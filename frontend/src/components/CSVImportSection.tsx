import React, { useState, useRef } from 'react';
import { Upload, FileText, X, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useDirectUpsert, getISOWeekLabel } from '@/hooks/useQueries';
import { parseCSVFile, ParseResult, ParsedRow } from '@/utils/csvParser';
import { UnitModel } from '@/backend';

interface ParsedFileEntry {
  fileName: string;
  result: ParseResult;
}

const MODEL_OPTIONS: UnitModel[] = [UnitModel.N135, UnitModel.N13, UnitModel.N125];

export default function CSVImportSection() {
  const [parsedFiles, setParsedFiles] = useState<ParsedFileEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set());
  const [defaultModel, setDefaultModel] = useState<UnitModel>(UnitModel.N135);
  // Pre-populate with the current ISO week so imports work without manual entry
  const [defaultWeek, setDefaultWeek] = useState<string>(() => getISOWeekLabel());
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upsertOne, invalidate } = useDirectUpsert();

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const results: ParsedFileEntry[] = [];

    for (const file of fileArray) {
      try {
        const result = await parseCSVFile(file);
        results.push({ fileName: file.name, result });
      } catch (err) {
        toast.error(`Failed to parse ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (results.length > 0) {
      setParsedFiles(prev => [...prev, ...results]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
  };

  const removeFile = (index: number) => {
    setParsedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const toggleExpand = (index: number) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Resolve model string to UnitModel enum
  const resolveModel = (modelStr: string | undefined): UnitModel => {
    const n = (modelStr ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (n.includes('135')) return UnitModel.N135;
    if (n.includes('125')) return UnitModel.N125;
    if (n.includes('13')) return UnitModel.N13;
    return defaultModel;
  };

  /**
   * Extract the unit ID exclusively from the filename stem.
   * This is the single source of truth — file content is never used for unit ID.
   */
  const getUnitIdFromFileName = (fileName: string): string => {
    return fileName.replace(/\.[^.]+$/, '');
  };

  const handleImport = async () => {
    if (parsedFiles.length === 0) return;

    setIsImporting(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      const allRecords: Array<{
        unit: UnitModel;
        id: string;
        week: string;
        total: bigint;
        stored: bigint;
        valid: bigint;
        fileName: string;
      }> = [];

      for (const entry of parsedFiles) {
        const { result, fileName } = entry;

        // Unit ID is ALWAYS derived from the filename stem — never from file content
        const unitId = getUnitIdFromFileName(fileName);

        if (!unitId || unitId.trim() === '') {
          console.warn(`[CSVImport] Skipping ${fileName}: could not derive unit ID from filename`);
          toast.warning(`Skipped "${fileName}": could not determine Unit ID from filename`);
          errorCount++;
          continue;
        }

        if (result.rows.length === 0) {
          console.warn(`[CSVImport] Skipping ${fileName}: no data rows parsed`);
          continue;
        }

        // Use the first (and only) aggregated row for packet counts
        const row = result.rows[0];

        // Week resolution: row-level → result-level → defaultWeek
        const weekYear = (row.weekYear && row.weekYear.trim())
          || (result.weekYear && result.weekYear.trim())
          || defaultWeek.trim();

        if (!weekYear) {
          console.warn(`[CSVImport] Skipping ${fileName}: missing weekYear`);
          toast.warning(`Skipped unit "${unitId}" in "${fileName}": missing week. Set a Default Week override.`);
          errorCount++;
          continue;
        }

        const model = resolveModel(row.model);
        const totalPkts = row.totalPkts ?? 0;
        const storedPkts = row.storedPkts ?? 0;
        const validGpsFixPkts = row.validGpsFixPkts ?? 0;

        console.log(`[CSVImport] Queued record:`, {
          unitId: unitId.trim(),
          weekYear,
          model,
          totalPkts,
          storedPkts,
          validGpsFixPkts,
        });

        allRecords.push({
          unit: model,
          id: unitId.trim(),
          week: weekYear,
          total: BigInt(totalPkts),
          stored: BigInt(storedPkts),
          valid: BigInt(validGpsFixPkts),
          fileName,
        });
      }

      if (allRecords.length === 0) {
        toast.error('No valid records to import. Check that files have data and week information.');
        return;
      }

      // Upsert all records sequentially
      for (const record of allRecords) {
        try {
          console.log(`[CSVImport] Upserting: id="${record.id}" week="${record.week}" unit="${record.unit}" total=${record.total} stored=${record.stored} valid=${record.valid}`);
          await upsertOne({
            unit: record.unit,
            id: record.id,
            week: record.week,
            total: record.total,
            stored: record.stored,
            valid: record.valid,
          });
          console.log(`[CSVImport] ✓ Upserted: ${record.id} / ${record.week}`);
          successCount++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[CSVImport] ✗ Failed to upsert ${record.id} for ${record.week}:`, err);
          toast.error(
            `Failed to import "${record.id}" (${record.week}) from "${record.fileName}": ${errMsg}`
          );
          errorCount++;
        }
      }

      // Invalidate cache ONCE after all upserts complete
      if (successCount > 0) {
        console.log(`[CSVImport] All upserts done. Invalidating reports cache...`);
        await invalidate();
        console.log(`[CSVImport] Cache invalidated. ${successCount} records imported.`);
        toast.success(`Successfully imported ${successCount} device${successCount !== 1 ? 's' : ''}`);
        setParsedFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }

      if (errorCount > 0 && successCount === 0) {
        toast.error(`All ${errorCount} record${errorCount !== 1 ? 's' : ''} failed to import`);
      } else if (errorCount > 0) {
        toast.warning(`${errorCount} record${errorCount !== 1 ? 's' : ''} failed to import`);
      }
    } finally {
      setIsImporting(false);
    }
  };

  // Total importable records (1 per file since each file = 1 device unit)
  const totalRows = parsedFiles.reduce((sum, f) => sum + f.result.rows.length, 0);

  // Helper to get total GPS packets for display
  const getTotalGps = (row: ParsedRow) => row.totalGpsPackets ?? row.validGpsFixPkts;

  // Resolve the effective week for a row (for display in the preview card)
  const resolveWeekForDisplay = (row: ParsedRow, result: ParseResult): string => {
    return (row.weekYear && row.weekYear.trim())
      || (result.weekYear && result.weekYear.trim())
      || defaultWeek
      || '—';
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-amber-400 bg-amber-400/10'
            : 'border-navy-600 hover:border-amber-400/50 hover:bg-navy-800/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
        <Upload className="mx-auto mb-3 text-amber-400" size={32} />
        <p className="text-sm font-medium text-foreground">Drop GPS report files here</p>
        <p className="text-xs text-muted-foreground mt-1">Supports CSV, XLS, XLSX • Multiple files allowed</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          File name is used as the Unit ID (e.g.{' '}
          <span className="text-amber-400 font-mono">S10002.xls</span> → Unit{' '}
          <span className="text-amber-400 font-mono">S10002</span>)
        </p>
      </div>

      {/* Parsed Files */}
      {parsedFiles.length > 0 && (
        <div className="space-y-3">
          {parsedFiles.map((entry, index) => {
            const { result, fileName } = entry;
            const isExpanded = expandedFiles.has(index);
            const hasRows = result.rows.length > 0;
            // Unit ID is ALWAYS the filename without extension
            const unitId = getUnitIdFromFileName(fileName);

            return (
              <div key={index} className="bg-navy-800 border border-navy-600 rounded-lg overflow-hidden">
                {/* File Header */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={16} className="text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      {/* Unit ID (filename stem) as primary label */}
                      <span className="text-sm font-semibold text-foreground truncate block">{unitId}</span>
                      <span className="text-xs text-muted-foreground truncate block">{fileName}</span>
                    </div>
                    {hasRows ? (
                      <Badge variant="secondary" className="text-xs shrink-0">1 unit</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs shrink-0">No data</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {hasRows && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleExpand(index)}>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFile(index)}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                </div>

                {/* Gateway Details */}
                {(result.gatewayName || result.startDate || result.endDate || result.weekYear) && (
                  <div className="px-3 pb-2 flex flex-wrap gap-3 text-xs text-muted-foreground border-t border-navy-600 pt-2">
                    {result.gatewayName && (
                      <span>Gateway: <span className="text-foreground">{result.gatewayName}</span></span>
                    )}
                    {result.startDate && (
                      <span>From: <span className="text-foreground">{result.startDate}</span></span>
                    )}
                    {result.endDate && (
                      <span>To: <span className="text-foreground">{result.endDate}</span></span>
                    )}
                    {result.weekYear
                      ? <span>Week: <span className="text-amber-400 font-medium">{result.weekYear}</span></span>
                      : <span>Week: <span className="text-amber-400/60 font-medium">{defaultWeek} (default)</span></span>
                    }
                  </div>
                )}

                {/* Aggregate Stats — single device unit totals */}
                {hasRows && (
                  <div className="px-3 pb-3 grid grid-cols-3 gap-2">
                    <div className="bg-navy-900 rounded p-2 text-center">
                      <div className="text-lg font-bold text-amber-400">
                        {result.rows.reduce((s, r) => s + r.totalPkts, 0).toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">Total Pkts</div>
                    </div>
                    <div className="bg-navy-900 rounded p-2 text-center">
                      <div className="text-lg font-bold text-blue-400">
                        {result.rows.reduce((s, r) => s + r.storedPkts, 0).toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">Stored</div>
                    </div>
                    <div className="bg-navy-900 rounded p-2 text-center">
                      <div className="text-lg font-bold text-emerald-400">
                        {result.rows.reduce((s, r) => s + r.validGpsFixPkts, 0).toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">Valid GPS</div>
                    </div>
                  </div>
                )}

                {/* Errors */}
                {result.errors && result.errors.length > 0 && (
                  <div className="px-3 pb-3">
                    {result.errors.map((err, ei) => (
                      <div key={ei} className="flex items-center gap-1.5 text-xs text-destructive">
                        <AlertCircle size={12} />
                        <span>{err}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Expanded Row Preview — shows the single aggregated device record */}
                {isExpanded && hasRows && (
                  <div className="border-t border-navy-600 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-navy-900">
                          <th className="px-3 py-2 text-left text-muted-foreground">Unit ID</th>
                          <th className="px-3 py-2 text-left text-muted-foreground">Week</th>
                          <th className="px-3 py-2 text-left text-muted-foreground">Model</th>
                          <th className="px-3 py-2 text-right text-muted-foreground">Total</th>
                          <th className="px-3 py-2 text-right text-muted-foreground">Stored</th>
                          <th className="px-3 py-2 text-right text-muted-foreground">Valid GPS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, ri) => (
                          <tr key={ri} className="border-t border-navy-700">
                            {/* Always show the filename-derived unit ID, never file content */}
                            <td className="px-3 py-1.5 font-mono text-amber-400">{unitId}</td>
                            <td className="px-3 py-1.5">{resolveWeekForDisplay(row, result)}</td>
                            <td className="px-3 py-1.5">{row.model || defaultModel}</td>
                            <td className="px-3 py-1.5 text-right">{row.totalPkts.toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-right">{row.storedPkts.toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-right">{getTotalGps(row).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Default Overrides */}
          <div className="bg-navy-800 border border-navy-600 rounded-lg p-3 space-y-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Default Overrides (used when not detected from file)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Default Model</label>
                <select
                  value={defaultModel}
                  onChange={e => setDefaultModel(e.target.value as UnitModel)}
                  className="w-full bg-navy-900 border border-navy-600 rounded px-2 py-1.5 text-sm text-foreground"
                >
                  {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Default Week</label>
                <input
                  type="text"
                  placeholder="e.g. 2026-W09"
                  value={defaultWeek}
                  onChange={e => setDefaultWeek(e.target.value)}
                  className="w-full bg-navy-900 border border-navy-600 rounded px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>
          </div>

          {/* Import Button */}
          <Button
            className="w-full"
            onClick={handleImport}
            disabled={isImporting || totalRows === 0}
          >
            {isImporting ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
                Importing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle size={16} />
                Import {parsedFiles.length} Device{parsedFiles.length !== 1 ? 's' : ''}
              </span>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

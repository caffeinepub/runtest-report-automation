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

/**
 * Detect IC0508 "Canister is stopped" errors from the Internet Computer.
 * These appear as rejection objects with reject_code 5 or error_code IC0508,
 * or as stringified JSON containing those patterns.
 */
function isCanisterStoppedError(err: unknown): boolean {
  if (!err) return false;

  // Check if the error object has IC-specific rejection fields
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    // Direct rejection object
    if (e.reject_code === 5 || e.error_code === 'IC0508') return true;
    // Nested body object
    if (e.body && typeof e.body === 'object') {
      const body = e.body as Record<string, unknown>;
      if (body.reject_code === 5 || body.error_code === 'IC0508') return true;
      if (typeof body.status === 'string' && body.status === 'non_replicated_rejection') return true;
    }
    // Check message string
    if (typeof e.message === 'string') {
      const msg = e.message;
      if (
        msg.includes('IC0508') ||
        msg.includes('non_replicated_rejection') ||
        (msg.includes('Canister') && msg.includes('stopped')) ||
        (msg.includes('reject_code') && msg.includes('5'))
      ) return true;
    }
  }

  // Check stringified error
  const str = String(err);
  if (
    str.includes('IC0508') ||
    str.includes('non_replicated_rejection') ||
    (str.includes('Canister') && str.includes('stopped')) ||
    (str.includes('reject_code') && str.includes('"5"')) ||
    (str.includes('"reject_code":5') || str.includes('"reject_code": 5'))
  ) return true;

  return false;
}

/**
 * Return a clean, human-readable error reason for display.
 * Never exposes raw JSON to the user.
 */
function getReadableErrorReason(err: unknown): { reason: string; isCanisterStopped: boolean } {
  if (isCanisterStoppedError(err)) {
    return {
      reason: 'backend service is currently stopped',
      isCanisterStopped: true,
    };
  }

  if (err instanceof Error) {
    // Strip any JSON blobs from the message
    const clean = err.message.replace(/\{[\s\S]*\}/g, '').trim();
    return { reason: clean || 'unknown error', isCanisterStopped: false };
  }

  return { reason: 'unknown error', isCanisterStopped: false };
}

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
    const failures: Array<{ id: string; week: string; reason: string; isCanisterStopped: boolean }> = [];

    try {
      const allRecords: Array<{
        unit: UnitModel;
        id: string;
        week: string;
        total: bigint;
        normalPkts: bigint;
        storedPkts: bigint;
        stored: bigint;
        valid: bigint;
        fileName: string;
      }> = [];

      // Build the list of records to upsert from all parsed files
      for (const { fileName, result } of parsedFiles) {
        if (result.errors.length > 0 || result.rows.length === 0) continue;

        // Unit ID is always derived from the filename — never from row content
        const unitId = getUnitIdFromFileName(fileName);

        for (const row of result.rows) {
          const model = resolveModel(row.model);
          const week = result.weekYear || defaultWeek;

          allRecords.push({
            unit: model,
            id: unitId,
            week,
            total: BigInt(row.totalPkts),
            normalPkts: BigInt(row.normalPktCount ?? 0),
            // storedPkts = the dedicated storedPktCount field (7th backend param)
            storedPkts: BigInt(row.storedPkts),
            // stored = legacy storedPkts field (5th backend param), same value
            stored: BigInt(row.storedPkts),
            valid: BigInt(row.validGpsFixPkts),
            fileName,
          });
        }
      }

      // Upsert all records, collecting failures
      for (const record of allRecords) {
        try {
          await upsertOne({
            unit: record.unit,
            id: record.id,
            week: record.week,
            total: record.total,
            stored: record.stored,
            valid: record.valid,
            storedPkts: record.storedPkts,
            normalPkts: record.normalPkts,
          });
          successCount++;
        } catch (err) {
          const { reason, isCanisterStopped } = getReadableErrorReason(err);
          failures.push({ id: record.id, week: record.week, reason, isCanisterStopped });
        }
      }

      // Invalidate queries after all upserts
      if (successCount > 0) {
        invalidate();
      }

      // Emit a single consolidated summary toast
      if (failures.length === 0 && successCount > 0) {
        toast.success(`Successfully imported ${successCount} unit record${successCount !== 1 ? 's' : ''}`);
        setParsedFiles([]);
      } else if (failures.length > 0 && successCount > 0) {
        const canisterStopped = failures.some(f => f.isCanisterStopped);
        if (canisterStopped) {
          toast.error(
            `Imported ${successCount} record${successCount !== 1 ? 's' : ''}, but ${failures.length} failed because the backend service is currently stopped. Please try again later.`
          );
        } else {
          toast.error(
            `Imported ${successCount} record${successCount !== 1 ? 's' : ''}, but ${failures.length} failed. Check the console for details.`
          );
        }
        setParsedFiles([]);
      } else if (failures.length > 0 && successCount === 0) {
        const canisterStopped = failures.some(f => f.isCanisterStopped);
        if (canisterStopped) {
          toast.error('Import failed: the backend service is currently stopped. Please try again later.');
        } else {
          toast.error(`All ${failures.length} record${failures.length !== 1 ? 's' : ''} failed to import. Check the console for details.`);
        }
      } else {
        toast.warning('No records were found to import. Check that your files have valid data.');
      }
    } finally {
      setIsImporting(false);
    }
  };

  const totalRecords = parsedFiles.reduce((sum, f) => sum + f.result.rows.length, 0);
  const hasErrors = parsedFiles.some(f => f.result.errors.length > 0);

  return (
    <div className="space-y-4">
      {/* Week override input */}
      <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
        <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium whitespace-nowrap">
          Default Week
        </span>
        <input
          type="text"
          value={defaultWeek}
          onChange={e => setDefaultWeek(e.target.value)}
          placeholder="e.g. 2024-W12"
          className="flex-1 h-8 px-3 bg-secondary border border-border rounded font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="text-xs text-muted-foreground">
          Used when week cannot be detected from file
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragging
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-primary/50 hover:bg-secondary/30'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.xls,.xlsx"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
        <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Drop files here or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">Supports CSV, TSV, XLS, XLSX (Waggle portal exports)</p>
      </div>

      {/* Parsed files list */}
      {parsedFiles.length > 0 && (
        <div className="space-y-2">
          {parsedFiles.map((entry, index) => {
            const isExpanded = expandedFiles.has(index);
            const hasFileErrors = entry.result.errors.length > 0;
            const rowCount = entry.result.rows.length;

            return (
              <div key={index} className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-secondary/30">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-mono font-medium flex-1 truncate">{entry.fileName}</span>

                  {hasFileErrors ? (
                    <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-xs gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Error
                    </Badge>
                  ) : (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs gap-1">
                      <CheckCircle className="w-3 h-3" />
                      {rowCount} record{rowCount !== 1 ? 's' : ''}
                    </Badge>
                  )}

                  {entry.result.weekYear && (
                    <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary">
                      {entry.result.weekYear}
                    </Badge>
                  )}

                  <button
                    onClick={() => toggleExpand(index)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => removeFile(index)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-4 py-3 border-t border-border bg-card text-xs space-y-2">
                    {hasFileErrors ? (
                      <div className="space-y-1">
                        {entry.result.errors.map((err, i) => (
                          <p key={i} className="text-destructive">{err}</p>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {entry.result.gatewayName && (
                          <p className="text-muted-foreground">Gateway: <span className="text-foreground font-mono">{entry.result.gatewayName}</span></p>
                        )}
                        {entry.result.startDate && (
                          <p className="text-muted-foreground">Period: <span className="text-foreground font-mono">{entry.result.startDate}{entry.result.endDate ? ` → ${entry.result.endDate}` : ''}</span></p>
                        )}
                        {entry.result.rows.map((row: ParsedRow, i: number) => (
                          <div key={i} className="font-mono text-foreground">
                            <span className="text-primary">{row.unitId}</span>
                            {' · '}Total: {row.totalPkts}
                            {' · '}Normal: {row.normalPktCount ?? 0}
                            {' · '}Stored: {row.storedPkts}
                            {' · '}Valid GPS: {row.validGpsFixPkts}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Import button */}
      {parsedFiles.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {totalRecords} record{totalRecords !== 1 ? 's' : ''} ready to import
            {hasErrors && <span className="text-destructive ml-2">(some files have errors)</span>}
          </p>
          <Button
            onClick={handleImport}
            disabled={isImporting || totalRecords === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
          >
            {isImporting ? (
              <>
                <Upload className="w-4 h-4 animate-pulse" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Import {totalRecords} Record{totalRecords !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

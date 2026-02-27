import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useDirectUpsert } from '@/hooks/useQueries';
import { parseCSVData, parseXLSData, ParseResult } from '@/utils/csvParser';
import { UnitModel } from '@/backend';
import ColumnMappingSelector from './ColumnMappingSelector';

interface CSVImportSectionProps {
  selectedWeek: string;
}

function detectUnitModel(unitId: string): UnitModel {
  const upper = unitId.toUpperCase();
  if (upper.includes('N135') || upper.includes('N13-5')) return UnitModel.N135;
  if (upper.includes('N125') || upper.includes('N12-5')) return UnitModel.N125;
  return UnitModel.N13;
}

const CSVImportSection: React.FC<CSVImportSectionProps> = ({ selectedWeek }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [importError, setImportError] = useState<string>('');
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [debugOpen, setDebugOpen] = useState(false);
  const [columnMappingOpen, setColumnMappingOpen] = useState(false);
  const [currentFilename, setCurrentFilename] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { upsertOne, invalidate } = useDirectUpsert();

  const processFile = useCallback(async (file: File) => {
    setImportStatus('idle');
    setImportError('');
    setParseResult(null);
    setCurrentFilename(file.name);

    try {
      let result: ParseResult;

      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text();
        result = parseCSVData(text, file.name);
      } else if (
        file.name.toLowerCase().endsWith('.xls') ||
        file.name.toLowerCase().endsWith('.xlsx')
      ) {
        const XLSX = (window as unknown as { XLSX: { read: (data: ArrayBuffer, opts: unknown) => unknown } }).XLSX;
        if (!XLSX) {
          throw new Error('SheetJS library not loaded. Please refresh the page and try again.');
        }
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        result = parseXLSData(workbook, file.name);
      } else {
        throw new Error('Unsupported file type. Please upload a CSV, XLS, or XLSX file.');
      }

      setParseResult(result);
      setDebugOpen(true);

      // Auto-open column mapping if columns are available
      if (result.debug.allColumnHeaders.length > 0) {
        setColumnMappingOpen(true);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse file');
      setImportStatus('error');
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!parseResult || parseResult.records.length === 0) return;

    setImportStatus('importing');
    setImportError('');

    // All records from the parser are already validated — they passed isValidUnitId
    const validRecords = parseResult.records.filter(
      r => r.unitId && r.unitId.trim() !== ''
    );

    if (validRecords.length === 0) {
      setImportError('No valid records found. All rows had missing or invalid unit IDs.');
      setImportStatus('error');
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const record of validRecords) {
      try {
        const unitModel = detectUnitModel(record.unitId);
        const weekYear = record.weekYear || selectedWeek;

        await upsertOne({
          unit: unitModel,
          id: record.unitId,
          week: weekYear,
          total: BigInt(Math.max(0, record.totalPkts)),
          stored: BigInt(Math.max(0, record.storedPkts)),
          valid: BigInt(Math.max(0, record.validGpsFixPkts)),
          storedPkts: BigInt(Math.max(0, record.storedPktCount)),
          normalPkts: BigInt(Math.max(0, record.normalPktCount)),
        });

        successCount++;
      } catch (err) {
        errorCount++;
        const msg = err instanceof Error ? err.message : String(err);
        if (errors.length < 3) errors.push(`${record.unitId}: ${msg}`);
      }
    }

    // Invalidate queries after all upserts
    invalidate();

    setImportedCount(successCount);
    setSkippedCount(parseResult.skippedRows + errorCount);

    if (successCount > 0) {
      setImportStatus('success');
    } else {
      setImportStatus('error');
      setImportError(
        `Import failed for all records. ${errors.join('; ')}`
      );
    }
  }, [parseResult, selectedWeek, upsertOne, invalidate]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset input so same file can be re-uploaded
      e.target.value = '';
    },
    [processFile]
  );

  const handleReset = () => {
    setParseResult(null);
    setImportStatus('idle');
    setImportError('');
    setImportedCount(0);
    setSkippedCount(0);
    setDebugOpen(false);
    setColumnMappingOpen(false);
    setCurrentFilename('');
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
          ${isDragging
            ? 'border-amber-400 bg-amber-500/10'
            : 'border-border/50 hover:border-amber-400/60 hover:bg-muted/30'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          className="hidden"
          onChange={handleFileChange}
        />
        <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          Drop CSV / XLS / XLSX file here
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          or click to browse
        </p>
        {currentFilename && (
          <p className="text-xs text-amber-400 mt-2 font-mono">
            📄 {currentFilename}
          </p>
        )}
      </div>

      {/* Error alert */}
      {importStatus === 'error' && importError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs break-all">{importError}</AlertDescription>
        </Alert>
      )}

      {/* Success alert */}
      {importStatus === 'success' && (
        <Alert className="border-green-500/30 bg-green-500/10">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <AlertDescription className="text-green-300 text-xs">
            Successfully imported {importedCount} record{importedCount !== 1 ? 's' : ''}.
            {skippedCount > 0 && ` ${skippedCount} row${skippedCount !== 1 ? 's' : ''} skipped (invalid/missing unit ID).`}
          </AlertDescription>
        </Alert>
      )}

      {/* Skipped rows warning */}
      {parseResult && parseResult.skippedRows > 0 && importStatus !== 'success' && (
        <Alert className="border-amber-500/30 bg-amber-500/10">
          <AlertCircle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-amber-300 text-xs">
            {parseResult.skippedRows} row{parseResult.skippedRows !== 1 ? 's' : ''} will be skipped due to missing or invalid unit IDs.
          </AlertDescription>
        </Alert>
      )}

      {/* Parse result summary + import button */}
      {parseResult && parseResult.records.length > 0 && importStatus !== 'success' && (
        <div className="bg-muted/30 border border-border/40 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-medium text-foreground">
                {parseResult.records.length} unit{parseResult.records.length !== 1 ? 's' : ''} detected
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReset} className="h-8 text-xs">
                Clear
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={importStatus === 'importing'}
                className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-navy-950"
              >
                {importStatus === 'importing' ? (
                  <span className="flex items-center gap-1">
                    <span className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
                    Importing…
                  </span>
                ) : (
                  `Import ${parseResult.records.length} Record${parseResult.records.length !== 1 ? 's' : ''}`
                )}
              </Button>
            </div>
          </div>

          {/* Unit list preview */}
          <div className="flex flex-wrap gap-1">
            {parseResult.records.slice(0, 8).map(r => (
              <span
                key={r.unitId}
                className="text-xs font-mono bg-navy-800/60 border border-border/30 rounded px-2 py-0.5 text-amber-300"
              >
                {r.unitId}
              </span>
            ))}
            {parseResult.records.length > 8 && (
              <span className="text-xs text-muted-foreground px-2 py-0.5">
                +{parseResult.records.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* No records found */}
      {parseResult && parseResult.records.length === 0 && importStatus !== 'error' && (
        <Alert className="border-amber-500/30 bg-amber-500/10">
          <AlertCircle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-amber-300 text-xs">
            No valid records found in the file. Check the debug panel below for details.
          </AlertDescription>
        </Alert>
      )}

      {/* Debug panel */}
      {parseResult && (
        <Collapsible open={debugOpen} onOpenChange={setDebugOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-xs text-muted-foreground hover:text-foreground h-8 border border-border/30 rounded"
            >
              <span className="flex items-center gap-1">
                <Settings2 className="h-3 w-3" />
                Debug Info — click to inspect raw file data
              </span>
              {debugOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 bg-navy-950/80 border border-border/30 rounded-lg p-4 font-mono text-xs space-y-3 overflow-x-auto">
              <div>
                <span className="text-muted-foreground">Strategy Used:</span>
                <br />
                <span className="text-green-400">{parseResult.debug.strategy}</span>
              </div>

              {parseResult.debug.isPerPacketFormat && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2 text-blue-300">
                  <strong>Per-Packet Event Log Format:</strong> Each row = one GPS packet event.
                  Total / Stored / Valid counts are computed by row aggregation, not read from columns.
                  Unit ID source: <strong>{parseResult.debug.unitIdSource}</strong>
                </div>
              )}

              <div>
                <span className="text-muted-foreground">
                  Detected Header Row (index {parseResult.debug.headerRowIndex}):
                </span>
                <br />
                <span className="text-foreground/80 break-all">
                  {parseResult.debug.headers.map((h, i) => (
                    <span
                      key={i}
                      className={
                        h.toLowerCase() === 'address'
                          ? 'text-amber-300 font-bold'
                          : h.toLowerCase() === 'pktstate' || h.toLowerCase() === 'pkt state'
                          ? 'text-cyan-300 font-bold'
                          : ''
                      }
                    >
                      [{i}] {h}{' '}
                    </span>
                  ))}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground">Column Mapping:</span>
                <div className="grid grid-cols-2 gap-x-8 mt-1">
                  {Object.entries(parseResult.debug.columnMapping).map(([key, val]) => (
                    <div key={key} className="flex gap-2">
                      <span className="text-muted-foreground w-16">{key}:</span>
                      <span
                        className={
                          val.includes('not found')
                            ? 'text-red-400'
                            : val.includes('aggregation')
                            ? 'text-blue-400'
                            : 'text-green-400'
                        }
                      >
                        {val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resolved aggregated records (first 3) */}
              {parseResult.debug.resolvedSampleRecords.length > 0 && (
                <div>
                  <span className="text-muted-foreground">
                    Resolved Records (first {parseResult.debug.resolvedSampleRecords.length} aggregated units):
                    {parseResult.debug.isPerPacketFormat && (
                      <span className="text-blue-400"> (counts = totals across all rows per unit)</span>
                    )}
                  </span>
                  {parseResult.debug.resolvedSampleRecords.map((rec, i) => (
                    <div key={i} className="text-foreground/70 mt-1">
                      Unit {i + 1}:{' '}
                      <span>unitId=</span>
                      <span className={!rec.unitId || rec.unitId === 'N/A' ? 'text-red-400' : 'text-amber-300'}>
                        &quot;{rec.unitId || 'N/A'}&quot;
                      </span>{' '}
                      <span>total=</span>
                      <span className="text-green-400">{rec.total}</span>{' '}
                      <span>stored=</span>
                      <span className="text-green-400">{rec.stored}</span>{' '}
                      <span>valid=</span>
                      <span className="text-green-400">{rec.valid}</span>{' '}
                      <span>normal=</span>
                      <span className="text-green-400">{rec.normal}</span>
                      {parseResult.debug.isPerPacketFormat && (
                        <>
                          {' '}
                          <span>lastPktState=</span>
                          <span className="text-cyan-300">&quot;{rec.pktState}&quot;</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Raw sample rows */}
              {parseResult.debug.sampleRows.length > 0 && (
                <div>
                  <span className="text-muted-foreground">First {parseResult.debug.sampleRows.length} Raw Data Rows (after header):</span>
                  {parseResult.debug.sampleRows.map((row, i) => (
                    <div key={i} className="text-foreground/60 mt-1 break-all">
                      Row {i + 1}: {Object.entries(row).slice(0, 6).map(([k, v]) => `${k}="${v}"`).join(' | ')}
                      {Object.keys(row).length > 6 && ' | ...'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Column Mapping Selector */}
      {parseResult && parseResult.debug.allColumnHeaders.length > 0 && (
        <Collapsible open={columnMappingOpen} onOpenChange={setColumnMappingOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-xs text-amber-400 hover:text-amber-300 h-8 border border-amber-500/30 rounded bg-amber-500/5 hover:bg-amber-500/10"
            >
              <span className="flex items-center gap-1">
                <Settings2 className="h-3 w-3" />
                Custom Column Mapping — select fields to show in Dashboard &amp; Reports
              </span>
              {columnMappingOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 bg-muted/20 border border-amber-500/20 rounded-lg p-4">
              <ColumnMappingSelector availableColumns={parseResult.debug.allColumnHeaders} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

export default CSVImportSection;

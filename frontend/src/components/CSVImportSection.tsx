import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Info,
  AlertCircle,
  Upload,
  Loader2,
  ClipboardPaste,
  Files,
  X,
  FileText,
  CheckCircle2,
  Package,
  Satellite,
  HardDrive,
  Calendar,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { UnitModel, MODEL_LABELS, ALL_MODELS, getCurrentWeekLabel, useUpsertReport } from '@/hooks/useQueries';
import { parseCSV, parseExcelFile, type ParsedRow, type ParsedFileResult, type FileMetadata } from '@/utils/csvParser';

interface ParsedRowWithSource extends ParsedRow {
  sourceFile: string;
}

interface FileEntry {
  name: string;
  rowCount: number;
  validCount: number;
  invalidCount: number;
  error?: string;
  metadata?: FileMetadata;
  aggregated?: ParsedFileResult['aggregated'];
}

type ImportMode = 'paste' | 'files';

// Supported file extensions
const SUPPORTED_EXTENSIONS = ['.csv', '.tsv', '.xls', '.xlsx'];
const ACCEPT_ATTR = '.csv,.tsv,.xls,.xlsx';

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

function isExcelFile(ext: string): boolean {
  return ext === '.xls' || ext === '.xlsx';
}

function isSupportedFile(ext: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/** Summary card shown after a Waggle portal file is parsed */
function FileSummaryCard({ entry }: { entry: FileEntry }) {
  const { metadata, aggregated } = entry;
  if (!metadata && !aggregated) return null;

  const hasMetadata = metadata && (metadata.unitName || metadata.startDate || metadata.endDate);
  const hasAggregated = aggregated !== undefined;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          Parsed File Summary — {entry.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {hasMetadata && (
            <>
              {metadata?.unitName && (
                <div className="flex items-start gap-2">
                  <Tag className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Unit Name</p>
                    <p className="text-xs font-semibold text-foreground font-mono">{metadata.unitName}</p>
                  </div>
                </div>
              )}
              {metadata?.startDate && (
                <div className="flex items-start gap-2">
                  <Calendar className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Start Date</p>
                    <p className="text-xs font-semibold text-foreground">{metadata.startDate}</p>
                  </div>
                </div>
              )}
              {metadata?.endDate && (
                <div className="flex items-start gap-2">
                  <Calendar className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">End Date</p>
                    <p className="text-xs font-semibold text-foreground">{metadata.endDate}</p>
                  </div>
                </div>
              )}
            </>
          )}
          {hasAggregated && (
            <>
              <div className="flex items-start gap-2">
                <Package className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Total Packets</p>
                  <p className="text-xs font-semibold text-foreground font-mono">{aggregated!.totalPackets.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <HardDrive className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Stored Packets</p>
                  <p className="text-xs font-semibold text-foreground font-mono">{aggregated!.storedPackets.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Satellite className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">GPS Valid Fix</p>
                  <p className="text-xs font-semibold text-foreground font-mono">{aggregated!.validGpsPackets.toLocaleString()}</p>
                </div>
              </div>
            </>
          )}
        </div>
        {!hasMetadata && !hasAggregated && (
          <p className="text-xs text-muted-foreground italic">No summary data extracted from this file.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function CSVImportSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('paste');

  // Paste mode state
  const [csvText, setCsvText] = useState('');

  // File upload mode state
  const [uploadedFiles, setUploadedFiles] = useState<FileEntry[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared state
  const [selectedModel, setSelectedModel] = useState<UnitModel>(UnitModel.N135);
  const [weekLabel, setWeekLabel] = useState(getCurrentWeekLabel());
  const [parsedRows, setParsedRows] = useState<ParsedRowWithSource[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const upsertReport = useUpsertReport();

  // ── Paste mode ──────────────────────────────────────────────────────────────
  const handlePaste = useCallback(() => {
    if (!csvText.trim()) {
      toast.error('Please paste data before parsing');
      return;
    }
    try {
      const result = parseCSV(csvText);
      if (result.rows.length === 0) {
        toast.error('No valid rows found in the pasted data');
        return;
      }
      const rowsWithSource: ParsedRowWithSource[] = result.rows.map(r => ({ ...r, sourceFile: 'Pasted data' }));
      setParsedRows(rowsWithSource);
      setUploadedFiles([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse pasted data';
      toast.error(`Parse error: ${message}`);
    }
  }, [csvText]);

  // ── File upload mode ─────────────────────────────────────────────────────────
  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsProcessingFiles(true);
    const allRows: ParsedRowWithSource[] = [];
    const fileEntries: FileEntry[] = [];

    for (const file of files) {
      const ext = getFileExtension(file.name);

      if (!isSupportedFile(ext)) {
        toast.error(`Unsupported file format: "${file.name}". Supported formats: CSV, TSV, XLS, XLSX.`);
        continue;
      }

      try {
        let result: ParsedFileResult;

        if (isExcelFile(ext)) {
          result = await parseExcelFile(file);
        } else {
          // CSV or TSV — read as text using FileReader wrapped in a Promise
          result = await new Promise<ParsedFileResult>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const text = typeof reader.result === 'string' ? reader.result : '';
                resolve(parseCSV(text));
              } catch (parseErr) {
                reject(parseErr);
              }
            };
            reader.onerror = () => {
              reject(new Error(`Could not read file "${file.name}". The file may be corrupted or inaccessible.`));
            };
            reader.readAsText(file, 'utf-8');
          });
        }

        const rows = result.rows;
        const rowsWithSource: ParsedRowWithSource[] = rows.map(r => ({ ...r, sourceFile: file.name }));
        allRows.push(...rowsWithSource);
        fileEntries.push({
          name: file.name,
          rowCount: rows.length,
          validCount: rows.filter(r => !r.error).length,
          invalidCount: rows.filter(r => !!r.error).length,
          metadata: result.metadata,
          aggregated: result.aggregated,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        fileEntries.push({
          name: file.name,
          rowCount: 0,
          validCount: 0,
          invalidCount: 0,
          error: message,
        });
        toast.error(`Failed to parse "${file.name}": ${message}`, { duration: 6000 });
      }
    }

    setIsProcessingFiles(false);

    if (fileInputRef.current) fileInputRef.current.value = '';

    const failedEntries = fileEntries.filter(f => f.error);
    const successEntries = fileEntries.filter(f => !f.error);

    if (fileEntries.length > 0) {
      setUploadedFiles(fileEntries);
    }

    if (allRows.length === 0) {
      if (failedEntries.length === 0) {
        toast.error('No data rows found in the uploaded files. Please check the file contents.');
      }
      return;
    }

    setParsedRows(allRows);
    setCsvText('');

    if (failedEntries.length > 0) {
      toast.warning(
        `Loaded ${successEntries.length} file${successEntries.length !== 1 ? 's' : ''} successfully. ${failedEntries.length} file${failedEntries.length !== 1 ? 's' : ''} could not be parsed.`
      );
    }
  }, []);

  const handleFilesSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    await processFiles(files);
  }, [processFiles]);

  const handleDropZoneClick = () => {
    if (!isProcessingFiles) {
      fileInputRef.current?.click();
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isProcessingFiles) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const supported: File[] = [];
    const unsupported: string[] = [];

    for (const file of files) {
      const ext = getFileExtension(file.name);
      if (isSupportedFile(ext)) {
        supported.push(file);
      } else {
        unsupported.push(file.name);
      }
    }

    if (unsupported.length > 0) {
      toast.error(
        `Unsupported file${unsupported.length > 1 ? 's' : ''}: ${unsupported.join(', ')}. Supported formats: CSV, TSV, XLS, XLSX.`
      );
    }

    if (supported.length === 0) return;
    await processFiles(supported);
  }, [processFiles, isProcessingFiles]);

  // ── Shared ───────────────────────────────────────────────────────────────────
  const validRows = parsedRows?.filter(r => !r.error) ?? [];
  const invalidRows = parsedRows?.filter(r => r.error) ?? [];

  const handleConfirmImport = async () => {
    if (validRows.length === 0) {
      toast.error('No valid rows to import');
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const row of validRows) {
      try {
        await upsertReport.mutateAsync({
          unit: selectedModel,
          id: row.unitId.trim(),
          week: weekLabel,
          total: BigInt(parseInt(row.totalPkts.trim(), 10)),
          stored: BigInt(parseInt(row.storedPkts.trim(), 10)),
          valid: BigInt(parseInt(row.validGpsFixPkts.trim(), 10)),
        });
        successCount++;
      } catch {
        errorCount++;
      }
    }

    setIsImporting(false);

    if (errorCount === 0) {
      toast.success(
        `Successfully imported ${successCount} record${successCount !== 1 ? 's' : ''} for ${MODEL_LABELS[selectedModel]} — ${weekLabel}`
      );
      handleReset();
    } else {
      toast.error(
        `Imported ${successCount} record${successCount !== 1 ? 's' : ''}, but ${errorCount} failed to save`
      );
    }
  };

  const handleReset = () => {
    setCsvText('');
    setParsedRows(null);
    setUploadedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleModeSwitch = (mode: ImportMode) => {
    setImportMode(mode);
    handleReset();
  };

  // Determine if any uploaded file has a summary to show
  const filesWithSummary = uploadedFiles.filter(f => !f.error && (f.metadata || f.aggregated));

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      {/* Section Toggle Header */}
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:bg-secondary/40 transition-colors group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Import from File</p>
              <p className="text-xs text-muted-foreground">
                Paste data or upload files — CSV, TSV, XLS, XLSX supported
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs border-primary/30 text-primary hidden sm:flex">
              CSV / TSV / Excel
            </Badge>
            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform" />
            )}
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 border border-border rounded-lg bg-card overflow-hidden">
          <div className="p-4 space-y-5">

            {/* Help / Format Guide */}
            <Collapsible open={isHelpOpen} onOpenChange={setIsHelpOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors">
                  <Info className="w-3.5 h-3.5" />
                  <span className="font-medium">How to prepare your data file</span>
                  {isHelpOpen ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 p-3 bg-primary/5 border border-primary/15 rounded-md space-y-2.5 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground text-xs">Waggle portal export format (auto-detected):</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Export the report from the Waggle portal — the file includes a <strong className="text-foreground">Gateway Details</strong> header block</li>
                    <li>Unit name, start date, and end date are extracted automatically from the header block</li>
                    <li>Packet counts are computed from the <strong className="text-foreground">PktState</strong> column (Normal = total, Stored = stored)</li>
                    <li>GPS valid fix count is computed from the <strong className="text-foreground">GPS Status</strong> column (Valid rows)</li>
                    <li>One aggregated record per file is created using the gateway name as the unit ID</li>
                  </ul>
                  <p className="font-medium text-foreground text-xs mt-2">Legacy CSV format (4 columns):</p>
                  <div className="font-mono bg-secondary/60 rounded px-3 py-2 text-xs border border-border">
                    <span className="text-primary">Unit ID</span>
                    <span className="text-muted-foreground mx-1">,</span>
                    <span className="text-foreground">Total Reporting Packets</span>
                    <span className="text-muted-foreground mx-1">,</span>
                    <span className="text-foreground">Stored Packets</span>
                    <span className="text-muted-foreground mx-1">,</span>
                    <span className="text-foreground">Valid GPS Fix Packets</span>
                  </div>
                  <p className="font-medium text-foreground text-xs">Supported file formats:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['.csv', '.tsv', '.xls', '.xlsx'].map(ext => (
                      <span key={ext} className="font-mono bg-secondary/80 border border-border rounded px-2 py-0.5 text-xs text-foreground">
                        {ext}
                      </span>
                    ))}
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Select the correct <strong className="text-foreground">Unit Model</strong> and <strong className="text-foreground">Week</strong> before importing</li>
                    <li>For bulk upload: select all files at once — each file creates one record</li>
                  </ul>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Model + Week Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Unit Model</Label>
                <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v as UnitModel)}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_MODELS.map(model => (
                      <SelectItem key={model} value={model}>
                        {MODEL_LABELS[model]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Week (ISO Format)</Label>
                <Input
                  value={weekLabel}
                  onChange={e => setWeekLabel(e.target.value)}
                  placeholder="e.g. 2024-W12"
                  className="bg-secondary border-border font-mono"
                />
              </div>
            </div>

            {/* Mode Toggle */}
            <div className="flex items-center gap-1 p-1 bg-secondary/60 rounded-lg border border-border w-fit">
              <button
                onClick={() => handleModeSwitch('paste')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  importMode === 'paste'
                    ? 'bg-card text-foreground shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Paste Data
              </button>
              <button
                onClick={() => handleModeSwitch('files')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  importMode === 'files'
                    ? 'bg-card text-foreground shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Files className="w-3.5 h-3.5" />
                Upload Files
              </button>
            </div>

            {/* ── Paste Mode ── */}
            {importMode === 'paste' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Paste CSV / TSV / Spreadsheet Data
                  </Label>
                  <Textarea
                    value={csvText}
                    onChange={e => {
                      setCsvText(e.target.value);
                      if (parsedRows) setParsedRows(null);
                    }}
                    placeholder={`Paste rows here, e.g.:\nUNIT-001\t1200\t980\t850\nUNIT-002\t1150\t900\t780`}
                    className="font-mono text-xs bg-secondary border-border min-h-[120px] resize-y placeholder:text-muted-foreground/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Supports comma-separated (CSV) and tab-separated (TSV) formats. Header rows are skipped automatically.
                  </p>
                </div>

                {!parsedRows && (
                  <Button
                    onClick={handlePaste}
                    variant="outline"
                    size="sm"
                    className="border-primary/30 text-primary hover:bg-primary/10"
                  >
                    Parse Data
                  </Button>
                )}
              </div>
            )}

            {/* ── File Upload Mode ── */}
            {importMode === 'files' && !parsedRows && (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  multiple
                  className="hidden"
                  onChange={handleFilesSelected}
                />

                {/* Drop Zone */}
                <div
                  onClick={handleDropZoneClick}
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleDrop}
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                    isProcessingFiles
                      ? 'border-primary/40 bg-primary/5 cursor-wait'
                      : 'border-primary/30 hover:border-primary/60 hover:bg-primary/5'
                  }`}
                >
                  {isProcessingFiles ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <p className="text-sm text-muted-foreground">Processing files…</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Upload className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Drop files here or click to browse</p>
                      <p className="text-xs text-muted-foreground">CSV, TSV, XLS, XLSX — multiple files supported</p>
                    </div>
                  )}
                </div>

                {/* Per-file error alerts */}
                {uploadedFiles.filter(f => f.error).map(f => (
                  <Alert key={f.name} variant="destructive" className="py-2">
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription className="text-xs">
                      <span className="font-medium">{f.name}:</span> {f.error}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            {/* ── File Summary Cards (shown after successful parse) ── */}
            {importMode === 'files' && parsedRows && filesWithSummary.length > 0 && (
              <div className="space-y-3">
                {filesWithSummary.map(entry => (
                  <FileSummaryCard key={entry.name} entry={entry} />
                ))}
              </div>
            )}

            {/* ── Parsed Preview Table ── */}
            {parsedRows && parsedRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-foreground">
                      Preview — {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} parsed
                    </p>
                    {validRows.length > 0 && (
                      <Badge variant="outline" className="text-xs border-green-500/40 text-green-400 bg-green-500/10">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {validRows.length} valid
                      </Badge>
                    )}
                    {invalidRows.length > 0 && (
                      <Badge variant="outline" className="text-xs border-destructive/40 text-destructive bg-destructive/10">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        {invalidRows.length} invalid
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Clear
                  </Button>
                </div>

                {/* File summary badges */}
                {uploadedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {uploadedFiles.map(f => (
                      <div
                        key={f.name}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs ${
                          f.error
                            ? 'border-destructive/30 bg-destructive/10 text-destructive'
                            : 'border-border bg-secondary/60 text-muted-foreground'
                        }`}
                      >
                        {f.error ? (
                          <AlertCircle className="w-3 h-3 shrink-0" />
                        ) : (
                          <FileText className="w-3 h-3 shrink-0" />
                        )}
                        <span className="font-mono truncate max-w-[160px]">{f.name}</span>
                        {!f.error && (
                          <Badge variant="outline" className="text-xs h-4 px-1 border-border">
                            {f.rowCount}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-md border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary/60">
                        <TableHead className="text-xs h-8">Unit ID</TableHead>
                        <TableHead className="text-xs h-8 text-right">Total Pkts</TableHead>
                        <TableHead className="text-xs h-8 text-right">Stored Pkts</TableHead>
                        <TableHead className="text-xs h-8 text-right">Valid GPS</TableHead>
                        {importMode === 'files' && uploadedFiles.length > 1 && (
                          <TableHead className="text-xs h-8">Source</TableHead>
                        )}
                        <TableHead className="text-xs h-8">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedRows.map((row, idx) => (
                        <TableRow
                          key={idx}
                          className={row.error ? 'bg-destructive/5' : ''}
                        >
                          <TableCell className="text-xs font-mono py-1.5">{row.unitId || '—'}</TableCell>
                          <TableCell className="text-xs text-right py-1.5 font-mono">{row.totalPkts || '—'}</TableCell>
                          <TableCell className="text-xs text-right py-1.5 font-mono">{row.storedPkts || '—'}</TableCell>
                          <TableCell className="text-xs text-right py-1.5 font-mono">{row.validGpsFixPkts || '—'}</TableCell>
                          {importMode === 'files' && uploadedFiles.length > 1 && (
                            <TableCell className="text-xs py-1.5 text-muted-foreground truncate max-w-[120px]">
                              {row.sourceFile}
                            </TableCell>
                          )}
                          <TableCell className="py-1.5">
                            {row.error ? (
                              <Badge variant="destructive" className="text-xs h-5 px-1.5">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                {row.error}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs h-5 px-1.5 border-green-500/40 text-green-400 bg-green-500/10">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                OK
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Invalid row warnings */}
                {invalidRows.length > 0 && (
                  <Alert variant="destructive" className="py-2">
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription className="text-xs">
                      {invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} have validation errors and will be skipped during import.
                      {validRows.length === 0 && ' No valid rows to import.'}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Import Button */}
                {validRows.length > 0 && (
                  <div className="flex items-center gap-3 pt-1">
                    <Button
                      onClick={handleConfirmImport}
                      disabled={isImporting}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      size="sm"
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                          Importing…
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5 mr-2" />
                          Import {validRows.length} Record{validRows.length !== 1 ? 's' : ''}
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Will be saved as <span className="font-medium text-foreground">{MODEL_LABELS[selectedModel]}</span> for week <span className="font-mono text-foreground">{weekLabel}</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Empty state after parse attempt with no valid rows */}
            {parsedRows && parsedRows.length === 0 && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription className="text-xs">
                  No data rows were found. Please check that the file contains valid data rows.
                </AlertDescription>
              </Alert>
            )}

          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

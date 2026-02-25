import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { UnitModel, MODEL_LABELS, ALL_MODELS, getCurrentWeekLabel, useUpsertReport } from '@/hooks/useQueries';
import { parseCSV, parseExcelFile, type ParsedRow } from '@/utils/csvParser';

interface ParsedRowWithSource extends ParsedRow {
  sourceFile: string;
}

interface FileEntry {
  name: string;
  rowCount: number;
  validCount: number;
  invalidCount: number;
  error?: string;
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
      const rows = parseCSV(csvText);
      if (rows.length === 0) {
        toast.error('No valid rows found in the pasted data');
        return;
      }
      const rowsWithSource: ParsedRowWithSource[] = rows.map(r => ({ ...r, sourceFile: 'Pasted data' }));
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
        let rows: ParsedRow[];

        if (isExcelFile(ext)) {
          rows = await parseExcelFile(file);
        } else {
          // CSV or TSV — read as text using FileReader wrapped in a Promise
          rows = await new Promise<ParsedRow[]>((resolve, reject) => {
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

        const rowsWithSource: ParsedRowWithSource[] = rows.map(r => ({ ...r, sourceFile: file.name }));
        allRows.push(...rowsWithSource);
        fileEntries.push({
          name: file.name,
          rowCount: rows.length,
          validCount: rows.filter(r => !r.error).length,
          invalidCount: rows.filter(r => !!r.error).length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        // Record per-file error but continue processing other files
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

    // Reset file input so the same file can be re-selected after fixing
    if (fileInputRef.current) fileInputRef.current.value = '';

    const failedEntries = fileEntries.filter(f => f.error);
    const successEntries = fileEntries.filter(f => !f.error);

    // Always update uploadedFiles so per-file errors are shown
    if (fileEntries.length > 0) {
      setUploadedFiles(fileEntries);
    }

    if (allRows.length === 0) {
      if (failedEntries.length === 0) {
        toast.error('No data rows found in the uploaded files. Please check the file contents.');
      }
      // Individual file errors already shown via toast above
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

    // Filter to supported files and warn about unsupported ones
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
                  <p className="font-medium text-foreground text-xs">Expected column order (4 columns):</p>
                  <div className="font-mono bg-secondary/60 rounded px-3 py-2 text-xs border border-border">
                    <span className="text-primary">Unit ID</span>
                    <span className="text-muted-foreground mx-1">,</span>
                    <span className="text-foreground">Total Reporting Packets</span>
                    <span className="text-muted-foreground mx-1">,</span>
                    <span className="text-foreground">Stored Packets</span>
                    <span className="text-muted-foreground mx-1">,</span>
                    <span className="text-foreground">Valid GPS Fix Packets</span>
                  </div>
                  <p className="font-medium text-foreground text-xs">Example rows:</p>
                  <div className="font-mono bg-secondary/60 rounded px-3 py-2 text-xs border border-border space-y-0.5">
                    <div className="text-muted-foreground">UNIT-001, 1200, 980, 850</div>
                    <div className="text-muted-foreground">UNIT-002, 1150, 900, 780</div>
                    <div className="text-muted-foreground">UNIT-003, 1300, 1100, 920</div>
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
                    <li>Export the report from the Waggle portal report view (N13_Senthil, N13_Sanjeevi, etc.)</li>
                    <li>For bulk upload: save one file per unit group, then select all files at once</li>
                    <li>CSV and TSV (comma and tab delimiters) are auto-detected</li>
                    <li>Excel files (.xls, .xlsx) — first sheet is used automatically</li>
                    <li>Header rows are automatically detected and skipped</li>
                    <li>Select the correct <strong className="text-foreground">Unit Model</strong> and <strong className="text-foreground">Week</strong> before importing — these apply to all rows</li>
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
                    disabled={!csvText.trim()}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                  >
                    <ClipboardPaste className="w-4 h-4" />
                    Parse &amp; Preview
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
                <div
                  onClick={handleDropZoneClick}
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isProcessingFiles
                      ? 'border-primary/40 bg-primary/5 cursor-wait'
                      : 'border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer'
                  }`}
                >
                  {isProcessingFiles ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <p className="text-sm font-medium text-foreground">Processing files…</p>
                      <p className="text-xs text-muted-foreground">Loading Excel parser and reading data</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Upload className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Drop files here or click to browse</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          CSV, TSV, XLS, XLSX — multiple files supported
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Per-file error list (shown when some files failed but others succeeded or all failed) */}
                {uploadedFiles.length > 0 && uploadedFiles.some(f => f.error) && (
                  <div className="space-y-1.5">
                    {uploadedFiles.filter(f => f.error).map(f => (
                      <Alert key={f.name} variant="destructive" className="py-2 px-3">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <AlertDescription className="text-xs">
                          <span className="font-medium">{f.name}</span>: {f.error}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Preview Table ── */}
            {parsedRows && parsedRows.length > 0 && (
              <div className="space-y-3">
                {/* Summary bar */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-primary/15 text-primary border-primary/25 text-xs">
                      {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} parsed
                    </Badge>
                    {validRows.length > 0 && (
                      <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/25 text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {validRows.length} valid
                      </Badge>
                    )}
                    {invalidRows.length > 0 && (
                      <Badge className="bg-destructive/15 text-destructive border-destructive/25 text-xs">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        {invalidRows.length} with warnings
                      </Badge>
                    )}
                    {/* Per-file error badges in preview mode */}
                    {uploadedFiles.filter(f => f.error).map(f => (
                      <Badge key={f.name} variant="destructive" className="text-xs gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {f.name} failed
                      </Badge>
                    ))}
                  </div>
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear
                  </button>
                </div>

                {/* Table */}
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-secondary/60">
                          <TableHead className="text-xs py-2 px-3 w-8">#</TableHead>
                          <TableHead className="text-xs py-2 px-3">Unit ID</TableHead>
                          <TableHead className="text-xs py-2 px-3 text-right">Total Pkts</TableHead>
                          <TableHead className="text-xs py-2 px-3 text-right">Stored Pkts</TableHead>
                          <TableHead className="text-xs py-2 px-3 text-right">Valid GPS</TableHead>
                          <TableHead className="text-xs py-2 px-3">Source</TableHead>
                          <TableHead className="text-xs py-2 px-3">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedRows.map((row, idx) => (
                          <TableRow
                            key={idx}
                            className={row.error ? 'bg-destructive/5' : ''}
                          >
                            <TableCell className="text-xs py-1.5 px-3 text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="text-xs py-1.5 px-3 font-mono font-medium">{row.unitId || '—'}</TableCell>
                            <TableCell className="text-xs py-1.5 px-3 text-right font-mono">{row.totalPkts || '—'}</TableCell>
                            <TableCell className="text-xs py-1.5 px-3 text-right font-mono">{row.storedPkts || '—'}</TableCell>
                            <TableCell className="text-xs py-1.5 px-3 text-right font-mono">{row.validGpsFixPkts || '—'}</TableCell>
                            <TableCell className="text-xs py-1.5 px-3 text-muted-foreground max-w-[120px] truncate">
                              <span title={row.sourceFile}>
                                <FileText className="w-3 h-3 inline mr-1 opacity-60" />
                                {row.sourceFile}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs py-1.5 px-3">
                              {row.error ? (
                                <span className="flex items-center gap-1 text-destructive">
                                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate max-w-[160px]" title={row.error}>{row.error}</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                  <CheckCircle2 className="w-3 h-3" />
                                  OK
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Invalid rows warning */}
                {invalidRows.length > 0 && validRows.length > 0 && (
                  <Alert className="border-amber-500/30 bg-amber-500/5 py-2">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                      {invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} have validation warnings and will be skipped during import. Only the {validRows.length} valid row{validRows.length !== 1 ? 's' : ''} will be imported.
                    </AlertDescription>
                  </Alert>
                )}

                {invalidRows.length > 0 && validRows.length === 0 && (
                  <Alert variant="destructive" className="py-2">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <AlertDescription className="text-xs">
                      All rows have validation errors. Please fix the data and try again.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Import action */}
                {validRows.length > 0 && (
                  <div className="flex items-center gap-3 pt-1">
                    <Button
                      onClick={handleConfirmImport}
                      disabled={isImporting}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Importing {validRows.length} record{validRows.length !== 1 ? 's' : ''}…
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Import {validRows.length} record{validRows.length !== 1 ? 's' : ''} → {MODEL_LABELS[selectedModel]} / {weekLabel}
                        </>
                      )}
                    </Button>
                    <button
                      onClick={handleReset}
                      disabled={isImporting}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

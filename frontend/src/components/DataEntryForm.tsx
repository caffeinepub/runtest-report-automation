import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UnitModel, MODEL_LABELS, ALL_MODELS, getCurrentWeekLabel, useUpsertReport } from '@/hooks/useQueries';
import { Plus, Trash2, Save, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface UnitRow {
  id: string;
  unitId: string;
  totalPkts: string;
  storedPkts: string;
  validGpsPkts: string;
  error?: string;
}

function createEmptyRow(): UnitRow {
  return {
    id: crypto.randomUUID(),
    unitId: '',
    totalPkts: '',
    storedPkts: '',
    validGpsPkts: '',
  };
}

function validateRow(row: UnitRow): string | undefined {
  if (!row.unitId.trim()) return 'Unit ID is required';
  const total = parseInt(row.totalPkts);
  const stored = parseInt(row.storedPkts);
  const valid = parseInt(row.validGpsPkts);
  if (isNaN(total) || total < 0) return 'Total packets must be a non-negative integer';
  if (isNaN(stored) || stored < 0) return 'Stored packets must be a non-negative integer';
  if (isNaN(valid) || valid < 0) return 'Valid GPS packets must be a non-negative integer';
  if (stored > total) return 'Stored packets cannot exceed total packets';
  if (valid > total) return 'Valid GPS packets cannot exceed total packets';
  return undefined;
}

export function DataEntryForm() {
  const [selectedModel, setSelectedModel] = useState<UnitModel>(UnitModel.N135);
  const [weekLabel, setWeekLabel] = useState(getCurrentWeekLabel());
  const [rows, setRows] = useState<UnitRow[]>([createEmptyRow()]);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');

  const upsertReport = useUpsertReport();

  const addRow = useCallback(() => {
    setRows(prev => [...prev, createEmptyRow()]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const updateRow = useCallback((id: string, field: keyof UnitRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value, error: undefined } : r));
  }, []);

  const addMultipleRows = useCallback((count: number) => {
    const newRows = Array.from({ length: count }, createEmptyRow);
    setRows(prev => [...prev, ...newRows]);
  }, []);

  const handleSubmit = async () => {
    // Validate all rows
    const validatedRows = rows.map(row => ({
      ...row,
      error: validateRow(row),
    }));

    const hasErrors = validatedRows.some(r => r.error);
    if (hasErrors) {
      setRows(validatedRows);
      toast.error('Please fix validation errors before submitting');
      return;
    }

    // Filter out completely empty rows
    const filledRows = rows.filter(r => r.unitId.trim());
    if (filledRows.length === 0) {
      toast.error('Please add at least one unit entry');
      return;
    }

    setSubmitStatus('submitting');
    let successCount = 0;
    let errorCount = 0;

    for (const row of filledRows) {
      try {
        await upsertReport.mutateAsync({
          unit: selectedModel,
          id: row.unitId.trim(),
          week: weekLabel,
          total: BigInt(parseInt(row.totalPkts) || 0),
          stored: BigInt(parseInt(row.storedPkts) || 0),
          valid: BigInt(parseInt(row.validGpsPkts) || 0),
        });
        successCount++;
      } catch {
        errorCount++;
      }
    }

    if (errorCount === 0) {
      setSubmitStatus('success');
      setSubmitMessage(`Successfully saved ${successCount} unit entries for ${MODEL_LABELS[selectedModel]} - ${weekLabel}`);
      toast.success(`Saved ${successCount} entries`);
      setRows([createEmptyRow()]);
    } else {
      setSubmitStatus('error');
      setSubmitMessage(`Saved ${successCount} entries, ${errorCount} failed`);
      toast.error(`${errorCount} entries failed to save`);
    }
  };

  const clearForm = () => {
    setRows([createEmptyRow()]);
    setSubmitStatus('idle');
    setSubmitMessage('');
  };

  return (
    <div className="space-y-6">
      {/* Form Header Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-card border border-border rounded-lg">
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

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Quick Add Rows</Label>
          <div className="flex gap-2">
            {[5, 10, 30].map(n => (
              <Button
                key={n}
                variant="outline"
                size="sm"
                onClick={() => addMultipleRows(n)}
                className="flex-1 border-border bg-secondary hover:bg-muted text-xs"
              >
                +{n}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Status Alert */}
      {submitStatus === 'success' && (
        <Alert className="border-green-500/30 bg-green-500/10">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <AlertDescription className="text-green-300">{submitMessage}</AlertDescription>
        </Alert>
      )}
      {submitStatus === 'error' && (
        <Alert className="border-destructive/30 bg-destructive/10">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-destructive">{submitMessage}</AlertDescription>
        </Alert>
      )}

      {/* Data Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-secondary/50 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Unit Entries</span>
            <Badge variant="outline" className="font-mono text-xs border-border">
              {rows.length} rows
            </Badge>
            <Badge className="font-mono text-xs bg-primary/20 text-primary border-primary/30">
              {MODEL_LABELS[selectedModel]}
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={addRow}
            className="border-primary/30 text-primary hover:bg-primary/10 gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Row
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-12 text-center text-xs text-muted-foreground">#</TableHead>
                <TableHead className="text-xs text-muted-foreground">Unit ID</TableHead>
                <TableHead className="text-xs text-muted-foreground text-right">Total Packets</TableHead>
                <TableHead className="text-xs text-muted-foreground text-right">Stored Packets</TableHead>
                <TableHead className="text-xs text-muted-foreground text-right">Valid GPS Fix</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow
                  key={row.id}
                  className={`border-border ${row.error ? 'bg-destructive/5' : 'hover:bg-secondary/30'}`}
                >
                  <TableCell className="text-center text-xs text-muted-foreground font-mono">
                    {idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Input
                        value={row.unitId}
                        onChange={e => updateRow(row.id, 'unitId', e.target.value)}
                        placeholder="e.g. UNIT-001"
                        className={`h-8 bg-secondary border-border font-mono text-sm ${row.error && !row.unitId ? 'border-destructive' : ''}`}
                      />
                      {row.error && (
                        <p className="text-xs text-destructive">{row.error}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.totalPkts}
                      onChange={e => updateRow(row.id, 'totalPkts', e.target.value)}
                      placeholder="0"
                      type="number"
                      min="0"
                      className="h-8 bg-secondary border-border font-mono text-sm text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.storedPkts}
                      onChange={e => updateRow(row.id, 'storedPkts', e.target.value)}
                      placeholder="0"
                      type="number"
                      min="0"
                      className="h-8 bg-secondary border-border font-mono text-sm text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.validGpsPkts}
                      onChange={e => updateRow(row.id, 'validGpsPkts', e.target.value)}
                      placeholder="0"
                      type="number"
                      min="0"
                      className="h-8 bg-secondary border-border font-mono text-sm text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={clearForm}
          className="border-border bg-secondary hover:bg-muted"
        >
          Clear All
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitStatus === 'submitting'}
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 min-w-[140px]"
        >
          {submitStatus === 'submitting' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save All Entries
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

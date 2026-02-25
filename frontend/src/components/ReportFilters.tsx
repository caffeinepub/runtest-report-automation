import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { UnitModel, MODEL_LABELS, ALL_MODELS, type ReportEntry } from '@/hooks/useQueries';
import { Download, Filter } from 'lucide-react';
import { WeekNavigator } from './WeekNavigator';

interface ReportFiltersProps {
  selectedModel: UnitModel | 'ALL';
  onModelChange: (model: UnitModel | 'ALL') => void;
  selectedWeek: string;
  onWeekChange: (week: string) => void;
  availableWeeks: string[];
  filteredEntries: ReportEntry[];
}

function exportToCSV(entries: ReportEntry[], week: string, model: UnitModel | 'ALL') {
  const modelLabel = model === 'ALL' ? 'All Models' : MODEL_LABELS[model];
  const headers = ['Unit ID', 'Model', 'Week', 'Total Packets', 'Stored Packets', 'Valid GPS Fix Packets', 'GPS Fix %', 'Stored %'];

  const rows = entries.map(e => {
    const total = Number(e.totalPkts);
    const stored = Number(e.storedPkts);
    const valid = Number(e.validGpsFixPkts);
    const gpsPct = total > 0 ? ((valid / total) * 100).toFixed(2) : '0.00';
    const storedPct = total > 0 ? ((stored / total) * 100).toFixed(2) : '0.00';
    return [
      e.unitId,
      MODEL_LABELS[e.unitModel as UnitModel] ?? String(e.unitModel),
      e.weekYear,
      total,
      stored,
      valid,
      gpsPct + '%',
      storedPct + '%',
    ];
  });

  // Add totals row
  const totalPkts = entries.reduce((s, e) => s + Number(e.totalPkts), 0);
  const storedPkts = entries.reduce((s, e) => s + Number(e.storedPkts), 0);
  const validPkts = entries.reduce((s, e) => s + Number(e.validGpsFixPkts), 0);
  const gpsPct = totalPkts > 0 ? ((validPkts / totalPkts) * 100).toFixed(2) : '0.00';
  const storedPct = totalPkts > 0 ? ((storedPkts / totalPkts) * 100).toFixed(2) : '0.00';
  rows.push(['TOTALS', modelLabel, week, totalPkts, storedPkts, validPkts, gpsPct + '%', storedPct + '%']);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `runtest-report-${week}-${model}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportFilters({
  selectedModel,
  onModelChange,
  selectedWeek,
  onWeekChange,
  availableWeeks,
  filteredEntries,
}: ReportFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-4 p-4 bg-card border border-border rounded-lg">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Filter className="w-4 h-4" />
        <span className="text-sm font-medium text-foreground">Filters</span>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Week</Label>
        <WeekNavigator
          currentWeek={selectedWeek}
          onWeekChange={onWeekChange}
          availableWeeks={availableWeeks.length > 0 ? availableWeeks : undefined}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Model</Label>
        <Select value={selectedModel} onValueChange={(v) => onModelChange(v as UnitModel | 'ALL')}>
          <SelectTrigger className="w-36 bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Models</SelectItem>
            {ALL_MODELS.map(model => (
              <SelectItem key={model} value={model}>
                {MODEL_LABELS[model]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto">
        <Button
          variant="outline"
          onClick={() => exportToCSV(filteredEntries, selectedWeek, selectedModel)}
          disabled={filteredEntries.length === 0}
          className="border-primary/30 text-primary hover:bg-primary/10 gap-2"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>
    </div>
  );
}

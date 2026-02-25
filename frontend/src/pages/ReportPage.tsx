import { useMemo, useState } from 'react';
import { useGetAllReports, UnitModel, getCurrentWeekLabel } from '@/hooks/useQueries';
import { WeeklyReportTable } from '@/components/WeeklyReportTable';
import { ReportFilters } from '@/components/ReportFilters';
import { ClipboardList } from 'lucide-react';

export function ReportPage() {
  const { data: allReports = [], isLoading } = useGetAllReports();

  const availableWeeks = useMemo(() => {
    const weeks = new Set(allReports.map(r => r.weekYear));
    return Array.from(weeks).sort().reverse();
  }, [allReports]);

  const defaultWeek = useMemo(() => {
    return availableWeeks[0] ?? getCurrentWeekLabel();
  }, [availableWeeks]);

  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<UnitModel | 'ALL'>('ALL');

  const currentWeek = selectedWeek ?? defaultWeek;

  const filteredEntries = useMemo(() => {
    return allReports
      .filter(e => e.weekYear === currentWeek)
      .filter(e => selectedModel === 'ALL' || e.unitModel === selectedModel)
      .sort((a, b) => a.unitId.localeCompare(b.unitId));
  }, [allReports, currentWeek, selectedModel]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Weekly Report</h1>
          <p className="text-sm text-muted-foreground">
            View and export GPS unit packet data by week and model
          </p>
        </div>
      </div>

      {/* Filters */}
      <ReportFilters
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        selectedWeek={currentWeek}
        onWeekChange={setSelectedWeek}
        availableWeeks={availableWeeks}
        filteredEntries={filteredEntries}
      />

      {/* Report Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
          <span className="text-sm font-medium">
            Report: <span className="font-mono text-primary">{currentWeek}</span>
            {selectedModel !== 'ALL' && (
              <span className="ml-2 text-muted-foreground">
                / {selectedModel === UnitModel.N135 ? 'N13.5' : selectedModel === UnitModel.N13 ? 'N13' : 'N12.5'}
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {filteredEntries.length} units
          </span>
        </div>
        <WeeklyReportTable
          entries={allReports}
          isLoading={isLoading}
          selectedModel={selectedModel}
          selectedWeek={currentWeek}
        />
      </div>
    </div>
  );
}

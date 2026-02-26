import { useState, useEffect } from 'react';
import { useGetAllReports, getISOWeekLabel, UnitModel } from '@/hooks/useQueries';
import { ReportFilters } from '@/components/ReportFilters';
import { WeeklyReportTable } from '@/components/WeeklyReportTable';
import { filterValidEntries } from '@/utils/reportFilters';

export default function ReportPage() {
  const { data: rawReports = [], isLoading } = useGetAllReports();
  const [currentWeek, setCurrentWeek] = useState(getISOWeekLabel());
  const [selectedModel, setSelectedModel] = useState<UnitModel | 'ALL'>('ALL');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('ALL');

  // Strip invalid unit IDs once at the top level so all downstream data is clean
  const reports = filterValidEntries(rawReports);

  const availableWeeks = Array.from(new Set(reports.map(r => r.weekYear))).sort();

  // Auto-select the most recent available week if current week has no data
  useEffect(() => {
    if (reports.length > 0 && !reports.some(r => r.weekYear === currentWeek)) {
      const sorted = [...availableWeeks].sort();
      if (sorted.length > 0) {
        setCurrentWeek(sorted[sorted.length - 1]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports]);

  // Reset unit ID filter when model or week changes
  useEffect(() => {
    setSelectedUnitId('ALL');
  }, [selectedModel, currentWeek]);

  // Filter by week and model
  const modelWeekFiltered = reports.filter(r => {
    const weekMatch = r.weekYear === currentWeek;
    const modelMatch = selectedModel === 'ALL' || r.unitModel === selectedModel;
    return weekMatch && modelMatch;
  });

  // Further filter by unit ID
  const filteredReports = selectedUnitId === 'ALL'
    ? modelWeekFiltered
    : modelWeekFiltered.filter(r => r.unitId === selectedUnitId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Weekly Reports</h1>
        <p className="text-muted-foreground text-sm">Detailed GPS packet data by unit and week</p>
      </div>

      <ReportFilters
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        selectedWeek={currentWeek}
        onWeekChange={setCurrentWeek}
        availableWeeks={availableWeeks}
        filteredEntries={filteredReports}
        modelWeekEntries={modelWeekFiltered}
        selectedUnitId={selectedUnitId}
        onUnitIdChange={setSelectedUnitId}
      />

      <WeeklyReportTable
        entries={filteredReports}
        isLoading={isLoading}
        selectedModel={selectedModel}
        selectedWeek={currentWeek}
      />
    </div>
  );
}

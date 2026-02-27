import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Columns } from 'lucide-react';
import { useGetAllReports, getISOWeekLabel, UnitModel } from '@/hooks/useQueries';
import { filterValidEntries } from '@/utils/reportFilters';
import WeeklyReportTable from '@/components/WeeklyReportTable';
import { ReportFilters } from '@/components/ReportFilters';
import { useColumnMapping } from '@/hooks/useColumnMapping';

const ReportPage: React.FC = () => {
  const [selectedWeek, setSelectedWeek] = useState(() => getISOWeekLabel());
  const [selectedModel, setSelectedModel] = useState<UnitModel | 'ALL'>('ALL');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('ALL');

  const { data: rawReports = [], isLoading } = useGetAllReports();
  const { selectedColumns } = useColumnMapping();

  const allValid = useMemo(() => filterValidEntries(rawReports), [rawReports]);

  // All available weeks for the week navigator
  const availableWeeks = useMemo(
    () => Array.from(new Set(allValid.map(e => e.weekYear))).sort(),
    [allValid]
  );

  // Entries filtered by week only
  const weekEntries = useMemo(
    () => allValid.filter(e => e.weekYear === selectedWeek),
    [allValid, selectedWeek]
  );

  // Entries filtered by week + model (used to populate unit ID dropdown)
  const modelWeekEntries = useMemo(() => {
    if (selectedModel === 'ALL') return weekEntries;
    return weekEntries.filter(e => String(e.unitModel) === selectedModel);
  }, [weekEntries, selectedModel]);

  // Fully filtered entries (week + model + unit ID)
  const filteredEntries = useMemo(() => {
    if (selectedUnitId === 'ALL') return modelWeekEntries;
    return modelWeekEntries.filter(e => e.unitId === selectedUnitId);
  }, [modelWeekEntries, selectedUnitId]);

  // Reset unit ID filter when model or week changes
  const handleModelChange = (model: UnitModel | 'ALL') => {
    setSelectedModel(model);
    setSelectedUnitId('ALL');
  };

  const handleWeekChange = (week: string) => {
    setSelectedWeek(week);
    setSelectedUnitId('ALL');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Weekly GPS tracker packet report
        </p>
      </div>

      {/* Filters */}
      <ReportFilters
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        selectedWeek={selectedWeek}
        onWeekChange={handleWeekChange}
        availableWeeks={availableWeeks}
        filteredEntries={filteredEntries}
        modelWeekEntries={modelWeekEntries}
        selectedUnitId={selectedUnitId}
        onUnitIdChange={setSelectedUnitId}
      />

      {/* Custom columns notice */}
      {selectedColumns.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-1">
          <Columns className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-xs text-amber-400/80">Custom columns:</span>
          {selectedColumns.map(col => (
            <Badge key={col} variant="outline" className="text-xs border-amber-500/30 text-amber-400/70 bg-amber-500/5">
              {col}
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground">— shown in table below</span>
        </div>
      )}

      {/* Report table */}
      <Card className="border-border/40 bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-400" />
              {selectedWeek} Report
            </CardTitle>
            <Badge variant="outline" className="text-xs border-border/40">
              {filteredEntries.length} unit{filteredEntries.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filteredEntries.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No data for {selectedWeek}</p>
            </div>
          ) : (
            <WeeklyReportTable entries={filteredEntries} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportPage;

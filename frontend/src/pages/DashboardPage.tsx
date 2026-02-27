import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Cpu, CheckCircle, HardDrive, Columns } from 'lucide-react';
import { useGetAllReports, getISOWeekLabel } from '@/hooks/useQueries';
import { filterValidEntries } from '@/utils/reportFilters';
import { ModelSummaryCard } from '@/components/ModelSummaryCard';
import { WeekNavigator } from '@/components/WeekNavigator';
import { UnitModel } from '@/backend';
import { useColumnMapping } from '@/hooks/useColumnMapping';

const DashboardPage: React.FC = () => {
  const [currentWeek, setCurrentWeek] = React.useState(() => getISOWeekLabel());
  const { data: rawReports = [], isLoading } = useGetAllReports();
  const { selectedColumns } = useColumnMapping();

  const allValid = filterValidEntries(rawReports);
  const weekEntries = allValid.filter(e => e.weekYear === currentWeek);

  const totalUnits = new Set(weekEntries.map(e => e.unitId)).size;
  const totalPkts = weekEntries.reduce((s, e) => s + Number(e.totalPkts), 0);
  const totalValid = weekEntries.reduce((s, e) => s + Number(e.validGpsFixPkts), 0);
  const totalStored = weekEntries.reduce((s, e) => s + Number(e.storedPkts), 0);

  const models = [UnitModel.N135, UnitModel.N13, UnitModel.N125];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">GPS tracker packet report overview</p>
        </div>
        <WeekNavigator currentWeek={currentWeek} onWeekChange={setCurrentWeek} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/40 bg-card/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Units</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {isLoading ? '—' : totalUnits}
                </p>
              </div>
              <Cpu className="h-8 w-8 text-amber-400/60" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Packets</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {isLoading ? '—' : totalPkts.toLocaleString()}
                </p>
              </div>
              <Activity className="h-8 w-8 text-blue-400/60" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Valid GPS Fixes</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {isLoading ? '—' : totalValid.toLocaleString()}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-400/60" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Stored Packets</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {isLoading ? '—' : totalStored.toLocaleString()}
                </p>
              </div>
              <HardDrive className="h-8 w-8 text-purple-400/60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Custom columns notice */}
      {selectedColumns.length > 0 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Columns className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="text-xs text-amber-300 font-medium">
                {selectedColumns.length} custom column{selectedColumns.length !== 1 ? 's' : ''} configured:
              </span>
              {selectedColumns.map(col => (
                <Badge key={col} variant="outline" className="text-xs border-amber-500/30 text-amber-400/80 bg-amber-500/10">
                  {col}
                </Badge>
              ))}
              <span className="text-xs text-muted-foreground ml-1">
                — visible in the Reports table
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-model breakdown */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          By Model — {currentWeek}
        </h2>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="border-border/40 bg-card/60 animate-pulse">
                <CardContent className="pt-6 pb-6">
                  <div className="h-16 bg-muted/40 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {models.map(model => (
              <ModelSummaryCard
                key={model}
                model={model}
                entries={weekEntries}
              />
            ))}
          </div>
        )}
      </div>

      {/* Empty state */}
      {!isLoading && weekEntries.length === 0 && (
        <Card className="border-border/40 bg-card/60">
          <CardContent className="py-12 text-center">
            <Activity className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No data for {currentWeek}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Import a file or enter data manually on the Data Entry page.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DashboardPage;

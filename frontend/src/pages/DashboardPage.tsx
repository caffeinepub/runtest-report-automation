import { useMemo, useState } from 'react';
import { useGetAllReports, ALL_MODELS, getCurrentWeekLabel, getAdjacentWeek } from '@/hooks/useQueries';
import { ModelSummaryCard } from '@/components/ModelSummaryCard';
import { WeekNavigator } from '@/components/WeekNavigator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Satellite, Activity } from 'lucide-react';
import { UnitModel } from '@/hooks/useQueries';

export function DashboardPage() {
  const { data: allReports = [], isLoading } = useGetAllReports();

  // Determine available weeks from data
  const availableWeeks = useMemo(() => {
    const weeks = new Set(allReports.map(r => r.weekYear));
    return Array.from(weeks).sort().reverse();
  }, [allReports]);

  // Default to most recent week with data, or current week
  const defaultWeek = useMemo(() => {
    return availableWeeks[0] ?? getCurrentWeekLabel();
  }, [availableWeeks]);

  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const currentWeek = selectedWeek ?? defaultWeek;

  const handleWeekChange = (week: string) => {
    setSelectedWeek(week);
  };

  // Aggregate stats for the selected week
  const weekReports = useMemo(() => {
    return allReports.filter(r => r.weekYear === currentWeek);
  }, [allReports, currentWeek]);

  const totalUnits = weekReports.length;
  const totalPkts = weekReports.reduce((s, e) => s + Number(e.totalPkts), 0);
  const validGpsPkts = weekReports.reduce((s, e) => s + Number(e.validGpsFixPkts), 0);
  const overallGpsPct = totalPkts > 0 ? ((validGpsPkts / totalPkts) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img
            src="/assets/generated/gps-icon.dim_128x128.png"
            alt="GPS Icon"
            className="w-10 h-10 object-contain"
          />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Weekly GPS unit performance overview</p>
          </div>
        </div>

        <WeekNavigator
          currentWeek={currentWeek}
          onWeekChange={handleWeekChange}
          availableWeeks={availableWeeks.length > 0 ? availableWeeks : undefined}
        />
      </div>

      {/* Summary Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Units', value: totalUnits, icon: Satellite },
          { label: 'Total Packets', value: totalPkts.toLocaleString(), icon: Activity },
          { label: 'Valid GPS Pkts', value: validGpsPkts.toLocaleString(), icon: Activity },
          { label: 'GPS Fix Rate', value: `${overallGpsPct}%`, icon: Activity },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="font-mono text-lg font-semibold text-foreground leading-none">{value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Model Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-64 bg-secondary" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ALL_MODELS.map(model => (
            <ModelSummaryCard
              key={model}
              model={model}
              entries={weekReports.filter(r => r.unitModel === model)}
            />
          ))}
        </div>
      )}

      {/* Available Weeks */}
      {availableWeeks.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">Available Weeks</h3>
          <div className="flex flex-wrap gap-2">
            {availableWeeks.map(week => (
              <Badge
                key={week}
                variant={week === currentWeek ? 'default' : 'outline'}
                className={`cursor-pointer font-mono text-xs transition-colors ${
                  week === currentWeek
                    ? 'bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-primary'
                }`}
                onClick={() => handleWeekChange(week)}
              >
                {week}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

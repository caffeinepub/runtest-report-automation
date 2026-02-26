import { useState } from 'react';
import { Activity, Package, MapPin, TrendingUp } from 'lucide-react';
import { useGetAllReports, getISOWeekLabel, MODEL_LABELS, ALL_MODELS } from '@/hooks/useQueries';
import { WeekNavigator } from '@/components/WeekNavigator';
import { ModelSummaryCard } from '@/components/ModelSummaryCard';
import { UnitModel } from '@/backend';

export default function DashboardPage() {
  const { data: reports = [], isLoading } = useGetAllReports();
  const [currentWeek, setCurrentWeek] = useState(getISOWeekLabel());

  // Derive available weeks from reports
  const availableWeeks = Array.from(new Set(reports.map(r => r.weekYear))).sort();

  // Auto-select the most recent available week if current week has no data
  const effectiveWeek =
    reports.some(r => r.weekYear === currentWeek)
      ? currentWeek
      : availableWeeks.length > 0
        ? availableWeeks[availableWeeks.length - 1]
        : currentWeek;

  // Filter reports for current week
  const weekReports = reports.filter(r => r.weekYear === effectiveWeek);

  // Aggregate stats
  const totalUnits = weekReports.length;
  const totalPackets = weekReports.reduce((s, r) => s + Number(r.totalPkts), 0);
  const validGpsPkts = weekReports.reduce((s, r) => s + Number(r.validGpsFixPkts), 0);
  const gpsFixRate = totalPackets > 0 ? ((validGpsPkts / totalPackets) * 100).toFixed(1) : '0.0';

  console.log('[DashboardPage] reports:', reports.length, 'effectiveWeek:', effectiveWeek, 'weekReports:', weekReports.length);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/assets/generated/gps-icon.dim_128x128.png" alt="GPS" className="w-12 h-12 rounded-lg opacity-90" />
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground text-sm">Weekly GPS unit performance overview</p>
          </div>
        </div>
        <WeekNavigator
          currentWeek={effectiveWeek}
          onWeekChange={setCurrentWeek}
          availableWeeks={availableWeeks}
        />
      </div>

      {/* Stats Bar */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-navy-800 border border-navy-600 rounded-lg p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<Activity size={18} />} label="Total Units" value={totalUnits} />
          <StatCard icon={<Package size={18} />} label="Total Packets" value={totalPackets.toLocaleString()} />
          <StatCard icon={<MapPin size={18} />} label="Valid GPS Pkts" value={validGpsPkts.toLocaleString()} />
          <StatCard icon={<TrendingUp size={18} />} label="GPS Fix Rate" value={`${gpsFixRate}%`} />
        </div>
      )}

      {/* Model Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ALL_MODELS.map((model: UnitModel) => (
          <ModelSummaryCard
            key={model}
            model={model}
            entries={weekReports.filter(r => r.unitModel === model)}
          />
        ))}
      </div>

      {/* Available Weeks */}
      {availableWeeks.length > 0 && (
        <div className="bg-navy-800 border border-navy-600 rounded-lg p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Available Weeks</h3>
          <div className="flex flex-wrap gap-2">
            {availableWeeks.map(week => (
              <button
                key={week}
                onClick={() => setCurrentWeek(week)}
                className={`px-3 py-1 rounded text-xs font-mono font-medium transition-colors ${
                  week === effectiveWeek
                    ? 'bg-amber-400 text-navy-950'
                    : 'bg-navy-700 text-muted-foreground hover:bg-navy-600 hover:text-foreground'
                }`}
              >
                {week}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-navy-800 border border-navy-600 rounded-lg p-4 flex items-center gap-3">
      <div className="text-amber-400">{icon}</div>
      <div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

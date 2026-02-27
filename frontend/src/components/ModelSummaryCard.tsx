import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { type ReportEntry, UnitModel, MODEL_LABELS } from '@/hooks/useQueries';
import { Cpu, Package, HardDrive, MapPin } from 'lucide-react';

interface ModelSummaryCardProps {
  model: UnitModel;
  entries: ReportEntry[];
}

export function ModelSummaryCard({ model, entries }: ModelSummaryCardProps) {
  // Count distinct unit IDs to match the report page's unit count
  const unitCount = new Set(entries.map(e => e.unitId)).size;
  const totalPkts = entries.reduce((sum, e) => sum + Number(e.totalPkts), 0);
  const storedPkts = entries.reduce((sum, e) => sum + Number(e.storedPkts), 0);
  const validGpsPkts = entries.reduce((sum, e) => sum + Number(e.validGpsFixPkts), 0);
  const gpsFixPct = totalPkts > 0 ? ((validGpsPkts / totalPkts) * 100).toFixed(1) : '0.0';
  const storedPct = totalPkts > 0 ? ((storedPkts / totalPkts) * 100).toFixed(1) : '0.0';

  const modelColors: Record<UnitModel, string> = {
    [UnitModel.N135]: 'text-amber-400',
    [UnitModel.N13]: 'text-chart-2',
    [UnitModel.N125]: 'text-chart-4',
  };

  const modelBorderColors: Record<UnitModel, string> = {
    [UnitModel.N135]: 'border-amber-500/30',
    [UnitModel.N13]: 'border-chart-2/30',
    [UnitModel.N125]: 'border-chart-4/30',
  };

  const modelBgColors: Record<UnitModel, string> = {
    [UnitModel.N135]: 'bg-amber-500/10',
    [UnitModel.N13]: 'bg-chart-2/10',
    [UnitModel.N125]: 'bg-chart-4/10',
  };

  const accentColor = modelColors[model];
  const borderColor = modelBorderColors[model];
  const bgColor = modelBgColors[model];

  return (
    <Card className={`border ${borderColor} bg-card animate-fade-in`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${bgColor} border ${borderColor} flex items-center justify-center`}>
              <Cpu className={`w-5 h-5 ${accentColor}`} />
            </div>
            <div>
              <CardTitle className={`text-xl font-bold ${accentColor}`}>
                {MODEL_LABELS[model]}
              </CardTitle>
              <p className="text-xs text-muted-foreground">GPS Unit Model</p>
            </div>
          </div>
          <Badge variant="outline" className={`${borderColor} ${accentColor} font-mono`}>
            {unitCount} units
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {unitCount === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No data for this week</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <Package className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                <div className={`stat-value text-lg ${accentColor}`}>
                  {totalPkts.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Total Pkts</div>
              </div>

              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <HardDrive className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                <div className="stat-value text-lg text-foreground">
                  {storedPkts.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Stored</div>
              </div>

              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <MapPin className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                <div className="stat-value text-lg text-foreground">
                  {validGpsPkts.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Valid GPS</div>
              </div>
            </div>

            {/* GPS Fix Rate Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Valid GPS Fix Rate</span>
                <span className={`font-mono font-semibold ${accentColor}`}>{gpsFixPct}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${bgColor.replace('/10', '/80')}`}
                  style={{ width: `${Math.min(parseFloat(gpsFixPct), 100)}%` }}
                />
              </div>
            </div>

            {/* Stored Rate Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Stored Packet Rate</span>
                <span className="font-mono font-semibold text-foreground">{storedPct}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-muted-foreground/40 transition-all duration-500"
                  style={{ width: `${Math.min(parseFloat(storedPct), 100)}%` }}
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

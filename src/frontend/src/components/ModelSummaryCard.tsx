import type { ReportEntry } from "@/backend";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { countDistinctUnits } from "@/utils/reportFilters";
import { Building2, Cpu, HardDrive, MapPin, Package, Tag } from "lucide-react";

interface ModelSummaryCardProps {
  model: string;
  entries: ReportEntry[];
}

const MODEL_COLORS: Record<string, string> = {
  "N13.5": "text-amber-400",
  N13: "text-blue-400",
  "N12.5": "text-purple-400",
};

const MODEL_BORDER_COLORS: Record<string, string> = {
  "N13.5": "border-amber-500/30",
  N13: "border-blue-500/30",
  "N12.5": "border-purple-500/30",
};

const MODEL_BG_COLORS: Record<string, string> = {
  "N13.5": "bg-amber-500/10",
  N13: "bg-blue-500/10",
  "N12.5": "bg-purple-500/10",
};

const MODEL_BAR_COLORS: Record<string, string> = {
  "N13.5": "bg-amber-500/70",
  N13: "bg-blue-500/70",
  "N12.5": "bg-purple-500/70",
};

/**
 * Maps backend Flavour enum values to human-readable display labels.
 * Matches the same logic used in WeeklyReportTable.
 */
function flavourLabel(f: string): string {
  if (!f || f.trim() === "") return "—";
  const lower = f.trim().toLowerCase();
  switch (lower) {
    case "aqi":
      return "AQI";
    case "standard":
      return "Lite";
    case "deluxe": {
      // Check for custom "Others" label stored in localStorage
      const custom = localStorage.getItem("runtest_others_flavour_label");
      return custom?.trim() ? custom.trim() : "Others";
    }
    case "premium":
      return "Premium"; // backward compat
    default:
      return f.charAt(0).toUpperCase() + f.slice(1);
  }
}

function locationLabel(l: string): string {
  if (!l || l.trim() === "") return "—";
  return l;
}

interface BreakdownItem {
  label: string;
  unitCount: number;
  totalPkts: number;
}

function buildBreakdown(
  entries: ReportEntry[],
  keyFn: (e: ReportEntry) => string,
  labelFn: (k: string) => string,
): BreakdownItem[] {
  const map = new Map<string, ReportEntry[]>();
  for (const e of entries) {
    const key = keyFn(e);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries())
    .map(([key, items]) => ({
      label: labelFn(key),
      unitCount: countDistinctUnits(items),
      totalPkts: items.reduce((s, e) => s + Number(e.totalPkts), 0),
    }))
    .sort((a, b) => b.unitCount - a.unitCount);
}

export function ModelSummaryCard({ model, entries }: ModelSummaryCardProps) {
  // Use consistent distinct unit counting
  const unitCount = countDistinctUnits(entries);
  const totalPkts = entries.reduce((sum, e) => sum + Number(e.totalPkts), 0);
  const storedPkts = entries.reduce((sum, e) => sum + Number(e.storedPkts), 0);
  const validGpsPkts = entries.reduce(
    (sum, e) => sum + Number(e.validGpsFixPkts),
    0,
  );
  const gpsFixPct =
    totalPkts > 0 ? ((validGpsPkts / totalPkts) * 100).toFixed(1) : "0.0";
  const storedPct =
    totalPkts > 0 ? ((storedPkts / totalPkts) * 100).toFixed(1) : "0.0";

  const accentColor = MODEL_COLORS[model] ?? "text-foreground";
  const borderColor = MODEL_BORDER_COLORS[model] ?? "border-border/30";
  const bgColor = MODEL_BG_COLORS[model] ?? "bg-muted/10";
  const barColor = MODEL_BAR_COLORS[model] ?? "bg-primary/70";

  // Breakdowns
  const flavourBreakdown = buildBreakdown(
    entries,
    (e) => String(e.flavour ?? "").trim(),
    flavourLabel,
  );
  const locationBreakdown = buildBreakdown(
    entries,
    (e) => (e.location ?? "").trim(),
    locationLabel,
  );

  return (
    <Card className={`border ${borderColor} bg-card animate-fade-in`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg ${bgColor} border ${borderColor} flex items-center justify-center`}
            >
              <Cpu className={`w-5 h-5 ${accentColor}`} />
            </div>
            <div>
              <CardTitle className={`text-xl font-bold ${accentColor}`}>
                {model}
              </CardTitle>
              <p className="text-xs text-muted-foreground">GPS Unit Model</p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={`${borderColor} ${accentColor} font-mono`}
          >
            {unitCount} units
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {unitCount === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No data for this week
          </p>
        ) : (
          <>
            {/* Packet Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <Package className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                <div className={`text-lg font-bold ${accentColor}`}>
                  {totalPkts.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Total Pkts
                </div>
              </div>

              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <HardDrive className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                <div className="text-lg font-bold text-foreground">
                  {storedPkts.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Stored
                </div>
              </div>

              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <MapPin className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                <div className="text-lg font-bold text-foreground">
                  {validGpsPkts.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Valid GPS
                </div>
              </div>
            </div>

            {/* Rate bars */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Valid GPS Fix Rate
                </span>
                <span className={`font-mono font-semibold ${accentColor}`}>
                  {gpsFixPct}%
                </span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{
                    width: `${Math.min(Number.parseFloat(gpsFixPct), 100)}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Stored Packet Rate
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {storedPct}%
                </span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-muted-foreground/40 transition-all duration-500"
                  style={{
                    width: `${Math.min(Number.parseFloat(storedPct), 100)}%`,
                  }}
                />
              </div>
            </div>

            <Separator className="opacity-30" />

            {/* Flavour Breakdown */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  By Flavour
                </span>
              </div>
              <div className="space-y-1.5">
                {flavourBreakdown.map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span
                      className="text-xs text-foreground/80 w-24 truncate shrink-0"
                      title={item.label}
                    >
                      {item.label}
                    </span>
                    <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor} opacity-70 transition-all duration-500`}
                        style={{
                          width:
                            unitCount > 0
                              ? `${(item.unitCount / unitCount) * 100}%`
                              : "0%",
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-16 text-right shrink-0">
                      {item.unitCount} unit{item.unitCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <Separator className="opacity-30" />

            {/* Location Breakdown */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  By Location
                </span>
              </div>
              <div className="space-y-1.5">
                {locationBreakdown.map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span
                      className="text-xs text-foreground/80 w-24 truncate shrink-0"
                      title={item.label}
                    >
                      {item.label}
                    </span>
                    <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor} opacity-50 transition-all duration-500`}
                        style={{
                          width:
                            unitCount > 0
                              ? `${(item.unitCount / unitCount) * 100}%`
                              : "0%",
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-16 text-right shrink-0">
                      {item.unitCount} unit{item.unitCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

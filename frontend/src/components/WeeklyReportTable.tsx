import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { type ReportEntry, UnitModel, MODEL_LABELS } from '@/hooks/useQueries';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface WeeklyReportTableProps {
  entries: ReportEntry[];
  isLoading: boolean;
  selectedModel: UnitModel | 'ALL';
  selectedWeek: string;
}

function GpsFixBadge({ pct }: { pct: number }) {
  if (pct >= 90) return (
    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 font-mono text-xs gap-1">
      <TrendingUp className="w-3 h-3" />
      {pct.toFixed(1)}%
    </Badge>
  );
  if (pct >= 70) return (
    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 font-mono text-xs gap-1">
      <Minus className="w-3 h-3" />
      {pct.toFixed(1)}%
    </Badge>
  );
  return (
    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 font-mono text-xs gap-1">
      <TrendingDown className="w-3 h-3" />
      {pct.toFixed(1)}%
    </Badge>
  );
}

export function WeeklyReportTable({ entries, isLoading, selectedModel, selectedWeek }: WeeklyReportTableProps) {
  // Entries are already filtered upstream (by week, model, and unit ID); just sort them here
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => a.unitId.localeCompare(b.unitId));
  }, [entries]);

  const totals = useMemo(() => {
    const totalPkts = sortedEntries.reduce((s, e) => s + Number(e.totalPkts), 0);
    const storedPkts = sortedEntries.reduce((s, e) => s + Number(e.storedPkts), 0);
    const validGpsPkts = sortedEntries.reduce((s, e) => s + Number(e.validGpsFixPkts), 0);
    const normalPkts = sortedEntries.reduce((s, e) => s + Number(e.normalPktCount), 0);
    const gpsFixPct = totalPkts > 0 ? (validGpsPkts / totalPkts) * 100 : 0;
    return { totalPkts, storedPkts, validGpsPkts, normalPkts, gpsFixPct };
  }, [sortedEntries]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-secondary" />
        ))}
      </div>
    );
  }

  if (sortedEntries.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <div className="text-4xl mb-3">📡</div>
        <p className="text-sm font-medium">No data found</p>
        <p className="text-xs mt-1">No entries for {selectedWeek}{selectedModel !== 'ALL' ? ` / ${MODEL_LABELS[selectedModel as UnitModel]}` : ''}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-xs text-muted-foreground uppercase tracking-wide">Unit ID</TableHead>
            {selectedModel === 'ALL' && (
              <TableHead className="text-xs text-muted-foreground uppercase tracking-wide">Model</TableHead>
            )}
            <TableHead className="text-xs text-muted-foreground uppercase tracking-wide text-right">Total Pkts</TableHead>
            <TableHead className="text-xs text-muted-foreground uppercase tracking-wide text-right">Normal Pkts</TableHead>
            <TableHead className="text-xs text-muted-foreground uppercase tracking-wide text-right">Stored Pkts</TableHead>
            <TableHead className="text-xs text-muted-foreground uppercase tracking-wide text-right">Valid GPS Pkts</TableHead>
            <TableHead className="text-xs text-muted-foreground uppercase tracking-wide text-right">GPS Fix %</TableHead>
            <TableHead className="text-xs text-muted-foreground uppercase tracking-wide text-right">Stored %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEntries.map((entry) => {
            const total = Number(entry.totalPkts);
            const stored = Number(entry.storedPkts);
            const valid = Number(entry.validGpsFixPkts);
            const normal = Number(entry.normalPktCount);
            const gpsFixPct = total > 0 ? (valid / total) * 100 : 0;
            const storedPct = total > 0 ? (stored / total) * 100 : 0;

            return (
              <TableRow key={`${entry.unitId}-${entry.weekYear}`} className="border-border hover:bg-secondary/30">
                <TableCell className="font-mono text-sm font-medium text-foreground">
                  {entry.unitId}
                </TableCell>
                {selectedModel === 'ALL' && (
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary">
                      {MODEL_LABELS[entry.unitModel as UnitModel] ?? String(entry.unitModel)}
                    </Badge>
                  </TableCell>
                )}
                <TableCell className="data-table-cell text-right">{total.toLocaleString()}</TableCell>
                <TableCell className="data-table-cell text-right">{normal.toLocaleString()}</TableCell>
                <TableCell className="data-table-cell text-right">{stored.toLocaleString()}</TableCell>
                <TableCell className="data-table-cell text-right">{valid.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <GpsFixBadge pct={gpsFixPct} />
                </TableCell>
                <TableCell className="data-table-cell text-right text-muted-foreground">
                  {storedPct.toFixed(1)}%
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="border-t-2 border-primary/30 bg-secondary/50 font-semibold">
            <TableCell className="font-mono text-sm text-primary">
              TOTALS ({sortedEntries.length} units)
            </TableCell>
            {selectedModel === 'ALL' && <TableCell />}
            <TableCell className="data-table-cell text-right text-primary">
              {totals.totalPkts.toLocaleString()}
            </TableCell>
            <TableCell className="data-table-cell text-right text-primary">
              {totals.normalPkts.toLocaleString()}
            </TableCell>
            <TableCell className="data-table-cell text-right">
              {totals.storedPkts.toLocaleString()}
            </TableCell>
            <TableCell className="data-table-cell text-right">
              {totals.validGpsPkts.toLocaleString()}
            </TableCell>
            <TableCell className="text-right">
              <GpsFixBadge pct={totals.gpsFixPct} />
            </TableCell>
            <TableCell className="data-table-cell text-right text-muted-foreground">
              {totals.totalPkts > 0 ? ((totals.storedPkts / totals.totalPkts) * 100).toFixed(1) : '0.0'}%
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

import type { ReportEntry } from "@/backend";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useColumnMapping } from "@/hooks/useColumnMapping";
import { countDistinctUnits } from "@/utils/reportFilters";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";

interface WeeklyReportTableProps {
  entries: ReportEntry[];
  isLoading?: boolean;
  rawRowData?: Map<string, Record<string, string>>;
}

type SortKey =
  | "unitId"
  | "model"
  | "flavour"
  | "location"
  | "totalPkts"
  | "normalPktCount"
  | "storedPkts"
  | "validGpsFixPkts";
type SortDir = "asc" | "desc";

function modelLabel(m: string): string {
  if (m === "N135") return "N13.5";
  if (m === "N125") return "N12.5";
  if (m === "N13") return "N13";
  return m;
}

/**
 * Maps backend Flavour enum values to human-readable display labels.
 * Backend stores: 'aqi', 'premium', 'standard', 'deluxe'
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

function calcPct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

const WeeklyReportTable: React.FC<WeeklyReportTableProps> = ({
  entries,
  isLoading,
  rawRowData,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>("unitId");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { selectedColumns, getColumnValue } = useColumnMapping();

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "unitId":
          cmp = a.unitId.localeCompare(b.unitId);
          break;
        case "model":
          cmp = String(a.model).localeCompare(String(b.model));
          break;
        case "flavour":
          cmp = String(a.flavour ?? "").localeCompare(String(b.flavour ?? ""));
          break;
        case "location":
          cmp = (a.location ?? "").localeCompare(b.location ?? "");
          break;
        case "totalPkts":
          cmp = Number(a.totalPkts) - Number(b.totalPkts);
          break;
        case "normalPktCount":
          cmp = Number(a.normalPktCount) - Number(b.normalPktCount);
          break;
        case "storedPkts":
          cmp = Number(a.storedPkts) - Number(b.storedPkts);
          break;
        case "validGpsFixPkts":
          cmp = Number(a.validGpsFixPkts) - Number(b.validGpsFixPkts);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [entries, sortKey, sortDir]);

  const totals = useMemo(
    () => ({
      total: entries.reduce((s, e) => s + Number(e.totalPkts), 0),
      normal: entries.reduce((s, e) => s + Number(e.normalPktCount), 0),
      stored: entries.reduce((s, e) => s + Number(e.storedPkts), 0),
      valid: entries.reduce((s, e) => s + Number(e.validGpsFixPkts), 0),
    }),
    [entries],
  );

  // Use consistent distinct unit count
  const distinctUnitCount = useMemo(
    () => countDistinctUnits(entries),
    [entries],
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-amber-400" />
    ) : (
      <ArrowDown className="h-3 w-3 text-amber-400" />
    );
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No data available for the selected filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border/40 hover:bg-transparent">
            <TableHead className="text-xs font-semibold text-muted-foreground w-8">
              #
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground"
                onClick={() => handleSort("unitId")}
              >
                Unit ID <SortIcon k="unitId" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground"
                onClick={() => handleSort("model")}
              >
                Model <SortIcon k="model" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground"
                onClick={() => handleSort("flavour")}
              >
                Flavour <SortIcon k="flavour" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground"
                onClick={() => handleSort("location")}
              >
                Location <SortIcon k="location" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground"
                onClick={() => handleSort("totalPkts")}
              >
                Total <SortIcon k="totalPkts" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground"
                onClick={() => handleSort("normalPktCount")}
              >
                Normal Pkts <SortIcon k="normalPktCount" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground"
                onClick={() => handleSort("storedPkts")}
              >
                Stored <SortIcon k="storedPkts" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground text-right">
              Stored Pkt %
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground"
                onClick={() => handleSort("validGpsFixPkts")}
              >
                Valid GPS <SortIcon k="validGpsFixPkts" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground text-right">
              Valid GPS %
            </TableHead>
            {selectedColumns.map((col) => (
              <TableHead
                key={col}
                className="text-xs font-semibold text-amber-400/80 text-right bg-amber-500/5 border-l border-amber-500/20"
                title={col}
              >
                <span className="truncate max-w-[80px] block">{col}</span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((entry, idx) => {
            const rawRow = rawRowData?.get(entry.unitId);
            const total = Number(entry.totalPkts);
            const stored = Number(entry.storedPkts);
            const valid = Number(entry.validGpsFixPkts);
            return (
              <TableRow
                key={`${entry.unitId}-${idx}`}
                className="border-border/20 hover:bg-muted/20"
              >
                <TableCell className="text-xs text-muted-foreground">
                  {idx + 1}
                </TableCell>
                <TableCell className="text-xs font-mono font-medium text-amber-300">
                  {entry.unitId}
                </TableCell>
                <TableCell className="text-xs text-foreground/80">
                  {modelLabel(String(entry.model))}
                </TableCell>
                <TableCell className="text-xs text-foreground/80">
                  {flavourLabel(String(entry.flavour ?? ""))}
                </TableCell>
                <TableCell
                  className="text-xs text-foreground/80 max-w-[120px] truncate"
                  title={entry.location || ""}
                >
                  {locationLabel(entry.location ?? "")}
                </TableCell>
                <TableCell className="text-xs text-right tabular-nums">
                  {total.toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-right tabular-nums text-blue-300">
                  {Number(entry.normalPktCount).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-right tabular-nums">
                  {stored.toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                  {calcPct(stored, total)}
                </TableCell>
                <TableCell className="text-xs text-right tabular-nums text-green-400">
                  {valid.toLocaleString()}
                </TableCell>
                <TableCell className="text-xs text-right tabular-nums text-green-300">
                  {calcPct(valid, total)}
                </TableCell>
                {selectedColumns.map((col) => (
                  <TableCell
                    key={col}
                    className="text-xs text-right tabular-nums text-amber-300/80 bg-amber-500/5 border-l border-amber-500/10"
                  >
                    {rawRow ? getColumnValue(rawRow, col) || "—" : "—"}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="border-border/40 bg-muted/10">
            <TableCell
              colSpan={2}
              className="text-xs font-semibold text-muted-foreground"
            >
              Totals ({distinctUnitCount} unit
              {distinctUnitCount !== 1 ? "s" : ""})
            </TableCell>
            <TableCell className="text-xs" />
            <TableCell className="text-xs" />
            <TableCell className="text-xs" />
            <TableCell className="text-xs text-right tabular-nums font-semibold">
              {totals.total.toLocaleString()}
            </TableCell>
            <TableCell className="text-xs text-right tabular-nums font-semibold text-blue-300">
              {totals.normal.toLocaleString()}
            </TableCell>
            <TableCell className="text-xs text-right tabular-nums font-semibold">
              {totals.stored.toLocaleString()}
            </TableCell>
            <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
              {calcPct(totals.stored, totals.total)}
            </TableCell>
            <TableCell className="text-xs text-right tabular-nums font-semibold text-green-400">
              {totals.valid.toLocaleString()}
            </TableCell>
            <TableCell className="text-xs text-right tabular-nums text-green-300">
              {calcPct(totals.valid, totals.total)}
            </TableCell>
            {selectedColumns.map((col) => (
              <TableCell
                key={col}
                className="bg-amber-500/5 border-l border-amber-500/10"
              />
            ))}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
};

export default WeeklyReportTable;

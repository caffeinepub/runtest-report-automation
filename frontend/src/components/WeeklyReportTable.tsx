import React, { useState, useMemo } from 'react';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { ReportEntry } from '@/backend';
import { useColumnMapping } from '@/hooks/useColumnMapping';

interface WeeklyReportTableProps {
  entries: ReportEntry[];
  rawRowData?: Map<string, Record<string, string>>; // unitId -> raw CSV row
}

type SortKey = 'unitId' | 'unitModel' | 'totalPkts' | 'normalPktCount' | 'storedPkts' | 'validGpsFixPkts';
type SortDir = 'asc' | 'desc';

function modelLabel(m: string): string {
  if (m === 'N135') return 'N13-5';
  if (m === 'N125') return 'N12-5';
  return 'N13';
}

const WeeklyReportTable: React.FC<WeeklyReportTableProps> = ({ entries, rawRowData }) => {
  const [sortKey, setSortKey] = useState<SortKey>('unitId');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { selectedColumns, getColumnValue } = useColumnMapping();

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'unitId':
          cmp = a.unitId.localeCompare(b.unitId);
          break;
        case 'unitModel':
          cmp = String(a.unitModel).localeCompare(String(b.unitModel));
          break;
        case 'totalPkts':
          cmp = Number(a.totalPkts) - Number(b.totalPkts);
          break;
        case 'normalPktCount':
          cmp = Number(a.normalPktCount) - Number(b.normalPktCount);
          break;
        case 'storedPkts':
          cmp = Number(a.storedPkts) - Number(b.storedPkts);
          break;
        case 'validGpsFixPkts':
          cmp = Number(a.validGpsFixPkts) - Number(b.validGpsFixPkts);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [entries, sortKey, sortDir]);

  const totals = useMemo(() => ({
    total: entries.reduce((s, e) => s + Number(e.totalPkts), 0),
    normal: entries.reduce((s, e) => s + Number(e.normalPktCount), 0),
    stored: entries.reduce((s, e) => s + Number(e.storedPkts), 0),
    valid: entries.reduce((s, e) => s + Number(e.validGpsFixPkts), 0),
  }), [entries]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-amber-400" />
      : <ArrowDown className="h-3 w-3 text-amber-400" />;
  };

  const totalColSpan = 6 + selectedColumns.length;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border/40 hover:bg-transparent">
            <TableHead className="text-xs font-semibold text-muted-foreground w-8">#</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground">
              <Button variant="ghost" size="sm" className="h-6 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={() => handleSort('unitId')}>
                Unit ID <SortIcon k="unitId" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground">
              <Button variant="ghost" size="sm" className="h-6 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={() => handleSort('unitModel')}>
                Model <SortIcon k="unitModel" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground text-right">
              <Button variant="ghost" size="sm" className="h-6 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={() => handleSort('totalPkts')}>
                Total <SortIcon k="totalPkts" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground text-right">
              <Button variant="ghost" size="sm" className="h-6 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={() => handleSort('normalPktCount')}>
                Normal Pkts <SortIcon k="normalPktCount" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground text-right">
              <Button variant="ghost" size="sm" className="h-6 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={() => handleSort('storedPkts')}>
                Stored <SortIcon k="storedPkts" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground text-right">
              <Button variant="ghost" size="sm" className="h-6 px-0 text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={() => handleSort('validGpsFixPkts')}>
                Valid GPS <SortIcon k="validGpsFixPkts" />
              </Button>
            </TableHead>
            {/* Custom columns */}
            {selectedColumns.map(col => (
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
            return (
              <TableRow key={entry.unitId} className="border-border/20 hover:bg-muted/20">
                <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                <TableCell className="text-xs font-mono font-medium text-amber-300">{entry.unitId}</TableCell>
                <TableCell className="text-xs text-foreground/80">{modelLabel(String(entry.unitModel))}</TableCell>
                <TableCell className="text-xs text-right tabular-nums">{Number(entry.totalPkts).toLocaleString()}</TableCell>
                <TableCell className="text-xs text-right tabular-nums text-blue-300">{Number(entry.normalPktCount).toLocaleString()}</TableCell>
                <TableCell className="text-xs text-right tabular-nums">{Number(entry.storedPkts).toLocaleString()}</TableCell>
                <TableCell className="text-xs text-right tabular-nums text-green-400">{Number(entry.validGpsFixPkts).toLocaleString()}</TableCell>
                {/* Custom column cells */}
                {selectedColumns.map(col => (
                  <TableCell
                    key={col}
                    className="text-xs text-right tabular-nums text-amber-200/70 bg-amber-500/5 border-l border-amber-500/10"
                  >
                    {getColumnValue(rawRow, col)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="border-border/40 bg-muted/30">
            <TableCell colSpan={3} className="text-xs font-semibold text-muted-foreground">
              Totals ({entries.length} units)
            </TableCell>
            <TableCell className="text-xs font-semibold text-right tabular-nums">{totals.total.toLocaleString()}</TableCell>
            <TableCell className="text-xs font-semibold text-right tabular-nums text-blue-300">{totals.normal.toLocaleString()}</TableCell>
            <TableCell className="text-xs font-semibold text-right tabular-nums">{totals.stored.toLocaleString()}</TableCell>
            <TableCell className="text-xs font-semibold text-right tabular-nums text-green-400">{totals.valid.toLocaleString()}</TableCell>
            {/* Custom column totals footer — span remaining */}
            {selectedColumns.map(col => (
              <TableCell key={col} className="text-xs text-right text-muted-foreground bg-amber-500/5 border-l border-amber-500/10">
                —
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
};

export default WeeklyReportTable;

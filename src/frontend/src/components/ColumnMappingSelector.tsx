import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useColumnMapping } from "@/hooks/useColumnMapping";
import { CheckSquare, Columns, Square } from "lucide-react";
import type React from "react";
import { useMemo } from "react";

interface ColumnMappingSelectorProps {
  availableColumns: string[];
}

// Columns that are already shown in the main table — exclude from custom mapping
const BUILT_IN_COLUMNS = new Set([
  "Date",
  "date",
  "datetime",
  "DateTime",
  "unitId",
  "unit id",
  "Unit ID",
  "address",
  "Address",
  "totalPkts",
  "total pkt",
  "Total Pkt",
  "Total Packets",
  "storedPkts",
  "stored pkt",
  "Stored Pkt",
  "Stored Packets",
  "validGpsFixPkts",
  "valid gps",
  "Valid GPS",
  "normalPktCount",
  "normal pkt",
  "Normal Pkt",
  "PktState",
  "pktstate",
  "Pkt State",
]);

// Group columns by category for better UX
function groupColumns(cols: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {
    "GPS & Location": [],
    "Device Info": [],
    Environmental: [],
    Network: [],
    Other: [],
  };

  for (const col of cols) {
    const lower = col.toLowerCase();
    if (
      lower.includes("lat") ||
      lower.includes("lon") ||
      lower.includes("gps") ||
      lower.includes("heading") ||
      lower.includes("speed") ||
      lower.includes("distance")
    ) {
      groups["GPS & Location"].push(col);
    } else if (
      lower.includes("battery") ||
      lower.includes("hwid") ||
      lower.includes("fota") ||
      lower.includes("wakeup") ||
      lower.includes("motion") ||
      lower.includes("light") ||
      lower.includes("pressure")
    ) {
      groups["Device Info"].push(col);
    } else if (
      lower.includes("temp") ||
      lower.includes("humid") ||
      lower.includes("aqi") ||
      lower.includes("voc") ||
      lower.includes("co2") ||
      lower.includes("sensor")
    ) {
      groups.Environmental.push(col);
    } else if (
      lower.includes("rssi") ||
      lower.includes("signal") ||
      lower.includes("cellular") ||
      lower.includes("transmission") ||
      lower.includes("qrc")
    ) {
      groups.Network.push(col);
    } else {
      groups.Other.push(col);
    }
  }

  // Remove empty groups
  return Object.fromEntries(
    Object.entries(groups).filter(([, v]) => v.length > 0),
  );
}

const ColumnMappingSelector: React.FC<ColumnMappingSelectorProps> = ({
  availableColumns,
}) => {
  const { selectedColumns, toggleColumn, selectAll, clearAll, isSelected } =
    useColumnMapping();

  // Filter out built-in columns
  const customizableColumns = useMemo(
    () =>
      availableColumns.filter(
        (col) => !BUILT_IN_COLUMNS.has(col) && col.trim() !== "",
      ),
    [availableColumns],
  );

  const grouped = useMemo(
    () => groupColumns(customizableColumns),
    [customizableColumns],
  );

  if (customizableColumns.length === 0) {
    return (
      <div className="text-muted-foreground text-sm py-2">
        No additional columns available for mapping.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Columns className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-foreground">
            Select columns to display in Dashboard &amp; Reports
          </span>
          {selectedColumns.length > 0 && (
            <Badge
              variant="secondary"
              className="bg-amber-500/20 text-amber-300 border-amber-500/30"
            >
              {selectedColumns.length} selected
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => selectAll(customizableColumns)}
            className="h-7 text-xs border-border/50 hover:bg-muted"
          >
            <CheckSquare className="h-3 w-3 mr-1" />
            Select All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearAll}
            className="h-7 text-xs border-border/50 hover:bg-muted"
          >
            <Square className="h-3 w-3 mr-1" />
            Clear All
          </Button>
        </div>
      </div>

      {/* Column groups */}
      <div className="space-y-3">
        {Object.entries(grouped).map(([groupName, cols]) => (
          <div key={groupName}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {groupName}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {cols.map((col) => (
                <button
                  type="button"
                  key={col}
                  className="flex items-center gap-2 cursor-pointer group text-left"
                  onClick={() => toggleColumn(col)}
                >
                  <Checkbox
                    checked={isSelected(col)}
                    onCheckedChange={() => toggleColumn(col)}
                    className="border-border/60 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  />
                  <span
                    className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate"
                    title={col}
                  >
                    {col}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedColumns.length > 0 && (
        <div className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
          ✓ {selectedColumns.length} column
          {selectedColumns.length !== 1 ? "s" : ""} will appear in the Dashboard
          and Reports table. Selection is saved automatically.
        </div>
      )}
    </div>
  );
};

export default ColumnMappingSelector;

import { Calendar, Download, Filter, Search } from "lucide-react";
import React from "react";
import type { ReportEntry } from "../backend";
import { Model } from "../backend";

const MODEL_FILTER_OPTIONS: { label: string; value: Model | "all" }[] = [
  { label: "All Models", value: "all" },
  { label: "N13.5", value: Model.N135 },
  { label: "N13", value: Model.N13 },
  { label: "N12.5", value: Model.N125 },
];

interface ReportFiltersProps {
  availableWeeks: string[];
  selectedWeek: string;
  unitIdFilter: string;
  modelFilter: Model | "all";
  onFilterChange: (week: string, unitId: string, model: Model | "all") => void;
  entries: ReportEntry[];
}

function calcPct(
  numerator: bigint | number,
  denominator: bigint | number,
): string {
  const num = Number(numerator);
  const den = Number(denominator);
  if (den === 0) return "—";
  return `${((num / den) * 100).toFixed(1)}%`;
}

function flavourLabel(f: string): string {
  if (!f || f.trim() === "") return "—";
  const lower = f.trim().toLowerCase();
  switch (lower) {
    case "aqi":
      return "AQI";
    case "standard":
      return "Lite";
    case "deluxe": {
      const custom = localStorage.getItem("runtest_others_flavour_label");
      return custom?.trim() ? custom.trim() : "Others";
    }
    case "premium":
      return "Premium";
    default:
      return f.charAt(0).toUpperCase() + f.slice(1);
  }
}

function locationLabel(l: string): string {
  if (!l || l.trim() === "") return "—";
  return l;
}

function modelLabel(m: string): string {
  if (m === "N135") return "N13.5";
  if (m === "N125") return "N12.5";
  if (m === "N13") return "N13";
  if (m === "others") {
    const custom = localStorage.getItem("runtest_others_model_label");
    return custom?.trim() ? custom.trim() : "Others";
  }
  return m;
}

export function ReportFilters({
  availableWeeks,
  selectedWeek,
  unitIdFilter,
  modelFilter,
  onFilterChange,
  entries,
}: ReportFiltersProps) {
  const handleExportCSV = () => {
    if (entries.length === 0) return;

    const headers = [
      "Unit ID",
      "Week",
      "Model",
      "Flavour",
      "Location",
      "Total Packets",
      "Stored Packets",
      "Stored Pkt %",
      "Valid GPS Fix Packets",
      "Valid GPS %",
      "Stored Packet Count",
      "Normal Packets",
    ];

    const rows = entries.map((e) => {
      const total = e.totalPkts;
      const stored = e.storedPkts;
      const valid = e.validGpsFixPkts;
      // Escape fields that might contain commas
      const escapeCSV = (val: string) => (val.includes(",") ? `"${val}"` : val);
      return [
        escapeCSV(e.unitId),
        escapeCSV(e.weekYear),
        escapeCSV(modelLabel(String(e.model ?? ""))),
        escapeCSV(flavourLabel(String(e.flavour ?? ""))),
        escapeCSV(locationLabel(e.location ?? "")),
        total.toString(),
        stored.toString(),
        calcPct(stored, total),
        valid.toString(),
        calcPct(valid, total),
        e.storedPktCount.toString(),
        e.normalPktCount.toString(),
      ];
    });

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gps-report-${selectedWeek}${modelFilter !== "all" ? `-${modelFilter}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-xl bg-card border border-border">
      {/* Week Selector */}
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <select
          value={selectedWeek}
          onChange={(e) =>
            onFilterChange(e.target.value, unitIdFilter, modelFilter)
          }
          className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {availableWeeks.length === 0 && (
            <option value="">No data available</option>
          )}
          {availableWeeks.map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </select>
      </div>
      {/* Model Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select
          value={modelFilter}
          onChange={(e) =>
            onFilterChange(
              selectedWeek,
              unitIdFilter,
              e.target.value as Model | "all",
            )
          }
          className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {MODEL_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {/* Unit ID Filter */}
      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Filter by Unit ID..."
          value={unitIdFilter}
          onChange={(e) =>
            onFilterChange(selectedWeek, e.target.value, modelFilter)
          }
          className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary flex-1"
        />
      </div>
      {/* Export Button */}
      <button
        type="button"
        onClick={handleExportCSV}
        disabled={entries.length === 0}
        className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Download className="w-4 h-4" />
        Export CSV
      </button>
    </div>
  );
}

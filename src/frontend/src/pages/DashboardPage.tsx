import React, { useState, useEffect } from "react";
import type { ReportEntry } from "../backend";
import { Model } from "../backend";
import { ModelSummaryCard } from "../components/ModelSummaryCard";
import { WeekNavigator } from "../components/WeekNavigator";
import { useGetAllReports } from "../hooks/useQueries";
import { filterValidEntries } from "../utils/reportFilters";

const KPI_WEEKS = 4;

const MODEL_OPTIONS: { label: string; value: Model | "all" }[] = [
  { label: "All Models", value: "all" },
  { label: "N13.5", value: Model.N135 },
  { label: "N13", value: Model.N13 },
  { label: "N12.5", value: Model.N125 },
];

const MODEL_DISPLAY: Record<Model, string> = {
  [Model.N135]: "N13.5",
  [Model.N13]: "N13",
  [Model.N125]: "N12.5",
  [Model.others]: "Others",
};

function getWeekLabel(weekYear: string): string {
  const [week, year] = weekYear.split("-");
  return `W${week}/${year}`;
}

function computeKPIs(entries: ReportEntry[]) {
  const total = entries.reduce((s, e) => s + Number(e.totalPkts), 0);
  const stored = entries.reduce((s, e) => s + Number(e.storedPkts), 0);
  const valid = entries.reduce((s, e) => s + Number(e.validGpsFixPkts), 0);
  const normal = entries.reduce((s, e) => s + Number(e.normalPktCount), 0);
  const storageRate = total > 0 ? ((stored / total) * 100).toFixed(1) : "0.0";
  const gpsRate = total > 0 ? ((valid / total) * 100).toFixed(1) : "0.0";
  return { total, stored, valid, normal, storageRate, gpsRate };
}

export default function DashboardPage() {
  const { data: allReports = [], isLoading } = useGetAllReports();
  const [selectedModelFilter, setSelectedModelFilter] = useState<Model | "all">(
    "all",
  );

  // Apply the same filterValidEntries logic used in ReportPage — single source of truth
  const validReports = filterValidEntries(allReports);

  // Filter by selected model
  const modelFilteredReports =
    selectedModelFilter === "all"
      ? validReports
      : validReports.filter((e) => e.model === selectedModelFilter);

  const availableWeeks = Array.from(
    new Set(modelFilteredReports.map((e) => e.weekYear)),
  ).sort((a, b) => {
    const [wa, ya] = a.split("-").map(Number);
    const [wb, yb] = b.split("-").map(Number);
    return ya !== yb ? ya - yb : wa - wb;
  });

  const [currentWeek, setCurrentWeek] = useState<string>("");

  useEffect(() => {
    if (!isLoading && availableWeeks.length > 0) {
      if (!currentWeek || !availableWeeks.includes(currentWeek)) {
        setCurrentWeek(availableWeeks[availableWeeks.length - 1]);
      }
    }
  }, [isLoading, availableWeeks, currentWeek]);

  // Week-scoped entries — already filtered by filterValidEntries above
  const weekEntries = modelFilteredReports.filter(
    (e) => e.weekYear === currentWeek,
  );

  const recentWeeks = availableWeeks.slice(-KPI_WEEKS);
  const recentEntries = modelFilteredReports.filter((e) =>
    recentWeeks.includes(e.weekYear),
  );
  const kpis = computeKPIs(recentEntries);

  // Models to show in summary cards
  const modelsToShow: Model[] =
    selectedModelFilter === "all"
      ? [Model.N135, Model.N13, Model.N125]
      : [selectedModelFilter];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            GPS tracker performance overview
          </p>
        </div>

        {/* Model Filter */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="dashboard-model-filter"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
          >
            Model Filter
          </label>
          <select
            id="dashboard-model-filter"
            value={selectedModelFilter}
            onChange={(e) => {
              setSelectedModelFilter(e.target.value as Model | "all");
              setCurrentWeek("");
            }}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Week Navigator */}
      <div className="mb-6">
        <WeekNavigator
          currentWeek={currentWeek}
          onWeekChange={setCurrentWeek}
          availableWeeks={availableWeeks}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="p-4 rounded-xl bg-card border border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Total Packets
          </p>
          <p className="text-2xl font-bold text-foreground">
            {kpis.total.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Last {KPI_WEEKS} weeks
          </p>
        </div>
        <div className="p-4 rounded-xl bg-card border border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Stored Packets
          </p>
          <p className="text-2xl font-bold text-foreground">
            {kpis.stored.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Storage rate: {kpis.storageRate}%
          </p>
        </div>
        <div className="p-4 rounded-xl bg-card border border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Valid GPS Fix
          </p>
          <p className="text-2xl font-bold text-foreground">
            {kpis.valid.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            GPS rate: {kpis.gpsRate}%
          </p>
        </div>
        <div className="p-4 rounded-xl bg-card border border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Normal Packets
          </p>
          <p className="text-2xl font-bold text-foreground">
            {kpis.normal.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Last {KPI_WEEKS} weeks
          </p>
        </div>
      </div>

      {/* Model Summary Cards */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Model Performance —{" "}
          {currentWeek ? getWeekLabel(currentWeek) : "No week selected"}
          {selectedModelFilter !== "all" && (
            <span className="ml-2 text-sm font-normal text-primary">
              ({MODEL_DISPLAY[selectedModelFilter]})
            </span>
          )}
        </h2>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 rounded-xl bg-muted/30 animate-pulse"
              />
            ))}
          </div>
        ) : weekEntries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>
              No data available for this week
              {selectedModelFilter !== "all"
                ? ` and model ${MODEL_DISPLAY[selectedModelFilter]}`
                : ""}
              .
            </p>
            {selectedModelFilter !== "all" && (
              <button
                type="button"
                onClick={() => setSelectedModelFilter("all")}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Show all models
              </button>
            )}
          </div>
        ) : (
          <div
            className={`grid grid-cols-1 gap-4 ${modelsToShow.length === 1 ? "md:grid-cols-1 max-w-md" : "md:grid-cols-3"}`}
          >
            {modelsToShow.map((model) => {
              // Pass only the week-scoped, validity-filtered entries for this model
              const modelEntries = weekEntries.filter((e) => e.model === model);
              return (
                <ModelSummaryCard
                  key={model}
                  model={MODEL_DISPLAY[model]}
                  entries={modelEntries}
                />
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

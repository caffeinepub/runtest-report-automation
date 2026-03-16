import React, { useState, useMemo } from "react";
import type { Model } from "../backend";
import { ReportFilters } from "../components/ReportFilters";
import { WeekNavigator } from "../components/WeekNavigator";
import WeeklyReportTable from "../components/WeeklyReportTable";
import { getISOWeekLabel, useGetAllReports } from "../hooks/useQueries";
import { filterValidEntries } from "../utils/reportFilters";

export default function ReportPage() {
  const { data: allReports = [], isLoading } = useGetAllReports();

  const [selectedWeek, setSelectedWeek] = useState<string>(() =>
    getISOWeekLabel(new Date()),
  );
  const [unitIdFilter, setUnitIdFilter] = useState("");
  const [modelFilter, setModelFilter] = useState<Model | "all">("all");

  // Derive sorted list of available weeks from all valid reports
  const availableWeeks = useMemo(() => {
    const valid = filterValidEntries(allReports);
    const weeks = Array.from(new Set(valid.map((e) => e.weekYear))).sort(
      (a, b) => b.localeCompare(a),
    );
    // Always include the current week even if no data yet
    const current = getISOWeekLabel(new Date());
    if (!weeks.includes(current)) weeks.unshift(current);
    return weeks;
  }, [allReports]);

  // Filter to valid entries for the selected week
  const weekEntries = useMemo(() => {
    const valid = filterValidEntries(allReports);
    return valid.filter((e) => e.weekYear === selectedWeek);
  }, [allReports, selectedWeek]);

  // Apply model + unit ID filters
  const filteredEntries = useMemo(() => {
    let entries = weekEntries;
    if (modelFilter !== "all") {
      entries = entries.filter((e) => String(e.model) === String(modelFilter));
    }
    if (unitIdFilter.trim()) {
      const q = unitIdFilter.trim().toLowerCase();
      entries = entries.filter((e) => e.unitId.toLowerCase().includes(q));
    }
    return entries;
  }, [weekEntries, modelFilter, unitIdFilter]);

  // Combined filter change handler matching ReportFilters' onFilterChange signature
  const handleFilterChange = (
    week: string,
    unitId: string,
    model: Model | "all",
  ) => {
    setSelectedWeek(week);
    setUnitIdFilter(unitId);
    setModelFilter(model);
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Weekly GPS tracker performance reports
        </p>
      </div>

      {/* Week navigator */}
      <WeekNavigator
        currentWeek={selectedWeek}
        onWeekChange={(week) =>
          handleFilterChange(week, unitIdFilter, modelFilter)
        }
        availableWeeks={availableWeeks}
      />

      {/* Filters */}
      <ReportFilters
        availableWeeks={availableWeeks}
        selectedWeek={selectedWeek}
        unitIdFilter={unitIdFilter}
        modelFilter={modelFilter}
        onFilterChange={handleFilterChange}
        entries={weekEntries}
      />

      {/* Table */}
      <WeeklyReportTable entries={filteredEntries} isLoading={isLoading} />
    </main>
  );
}

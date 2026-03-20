import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReportEntry } from "../backend";
import { Flavour, Model } from "../backend";
import { useActor } from "./useActor";

// Re-export types and enums used by other components
export type { ReportEntry };
export { Model, Flavour };

// Alias Model as UnitModel for backward compatibility
export { Model as UnitModel };

// Model display labels
export const MODEL_LABELS: Record<Model, string> = {
  [Model.N135]: "N13.5",
  [Model.others]: "Others",
  [Model.N13]: "N13",
  [Model.N125]: "N12.5",
};

export const ALL_MODELS: Model[] = [
  Model.N135,
  Model.N13,
  Model.N125,
  Model.others,
];

// ── Week helpers ──────────────────────────────────────────────────────────────

export function getISOWeekLabel(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// Alias for backward compatibility
export const getCurrentWeekLabel = getISOWeekLabel;

export function weekLabelToDate(label: string): Date {
  const [yearStr, weekStr] = label.split("-W");
  const year = Number.parseInt(yearStr, 10);
  const week = Number.parseInt(weekStr, 10);
  const jan4 = new Date(year, 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const result = new Date(startOfWeek1);
  result.setDate(startOfWeek1.getDate() + (week - 1) * 7);
  return result;
}

export function parseWeekLabel(
  label: string,
): { year: number; week: number } | null {
  const match = label.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  return {
    year: Number.parseInt(match[1], 10),
    week: Number.parseInt(match[2], 10),
  };
}

export function getAdjacentWeek(label: string, delta: number): string {
  const parsed = parseWeekLabel(label);
  if (!parsed) return label;
  let { year, week } = parsed;
  week += delta;
  if (week < 1) {
    year -= 1;
    week = 52;
  } else if (week > 52) {
    year += 1;
    week = 1;
  }
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useGetAllReports() {
  const { actor, isFetching } = useActor();
  return useQuery<ReportEntry[]>({
    queryKey: ["reports"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getAllReports();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useGetReport(unitId: string, weekYear: string) {
  const { actor, isFetching } = useActor();
  return useQuery<ReportEntry | null>({
    queryKey: ["report", unitId, weekYear],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getReport(unitId, weekYear);
    },
    enabled: !!actor && !isFetching && !!unitId && !!weekYear,
  });
}

export function useGetReportsByModel(model: Model | null) {
  const { actor, isFetching } = useActor();
  return useQuery<ReportEntry[]>({
    queryKey: ["reports", "model", model],
    queryFn: async () => {
      if (!actor || !model) return [];
      return actor.getReportsByModel(model);
    },
    enabled: !!actor && !isFetching && !!model,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useUpsertReport() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      model,
      flavour,
      unitId,
      weekYear,
      totalPkts,
      storedPkts,
      validGpsFixPkts,
      storedPktCount,
      normalPkts,
      location,
    }: {
      model: Model;
      flavour: Flavour;
      unitId: string;
      weekYear: string;
      totalPkts: bigint;
      storedPkts: bigint;
      validGpsFixPkts: bigint;
      storedPktCount?: bigint;
      normalPkts?: bigint;
      location?: string;
    }) => {
      if (!actor) throw new Error("Actor not initialized");
      return actor.upsertReport(
        model,
        flavour,
        unitId,
        weekYear,
        totalPkts,
        storedPkts,
        validGpsFixPkts,
        storedPktCount ?? BigInt(0),
        normalPkts ?? BigInt(0),
        location ?? "",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

// Keep legacy aliases
export const useCreateReport = useUpsertReport;
export const useUpdateReport = useUpsertReport;

// ── Direct upsert (used by CSV import) ───────────────────────────────────────
// Uses upsertBatchReport to send all records in a single call, avoiding
// race conditions that occur when parallel upsertReport calls are made.

export function useDirectUpsert() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      entries: Array<{
        model: Model;
        flavour: Flavour;
        unitId: string;
        weekYear: string;
        totalPkts: bigint;
        storedPkts: bigint;
        validGpsFixPkts: bigint;
        storedPktCount?: bigint;
        normalPkts?: bigint;
        location?: string;
      }>,
    ) => {
      if (!actor) throw new Error("Actor not initialized");
      if (entries.length === 0) return;

      // Use upsertBatchReport to send all records in a single atomic call,
      // preventing race conditions from parallel concurrent update calls.
      const batch: Array<
        [
          Model,
          Flavour,
          string,
          string,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          string,
        ]
      > = entries.map((e) => [
        e.model,
        e.flavour,
        e.unitId,
        e.weekYear,
        e.totalPkts,
        e.storedPkts,
        e.validGpsFixPkts,
        e.storedPktCount ?? BigInt(0),
        e.normalPkts ?? BigInt(0),
        e.location ?? "",
      ]);

      return actor.upsertBatchReport(batch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useGetDisplayColumns() {
  const { actor, isFetching } = useActor();
  return useQuery<string[]>({
    queryKey: ["displayColumns"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getDisplayColumns();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useAddDisplayColumn() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (columnName: string) => {
      if (!actor) throw new Error("Actor not initialized");
      return actor.addDisplayColumn(columnName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["displayColumns"] });
    },
  });
}

export function useRemoveDisplayColumn() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (columnName: string) => {
      if (!actor) throw new Error("Actor not initialized");
      return actor.removeDisplayColumn(columnName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["displayColumns"] });
    },
  });
}

// ── Clear All Data ────────────────────────────────────────────────────────────

export function useClearAllData() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("Actor not initialized");
      return actor.clearAllData();
    },
    onSuccess: () => {
      // Invalidate all queries so the UI reflects the empty state
      queryClient.invalidateQueries();
    },
  });
}

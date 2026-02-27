import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActor } from './useActor';
import { UnitModel, ReportEntry } from '@/backend';

export { UnitModel };
export type { ReportEntry };

// ── Week helpers ──────────────────────────────────────────────────────────────

export function getISOWeekLabel(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Alias for backward compatibility
export const getCurrentWeekLabel = getISOWeekLabel;

export function weekLabelToDate(label: string): Date {
  const [yearStr, weekStr] = label.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  const jan4 = new Date(year, 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const result = new Date(startOfWeek1);
  result.setDate(startOfWeek1.getDate() + (week - 1) * 7);
  return result;
}

export function parseWeekLabel(label: string): { year: number; week: number } | null {
  const match = label.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  return { year: parseInt(match[1], 10), week: parseInt(match[2], 10) };
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
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export const MODEL_LABELS: Record<UnitModel, string> = {
  [UnitModel.N135]: 'N13.5',
  [UnitModel.N13]: 'N13',
  [UnitModel.N125]: 'N12.5',
};

export const ALL_MODELS: UnitModel[] = [UnitModel.N135, UnitModel.N13, UnitModel.N125];

// ── Queries ───────────────────────────────────────────────────────────────────

export function useGetAllReports() {
  const { actor, isFetching } = useActor();

  return useQuery<ReportEntry[]>({
    queryKey: ['reports'],
    queryFn: async () => {
      if (!actor) return [];
      const data = await actor.getAllReports();
      console.log('[useGetAllReports] fetched', data.length, 'reports');
      return data;
    },
    enabled: !!actor && !isFetching,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useGetReport(unitId: string, weekYear: string) {
  const { actor, isFetching } = useActor();

  return useQuery<ReportEntry | null>({
    queryKey: ['report', unitId, weekYear],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getReport(unitId, weekYear);
    },
    enabled: !!actor && !isFetching && !!unitId && !!weekYear,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useUpsertReport() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      unit: UnitModel;
      id: string;
      week: string;
      total: bigint;
      stored: bigint;
      valid: bigint;
      storedPkts?: bigint;
      normalPkts?: bigint;
    }) => {
      if (!actor) throw new Error('Actor not initialized');
      await actor.upsertReport(
        params.unit,
        params.id,
        params.week,
        params.total,
        params.stored,
        params.valid,
        params.storedPkts ?? BigInt(0),
        params.normalPkts ?? BigInt(0),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

// Keep legacy aliases so any code that imports useCreateReport / useUpdateReport still works
export const useCreateReport = useUpsertReport;
export const useUpdateReport = useUpsertReport;

// ── Direct upsert (used by CSV import) ───────────────────────────────────────

export function useDirectUpsert() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  const upsertOne = async (params: {
    unit: UnitModel;
    id: string;
    week: string;
    total: bigint;
    stored: bigint;
    valid: bigint;
    storedPkts?: bigint;
    normalPkts?: bigint;
  }) => {
    if (!actor) throw new Error('Actor not initialized');
    await actor.upsertReport(
      params.unit,
      params.id,
      params.week,
      params.total,
      params.stored,
      params.valid,
      params.storedPkts ?? BigInt(0),
      params.normalPkts ?? BigInt(0),
    );
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['reports'] });
  };

  return { upsertOne, invalidate };
}

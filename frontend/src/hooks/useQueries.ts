import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActor } from './useActor';
import { type ReportEntry, UnitModel } from '../backend';

export { UnitModel };
export type { ReportEntry };

export const MODEL_LABELS: Record<UnitModel, string> = {
  [UnitModel.N135]: 'N13.5',
  [UnitModel.N13]: 'N13',
  [UnitModel.N125]: 'N12.5',
};

export const ALL_MODELS = [UnitModel.N135, UnitModel.N13, UnitModel.N125] as const;

// Get current ISO week label e.g. "2024-W12"
export function getCurrentWeekLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000) + 1;
  const weekNum = Math.ceil(dayOfYear / 7);
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

export function getWeekLabel(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function parseWeekLabel(label: string): { year: number; week: number } | null {
  const match = label.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  return { year: parseInt(match[1]), week: parseInt(match[2]) };
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
  return getWeekLabel(year, week);
}

export function useGetAllReports() {
  const { actor, isFetching } = useActor();
  return useQuery<ReportEntry[]>({
    queryKey: ['reports'],
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
    queryKey: ['report', unitId, weekYear],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getReport(unitId, weekYear);
    },
    enabled: !!actor && !isFetching && !!unitId && !!weekYear,
  });
}

export function useCreateReport() {
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
    }) => {
      if (!actor) throw new Error('Actor not initialized');
      return actor.createReport(params.unit, params.id, params.week, params.total, params.stored, params.valid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report'] });
    },
  });
}

export function useUpdateReport() {
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
    }) => {
      if (!actor) throw new Error('Actor not initialized');
      return actor.updateReport(params.unit, params.id, params.week, params.total, params.stored, params.valid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report'] });
    },
  });
}

// Upsert: try create first, if fails (already exists) do update
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
    }) => {
      if (!actor) throw new Error('Actor not initialized');
      try {
        await actor.createReport(params.unit, params.id, params.week, params.total, params.stored, params.valid);
      } catch {
        await actor.updateReport(params.unit, params.id, params.week, params.total, params.stored, params.valid);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report'] });
    },
  });
}

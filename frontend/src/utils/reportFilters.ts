import type { ReportEntry } from '@/hooks/useQueries';

/**
 * Unit IDs that are known to be invalid — these are GPS packet field values
 * (battery state, signal quality, etc.) that were mistakenly stored as unit IDs.
 */
export const INVALID_UNIT_IDS = new Set([
  '-139',
  'charging',
  'fair',
  'full',
  'good',
  'poor',
  'unknown',
]);

/**
 * Returns true when the given unit ID is considered valid.
 * A unit ID is invalid if it:
 *  - matches one of the known bad values (case-insensitive), or
 *  - starts with a '-' (negative numbers / malformed IDs).
 */
export function isValidUnitId(unitId: string): boolean {
  if (unitId.startsWith('-')) return false;
  return !INVALID_UNIT_IDS.has(unitId.toLowerCase());
}

/**
 * Filters an array of ReportEntry objects, removing entries with invalid unit IDs.
 */
export function filterValidEntries(entries: ReportEntry[]): ReportEntry[] {
  return entries.filter(e => isValidUnitId(e.unitId));
}

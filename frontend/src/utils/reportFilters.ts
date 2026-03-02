import type { ReportEntry } from "@/backend";

/**
 * Unit IDs that are known to be invalid — these are GPS packet field values
 * (battery state, signal quality, etc.) that were mistakenly stored as unit IDs.
 */
export const INVALID_UNIT_IDS = new Set([
  "-139",
  "charging",
  "fair",
  "full",
  "good",
  "poor",
  "unknown",
  "address not found",
  "address",
  "n/a",
  "",
  "undefined",
  "null",
  "none",
  "not found",
  "-",
  "na",
]);

/**
 * Returns true when the given unit ID is considered valid.
 */
export function isValidUnitId(unitId: string): boolean {
  if (!unitId || unitId.trim() === "") return false;
  if (unitId.startsWith("-")) return false;
  return !INVALID_UNIT_IDS.has(unitId.toLowerCase().trim());
}

/**
 * Filters an array of ReportEntry objects, removing entries with invalid unit IDs.
 * Does NOT drop entries with missing/empty model, flavour, or location fields.
 */
export function filterValidEntries(entries: ReportEntry[]): ReportEntry[] {
  return entries.filter((e) => isValidUnitId(e.unitId));
}

/**
 * Counts distinct unit IDs in a set of entries.
 * Use this everywhere a "unit count" is needed to ensure consistency.
 */
export function countDistinctUnits(entries: ReportEntry[]): number {
  return new Set(entries.map((e) => e.unitId)).size;
}

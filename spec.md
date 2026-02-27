# Specification

## Summary
**Goal:** Fix the CSV/XLS parser in the GPS Packet Tracker so that unit IDs are correctly resolved from the "Address" column in Waggle Portal export files, and ensure packet count aggregation produces real numeric values.

**Planned changes:**
- Fix the Address column lookup in `csvParser.ts` to scan the detected header row for the keyword "Address" (case-insensitive) and use that column index to read unit IDs, instead of emitting "Address not found" for every row.
- Audit and fix the per-packet event log aggregation logic so that total, stored, and valid packet counts are computed as numeric values rather than remaining as "aggregated" placeholders after unit ID resolution is corrected.

**User-visible outcome:** Uploading a Waggle Portal XLS export no longer shows "Address not found" unit IDs, the "2648 rows will be skipped" warning is resolved, valid records are imported successfully, and the dashboard and reports reflect correct numeric packet count figures.

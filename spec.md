# Specification

## Summary
**Goal:** Fix the CSV/XLS import failure where all parsed records fail to upsert to the backend, showing "All 4 records failed to import" errors.

**Planned changes:**
- Investigate and fix the root cause of backend upsert failures in CSVImportSection (likely unit ID/week key format mismatch, type mismatch, or backend actor error)
- Add detailed per-record error logging to the console to surface the specific backend error reason
- Update the error toast message to include the specific backend error reason (not just unit ID and filename) so users can diagnose failures
- Ensure valid XLS files with unit IDs like S10026_PRD, S10006-PRD, S10002-PRD successfully upsert to the backend for the correct week

**User-visible outcome:** Importing valid XLS files no longer triggers "All N records failed to import." Successfully imported records appear on the Dashboard under the correct week. If a record does fail, the error toast shows the specific backend error reason.

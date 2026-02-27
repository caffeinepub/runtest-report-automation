# Specification

## Summary
**Goal:** Fix the CSV parser and backend data model so that the Stored packet count is correctly extracted from the `PktState` column and persisted, instead of always showing 0.

**Planned changes:**
- Fix the frontend CSV parser to count rows where `PktState` equals `"Stored"` and assign that count to `storedPkts` (currently always returns 0).
- Ensure `normalPktCount` parsing remains unaffected; Normal + Stored counts should sum to Total packets hit.
- Add `storedPktCount` as a separate field in the backend `ReportEntry` type.
- Update the backend upsert function to accept and persist the `storedPktCount` value submitted from the frontend.
- Apply a migration so existing backend entries without `storedPktCount` default to 0.

**User-visible outcome:** After uploading a file with a `PktState` column containing `"Normal"` and `"Stored"` rows, the STORED PKTS column in the Weekly Reports table will display the correct non-zero count instead of 0.

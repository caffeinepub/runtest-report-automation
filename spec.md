# Specification

## Summary
**Goal:** Fix two bugs in the GPS Packet Tracker Reports: flavour value being incorrectly saved as "Premium" instead of the selected "AQI", and uploaded units being under-counted (4 units showing as 3).

**Planned changes:**
- Fix the flavour field mapping during CSV/XLS import so that the flavour selected in the CSVImportSection (e.g., "AQI") is correctly persisted to the backend and displayed in the Reports table instead of defaulting to "Premium".
- Fix the unit count bug where uploading 4 distinct unit files results in only 3 records being stored/displayed — investigate and resolve the off-by-one error, false-positive duplicate detection, or silent record drop during batch upsert.
- Ensure the Reports table footer correctly shows "Totals (4 units)" when 4 distinct units are uploaded.

**User-visible outcome:** After uploading 4 files with "AQI" flavour selected, the Reports table will show all 4 unit rows each with "AQI" in the Flavour column, and the footer will read "Totals (4 units)".

# Specification

## Summary
**Goal:** Fix the CSV/Excel parser to correctly handle the uploaded Gateway report file format, extract metadata, and compute packet/GPS statistics.

**Planned changes:**
- Update `csvParser.ts` to skip metadata rows 1–7 and identify row 8 (blue highlighted row) as the column header row, with data rows starting from row 9, eliminating the "No data rows found" error
- Parse gateway metadata from rows 2–6: extract unit name from the "Gateway :" row, start date from "Start Date & Time :", and end date from "End Date & Time :"
- Count total packets (PktState = "Normal") and stored packets (PktState = "Stored") by finding the "PktState" column header by name in the header row
- Count GPS valid fix packets by finding the "GPS Status" column header by name and counting rows where the value is "Valid" (case-insensitive)
- Update `CSVImportSection.tsx` to display a preview card after a successful parse showing unit name, start date, end date, total packets, stored packets, and GPS valid fix count before the user submits

**User-visible outcome:** Users can upload the Gateway XLS/XLSX report file without errors; after upload, a summary preview card shows the extracted gateway details and computed packet statistics before submission.

# Specification

## Summary
**Goal:** Fix the file upload error in the CSV import section so that uploading CSV, TSV, XLS, and XLSX files works reliably without runtime errors.

**Planned changes:**
- Rewrite the SheetJS loading mechanism in `csvParser.ts` to use a bundled npm import instead of a CDN lazy-load, eliminating CDN fetch failures.
- Fix the file reading pipeline in `CSVImportSection.tsx` so selected files are correctly read and passed to the parser.
- Improve error boundary logic in `CSVImportSection.tsx` to distinguish between per-row parse warnings and fatal upload errors.
- Add defensive per-file error handling so a single failing file shows an inline error without blocking other files in a batch upload from being parsed and previewed.

**User-visible outcome:** Users can upload CSV, TSV, XLS, and XLSX files and see parsed rows in the preview table without encountering an upload error. In multi-file uploads, a failing file shows a per-file error while successfully parsed files remain available for bulk upsert.

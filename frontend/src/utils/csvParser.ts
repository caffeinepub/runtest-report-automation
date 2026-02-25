export interface ParsedRow {
  unitId: string;
  totalPkts: string;
  storedPkts: string;
  validGpsFixPkts: string;
  error?: string;
  rawLine: string;
}

// Cache the dynamically imported XLSX module so we only fetch it once
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let xlsxModuleCache: any = null;
let xlsxLoadPromise: Promise<any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Loads SheetJS via dynamic ES module import from CDN.
 * Uses the official .mjs build which is a proper ES module — no global variable polling needed.
 * The result is cached so subsequent calls are instant.
 */
async function loadXLSX(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (xlsxModuleCache) return xlsxModuleCache;

  if (xlsxLoadPromise) return xlsxLoadPromise;

  xlsxLoadPromise = (async () => {
    // Try the official SheetJS CDN ESM build first
    const cdnUrls = [
      'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs',
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm',
    ];

    let lastError: Error | null = null;

    for (const url of cdnUrls) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = await (Function('u', 'return import(u)')(url) as Promise<any>);
        if (mod && (mod.read || mod.default?.read)) {
          xlsxModuleCache = mod.read ? mod : mod.default;
          return xlsxModuleCache;
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    // Reset so callers can retry
    xlsxLoadPromise = null;
    throw new Error(
      `Could not load Excel parser library. ${lastError?.message ?? 'Please check your internet connection.'}`
    );
  })();

  return xlsxLoadPromise;
}

/**
 * Parses raw CSV or TSV text (copied from Google Sheets / Waggle portal export).
 * Expected column order: Unit ID, Total Reporting Packets, Stored Packets, Valid GPS Fix Packets
 * Handles both comma and tab delimiters, trims whitespace, skips empty rows and header rows.
 */
export function parseCSV(raw: string): ParsedRow[] {
  const lines = raw.split(/\r?\n/);
  const results: ParsedRow[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect delimiter: prefer tab if present, else comma
    const delimiter = trimmed.includes('\t') ? '\t' : ',';
    const cols = trimmed.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));

    if (cols.length < 4) {
      // Skip rows that don't have enough columns (likely headers or malformed)
      const firstCol = cols[0] ?? '';
      const isLikelyHeader =
        /unit\s*id|unit_id|unitid|device|name|id/i.test(firstCol) ||
        /total|packet|stored|gps|fix|valid/i.test(firstCol);
      if (isLikelyHeader) continue;

      results.push({
        unitId: cols[0] ?? '',
        totalPkts: '',
        storedPkts: '',
        validGpsFixPkts: '',
        error: `Expected at least 4 columns, found ${cols.length}`,
        rawLine: trimmed,
      });
      continue;
    }

    const [unitId, totalPkts, storedPkts, validGpsFixPkts] = cols;

    // Skip header rows
    const isHeader =
      /unit\s*id|unit_id|unitid|device|name/i.test(unitId) ||
      /total|packet|stored|gps|fix|valid/i.test(unitId);
    if (isHeader) continue;

    const row: ParsedRow = {
      unitId: unitId ?? '',
      totalPkts: totalPkts ?? '',
      storedPkts: storedPkts ?? '',
      validGpsFixPkts: validGpsFixPkts ?? '',
      rawLine: trimmed,
    };

    row.error = validateParsedRow(row);
    results.push(row);
  }

  return results;
}

/**
 * Reads a File as an ArrayBuffer, wrapped in a Promise.
 */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader did not return an ArrayBuffer'));
      }
    };
    reader.onerror = () => {
      reject(new Error(`Could not read file "${file.name}". The file may be corrupted or inaccessible.`));
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parses an Excel file (.xlsx or .xls) using SheetJS loaded dynamically via ES module import.
 * Reads the first sheet and maps rows to ParsedRow format.
 */
export async function parseExcelFile(file: File): Promise<ParsedRow[]> {
  let XLSX: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    XLSX = await loadXLSX();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load Excel parser library';
    throw new Error(message);
  }

  if (!XLSX || !XLSX.read) {
    throw new Error('SheetJS failed to initialize. Please refresh the page and try again.');
  }

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await readFileAsArrayBuffer(file);
  } catch (err) {
    const message = err instanceof Error ? err.message : `Could not read file "${file.name}"`;
    throw new Error(message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let workbook: any;
  try {
    workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  } catch {
    throw new Error(`Could not parse "${file.name}" as an Excel file. The file may be corrupted or in an unsupported format.`);
  }

  const firstSheetName: string | undefined = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[firstSheetName];
  let rawRows: unknown[][];
  try {
    rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  } catch {
    throw new Error(`Failed to read sheet data from "${file.name}".`);
  }

  const results: ParsedRow[] = [];

  for (const rawRow of rawRows) {
    const cols = (rawRow as unknown[]).map(cell => String(cell ?? '').trim());

    // Skip empty rows
    if (cols.every(c => c === '')) continue;

    const rawLine = cols.join(',');

    if (cols.length < 4) {
      const firstCol = cols[0] ?? '';
      const isLikelyHeader =
        /unit\s*id|unit_id|unitid|device|name|id/i.test(firstCol) ||
        /total|packet|stored|gps|fix|valid/i.test(firstCol);
      if (isLikelyHeader) continue;

      results.push({
        unitId: firstCol,
        totalPkts: '',
        storedPkts: '',
        validGpsFixPkts: '',
        error: `Expected at least 4 columns, found ${cols.length}`,
        rawLine,
      });
      continue;
    }

    const [unitId, totalPkts, storedPkts, validGpsFixPkts] = cols;

    // Skip header rows
    const isHeader =
      /unit\s*id|unit_id|unitid|device|name/i.test(unitId) ||
      /total|packet|stored|gps|fix|valid/i.test(unitId);
    if (isHeader) continue;

    const row: ParsedRow = {
      unitId: unitId ?? '',
      totalPkts: totalPkts ?? '',
      storedPkts: storedPkts ?? '',
      validGpsFixPkts: validGpsFixPkts ?? '',
      rawLine,
    };

    row.error = validateParsedRow(row);
    results.push(row);
  }

  return results;
}

export function validateParsedRow(row: ParsedRow): string | undefined {
  if (!row.unitId.trim()) return 'Unit ID is required';

  const total = Number(row.totalPkts.trim());
  const stored = Number(row.storedPkts.trim());
  const valid = Number(row.validGpsFixPkts.trim());

  if (row.totalPkts.trim() === '' || !Number.isInteger(total) || total < 0)
    return 'Total packets must be a non-negative integer';
  if (row.storedPkts.trim() === '' || !Number.isInteger(stored) || stored < 0)
    return 'Stored packets must be a non-negative integer';
  if (row.validGpsFixPkts.trim() === '' || !Number.isInteger(valid) || valid < 0)
    return 'Valid GPS fix packets must be a non-negative integer';
  if (stored > total) return 'Stored packets cannot exceed total packets';
  if (valid > total) return 'Valid GPS fix packets cannot exceed total packets';

  return undefined;
}

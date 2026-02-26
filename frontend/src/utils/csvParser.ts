export interface FileMetadata {
  unitName?: string;
  startDate?: string;
  endDate?: string;
}

export interface ParsedRow {
  unitId: string;
  totalPkts: string;
  storedPkts: string;
  validGpsFixPkts: string;
  error?: string;
  rawLine: string;
}

export interface ParsedFileResult {
  rows: ParsedRow[];
  metadata?: FileMetadata;
  /** Aggregated stats computed from the raw data rows (PktState + GPS Status columns) */
  aggregated?: {
    totalPackets: number;
    storedPackets: number;
    validGpsPackets: number;
  };
}

// Cache the dynamically imported XLSX module so we only fetch it once
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let xlsxModuleCache: any = null;
let xlsxLoadPromise: Promise<any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Loads SheetJS via dynamic ES module import from CDN.
 */
async function loadXLSX(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (xlsxModuleCache) return xlsxModuleCache;
  if (xlsxLoadPromise) return xlsxLoadPromise;

  xlsxLoadPromise = (async () => {
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

    xlsxLoadPromise = null;
    throw new Error(
      `Could not load Excel parser library. ${lastError?.message ?? 'Please check your internet connection.'}`
    );
  })();

  return xlsxLoadPromise;
}

/**
 * Extracts metadata from the header block rows (rows before the actual data header).
 * Looks for "Key : Value" patterns in the first few rows.
 */
function extractMetadata(rows: string[][]): FileMetadata {
  const metadata: FileMetadata = {};

  for (const row of rows) {
    // Join all cells to handle cases where the value spans multiple cells
    const fullText = row.join(' ').trim();

    // Gateway : N13-5_D20_Lite
    const gatewayMatch = fullText.match(/gateway\s*:\s*(.+)/i);
    if (gatewayMatch) {
      metadata.unitName = gatewayMatch[1].trim();
      continue;
    }

    // Start Date & Time : 8 Feb'26 12:00 AM
    const startMatch = fullText.match(/start\s+date\s*(?:&|and)?\s*time\s*:\s*(.+)/i);
    if (startMatch) {
      metadata.startDate = startMatch[1].trim();
      continue;
    }

    // End Date & Time : 23 Feb'26 12:00 AM
    const endMatch = fullText.match(/end\s+date\s*(?:&|and)?\s*time\s*:\s*(.+)/i);
    if (endMatch) {
      metadata.endDate = endMatch[1].trim();
      continue;
    }
  }

  return metadata;
}

/**
 * Returns true if the row looks like the actual data header row for the Waggle portal export.
 * Checks for column names like "Date", "Timezone", "PktState", "GPS Status".
 */
function isWaggleDataHeaderRow(cols: string[]): boolean {
  const joined = cols.map(c => c.toLowerCase().trim());
  return (
    joined.includes('date') ||
    joined.includes('timezone') ||
    joined.some(c => c === 'pktstate') ||
    joined.some(c => c === 'gps status')
  );
}

/**
 * Returns true if the row looks like a legacy GPS packet data header row.
 * Checks for unit ID / packet-related column names.
 */
function isLegacyDataHeaderRow(cols: string[]): boolean {
  const checkCols = cols.slice(0, 6);
  return checkCols.some(c =>
    /unit\s*id|unit_id|unitid/i.test(c) ||
    /total\s*(reporting\s*)?p(ac)?k(e)?t/i.test(c) ||
    /stored\s*p(ac)?k(e)?t/i.test(c) ||
    /valid\s*gps/i.test(c) ||
    /gps\s*fix/i.test(c)
  );
}

/**
 * Returns true if the row is a metadata/summary row that should be silently skipped.
 */
function isMetadataRow(cols: string[]): boolean {
  const nonEmpty = cols.filter(c => c !== '');
  if (nonEmpty.length === 0) return true;

  const firstCol = cols[0] ?? '';

  if (/gateway\s*details?/i.test(firstCol)) return true;
  if (/gateway\s*details?/i.test(cols[1] ?? '')) return true;
  if (/report\s*(summary|details?|date|period|generated)/i.test(firstCol)) return true;
  if (/customer\s*name/i.test(firstCol)) return true;
  if (/group\s*:/i.test(firstCol)) return true;
  if (/gateway\s*:/i.test(firstCol)) return true;
  if (/start\s*date/i.test(firstCol)) return true;
  if (/end\s*date/i.test(firstCol)) return true;
  if (/^\s*$/.test(firstCol) && nonEmpty.length <= 2) return true;

  return false;
}

/**
 * Scans up to the first `maxScanRows` rows to find the index of the true data header row.
 * Returns -1 if no header row is found.
 */
function findHeaderRowIndex(rows: string[][], maxScanRows = 20): number {
  const limit = Math.min(rows.length, maxScanRows);
  for (let i = 0; i < limit; i++) {
    if (isWaggleDataHeaderRow(rows[i]) || isLegacyDataHeaderRow(rows[i])) return i;
  }
  return -1;
}

/**
 * Finds a column index by header name (case-insensitive, trimmed).
 */
function findColumnIndex(headerRow: string[], name: string): number {
  const lower = name.toLowerCase().trim();
  return headerRow.findIndex(h => h.toLowerCase().trim() === lower);
}

/**
 * Parses a 2D array of string cells into a ParsedFileResult.
 *
 * For Waggle portal exports (with metadata block + PktState/GPS Status columns):
 *   - Extracts metadata (unit name, start/end date) from rows before the header
 *   - Aggregates PktState Normal/Stored counts and GPS Status Valid count
 *   - Returns a single ParsedRow with the gateway as unitId
 *
 * For legacy CSV format (unit ID, total, stored, valid columns):
 *   - Returns one ParsedRow per data row
 */
function parseRows(allCols: string[][], _sourceLabel = ''): ParsedFileResult {
  const headerIdx = findHeaderRowIndex(allCols);

  // Extract metadata from rows before the header
  const metadataRows = headerIdx > 0 ? allCols.slice(0, headerIdx) : [];
  const metadata = extractMetadata(metadataRows);

  // Data rows start after the header row
  const dataStartIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
  const headerRow = headerIdx >= 0 ? allCols[headerIdx] : [];

  // Check if this is a Waggle portal export (has PktState or GPS Status columns)
  const pktStateIdx = findColumnIndex(headerRow, 'PktState');
  const gpsStatusIdx = findColumnIndex(headerRow, 'GPS Status');
  const isWaggleFormat = pktStateIdx >= 0 || gpsStatusIdx >= 0;

  if (isWaggleFormat) {
    // Aggregate counts from data rows
    let totalPackets = 0;
    let storedPackets = 0;
    let validGpsPackets = 0;

    for (let i = dataStartIdx; i < allCols.length; i++) {
      const cols = allCols[i];

      // Skip fully empty rows
      if (cols.every(c => c === '')) continue;

      // Count PktState
      if (pktStateIdx >= 0) {
        const pktState = (cols[pktStateIdx] ?? '').trim().toLowerCase();
        if (pktState === 'normal') {
          totalPackets++;
        } else if (pktState === 'stored') {
          storedPackets++;
        }
      }

      // Count GPS Status
      if (gpsStatusIdx >= 0) {
        const gpsStatus = (cols[gpsStatusIdx] ?? '').trim().toLowerCase();
        if (gpsStatus === 'valid') {
          validGpsPackets++;
        }
      }
    }

    // Total = Normal + Stored (all packets)
    const grandTotal = totalPackets + storedPackets;

    // Build a single aggregated ParsedRow using the gateway name as unitId
    const unitId = metadata.unitName ?? 'Unknown Gateway';
    const row: ParsedRow = {
      unitId,
      totalPkts: String(grandTotal),
      storedPkts: String(storedPackets),
      validGpsFixPkts: String(validGpsPackets),
      rawLine: `${unitId},${grandTotal},${storedPackets},${validGpsPackets}`,
    };

    row.error = validateParsedRow(row);

    return {
      rows: [row],
      metadata,
      aggregated: {
        totalPackets: grandTotal,
        storedPackets,
        validGpsPackets,
      },
    };
  }

  // Legacy format: one row per unit
  const results: ParsedRow[] = [];

  for (let i = dataStartIdx; i < allCols.length; i++) {
    const cols = allCols[i];

    if (cols.every(c => c === '')) continue;
    if (isMetadataRow(cols)) continue;
    if (isWaggleDataHeaderRow(cols) || isLegacyDataHeaderRow(cols)) continue;

    const rawLine = cols.join(',');

    if (cols.length < 4) {
      const firstCol = cols[0] ?? '';
      if (!firstCol.trim() || isMetadataRow(cols)) continue;

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

    if (!unitId.trim()) continue;
    if (isLegacyDataHeaderRow(cols)) continue;
    if (isMetadataRow(cols)) continue;

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

  return { rows: results, metadata };
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
 * Parses raw CSV or TSV text into a ParsedFileResult.
 */
export function parseCSV(raw: string): ParsedFileResult {
  const lines = raw.split(/\r?\n/);

  let delimiter = ',';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      delimiter = trimmed.includes('\t') ? '\t' : ',';
      break;
    }
  }

  const allCols: string[][] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      allCols.push([]);
      continue;
    }
    const cols = trimmed.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    allCols.push(cols);
  }

  return parseRows(allCols);
}

/**
 * Parses an Excel file (.xlsx or .xls) using SheetJS loaded dynamically via ES module import.
 */
export async function parseExcelFile(file: File): Promise<ParsedFileResult> {
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
    return { rows: [] };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  let rawRows: unknown[][];
  try {
    rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  } catch {
    throw new Error(`Failed to read sheet data from "${file.name}".`);
  }

  const allCols: string[][] = rawRows.map(rawRow =>
    (rawRow as unknown[]).map(cell => String(cell ?? '').trim())
  );

  return parseRows(allCols, file.name);
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

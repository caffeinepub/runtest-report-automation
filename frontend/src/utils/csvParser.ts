// CSV/XLS parser for Waggle Portal GPS tracker export files

export interface ParsedRecord {
  unitId: string;
  totalPkts: number;
  storedPkts: number;
  validGpsFixPkts: number;
  normalPktCount: number;
  storedPktCount: number;
  weekYear?: string;
  rawRow?: Record<string, string>; // raw row data keyed by column name
}

export interface ParseDebugInfo {
  strategy: string;
  format: string;
  headerRowIndex: number;
  headers: string[];
  columnMapping: {
    unitId: string;
    total: string;
    stored: string;
    valid: string;
    pktState: string;
  };
  sampleRows: Array<Record<string, string>>;
  isPerPacketFormat: boolean;
  unitIdSource: string;
  allColumnHeaders: string[]; // all detected column headers for custom mapping
  resolvedSampleRecords: Array<{ unitId: string; total: number; stored: number; valid: number; normal: number; pktState: string }>;
}

export interface ParseResult {
  records: ParsedRecord[];
  debug: ParseDebugInfo;
  skippedRows: number;
}

// Known invalid unit IDs — includes literal values that appear in the Address column
// of Waggle Portal exports when the device address is not populated
const INVALID_UNIT_IDS = new Set([
  'address not found',
  'address',
  'unknown',
  'n/a',
  '',
  'undefined',
  'null',
  'none',
  'not found',
  '-',
  'na',
]);

function isValidUnitId(id: string): boolean {
  if (!id || id.trim() === '') return false;
  const lower = id.trim().toLowerCase();
  if (INVALID_UNIT_IDS.has(lower)) return false;
  if (id.startsWith('-')) return false;
  if (id.length < 2) return false;
  return true;
}

function getISOWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `W${String(weekNo).padStart(2, '0')}-${d.getUTCFullYear()}`;
}

// Detect per-packet-event-log format by checking for Date/Timezone/Latitude/Longitude pattern
function isPerPacketEventLogHeader(headers: string[]): boolean {
  const normalized = headers.map(h => h.trim().toLowerCase());
  const hasDate = normalized.some(h => h === 'date' || h === 'datetime');
  const hasTimezone = normalized.some(h => h === 'timezone' || h === 'time zone');
  const hasLat = normalized.some(h => h === 'latitude' || h === 'lat');
  const hasLon = normalized.some(h => h === 'longitude' || h === 'lon' || h === 'long');
  return hasDate && hasTimezone && hasLat && hasLon;
}

// Find the Address column index — try multiple strategies
function findAddressColumnIndex(headers: string[]): number {
  // Strategy 1: exact match "Address" (case-insensitive)
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].trim().toLowerCase() === 'address') {
      return i;
    }
  }
  // Strategy 2: contains "address"
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].trim().toLowerCase().includes('address')) {
      return i;
    }
  }
  // Strategy 3: known fixed index 25 for Waggle Portal per-packet format
  if (headers.length > 25) {
    return 25;
  }
  return -1;
}

// Find HWID or device serial column index (alternative to Address)
function findHwidColumnIndex(headers: string[]): number {
  const candidates = ['hwid', 'hw id', 'hw_id', 'serial', 'serial no', 'serialno', 'device id', 'deviceid', 'imei', 'unit id', 'unitid'];
  for (const candidate of candidates) {
    for (let i = 0; i < headers.length; i++) {
      if (headers[i].trim().toLowerCase() === candidate) {
        return i;
      }
    }
  }
  return -1;
}

// Find PktState column index
function findPktStateColumnIndex(headers: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim().toLowerCase();
    if (h === 'pktstate' || h === 'pkt state' || h === 'packet state') {
      return i;
    }
  }
  // Known fixed index 24 for Waggle Portal per-packet format
  if (headers.length > 24) {
    return 24;
  }
  return -1;
}

// Find GPS Status column index
function findGpsStatusColumnIndex(headers: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim().toLowerCase();
    if (h === 'gps status' || h === 'gpsstatus' || h === 'gps_status') {
      return i;
    }
  }
  return -1;
}

/**
 * Extract unit ID from filename.
 * Handles Waggle Portal filenames like:
 *   S18025_PRD.xls        → S18025
 *   N13-5_D20_Lite.xls    → N13-5_D20
 *   device_12345.csv      → 12345
 */
function extractUnitIdFromFilename(filename: string): string | null {
  if (!filename) return null;

  // Remove extension
  const base = filename.replace(/\.[^.]+$/, '');

  // Strategy 1: Match leading alphanumeric ID before underscore or dash separator
  // e.g. "S18025_PRD" → "S18025", "N13-5_D20_Lite" → "N13-5_D20"
  const leadingMatch = base.match(/^([A-Z0-9][A-Z0-9\-]{2,}?)(?:_[A-Z]|$)/i);
  if (leadingMatch) {
    const candidate = leadingMatch[1];
    if (candidate.length >= 3 && !INVALID_UNIT_IDS.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  // Strategy 2: Match any uppercase alphanumeric token that looks like a device ID
  // e.g. "S18025", "N135", "ABC123"
  const tokens = base.split(/[_\s\(\)]+/);
  for (const token of tokens) {
    if (/^[A-Z][A-Z0-9\-]{2,}$/i.test(token) && !INVALID_UNIT_IDS.has(token.toLowerCase())) {
      return token;
    }
  }

  // Strategy 3: Any sequence of 4+ alphanumeric chars
  const match = base.match(/([A-Z0-9]{4,})/i);
  if (match) return match[1];

  return null;
}

/**
 * Pad a row array to at least `minLength` elements, filling missing slots with ''.
 * This is critical for XLS files where SheetJS may return sparse/short rows
 * when trailing cells are empty — the Address column (index 25) would be missing
 * from rows that don't have a value there, causing unitId to be unresolvable.
 */
function padRow(row: string[], minLength: number): string[] {
  if (row.length >= minLength) return row;
  const padded = [...row];
  while (padded.length < minLength) {
    padded.push('');
  }
  return padded;
}

/**
 * Safely get a cell value from a row by index.
 * Returns '' for missing/undefined cells regardless of row length.
 */
function getCellValue(row: string[], index: number): string {
  if (index < 0) return '';
  const val = row[index];
  return val !== undefined && val !== null ? String(val).trim() : '';
}

/**
 * Resolve the unit ID for a row using multiple strategies:
 * 1. Address column value (if valid)
 * 2. HWID/serial column value (if valid)
 * 3. Filename extraction (last resort)
 *
 * Returns empty string if no valid ID found.
 */
function resolveUnitId(
  row: string[],
  addressIdx: number,
  hwidIdx: number,
  filename: string
): string {
  // Try Address column first
  if (addressIdx >= 0) {
    const val = getCellValue(row, addressIdx);
    if (val && isValidUnitId(val)) {
      return val;
    }
  }

  // Try HWID/serial column
  if (hwidIdx >= 0) {
    const val = getCellValue(row, hwidIdx);
    if (val && isValidUnitId(val)) {
      return val;
    }
  }

  // Fall back to filename
  const fromFilename = extractUnitIdFromFilename(filename);
  if (fromFilename && isValidUnitId(fromFilename)) {
    return fromFilename;
  }

  return '';
}

// Parse rows in per-packet-event-log format
// Each row is one GPS packet event; aggregate by unitId (Address column)
function parsePerPacketFormat(
  headers: string[],
  dataRows: string[][],
  filename: string
): {
  records: ParsedRecord[];
  skippedRows: number;
  sampleRows: Array<Record<string, string>>;
  resolvedSampleRecords: Array<{ unitId: string; total: number; stored: number; valid: number; normal: number; pktState: string }>;
  unitIdSource: string;
} {
  const addressIdx = findAddressColumnIndex(headers);
  const hwidIdx = findHwidColumnIndex(headers);
  const pktStateIdx = findPktStateColumnIndex(headers);
  const gpsStatusIdx = findGpsStatusColumnIndex(headers);
  const dateIdx = headers.findIndex(h => h.trim().toLowerCase() === 'date' || h.trim().toLowerCase() === 'datetime');

  // The minimum row width needed to access all relevant columns
  const minRowWidth = Math.max(
    addressIdx + 1,
    hwidIdx + 1,
    pktStateIdx + 1,
    gpsStatusIdx + 1,
    dateIdx + 1,
    headers.length
  );

  // Determine unit ID source description
  let unitIdSource = 'filename fallback';
  if (addressIdx >= 0) {
    unitIdSource = `col ${addressIdx} = "${headers[addressIdx]?.trim()}"`;
  } else if (hwidIdx >= 0) {
    unitIdSource = `col ${hwidIdx} = "${headers[hwidIdx]?.trim()}" (HWID)`;
  }

  // Aggregate by unitId
  const unitMap = new Map<string, {
    totalPkts: number;
    storedPkts: number;
    validGpsFixPkts: number;
    normalPktCount: number;
    storedPktCount: number;
    weekYear: string;
    rawRow: Record<string, string>;
    lastPktState: string;
  }>();

  let skippedRows = 0;

  for (const rawRow of dataRows) {
    // Pad the row so all column indices are accessible, even if the XLS row is shorter
    const row = padRow(rawRow, minRowWidth);

    if (row.every(cell => cell.trim() === '')) continue;

    // Resolve unit ID using multi-strategy approach
    const unitId = resolveUnitId(row, addressIdx, hwidIdx, filename);

    if (!isValidUnitId(unitId)) {
      skippedRows++;
      continue;
    }

    // Determine pktState
    const pktState = pktStateIdx >= 0 ? getCellValue(row, pktStateIdx) : '';

    // Determine GPS validity
    let isValidGps = false;
    if (gpsStatusIdx >= 0) {
      const gpsStatus = getCellValue(row, gpsStatusIdx).toLowerCase();
      isValidGps = gpsStatus === 'fix' || gpsStatus === 'valid' || gpsStatus === '1' || gpsStatus === 'true';
    }

    // Determine week from date column
    let weekYear = getISOWeekLabel(new Date());
    if (dateIdx >= 0) {
      const dateStr = getCellValue(row, dateIdx);
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          weekYear = getISOWeekLabel(parsed);
        }
      }
    }

    // Build raw row object keyed by header name
    const rowObj: Record<string, string> = {};
    headers.forEach((h, i) => {
      rowObj[h.trim()] = getCellValue(row, i);
    });

    if (!unitMap.has(unitId)) {
      unitMap.set(unitId, {
        totalPkts: 0,
        storedPkts: 0,
        validGpsFixPkts: 0,
        normalPktCount: 0,
        storedPktCount: 0,
        weekYear,
        rawRow: rowObj,
        lastPktState: pktState,
      });
    }

    const entry = unitMap.get(unitId)!;
    entry.totalPkts++;
    entry.lastPktState = pktState;

    const pktStateLower = pktState.toLowerCase();
    if (pktStateLower === 'normal' || pktStateLower === 'norm') {
      entry.normalPktCount++;
    }
    if (pktStateLower === 'stored' || pktStateLower === 'pktstate' || pktStateLower === 'store') {
      entry.storedPkts++;
      entry.storedPktCount++;
    }
    if (isValidGps) {
      entry.validGpsFixPkts++;
    }
  }

  const records: ParsedRecord[] = [];
  for (const [unitId, data] of unitMap.entries()) {
    records.push({
      unitId,
      totalPkts: data.totalPkts,
      storedPkts: data.storedPkts,
      validGpsFixPkts: data.validGpsFixPkts,
      normalPktCount: data.normalPktCount,
      storedPktCount: data.storedPktCount,
      weekYear: data.weekYear,
      rawRow: data.rawRow,
    });
  }

  // Build sample rows for debug (first 3 data rows, padded)
  const sampleRows: Array<Record<string, string>> = [];
  for (let i = 0; i < Math.min(3, dataRows.length); i++) {
    const row = padRow(dataRows[i], minRowWidth);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = getCellValue(row, idx);
    });
    sampleRows.push(obj);
  }

  // Build resolved sample records from the first 3 aggregated records
  const resolvedSampleRecords = records.slice(0, 3).map(r => ({
    unitId: r.unitId,
    total: r.totalPkts,
    stored: r.storedPkts,
    valid: r.validGpsFixPkts,
    normal: r.normalPktCount,
    pktState: unitMap.get(r.unitId)?.lastPktState ?? '',
  }));

  return { records, skippedRows, sampleRows, resolvedSampleRecords, unitIdSource };
}

// Parse rows in summary format (one row per unit)
function parseSummaryFormat(
  headers: string[],
  dataRows: string[][],
  filename: string
): {
  records: ParsedRecord[];
  skippedRows: number;
  sampleRows: Array<Record<string, string>>;
  resolvedSampleRecords: Array<{ unitId: string; total: number; stored: number; valid: number; normal: number; pktState: string }>;
} {
  // Find column indices
  const findCol = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex(h => h.trim().toLowerCase().includes(name.toLowerCase()));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const unitIdIdx = findCol(['unit id', 'unitid', 'device id', 'deviceid', 'imei', 'serial', 'address', 'hwid']);
  const totalIdx = findCol(['total pkt', 'totalpkt', 'total packet', 'total_pkt']);
  const storedIdx = findCol(['stored pkt', 'storedpkt', 'stored packet', 'stored_pkt']);
  const validIdx = findCol(['valid gps', 'validgps', 'gps fix', 'gpsfix', 'valid_gps']);
  const normalIdx = findCol(['normal pkt', 'normalpkt', 'normal packet', 'normal_pkt']);
  const dateIdx = findCol(['date', 'datetime', 'week']);

  const minRowWidth = headers.length;

  const records: ParsedRecord[] = [];
  let skippedRows = 0;
  const sampleRows: Array<Record<string, string>> = [];

  for (const rawRow of dataRows) {
    const row = padRow(rawRow, minRowWidth);
    if (row.every(cell => cell.trim() === '')) continue;

    let unitId = unitIdIdx >= 0 ? getCellValue(row, unitIdIdx) : '';
    if (!unitId || !isValidUnitId(unitId)) {
      const fromFilename = extractUnitIdFromFilename(filename);
      if (fromFilename && isValidUnitId(fromFilename)) unitId = fromFilename;
    }

    if (!isValidUnitId(unitId)) {
      skippedRows++;
      continue;
    }

    const totalPkts = totalIdx >= 0 ? parseInt(getCellValue(row, totalIdx) || '0', 10) || 0 : 0;
    const storedPkts = storedIdx >= 0 ? parseInt(getCellValue(row, storedIdx) || '0', 10) || 0 : 0;
    const validGpsFixPkts = validIdx >= 0 ? parseInt(getCellValue(row, validIdx) || '0', 10) || 0 : 0;
    const normalPktCount = normalIdx >= 0 ? parseInt(getCellValue(row, normalIdx) || '0', 10) || 0 : 0;

    let weekYear = getISOWeekLabel(new Date());
    if (dateIdx >= 0) {
      const dateStr = getCellValue(row, dateIdx);
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          weekYear = getISOWeekLabel(parsed);
        }
      }
    }

    const rowObj: Record<string, string> = {};
    headers.forEach((h, i) => {
      rowObj[h.trim()] = getCellValue(row, i);
    });

    records.push({
      unitId,
      totalPkts,
      storedPkts,
      validGpsFixPkts,
      normalPktCount,
      storedPktCount: storedPkts,
      weekYear,
      rawRow: rowObj,
    });

    if (sampleRows.length < 3) sampleRows.push(rowObj);
  }

  const resolvedSampleRecords = records.slice(0, 3).map(r => ({
    unitId: r.unitId,
    total: r.totalPkts,
    stored: r.storedPkts,
    valid: r.validGpsFixPkts,
    normal: r.normalPktCount,
    pktState: 'N/A',
  }));

  return { records, skippedRows, sampleRows, resolvedSampleRecords };
}

// Find the header row in raw rows (first row with enough non-empty cells)
function findHeaderRow(rows: string[][]): { headerRowIndex: number; headers: string[] } {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    const nonEmpty = row.filter(c => c && c.trim() !== '');
    if (nonEmpty.length >= 3) {
      return { headerRowIndex: i, headers: row.map(c => c?.trim() || '') };
    }
  }
  return { headerRowIndex: 0, headers: rows[0]?.map(c => c?.trim() || '') || [] };
}

export function parseCSVData(csvText: string, filename: string = ''): ParseResult {
  const lines = csvText.split(/\r?\n/);
  const rows: string[][] = lines.map(line => {
    // Simple CSV parse (handles quoted fields)
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }).filter(row => row.some(c => c.trim() !== ''));

  return parseRows(rows, filename);
}

export function parseXLSData(workbook: unknown, filename: string = ''): ParseResult {
  // Use SheetJS (XLSX) loaded globally via CDN
  const XLSX = (window as unknown as {
    XLSX: {
      utils: {
        sheet_to_json: (sheet: unknown, opts: unknown) => unknown[];
        decode_range: (ref: string) => { s: { r: number; c: number }; e: { r: number; c: number } };
        encode_range: (range: { s: { r: number; c: number }; e: { r: number; c: number } }) => string;
      };
    };
  }).XLSX;

  if (!XLSX) {
    throw new Error('SheetJS (XLSX) library not loaded. Please refresh the page.');
  }

  const wb = workbook as {
    SheetNames: string[];
    Sheets: Record<string, { '!ref'?: string; [key: string]: unknown }>;
  };

  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  // Ensure the sheet's used range covers all columns including trailing ones (e.g. Address at col 25).
  // SheetJS may under-report the range for .xls files if trailing cells are empty.
  // We expand the range to at least 40 columns (AO) to cover the full Waggle Portal export layout.
  if (sheet['!ref']) {
    try {
      const range = XLSX.utils.decode_range(sheet['!ref']);
      if (range.e.c < 39) {
        range.e.c = 39; // expand to column 40 (index 39) to ensure Address col 25 is included
        sheet['!ref'] = XLSX.utils.encode_range(range);
      }
    } catch {
      // If range manipulation fails, proceed with original ref
    }
  }

  // Get raw array of arrays; defval:'' fills empty cells within the used range
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

  // Convert all cell values to strings and filter out fully-empty rows
  const rows: string[][] = rawData
    .map(row => (row as unknown[]).map(c => (c !== undefined && c !== null ? String(c) : '')))
    .filter(row => row.some(c => c.trim() !== ''));

  return parseRows(rows, filename);
}

function parseRows(rows: string[][], filename: string): ParseResult {
  if (rows.length < 2) {
    return {
      records: [],
      skippedRows: 0,
      debug: {
        strategy: 'no-data',
        format: 'unknown',
        headerRowIndex: 0,
        headers: [],
        columnMapping: { unitId: 'N/A', total: 'N/A', stored: 'N/A', valid: 'N/A', pktState: 'N/A' },
        sampleRows: [],
        isPerPacketFormat: false,
        unitIdSource: 'none',
        allColumnHeaders: [],
        resolvedSampleRecords: [],
      },
    };
  }

  const { headerRowIndex, headers } = findHeaderRow(rows);
  const dataRows = rows.slice(headerRowIndex + 1);

  const isPerPacket = isPerPacketEventLogHeader(headers);

  let records: ParsedRecord[];
  let skippedRows: number;
  let sampleRows: Array<Record<string, string>>;
  let resolvedSampleRecords: ParseDebugInfo['resolvedSampleRecords'];
  let format: string;
  let unitIdSource: string;
  let columnMapping: ParseDebugInfo['columnMapping'];

  if (isPerPacket) {
    format = 'per-packet-event-log';
    const addressIdx = findAddressColumnIndex(headers);
    const hwidIdx = findHwidColumnIndex(headers);
    const pktStateIdx = findPktStateColumnIndex(headers);

    // Describe the unit ID source in the column mapping
    let unitIdColDesc = 'filename fallback';
    if (addressIdx >= 0) {
      unitIdColDesc = `col ${addressIdx} = "${headers[addressIdx]?.trim()}"`;
    } else if (hwidIdx >= 0) {
      unitIdColDesc = `col ${hwidIdx} = "${headers[hwidIdx]?.trim()}" (HWID fallback)`;
    }

    columnMapping = {
      unitId: unitIdColDesc,
      total: 'computed by row aggregation',
      stored: 'computed by row aggregation',
      valid: 'computed by row aggregation',
      pktState: pktStateIdx >= 0 ? `col ${pktStateIdx} = "${headers[pktStateIdx]?.trim()}"` : 'not found',
    };

    const result = parsePerPacketFormat(headers, dataRows, filename);
    records = result.records;
    skippedRows = result.skippedRows;
    sampleRows = result.sampleRows;
    resolvedSampleRecords = result.resolvedSampleRecords;
    unitIdSource = result.unitIdSource;
  } else {
    format = 'summary';
    unitIdSource = 'unit id column';
    columnMapping = {
      unitId: 'auto-detected',
      total: 'auto-detected',
      stored: 'auto-detected',
      valid: 'auto-detected',
      pktState: 'N/A',
    };

    const result = parseSummaryFormat(headers, dataRows, filename);
    records = result.records;
    skippedRows = result.skippedRows;
    sampleRows = result.sampleRows;
    resolvedSampleRecords = result.resolvedSampleRecords;
  }

  return {
    records,
    skippedRows,
    debug: {
      strategy: `header:exact-keyword, format:${format}`,
      format,
      headerRowIndex,
      headers,
      columnMapping,
      sampleRows,
      isPerPacketFormat: isPerPacket,
      unitIdSource,
      allColumnHeaders: headers.filter(h => h.trim() !== ''),
      resolvedSampleRecords,
    },
  };
}

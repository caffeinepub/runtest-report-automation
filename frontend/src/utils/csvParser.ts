// Waggle portal CSV/XLS/XLSX parser
// Parses exported files from the Waggle GPS tracking portal
// Each file is treated as a single device unit; the unit ID is ALWAYS derived from the filename (without extension).
// Values inside the file (columns, rows) are NEVER used as the unit ID.

export interface ParsedRow {
  unitId: string;
  totalPkts: number;
  storedPkts: number;
  normalPktCount: number;
  totalGpsPackets: number;
  validGpsFixPkts: number;
  model?: string;
  weekYear?: string;
  startDate?: string;
  endDate?: string;
  gatewayName?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  weekYear?: string;
  startDate?: string;
  endDate?: string;
  gatewayName?: string;
  /** Device name derived exclusively from the filename (without extension) */
  deviceName?: string;
  errors: string[];
}

// Normalize a string: trim whitespace (including non-breaking spaces), lowercase
function norm(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, ' ')
    .trim()
    .toLowerCase();
}

// Normalize for fuzzy column matching: remove ALL whitespace, underscores, hyphens
function normKey(s: unknown): string {
  return norm(s).replace(/[\s_\-]/g, '');
}

// Parse a date string from Waggle format
function parseWaggleDate(dateStr: string): string {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return dateStr.trim();
}

// Extract ISO week string from a date string
function getISOWeek(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// Detect unit model from unit ID string (filename stem)
function detectModel(unitId: string): string {
  const id = unitId.toUpperCase();
  if (id.includes('N13-5') || id.includes('N135')) return 'N135';
  if (id.includes('N12-5') || id.includes('N125')) return 'N125';
  if (id.includes('N13')) return 'N13';
  return '';
}

/**
 * Strip file extension from a filename to get the device name (unit ID).
 * This is the ONLY source of truth for the unit ID — never use file content.
 */
function deviceNameFromFilename(filename: string): string {
  // Remove path separators if any
  const base = filename.split(/[\\/]/).pop() ?? filename;
  // Remove extension (last dot and everything after)
  return base.replace(/\.[^.]+$/, '');
}

// Check if a normalized-key cell value matches 'pktstate' variants
function isPktStateHeader(cell: unknown): boolean {
  const k = normKey(cell);
  return k === 'pktstate' || k === 'packetstate' || k === 'pkt';
}

// Check if a normalized-key cell value matches 'gps status' variants
function isGpsStatusHeader(cell: unknown): boolean {
  const k = normKey(cell);
  return k === 'gpsstatus' || k === 'gpsfix' || k === 'gpsfixstatus';
}

// Parse Waggle portal format (CSV/TSV/XLS/XLSX)
// Returns null if the file doesn't look like a Waggle export.
// IMPORTANT: unitId is NEVER extracted from file content — it is always set to 'pending'
// and will be replaced by the filename stem after this function returns.
function parseWaggleFormat(grid: unknown[][]): ParseResult | null {
  // --- Metadata extraction ---
  let gatewayName = '';
  let startDate = '';
  let endDate = '';

  // Scan first 30 rows for metadata
  for (let i = 0; i < Math.min(30, grid.length); i++) {
    const row = grid[i];
    if (!row || row.length === 0) continue;
    const first = norm(row[0]);
    const second = row[1] !== undefined ? String(row[1]).trim() : '';

    if (first.startsWith('gateway')) {
      const colonIdx = first.indexOf(':');
      if (colonIdx !== -1) {
        gatewayName = first.slice(colonIdx + 1).trim();
        if (!gatewayName && second) gatewayName = second;
      } else if (second) {
        gatewayName = second;
      }
    }

    if (first.includes('start') && first.includes('date')) {
      const colonIdx = first.indexOf(':');
      if (colonIdx !== -1) {
        const val = first.slice(colonIdx + 1).trim();
        startDate = parseWaggleDate(val || second);
      } else if (second) {
        startDate = parseWaggleDate(second);
      }
    }

    if (first.includes('end') && first.includes('date')) {
      const colonIdx = first.indexOf(':');
      if (colonIdx !== -1) {
        const val = first.slice(colonIdx + 1).trim();
        endDate = parseWaggleDate(val || second);
      } else if (second) {
        endDate = parseWaggleDate(second);
      }
    }
  }

  // --- Header row detection ---
  // Scan ALL rows to find the header row containing 'PktState' and 'GPS Status' columns.
  let headerRowIdx = -1;
  let pktStateCol = -1;
  let gpsStatusCol = -1;

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i];
    if (!row || row.length === 0) continue;

    let foundPktState = -1;
    let foundGpsStatus = -1;

    for (let j = 0; j < row.length; j++) {
      const cell = row[j];
      if (cell === null || cell === undefined || String(cell).trim() === '') continue;

      if (isPktStateHeader(cell)) foundPktState = j;
      if (isGpsStatusHeader(cell)) foundGpsStatus = j;
    }

    if (foundPktState !== -1 && foundGpsStatus !== -1) {
      headerRowIdx = i;
      pktStateCol = foundPktState;
      gpsStatusCol = foundGpsStatus;
      console.log(
        `[csvParser] Header row found at index ${i}.`,
        `PktState col: ${pktStateCol} (raw: "${row[pktStateCol]}"),`,
        `GPS Status col: ${gpsStatusCol} (raw: "${row[gpsStatusCol]}")`
      );
      break;
    }
  }

  if (headerRowIdx === -1) {
    console.error('[csvParser] Header row NOT found. Could not locate "PktState" and "GPS Status" columns.');
    console.error('[csvParser] Dumping all non-empty rows for diagnosis:');
    for (let i = 0; i < Math.min(grid.length, 50); i++) {
      const row = grid[i];
      if (!row || row.length === 0) continue;
      const hasContent = row.some(c => c !== null && c !== undefined && String(c).trim() !== '');
      if (hasContent) {
        console.error(`  Row ${i}:`, JSON.stringify(row));
      }
    }
    return null;
  }

  // --- Data row extraction ---
  // unitId is intentionally set to 'pending' here — it will be replaced by the
  // filename stem in aggregateToSingleUnit. No column value is ever used as unitId.
  const rows: ParsedRow[] = [];
  let dataRowCount = 0;

  for (let i = headerRowIdx + 1; i < grid.length; i++) {
    const row = grid[i];
    if (!row || row.length === 0) continue;

    const rawPktState = row[pktStateCol];
    const rawGpsStatus = row[gpsStatusCol];
    if (
      (rawPktState === null || rawPktState === undefined || String(rawPktState).trim() === '') &&
      (rawGpsStatus === null || rawGpsStatus === undefined || String(rawGpsStatus).trim() === '')
    ) {
      continue;
    }

    const pktStateVal = normKey(rawPktState);
    const gpsStatusVal = normKey(rawGpsStatus);

    const validPktStates = ['normal', 'stored'];
    const validGpsStates = ['valid', 'invalid'];
    const hasPktState = validPktStates.includes(pktStateVal);
    const hasGpsState = validGpsStates.includes(gpsStatusVal);

    if (!hasPktState && !hasGpsState) {
      continue;
    }

    dataRowCount++;

    const isNormal = pktStateVal === 'normal';
    const isStored = pktStateVal === 'stored';
    const isValidGps = gpsStatusVal === 'valid';
    const hasGpsData = gpsStatusVal === 'valid' || gpsStatusVal === 'invalid';

    rows.push({
      // unitId is always 'pending' — NEVER derived from file content
      unitId: 'pending',
      totalPkts: isNormal || isStored ? 1 : 0,
      storedPkts: isStored ? 1 : 0,
      normalPktCount: isNormal ? 1 : 0,
      totalGpsPackets: hasGpsData ? 1 : 0,
      validGpsFixPkts: isValidGps ? 1 : 0,
      model: '',
    });
  }

  console.log(`[csvParser] Data rows extracted after header: ${dataRowCount}`);

  if (rows.length === 0) {
    console.error('[csvParser] No data rows found after the header row.');
    for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 6, grid.length); i++) {
      console.error(`  Post-header row ${i}:`, JSON.stringify(grid[i]));
    }
  }

  const weekYear = startDate ? getISOWeek(startDate) : '';

  return {
    rows,
    weekYear,
    startDate,
    endDate,
    gatewayName,
    errors: [],
  };
}

/**
 * Aggregate all individual packet rows into a single summary row for the device.
 * The unitId is ALWAYS set to deviceName (the filename stem) — never from row content.
 */
function aggregateToSingleUnit(rows: ParsedRow[], deviceName: string, resultWeekYear?: string): ParsedRow[] {
  if (rows.length === 0) return [];

  const model = detectModel(deviceName);
  const weekYear = resultWeekYear || rows.find(r => r.weekYear)?.weekYear;

  const aggregated: ParsedRow = {
    // unitId is always the filename stem — this is the single source of truth
    unitId: deviceName,
    totalPkts: 0,
    storedPkts: 0,
    normalPktCount: 0,
    totalGpsPackets: 0,
    validGpsFixPkts: 0,
    model: model || '',
    weekYear,
  };

  for (const row of rows) {
    aggregated.totalPkts += row.totalPkts;
    aggregated.storedPkts += row.storedPkts;
    aggregated.normalPktCount += row.normalPktCount;
    aggregated.totalGpsPackets += row.totalGpsPackets;
    aggregated.validGpsFixPkts += row.validGpsFixPkts;
  }

  return [aggregated];
}

/**
 * Main entry point: parse a file (CSV, TSV, XLS, XLSX).
 * The unit ID for all records is ALWAYS derived from the filename (without extension).
 * No value from inside the file is ever used as the unit ID.
 */
export async function parseCSVFile(file: File): Promise<ParseResult> {
  const fileName = file.name.toLowerCase();
  const isExcel = fileName.endsWith('.xls') || fileName.endsWith('.xlsx');
  // This is the ONLY place unitId originates — the filename stem
  const deviceName = deviceNameFromFilename(file.name);

  if (isExcel) {
    return parseExcelFile(file, deviceName);
  }

  // CSV/TSV parsing
  const text = await file.text();
  const lines = text.split(/\r?\n/);

  const firstLine = lines[0] || '';
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  const grid: string[][] = lines.map(line =>
    line.split(delimiter).map(cell => cell.replace(/^"|"$/g, '').trim())
  );

  const result = parseWaggleFormat(grid);
  if (result) {
    result.rows = aggregateToSingleUnit(result.rows, deviceName, result.weekYear || undefined);
    if (!result.weekYear && result.rows[0]?.weekYear) {
      result.weekYear = result.rows[0].weekYear;
    }
    result.deviceName = deviceName;
    return result;
  }

  return {
    rows: [],
    weekYear: undefined,
    startDate: undefined,
    endDate: undefined,
    gatewayName: undefined,
    deviceName,
    errors: ['Could not parse file. Make sure it is a valid Waggle portal export with PktState and GPS Status columns.'],
  };
}

// Parse Excel file using SheetJS (loaded via CDN in index.html)
async function parseExcelFile(file: File, deviceName: string): Promise<ParseResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX = (window as any).XLSX;
  if (!XLSX) {
    console.error('[csvParser] SheetJS (XLSX) not available on window. Check CDN script in index.html.');
    return {
      rows: [],
      deviceName,
      errors: ['SheetJS library not loaded. Please refresh the page and try again.'],
    };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();

    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellText: true, cellDates: false });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      console.error('[csvParser] No sheets found in workbook.');
      return { rows: [], deviceName, errors: ['No sheets found in the Excel file.'] };
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    console.log(`[csvParser] Excel sheet "${sheetName}" selected. Sheet ref: ${sheet['!ref'] ?? 'undefined'}`);

    const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      blankrows: true,
      raw: false,
    });

    console.log(`[csvParser] Excel grid loaded. Total rows: ${grid.length}`);

    if (grid.length === 0) {
      console.error('[csvParser] Sheet is empty after conversion.');
      return { rows: [], deviceName, errors: ['The Excel file appears to be empty.'] };
    }

    console.log('[csvParser] First 15 rows of grid:');
    for (let i = 0; i < Math.min(15, grid.length); i++) {
      const row = grid[i];
      const hasContent = Array.isArray(row) && row.some(c => c !== null && c !== undefined && String(c).trim() !== '');
      if (hasContent) {
        console.log(`  Row ${i}:`, JSON.stringify(row));
      }
    }

    const result = parseWaggleFormat(grid);
    if (result) {
      if (result.rows.length === 0 && result.errors.length === 0) {
        console.error('[csvParser] parseWaggleFormat returned 0 rows with no errors — possible value mismatch.');
        result.errors.push('No data rows found in file. Open the browser console (F12) to see detailed parsing information.');
      }
      result.rows = aggregateToSingleUnit(result.rows, deviceName, result.weekYear || undefined);
      if (!result.weekYear && result.rows[0]?.weekYear) {
        result.weekYear = result.rows[0].weekYear;
      }
      result.deviceName = deviceName;
      return result;
    }

    return {
      rows: [],
      deviceName,
      errors: ['No data rows found in file. Open the browser console (F12) to see detailed parsing information. Make sure the file is a valid Waggle portal export with PktState and GPS Status columns.'],
    };
  } catch (err) {
    console.error('[csvParser] Error parsing Excel file:', err);
    return {
      rows: [],
      deviceName,
      errors: [`Failed to parse Excel file: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

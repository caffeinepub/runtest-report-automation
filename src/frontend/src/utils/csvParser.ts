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
  startDate?: string; // earliest date from column A
  endDate?: string; // latest date from column A
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
  resolvedSampleRecords: Array<{
    unitId: string;
    total: number;
    stored: number;
    valid: number;
    normal: number;
    pktState: string;
  }>;
}

export interface ParseResult {
  records: ParsedRecord[];
  debug: ParseDebugInfo;
  skippedRows: number;
}

// Known invalid unit IDs — includes literal values that appear in the Address column
// of Waggle Portal exports when the device address is not populated
const INVALID_UNIT_IDS = new Set([
  "address not found",
  "address",
  "unknown",
  "n/a",
  "",
  "undefined",
  "null",
  "none",
  "not found",
  "-",
  "na",
]);

function isValidUnitId(id: string): boolean {
  if (!id || id.trim() === "") return false;
  const lower = id.trim().toLowerCase();
  if (INVALID_UNIT_IDS.has(lower)) return false;
  if (id.startsWith("-")) return false;
  if (id.length < 2) return false;
  return true;
}

function getISOWeekLabel(date: Date): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `W${String(weekNo).padStart(2, "0")}-${d.getUTCFullYear()}`;
}

/**
 * Format a Date as DD/MM/YYYY for display.
 */
function formatDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Convert an Excel serial number to a JS Date.
 * Excel epoch: Dec 30, 1899. Serial 1 = Jan 1, 1900.
 * Handles the Excel 1900 leap year bug (serial 60 is skipped).
 */
function excelSerialToDate(serial: number): Date | null {
  if (serial < 1 || serial > 2958465) return null; // valid range ~1900–9999
  // Adjust for Excel's erroneous leap year 1900
  const adjustedSerial = serial > 59 ? serial - 1 : serial;
  const msPerDay = 86400000;
  const excelEpoch = new Date(Date.UTC(1899, 11, 31)); // Dec 31, 1899
  const date = new Date(excelEpoch.getTime() + adjustedSerial * msPerDay);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * Try to parse a date value that may be:
 * - A JS Date object (from SheetJS cellDates:true)
 * - An Excel serial number string (e.g. "45736")
 * - An ISO / human-readable date string
 * - "YYYY-MM-DD HH:MM:SS" (space separator, Waggle Portal export)
 * - "DD/MM/YYYY" or "DD/MM/YYYY HH:MM:SS"
 * - "MM/DD/YYYY" (US format fallback)
 */
function parseCellDate(raw: string): Date | null {
  if (!raw || raw.trim() === "") return null;
  const trimmed = raw.trim();

  // Try Excel serial number first (pure integer string, e.g. "45736")
  const serial = Number(trimmed);
  if (Number.isInteger(serial) && serial > 30000 && serial < 60000) {
    return excelSerialToDate(serial);
  }

  // Handle "YYYY-MM-DD HH:MM:SS" — replace space with T for ISO parsing
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(trimmed)) {
    const iso = trimmed.replace(" ", "T");
    const d = new Date(iso);
    if (
      !Number.isNaN(d.getTime()) &&
      d.getFullYear() >= 2000 &&
      d.getFullYear() <= 2100
    )
      return d;
  }

  // Handle "DD/MM/YYYY" or "DD/MM/YYYY HH:MM:SS"
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(trimmed)) {
    const datePart = trimmed.split(" ")[0];
    const parts = datePart.split("/");
    if (parts.length === 3) {
      const day = Number.parseInt(parts[0], 10);
      const month = Number.parseInt(parts[1], 10);
      const year = Number.parseInt(parts[2], 10);
      // Try DD/MM/YYYY first
      if (
        day >= 1 &&
        day <= 31 &&
        month >= 1 &&
        month <= 12 &&
        year >= 2000 &&
        year <= 2100
      ) {
        const d = new Date(Date.UTC(year, month - 1, day));
        if (!Number.isNaN(d.getTime())) return d;
      }
      // Fallback: try MM/DD/YYYY
      if (
        month >= 1 &&
        month <= 31 &&
        day >= 1 &&
        day <= 12 &&
        year >= 2000 &&
        year <= 2100
      ) {
        const d = new Date(Date.UTC(year, day - 1, month));
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
  }

  // Try standard JS date parsing (handles ISO strings like "2024-03-15T00:00:00.000Z")
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) {
    if (d.getFullYear() >= 2000 && d.getFullYear() <= 2100) return d;
  }

  return null;
}

// Detect per-packet-event-log format using flexible substring matching.
// Supports all Waggle Portal column name variants ("Lat.", "Date/Time", etc.)
function isPerPacketEventLogHeader(headers: string[]): boolean {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const hasDate = normalized.some(
    (h) => h.includes("date") || h.includes("time"),
  );
  const hasTimezone = normalized.some(
    (h) =>
      h.includes("timezone") || h.includes("time zone") || h.includes(" tz"),
  );
  const hasLat = normalized.some((h) => h.includes("lat"));
  const hasLon = normalized.some(
    (h) => h.includes("lon") || h.includes("lng") || h.includes("long"),
  );
  // PktState / GPS Status are strong indicators of Waggle per-packet format
  const hasPktState = normalized.some(
    (h) =>
      h.includes("pktstate") ||
      h.includes("pkt state") ||
      h.includes("packet state"),
  );
  const hasGpsStatus = normalized.some(
    (h) => h.includes("gps status") || h.includes("gpsstatus"),
  );
  // Match if: full coordinate+date set OR PktState+GPS Status OR PktState alone
  return (
    (hasDate && hasTimezone && hasLat && hasLon) ||
    (hasPktState && hasGpsStatus) ||
    hasPktState
  );
}

// Find PktState column index
function findPktStateColumnIndex(headers: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim().toLowerCase();
    if (h === "pktstate" || h === "pkt state" || h === "packet state") {
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
    if (h === "gps status" || h === "gpsstatus" || h === "gps_status") {
      return i;
    }
  }
  return -1;
}

/**
 * Get the full base filename (without extension) to use as the unit ID.
 */
function getUnitIdFromFilename(filename: string): string {
  if (!filename) return "unknown";
  return filename.replace(/\.[^.]+$/, "").trim() || "unknown";
}

/**
 * Pad a row array to at least `minLength` elements, filling missing slots with ''.
 */
function padRow(row: string[], minLength: number): string[] {
  if (row.length >= minLength) return row;
  const padded = [...row];
  while (padded.length < minLength) {
    padded.push("");
  }
  return padded;
}

/**
 * Safely get a cell value from a row by index.
 */
function getCellValue(row: string[], index: number): string {
  if (index < 0) return "";
  const val = row[index];
  return val !== undefined && val !== null ? String(val).trim() : "";
}

/**
 * Try to parse a date from column A (index 0) of a data row.
 */
function parseDateFromColA(row: string[], minRowWidth: number): Date | null {
  const row0 = padRow(row, minRowWidth);
  const raw = getCellValue(row0, 0);
  return parseCellDate(raw);
}

// Parse rows in per-packet-event-log format
function parsePerPacketFormat(
  headers: string[],
  dataRows: string[][],
  filename: string,
): {
  records: ParsedRecord[];
  skippedRows: number;
  sampleRows: Array<Record<string, string>>;
  resolvedSampleRecords: Array<{
    unitId: string;
    total: number;
    stored: number;
    valid: number;
    normal: number;
    pktState: string;
  }>;
  unitIdSource: string;
} {
  const pktStateIdx = findPktStateColumnIndex(headers);
  const gpsStatusIdx = findGpsStatusColumnIndex(headers);
  const dateIdx = headers.findIndex(
    (h) =>
      h.trim().toLowerCase() === "date" ||
      h.trim().toLowerCase() === "datetime",
  );

  const minRowWidth = Math.max(
    pktStateIdx + 1,
    gpsStatusIdx + 1,
    dateIdx + 1,
    headers.length,
    1, // at least column A (index 0)
  );

  const unitId = getUnitIdFromFilename(filename);
  const unitIdSource = `filename: "${unitId}"`;

  let totalPkts = 0;
  let storedPkts = 0;
  let validGpsFixPkts = 0;
  let normalPktCount = 0;
  let storedPktCount = 0;
  let weekYear = getISOWeekLabel(new Date());
  let rawRowObj: Record<string, string> = {};
  let lastPktState = "";
  const skippedRows = 0;

  // Column A is in DESCENDING order:
  // - First valid date in column A = endDate (Last Reported = most recent)
  // - Last valid date in column A = startDate (oldest = Start Date)
  let firstColADate: Date | null = null;
  let lastColADate: Date | null = null;

  for (const rawRow of dataRows) {
    const row = padRow(rawRow, minRowWidth);
    if (row.every((cell) => cell.trim() === "")) continue;

    const pktState = pktStateIdx >= 0 ? getCellValue(row, pktStateIdx) : "";

    // Determine GPS validity
    let isValidGps = false;
    if (gpsStatusIdx >= 0) {
      const gpsStatus = getCellValue(row, gpsStatusIdx).toLowerCase();
      isValidGps =
        gpsStatus === "fix" ||
        gpsStatus === "valid" ||
        gpsStatus === "1" ||
        gpsStatus === "true";
    }

    // Extract date from column A for start/end date tracking
    // Dates are in descending order: first row = most recent (endDate), last row = oldest (startDate)
    const rowDate = parseDateFromColA(rawRow, minRowWidth);
    if (rowDate) {
      if (firstColADate === null) {
        // First valid date encountered = most recent (endDate / Last Reported)
        firstColADate = rowDate;
      }
      // Always update last seen valid date = oldest (startDate)
      lastColADate = rowDate;
    }

    // Capture first row's date for week label
    if (dateIdx >= 0 && weekYear === getISOWeekLabel(new Date())) {
      const dateStr = getCellValue(row, dateIdx);
      if (dateStr) {
        const parsed = parseCellDate(dateStr);
        if (parsed) {
          weekYear = getISOWeekLabel(parsed);
        }
      }
    }

    // Build raw row object from first data row for debug
    if (totalPkts === 0) {
      headers.forEach((h, i) => {
        rawRowObj[h.trim()] = getCellValue(row, i);
      });
      lastPktState = pktState;
    }

    totalPkts++;
    lastPktState = pktState;

    const pktStateLower = pktState.toLowerCase();
    if (pktStateLower === "normal" || pktStateLower === "norm") {
      normalPktCount++;
    }
    if (
      pktStateLower === "stored" ||
      pktStateLower === "store" ||
      pktStateLower === "pktstate"
    ) {
      storedPkts++;
      storedPktCount++;
    }
    if (isValidGps) {
      validGpsFixPkts++;
    }
  }

  // endDate = first valid column A date (most recent, top of descending list)
  // startDate = last valid column A date (oldest, bottom of descending list)
  const endDate = firstColADate ? formatDate(firstColADate) : undefined;
  const startDate = lastColADate ? formatDate(lastColADate) : undefined;

  const records: ParsedRecord[] = [
    {
      unitId,
      totalPkts,
      storedPkts,
      validGpsFixPkts,
      normalPktCount,
      storedPktCount,
      weekYear,
      rawRow: rawRowObj,
      startDate,
      endDate,
    },
  ];

  const sampleRows: Array<Record<string, string>> = [];
  for (let i = 0; i < Math.min(3, dataRows.length); i++) {
    const row = padRow(dataRows[i], minRowWidth);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = getCellValue(row, idx);
    });
    sampleRows.push(obj);
  }

  const resolvedSampleRecords = records.slice(0, 3).map((r) => ({
    unitId: r.unitId,
    total: r.totalPkts,
    stored: r.storedPkts,
    valid: r.validGpsFixPkts,
    normal: r.normalPktCount,
    pktState: lastPktState,
  }));

  return {
    records,
    skippedRows,
    sampleRows,
    resolvedSampleRecords,
    unitIdSource,
  };
}

// Parse rows in summary format (one row per unit)
function parseSummaryFormat(
  headers: string[],
  dataRows: string[][],
  filename: string,
): {
  records: ParsedRecord[];
  skippedRows: number;
  sampleRows: Array<Record<string, string>>;
  resolvedSampleRecords: Array<{
    unitId: string;
    total: number;
    stored: number;
    valid: number;
    normal: number;
    pktState: string;
  }>;
} {
  const findCol = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex((h) =>
        h.trim().toLowerCase().includes(name.toLowerCase()),
      );
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const unitIdIdx = findCol([
    "unit id",
    "unitid",
    "device id",
    "deviceid",
    "imei",
    "serial",
    "address",
    "hwid",
  ]);
  const totalIdx = findCol([
    "total pkt",
    "totalpkt",
    "total packet",
    "total_pkt",
  ]);
  const storedIdx = findCol([
    "stored pkt",
    "storedpkt",
    "stored packet",
    "stored_pkt",
  ]);
  const validIdx = findCol([
    "valid gps",
    "validgps",
    "gps fix",
    "gpsfix",
    "valid_gps",
  ]);
  const normalIdx = findCol([
    "normal pkt",
    "normalpkt",
    "normal packet",
    "normal_pkt",
  ]);
  const dateIdx = findCol(["date", "datetime", "week"]);

  const minRowWidth = Math.max(headers.length, 1);

  const records: ParsedRecord[] = [];
  let skippedRows = 0;
  const sampleRows: Array<Record<string, string>> = [];

  // For summary format, column A dates are also in descending order.
  // Collect all valid column A dates, then assign first = endDate, last = startDate.
  const colADates: Date[] = [];

  for (const rawRow of dataRows) {
    const row = padRow(rawRow, minRowWidth);
    if (row.every((cell) => cell.trim() === "")) continue;

    const colADate = parseDateFromColA(rawRow, minRowWidth);
    if (colADate) colADates.push(colADate);

    let unitId = unitIdIdx >= 0 ? getCellValue(row, unitIdIdx) : "";
    if (!unitId || !isValidUnitId(unitId)) {
      unitId = getUnitIdFromFilename(filename);
    }

    if (!isValidUnitId(unitId)) {
      skippedRows++;
      continue;
    }

    const totalPkts =
      totalIdx >= 0
        ? Number.parseInt(getCellValue(row, totalIdx) || "0", 10) || 0
        : 0;
    const storedPkts =
      storedIdx >= 0
        ? Number.parseInt(getCellValue(row, storedIdx) || "0", 10) || 0
        : 0;
    const validGpsFixPkts =
      validIdx >= 0
        ? Number.parseInt(getCellValue(row, validIdx) || "0", 10) || 0
        : 0;
    const normalPktCount =
      normalIdx >= 0
        ? Number.parseInt(getCellValue(row, normalIdx) || "0", 10) || 0
        : 0;

    let weekYear = getISOWeekLabel(new Date());
    if (dateIdx >= 0) {
      const dateStr = getCellValue(row, dateIdx);
      if (dateStr) {
        const parsed = parseCellDate(dateStr);
        if (parsed) {
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
      // Dates will be set after collecting all rows
      startDate: undefined,
      endDate: undefined,
    });

    if (sampleRows.length < 3) sampleRows.push(rowObj);
  }

  // Assign start/end dates to all records based on column A ordering:
  // First valid date = endDate (most recent / Last Reported)
  // Last valid date = startDate (oldest / Start Date)
  if (colADates.length > 0) {
    const endDate = formatDate(colADates[0]);
    const startDate = formatDate(colADates[colADates.length - 1]);
    for (const rec of records) {
      rec.endDate = endDate;
      rec.startDate = startDate;
    }
  }

  const resolvedSampleRecords = records.slice(0, 3).map((r) => ({
    unitId: r.unitId,
    total: r.totalPkts,
    stored: r.storedPkts,
    valid: r.validGpsFixPkts,
    normal: r.normalPktCount,
    pktState: "N/A",
  }));

  return { records, skippedRows, sampleRows, resolvedSampleRecords };
}

// Find the header row in raw rows (first row with enough non-empty cells)
function findHeaderRow(rows: string[][]): {
  headerRowIndex: number;
  headers: string[];
} {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    const nonEmpty = row.filter((c) => c && c.trim() !== "");
    if (nonEmpty.length >= 3) {
      return { headerRowIndex: i, headers: row.map((c) => c?.trim() || "") };
    }
  }
  return {
    headerRowIndex: 0,
    headers: rows[0]?.map((c) => c?.trim() || "") || [],
  };
}

export function parseCSVData(csvText: string, filename = ""): ParseResult {
  const lines = csvText.split(/\r?\n/);
  const rows: string[][] = lines
    .map((line) => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
          result.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
      result.push(current);
      return result;
    })
    .filter((row) => row.some((c) => c.trim() !== ""));

  return parseRows(rows, filename);
}

export function parseXLSData(workbook: unknown, filename = ""): ParseResult {
  const XLSX = (
    window as unknown as {
      XLSX: {
        utils: {
          sheet_to_json: (sheet: unknown, opts: unknown) => unknown[];
          decode_range: (ref: string) => {
            s: { r: number; c: number };
            e: { r: number; c: number };
          };
          encode_range: (range: {
            s: { r: number; c: number };
            e: { r: number; c: number };
          }) => string;
        };
      };
    }
  ).XLSX;

  if (!XLSX) {
    throw new Error(
      "SheetJS (XLSX) library not loaded. Please refresh the page.",
    );
  }

  const wb = workbook as {
    SheetNames: string[];
    Sheets: Record<string, { "!ref"?: string; [key: string]: unknown }>;
  };

  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  if (sheet["!ref"]) {
    try {
      const range = XLSX.utils.decode_range(sheet["!ref"]);
      if (range.e.c < 39) {
        range.e.c = 39;
        sheet["!ref"] = XLSX.utils.encode_range(range);
      }
    } catch {
      // proceed with original ref
    }
  }

  // Use cellDates:true so SheetJS returns Date objects for date cells
  // instead of Excel serial numbers
  const rawData = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    cellDates: true,
  }) as unknown[][];

  const rows: string[][] = rawData
    .map((row) =>
      (row as unknown[]).map((c) => {
        if (c === undefined || c === null) return "";
        // If SheetJS returned a Date object (from cellDates:true), convert to ISO string
        // so parseCellDate can reliably parse it later
        if (c instanceof Date) {
          if (Number.isNaN(c.getTime())) return "";
          return c.toISOString();
        }
        return String(c);
      }),
    )
    .filter((row) => row.some((c) => c.trim() !== ""));

  return parseRows(rows, filename);
}

function parseRows(rows: string[][], filename: string): ParseResult {
  if (rows.length < 2) {
    const unitId = getUnitIdFromFilename(filename);
    return {
      records: [
        {
          unitId,
          totalPkts: 0,
          storedPkts: 0,
          validGpsFixPkts: 0,
          normalPktCount: 0,
          storedPktCount: 0,
          weekYear: getISOWeekLabel(new Date()),
        },
      ],
      skippedRows: 0,
      debug: {
        strategy: "no-data",
        format: "unknown",
        headerRowIndex: 0,
        headers: [],
        columnMapping: {
          unitId: `filename: "${unitId}"`,
          total: "N/A",
          stored: "N/A",
          valid: "N/A",
          pktState: "N/A",
        },
        sampleRows: [],
        isPerPacketFormat: false,
        unitIdSource: "filename",
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
  let resolvedSampleRecords: ParseDebugInfo["resolvedSampleRecords"];
  let format: string;
  let unitIdSource: string;
  let columnMapping: ParseDebugInfo["columnMapping"];

  if (isPerPacket) {
    format = "per-packet-event-log";
    const pktStateIdx = findPktStateColumnIndex(headers);

    columnMapping = {
      unitId: `filename: "${getUnitIdFromFilename(filename)}"`,
      total: "computed by row aggregation",
      stored: "computed by row aggregation",
      valid: "computed by row aggregation",
      pktState:
        pktStateIdx >= 0
          ? `col ${pktStateIdx} = "${headers[pktStateIdx]?.trim()}"`
          : "not found",
    };

    const result = parsePerPacketFormat(headers, dataRows, filename);
    records = result.records;
    skippedRows = result.skippedRows;
    sampleRows = result.sampleRows;
    resolvedSampleRecords = result.resolvedSampleRecords;
    unitIdSource = result.unitIdSource;
  } else {
    format = "summary";
    unitIdSource = "unit id column";
    columnMapping = {
      unitId: "auto-detected",
      total: "auto-detected",
      stored: "auto-detected",
      valid: "auto-detected",
      pktState: "N/A",
    };

    const result = parseSummaryFormat(headers, dataRows, filename);
    records = result.records;
    skippedRows = result.skippedRows;
    sampleRows = result.sampleRows;
    resolvedSampleRecords = result.resolvedSampleRecords;

    if (records.length === 0) {
      const unitId = getUnitIdFromFilename(filename);
      records = [
        {
          unitId,
          totalPkts: 0,
          storedPkts: 0,
          validGpsFixPkts: 0,
          normalPktCount: 0,
          storedPktCount: 0,
          weekYear: getISOWeekLabel(new Date()),
        },
      ];
      unitIdSource = `filename fallback: "${unitId}"`;
    }
  }

  return {
    records,
    skippedRows,
    debug: {
      strategy: `header:flexible-keyword, format:${format}`,
      format,
      headerRowIndex,
      headers,
      columnMapping,
      sampleRows,
      isPerPacketFormat: isPerPacket,
      unitIdSource,
      allColumnHeaders: headers.filter((h) => h.trim() !== ""),
      resolvedSampleRecords,
    },
  };
}

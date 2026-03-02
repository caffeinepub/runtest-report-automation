import React, { useCallback, useRef, useState } from "react";
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  MapPin,
} from "lucide-react";
import { parseCSVData, parseXLSData, ParsedRecord } from "../utils/csvParser";
import { useDirectUpsert } from "../hooks/useQueries";
import ColumnMappingSelector from "./ColumnMappingSelector";
import { Model, Flavour } from "../backend";

interface CSVImportSectionProps {
  currentWeek?: string;
  selectedWeek?: string;
  onImportSuccess?: (week: string) => void;
}

interface FileStatus {
  name: string;
  status: "pending" | "parsing" | "done" | "error";
  recordCount?: number;
  errorMessage?: string;
}

const MODEL_OPTIONS: { label: string; value: Model }[] = [
  { label: "N13.5", value: Model.N135 },
  { label: "N13", value: Model.N13 },
  { label: "N12.5", value: Model.N125 },
];

// IMPORTANT: Flavour enum values must match backend exactly.
// Flavour.aqi = "aqi", Flavour.premium = "premium", Flavour.standard = "standard", Flavour.deluxe = "deluxe"
const FLAVOUR_OPTIONS: { label: string; value: Flavour }[] = [
  { label: "Lite", value: Flavour.standard },
  { label: "AQI", value: Flavour.aqi },
  { label: "Premium", value: Flavour.premium },
  { label: "Deluxe", value: Flavour.deluxe },
];

const OTHERS_VALUE = "__others__";

async function parseFile(file: File): Promise<ParsedRecord[]> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "xls" || ext === "xlsx") {
    const XLSX = (
      window as unknown as {
        XLSX: { read: (data: ArrayBuffer, opts: unknown) => unknown };
      }
    ).XLSX;
    if (!XLSX) {
      throw new Error(
        "SheetJS library not loaded. Please refresh the page and try again."
      );
    }
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const result = parseXLSData(workbook, file.name);
    return result.records;
  } else if (ext === "csv") {
    const text = await file.text();
    const result = parseCSVData(text, file.name);
    return result.records;
  } else {
    throw new Error(
      "Unsupported file type. Please upload a CSV, XLS, or XLSX file."
    );
  }
}

export function CSVImportSection({
  currentWeek,
  selectedWeek,
  onImportSuccess,
}: CSVImportSectionProps) {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showColumnMapping, setShowColumnMapping] = useState(false);
  const [importedWeek, setImportedWeek] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<Model | "">("");
  const [selectedFlavour, setSelectedFlavour] = useState<Flavour | typeof OTHERS_VALUE | "">("");
  const [customFlavour, setCustomFlavour] = useState("");
  const [customFlavourError, setCustomFlavourError] = useState("");
  const [location, setLocation] = useState("");
  const [locationError, setLocationError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directUpsert = useDirectUpsert();

  const isOthers = selectedFlavour === OTHERS_VALUE;

  // Resolve the backend Flavour enum value:
  // - If a known flavour is selected, use it directly (it IS already a Flavour enum value)
  // - If "Others" is selected, fall back to Flavour.deluxe (closest available)
  const backendFlavour: Flavour | "" = isOthers
    ? Flavour.deluxe
    : (selectedFlavour as Flavour | "");

  const canUpload =
    selectedModel !== "" &&
    selectedFlavour !== "" &&
    (!isOthers || customFlavour.trim() !== "") &&
    location.trim() !== "";

  const activeWeek = selectedWeek ?? currentWeek ?? "";

  const getFlavourDisplayLabel = () => {
    if (isOthers) return customFlavour.trim() || "Others";
    return FLAVOUR_OPTIONS.find((f) => f.value === selectedFlavour)?.label ?? "";
  };

  const processFiles = useCallback(
    async (fileList: File[]) => {
      // Validate before processing
      let hasValidationError = false;

      if (isOthers && !customFlavour.trim()) {
        setCustomFlavourError("Please enter a custom flavour name.");
        hasValidationError = true;
      }
      if (!location.trim()) {
        setLocationError("Location is required.");
        hasValidationError = true;
      }
      if (hasValidationError || !canUpload || !selectedModel || !backendFlavour) return;

      const model = selectedModel as Model;
      const flavour = backendFlavour as Flavour;

      // Initialize all file statuses as "pending"
      const newFileStatuses: FileStatus[] = fileList.map((f) => ({
        name: f.name,
        status: "pending" as const,
      }));
      const startIndex = files.length;
      setFiles((prev) => [...prev, ...newFileStatuses]);
      setImportedWeek(null);
      setIsUploading(true);

      // Step 1: Parse all files first, collecting records and tracking per-file results
      type ParseResult =
        | { ok: true; records: ParsedRecord[] }
        | { ok: false; error: string };

      const parseResults: ParseResult[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const fileIndex = startIndex + i;

        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === fileIndex ? { ...f, status: "parsing" as const } : f
          )
        );

        try {
          const records = await parseFile(file);
          parseResults.push({ ok: true, records });
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === fileIndex
                ? { ...f, status: "parsing" as const, recordCount: records.length }
                : f
            )
          );
        } catch (err) {
          parseResults.push({
            ok: false,
            error: err instanceof Error ? err.message : "Unknown error",
          });
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === fileIndex
                ? {
                    ...f,
                    status: "error" as const,
                    errorMessage:
                      err instanceof Error ? err.message : "Unknown error",
                  }
                : f
            )
          );
        }
      }

      // Step 2: Aggregate ALL successfully parsed records into one batch.
      // Use a Map keyed by unitId+weekYear to deduplicate — last record wins,
      // matching the backend's upsert semantics. This ensures the count is predictable.
      const recordMap = new Map<
        string,
        {
          model: Model;
          flavour: Flavour;
          unitId: string;
          weekYear: string;
          totalPkts: bigint;
          storedPkts: bigint;
          validGpsFixPkts: bigint;
          storedPktCount: bigint;
          normalPkts: bigint;
          location: string;
        }
      >();

      let detectedWeek: string | null = null;

      for (const result of parseResults) {
        if (result.ok) {
          for (const r of result.records) {
            const week = r.weekYear ?? activeWeek;
            if (week && !detectedWeek) detectedWeek = week;

            const key = `${r.unitId}__${week}`;
            recordMap.set(key, {
              model,
              flavour,
              unitId: r.unitId,
              weekYear: week,
              totalPkts: BigInt(Math.max(0, r.totalPkts)),
              storedPkts: BigInt(Math.max(0, r.storedPkts)),
              validGpsFixPkts: BigInt(Math.max(0, r.validGpsFixPkts)),
              storedPktCount: BigInt(Math.max(0, r.storedPktCount ?? r.storedPkts)),
              normalPkts: BigInt(Math.max(0, r.normalPktCount ?? 0)),
              location: location.trim(),
            });
          }
        }
      }

      const allRecords = Array.from(recordMap.values());

      // Step 3: Send all records in a single batch call to avoid race conditions
      if (allRecords.length > 0) {
        try {
          await directUpsert.mutateAsync(allRecords);

          // Mark all successfully parsed files as done
          setFiles((prev) =>
            prev.map((f, idx) => {
              const relIdx = idx - startIndex;
              if (relIdx < 0 || relIdx >= parseResults.length) return f;
              const result = parseResults[relIdx];
              if (result.ok) {
                return { ...f, status: "done" as const };
              }
              return f;
            })
          );

          if (detectedWeek) {
            setImportedWeek(detectedWeek);
            onImportSuccess?.(detectedWeek);
          }
        } catch (err) {
          // Mark all pending/parsing files as error
          setFiles((prev) =>
            prev.map((f, idx) => {
              const relIdx = idx - startIndex;
              if (relIdx < 0 || relIdx >= parseResults.length) return f;
              const result = parseResults[relIdx];
              if (result.ok) {
                return {
                  ...f,
                  status: "error" as const,
                  errorMessage:
                    err instanceof Error ? err.message : "Upload failed",
                };
              }
              return f;
            })
          );
        }
      } else {
        // No records to upload — mark parsed files as done (0 records)
        setFiles((prev) =>
          prev.map((f, idx) => {
            const relIdx = idx - startIndex;
            if (relIdx < 0 || relIdx >= parseResults.length) return f;
            const result = parseResults[relIdx];
            if (result.ok) {
              return { ...f, status: "done" as const };
            }
            return f;
          })
        );
      }

      setIsUploading(false);
    },
    [
      files.length,
      directUpsert,
      onImportSuccess,
      canUpload,
      selectedModel,
      backendFlavour,
      activeWeek,
      location,
      isOthers,
      customFlavour,
    ]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (!canUpload) return;
      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        (f) =>
          f.name.endsWith(".csv") ||
          f.name.endsWith(".xls") ||
          f.name.endsWith(".xlsx")
      );
      if (droppedFiles.length > 0) processFiles(droppedFiles);
    },
    [processFiles, canUpload]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!canUpload) return;
      const selectedFiles = Array.from(e.target.files || []).filter(
        (f) =>
          f.name.endsWith(".csv") ||
          f.name.endsWith(".xls") ||
          f.name.endsWith(".xlsx")
      );
      if (selectedFiles.length > 0) processFiles(selectedFiles);
      e.target.value = "";
    },
    [processFiles, canUpload]
  );

  const allDone = files.length > 0 && files.every((f) => f.status === "done");
  const hasErrors = files.some((f) => f.status === "error");
  const isProcessing =
    isUploading || files.some((f) => f.status === "parsing");

  const missingFields: string[] = [];
  if (!selectedModel) missingFields.push("Model");
  if (!selectedFlavour) missingFields.push("Flavour");
  if (isOthers && !customFlavour.trim()) missingFields.push("Custom Flavour");
  if (!location.trim()) missingFields.push("Location");

  return (
    <div className="space-y-4">
      {/* Model, Flavour & Location Selection */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Model */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Model <span className="text-destructive">*</span>
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as Model | "")}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— Select Model —</option>
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Flavour */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Flavour <span className="text-destructive">*</span>
            </label>
            {isOthers ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customFlavour}
                  onChange={(e) => {
                    setCustomFlavour(e.target.value);
                    if (e.target.value.trim()) setCustomFlavourError("");
                  }}
                  placeholder="Enter custom flavour…"
                  className={`flex-1 bg-background border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                    customFlavourError ? "border-destructive" : "border-border"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFlavour("");
                    setCustomFlavour("");
                    setCustomFlavourError("");
                  }}
                  className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
                  title="Back to dropdown"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <select
                value={selectedFlavour}
                onChange={(e) => {
                  setSelectedFlavour(e.target.value as Flavour | typeof OTHERS_VALUE | "");
                  setCustomFlavourError("");
                }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">— Select Flavour —</option>
                {FLAVOUR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
                <option value={OTHERS_VALUE}>Others</option>
              </select>
            )}
            {customFlavourError && (
              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" />
                {customFlavourError}
              </p>
            )}
          </div>
        </div>

        {/* Location */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            Location <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              if (e.target.value.trim()) setLocationError("");
            }}
            placeholder="e.g. Kuala Lumpur, Site A, Building 3…"
            className={`w-full bg-background border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
              locationError ? "border-destructive" : "border-border"
            }`}
          />
          {locationError && (
            <p className="text-xs text-destructive flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3" />
              {locationError}
            </p>
          )}
        </div>

        {/* Status line */}
        {missingFields.length > 0 ? (
          <p className="text-xs text-amber-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            Please fill in: {missingFields.join(", ")} before uploading files.
          </p>
        ) : (
          <p className="text-xs text-green-400 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
            Files will be tagged as:{" "}
            <strong>
              {MODEL_OPTIONS.find((m) => m.value === selectedModel)?.label}
            </strong>{" "}
            /{" "}
            <strong>{getFlavourDisplayLabel()}</strong>
            {" / "}
            <strong>{location.trim()}</strong>
          </p>
        )}
      </div>

      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          canUpload
            ? `cursor-pointer ${
                isDragging
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`
            : "border-border/40 opacity-50 cursor-not-allowed"
        } ${isProcessing ? "pointer-events-none opacity-60" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (canUpload) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => canUpload && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          multiple
          className="hidden"
          onChange={handleFileInput}
          disabled={!canUpload}
        />
        <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          Drop CSV or XLS files here
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          or click to browse — multiple files supported
        </p>
        {!canUpload && (
          <p className="text-xs text-amber-400 mt-2">
            Fill in Model, Flavour, and Location above first
          </p>
        )}
      </div>

      {/* Column Mapping Toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowColumnMapping((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          {showColumnMapping ? "Hide" : "Show"} custom column mapping
        </button>
        {showColumnMapping && (
          <div className="mt-3">
            {/* Pass empty array — no file columns available until a file is parsed */}
            <ColumnMappingSelector availableColumns={[]} />
          </div>
        )}
      </div>

      {/* File Status List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Upload Status
            </p>
            <button
              type="button"
              onClick={() => setFiles([])}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              disabled={isProcessing}
            >
              Clear all
            </button>
          </div>
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/60"
            >
              {f.status === "pending" && (
                <div className="w-4 h-4 rounded-full border-2 border-border flex-shrink-0" />
              )}
              {f.status === "parsing" && (
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin flex-shrink-0" />
              )}
              {f.status === "done" && (
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              )}
              {f.status === "error" && (
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{f.name}</p>
                {f.status === "done" && f.recordCount !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    {f.recordCount} record{f.recordCount !== 1 ? "s" : ""} parsed
                  </p>
                )}
                {f.status === "error" && f.errorMessage && (
                  <p className="text-xs text-destructive">{f.errorMessage}</p>
                )}
              </div>
            </div>
          ))}

          {allDone && importedWeek && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-xs text-green-400">
                Successfully imported data for week{" "}
                <strong>{importedWeek}</strong>
              </p>
            </div>
          )}

          {hasErrors && !isProcessing && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <p className="text-xs text-destructive">
                Some files failed to upload. Check the errors above and try again.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CSVImportSection;

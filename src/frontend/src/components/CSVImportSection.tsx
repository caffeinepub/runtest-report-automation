import {
  AlertCircle,
  CheckCircle,
  FileText,
  Loader2,
  MapPin,
  Upload,
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { Flavour, Model } from "../backend";
import { useDirectUpsert } from "../hooks/useQueries";
import {
  type ParsedRecord,
  parseCSVData,
  parseXLSData,
} from "../utils/csvParser";
import ColumnMappingSelector from "./ColumnMappingSelector";

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
const MODEL_OTHERS_VALUE = "__model_others__";

const FLAVOUR_OPTIONS: { label: string; value: Flavour }[] = [
  { label: "Lite", value: Flavour.standard },
  { label: "AQI", value: Flavour.aqi },
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
        "SheetJS library not loaded. Please refresh the page and try again.",
      );
    }
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const result = parseXLSData(workbook, file.name);
    return result.records;
  }
  if (ext === "csv") {
    const text = await file.text();
    const result = parseCSVData(text, file.name);
    return result.records;
  }
  throw new Error(
    "Unsupported file type. Please upload a CSV, XLS, or XLSX file.",
  );
}

/** Persist start/end dates per unitId in localStorage */
function saveDatesToLocalStorage(
  unitId: string,
  startDate: string | undefined,
  endDate: string | undefined,
) {
  if (!startDate && !endDate) return;
  try {
    const raw = localStorage.getItem("runtest_unit_dates") || "{}";
    const store: Record<string, { startDate?: string; endDate?: string }> =
      JSON.parse(raw);
    store[unitId] = { startDate, endDate };
    localStorage.setItem("runtest_unit_dates", JSON.stringify(store));
  } catch {
    // ignore storage errors
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
  const [selectedModel, setSelectedModel] = useState<
    Model | typeof MODEL_OTHERS_VALUE | ""
  >("");
  const [selectedFlavour, setSelectedFlavour] = useState<
    Flavour | typeof OTHERS_VALUE | ""
  >("");
  const [customFlavour, setCustomFlavour] = useState("");
  const [customFlavourError, setCustomFlavourError] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customModelError, setCustomModelError] = useState("");
  const [location, setLocation] = useState("");
  const [locationError, setLocationError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directUpsert = useDirectUpsert();

  const isOthers = selectedFlavour === OTHERS_VALUE;
  const isModelOthers = selectedModel === MODEL_OTHERS_VALUE;

  const backendFlavour: Flavour | "" = isOthers
    ? Flavour.deluxe
    : (selectedFlavour as Flavour | "");

  const canUpload =
    selectedModel !== "" &&
    selectedFlavour !== "" &&
    (!isOthers || customFlavour.trim() !== "") &&
    (!isModelOthers || customModel.trim() !== "") &&
    location.trim() !== "";

  const activeWeek = selectedWeek ?? currentWeek ?? "";

  const getFlavourDisplayLabel = () => {
    if (isOthers) return customFlavour.trim() || "Others";
    return (
      FLAVOUR_OPTIONS.find((f) => f.value === selectedFlavour)?.label ?? ""
    );
  };

  const getModelDisplayLabel = () => {
    if (isModelOthers) return customModel.trim() || "Others";
    return MODEL_OPTIONS.find((m) => m.value === selectedModel)?.label ?? "";
  };

  const processFiles = useCallback(
    async (fileList: File[]) => {
      let hasValidationError = false;

      if (isModelOthers && !customModel.trim()) {
        setCustomModelError("Please enter a custom model name.");
        hasValidationError = true;
      }
      if (isOthers && !customFlavour.trim()) {
        setCustomFlavourError("Please enter a custom flavour name.");
        hasValidationError = true;
      }
      if (!location.trim()) {
        setLocationError("Location is required.");
        hasValidationError = true;
      }
      if (hasValidationError || !canUpload || !selectedModel || !backendFlavour)
        return;

      const model = (isModelOthers ? Model.others : selectedModel) as Model;
      const flavour = backendFlavour as Flavour;

      if (isOthers && customFlavour.trim()) {
        localStorage.setItem(
          "runtest_others_flavour_label",
          customFlavour.trim(),
        );
      }
      if (isModelOthers && customModel.trim()) {
        localStorage.setItem("runtest_others_model_label", customModel.trim());
      }

      const newFileStatuses: FileStatus[] = fileList.map((f) => ({
        name: f.name,
        status: "pending" as const,
      }));
      const startIndex = files.length;
      setFiles((prev) => [...prev, ...newFileStatuses]);
      setImportedWeek(null);
      setIsUploading(true);

      type FileParseResult =
        | { ok: true; records: ParsedRecord[] }
        | { ok: false; error: string };

      const parseResults: FileParseResult[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const fileIndex = startIndex + i;

        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === fileIndex ? { ...f, status: "parsing" as const } : f,
          ),
        );

        try {
          const records = await parseFile(file);
          parseResults.push({ ok: true, records });
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === fileIndex
                ? {
                    ...f,
                    status: "parsing" as const,
                    recordCount: records.length,
                  }
                : f,
            ),
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
                : f,
            ),
          );
        }
      }

      // Guarantee 1 record per file
      for (let i = 0; i < fileList.length; i++) {
        const result = parseResults[i];
        if (result?.ok && result.records.length === 0) {
          const unitId =
            fileList[i].name.replace(/\.[^.]+$/, "").trim() || fileList[i].name;
          result.records = [
            {
              unitId,
              totalPkts: 0,
              storedPkts: 0,
              validGpsFixPkts: 0,
              normalPktCount: 0,
              storedPktCount: 0,
              weekYear: activeWeek,
            },
          ];
        }
      }

      // Save dates to localStorage for each record
      for (const result of parseResults) {
        if (result.ok) {
          for (const r of result.records) {
            saveDatesToLocalStorage(r.unitId, r.startDate, r.endDate);
          }
        }
      }

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
            const week = activeWeek;
            if (!detectedWeek) detectedWeek = week;

            const key = `${r.unitId}__${week}`;
            recordMap.set(key, {
              model,
              flavour,
              unitId: r.unitId,
              weekYear: week,
              totalPkts: BigInt(Math.max(0, r.totalPkts)),
              storedPkts: BigInt(Math.max(0, r.storedPkts)),
              validGpsFixPkts: BigInt(Math.max(0, r.validGpsFixPkts)),
              storedPktCount: BigInt(
                Math.max(0, r.storedPktCount ?? r.storedPkts),
              ),
              normalPkts: BigInt(Math.max(0, r.normalPktCount ?? 0)),
              location: location.trim(),
            });
          }
        }
      }

      const allRecords = Array.from(recordMap.values());

      if (allRecords.length > 0) {
        try {
          await directUpsert.mutateAsync(allRecords);

          setFiles((prev) =>
            prev.map((f, idx) => {
              const relIdx = idx - startIndex;
              if (relIdx < 0 || relIdx >= parseResults.length) return f;
              const result = parseResults[relIdx];
              if (result.ok) {
                return { ...f, status: "done" as const };
              }
              return f;
            }),
          );

          if (detectedWeek) {
            setImportedWeek(detectedWeek);
            onImportSuccess?.(detectedWeek);
          }
        } catch (err) {
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
            }),
          );
        }
      } else {
        setFiles((prev) =>
          prev.map((f, idx) => {
            const relIdx = idx - startIndex;
            if (relIdx < 0 || relIdx >= parseResults.length) return f;
            const result = parseResults[relIdx];
            if (result.ok) {
              return { ...f, status: "done" as const };
            }
            return f;
          }),
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
      isModelOthers,
      customModel,
    ],
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
          f.name.endsWith(".xlsx"),
      );
      if (droppedFiles.length > 0) processFiles(droppedFiles);
    },
    [processFiles, canUpload],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!canUpload) return;
      const selectedFiles = Array.from(e.target.files || []).filter(
        (f) =>
          f.name.endsWith(".csv") ||
          f.name.endsWith(".xls") ||
          f.name.endsWith(".xlsx"),
      );
      if (selectedFiles.length > 0) processFiles(selectedFiles);
      e.target.value = "";
    },
    [processFiles, canUpload],
  );

  const allDone = files.length > 0 && files.every((f) => f.status === "done");
  const hasErrors = files.some((f) => f.status === "error");
  const isProcessing = isUploading || files.some((f) => f.status === "parsing");

  const missingFields: string[] = [];
  if (!selectedModel) missingFields.push("Model");
  if (!selectedFlavour) missingFields.push("Flavour");
  if (isModelOthers && !customModel.trim()) missingFields.push("Custom Model");
  if (isOthers && !customFlavour.trim()) missingFields.push("Custom Flavour");
  if (!location.trim()) missingFields.push("Location");

  return (
    <div className="space-y-4">
      {/* Model, Flavour & Location Selection */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Model */}
          <div className="space-y-1.5">
            <label
              htmlFor="csv-model-select"
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              Model <span className="text-destructive">*</span>
            </label>
            {isModelOthers ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => {
                    setCustomModel(e.target.value);
                    if (e.target.value.trim()) setCustomModelError("");
                  }}
                  placeholder="Enter custom model…"
                  data-ocid="upload.model.input"
                  className={`flex-1 bg-background border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                    customModelError ? "border-destructive" : "border-border"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedModel("");
                    setCustomModel("");
                    setCustomModelError("");
                  }}
                  className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
                  title="Back to dropdown"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <select
                id="csv-model-select"
                value={selectedModel}
                onChange={(e) =>
                  setSelectedModel(
                    e.target.value as Model | typeof MODEL_OTHERS_VALUE | "",
                  )
                }
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                data-ocid="upload.model.select"
              >
                <option value="">— Select Model —</option>
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
                <option value={MODEL_OTHERS_VALUE}>Others</option>
              </select>
            )}
            {customModelError && (
              <p
                className="text-xs text-destructive flex items-center gap-1 mt-1"
                data-ocid="upload.model.error_state"
              >
                <AlertCircle className="w-3 h-3" />
                {customModelError}
              </p>
            )}
          </div>

          {/* Flavour */}
          <div className="space-y-1.5">
            <label
              htmlFor="csv-flavour-select"
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
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
                  data-ocid="upload.flavour.input"
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
                id="csv-flavour-select"
                value={selectedFlavour}
                onChange={(e) => {
                  setSelectedFlavour(
                    e.target.value as Flavour | typeof OTHERS_VALUE | "",
                  );
                  setCustomFlavourError("");
                }}
                data-ocid="upload.flavour.select"
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
              <p
                className="text-xs text-destructive flex items-center gap-1 mt-1"
                data-ocid="upload.flavour.error_state"
              >
                <AlertCircle className="w-3 h-3" />
                {customFlavourError}
              </p>
            )}
          </div>
        </div>

        {/* Location */}
        <div className="space-y-1.5">
          <label
            htmlFor="csv-location-input"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"
          >
            <MapPin className="w-3.5 h-3.5" />
            Location <span className="text-destructive">*</span>
          </label>
          <input
            id="csv-location-input"
            type="text"
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              if (e.target.value.trim()) setLocationError("");
            }}
            placeholder="e.g. Kuala Lumpur, Site A, Building 3…"
            data-ocid="upload.location.input"
            className={`w-full bg-background border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
              locationError ? "border-destructive" : "border-border"
            }`}
          />
          {locationError && (
            <p
              className="text-xs text-destructive flex items-center gap-1 mt-1"
              data-ocid="upload.location.error_state"
            >
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
            Files will be tagged as: <strong>{getModelDisplayLabel()}</strong> /{" "}
            <strong>{getFlavourDisplayLabel()}</strong>
            {" / "}
            <strong>{location.trim()}</strong>
          </p>
        )}
      </div>
      {/* Drop Zone */}
      <div
        data-ocid="upload.dropzone"
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
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (canUpload) fileInputRef.current?.click();
          }
        }}
        tabIndex={canUpload ? 0 : -1}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          multiple
          className="hidden"
          onChange={handleFileInput}
          disabled={!canUpload}
          data-ocid="upload.upload_button"
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
          {files.map((f, idx) => (
            <div
              key={f.name}
              data-ocid={`upload.item.${idx + 1}`}
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
                <p className="text-xs font-medium text-foreground truncate">
                  {f.name}
                </p>
                {f.status === "done" && f.recordCount !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    {f.recordCount} record{f.recordCount !== 1 ? "s" : ""}{" "}
                    parsed
                  </p>
                )}
                {f.status === "error" && f.errorMessage && (
                  <p className="text-xs text-destructive">{f.errorMessage}</p>
                )}
              </div>
            </div>
          ))}

          {allDone && importedWeek && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30"
              data-ocid="upload.success_state"
            >
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-xs text-green-400">
                Successfully imported data for week{" "}
                <strong>{importedWeek}</strong>
              </p>
            </div>
          )}

          {hasErrors && !isProcessing && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30"
              data-ocid="upload.error_state"
            >
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <p className="text-xs text-destructive">
                Some files failed to upload. Check the errors above and try
                again.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CSVImportSection;

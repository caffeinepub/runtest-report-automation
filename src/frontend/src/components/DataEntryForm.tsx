import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ALL_MODELS,
  Flavour,
  MODEL_LABELS,
  Model,
  getCurrentWeekLabel,
  useUpsertReport,
} from "@/hooks/useQueries";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

// All four backend Flavour enum values must be present in this record
const FLAVOUR_LABELS: Record<Flavour, string> = {
  [Flavour.standard]: "Lite",
  [Flavour.aqi]: "AQI",
  [Flavour.premium]: "Premium",
  [Flavour.deluxe]: "Deluxe",
};

const ALL_FLAVOURS: Flavour[] = [
  Flavour.standard,
  Flavour.aqi,
  Flavour.premium,
  Flavour.deluxe,
];

const OTHERS_VALUE = "__others__";
const MODEL_OTHERS_VALUE = "__model_others__";

interface UnitRow {
  id: string;
  unitId: string;
  totalPkts: string;
  normalPkts: string;
  storedPkts: string;
  validGpsPkts: string;
  error?: string;
}

function createEmptyRow(): UnitRow {
  return {
    id: crypto.randomUUID(),
    unitId: "",
    totalPkts: "",
    normalPkts: "",
    storedPkts: "",
    validGpsPkts: "",
  };
}

function validateRow(row: UnitRow): string | undefined {
  if (!row.unitId.trim()) return "Unit ID is required";
  const total = Number.parseInt(row.totalPkts);
  const normal = Number.parseInt(row.normalPkts);
  const stored = Number.parseInt(row.storedPkts);
  const valid = Number.parseInt(row.validGpsPkts);
  if (Number.isNaN(total) || total < 0)
    return "Total packets must be a non-negative integer";
  if (row.normalPkts !== "" && (Number.isNaN(normal) || normal < 0))
    return "Normal packets must be a non-negative integer";
  if (Number.isNaN(stored) || stored < 0)
    return "Stored packets must be a non-negative integer";
  if (Number.isNaN(valid) || valid < 0)
    return "Valid GPS packets must be a non-negative integer";
  if (stored > total) return "Stored packets cannot exceed total packets";
  if (valid > total) return "Valid GPS packets cannot exceed total packets";
  return undefined;
}

export function DataEntryForm() {
  const [selectedModel, setSelectedModel] = useState<
    Model | typeof MODEL_OTHERS_VALUE
  >(Model.N135);
  const [customModel, setCustomModel] = useState("");
  const [customModelError, setCustomModelError] = useState("");
  const [selectedFlavour, setSelectedFlavour] = useState<
    Flavour | typeof OTHERS_VALUE
  >(Flavour.standard);
  const [customFlavour, setCustomFlavour] = useState("");
  const [customFlavourError, setCustomFlavourError] = useState("");
  const [location, setLocation] = useState("");
  const [weekLabel, setWeekLabel] = useState(getCurrentWeekLabel());
  const [rows, setRows] = useState<UnitRow[]>([createEmptyRow()]);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  const upsertReport = useUpsertReport();

  const isOthers = selectedFlavour === OTHERS_VALUE;
  const isModelOthers = selectedModel === MODEL_OTHERS_VALUE;

  // For backend: "Others" maps to Flavour.deluxe
  const backendFlavour: Flavour = isOthers
    ? Flavour.deluxe
    : (selectedFlavour as Flavour);
  const backendModel: Model = isModelOthers
    ? Model.others
    : (selectedModel as Model);

  const getModelDisplayLabel = () => {
    if (isModelOthers) return customModel.trim() || "Others";
    return MODEL_LABELS[selectedModel as Model] ?? selectedModel;
  };

  const getFlavourDisplayLabel = () => {
    if (isOthers) return customFlavour.trim() || "Others";
    return FLAVOUR_LABELS[selectedFlavour as Flavour] ?? selectedFlavour;
  };

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, createEmptyRow()]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateRow = useCallback(
    (id: string, field: keyof UnitRow, value: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, [field]: value, error: undefined } : r,
        ),
      );
    },
    [],
  );

  const addMultipleRows = useCallback((count: number) => {
    const newRows = Array.from({ length: count }, createEmptyRow);
    setRows((prev) => [...prev, ...newRows]);
  }, []);

  const handleSubmit = async () => {
    // Validate model
    if (isModelOthers && !customModel.trim()) {
      setCustomModelError("Please enter a custom model name.");
      toast.error("Please enter a custom model name.");
      return;
    }
    // Validate flavour
    if (isOthers && !customFlavour.trim()) {
      setCustomFlavourError("Please enter a custom flavour name.");
      toast.error("Please enter a custom flavour name.");
      return;
    }

    const validatedRows = rows.map((row) => ({
      ...row,
      error: validateRow(row),
    }));

    const hasErrors = validatedRows.some((r) => r.error);
    if (hasErrors) {
      setRows(validatedRows);
      toast.error("Please fix validation errors before submitting");
      return;
    }

    const filledRows = rows.filter((r) => r.unitId.trim());
    if (filledRows.length === 0) {
      toast.error("Please add at least one unit entry");
      return;
    }

    setSubmitStatus("submitting");
    let successCount = 0;
    let errorCount = 0;

    for (const row of filledRows) {
      try {
        if (isModelOthers && customModel.trim()) {
          localStorage.setItem(
            "runtest_others_model_label",
            customModel.trim(),
          );
        }
        await upsertReport.mutateAsync({
          model: backendModel,
          flavour: backendFlavour,
          unitId: row.unitId.trim(),
          weekYear: weekLabel,
          totalPkts: BigInt(Number.parseInt(row.totalPkts) || 0),
          storedPkts: BigInt(Number.parseInt(row.storedPkts) || 0),
          validGpsFixPkts: BigInt(Number.parseInt(row.validGpsPkts) || 0),
          storedPktCount: BigInt(Number.parseInt(row.storedPkts) || 0),
          normalPkts: BigInt(Number.parseInt(row.normalPkts) || 0),
          location: location.trim(),
        });
        successCount++;
      } catch {
        errorCount++;
      }
    }

    if (errorCount === 0) {
      setSubmitStatus("success");
      setSubmitMessage(
        `Successfully saved ${successCount} unit${successCount !== 1 ? "s" : ""}`,
      );
      toast.success(
        `Saved ${successCount} unit record${successCount !== 1 ? "s" : ""}`,
      );
      setRows([createEmptyRow()]);
    } else {
      setSubmitStatus("error");
      setSubmitMessage(`${successCount} saved, ${errorCount} failed`);
      toast.error(
        `${errorCount} record${errorCount !== 1 ? "s" : ""} failed to save`,
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-card border border-border">
        {/* Week */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Week
          </Label>
          <Input
            value={weekLabel}
            onChange={(e) => setWeekLabel(e.target.value)}
            placeholder="e.g. W08-2026"
            className="text-sm"
          />
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Model
          </Label>
          {isModelOthers ? (
            <div className="flex gap-2">
              <Input
                value={customModel}
                onChange={(e) => {
                  setCustomModel(e.target.value);
                  if (e.target.value.trim()) setCustomModelError("");
                }}
                placeholder="Custom model…"
                className={`text-sm flex-1 ${customModelError ? "border-destructive" : ""}`}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 flex-shrink-0"
                onClick={() => {
                  setSelectedModel(Model.N135);
                  setCustomModel("");
                  setCustomModelError("");
                }}
                title="Back to dropdown"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Select
              value={selectedModel}
              onValueChange={(v) => {
                setSelectedModel(v as Model | typeof MODEL_OTHERS_VALUE);
                setCustomModelError("");
              }}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_MODELS.filter((m) => m !== Model.others).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODEL_LABELS[m]}
                  </SelectItem>
                ))}
                <SelectItem value={MODEL_OTHERS_VALUE}>Others</SelectItem>
              </SelectContent>
            </Select>
          )}
          {customModelError && (
            <p className="text-xs text-destructive flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3" />
              {customModelError}
            </p>
          )}
        </div>

        {/* Flavour */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Flavour
          </Label>
          {isOthers ? (
            <div className="flex gap-2">
              <Input
                value={customFlavour}
                onChange={(e) => {
                  setCustomFlavour(e.target.value);
                  if (e.target.value.trim()) setCustomFlavourError("");
                }}
                placeholder="Custom flavour…"
                className={`text-sm flex-1 ${customFlavourError ? "border-destructive" : ""}`}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 flex-shrink-0"
                onClick={() => {
                  setSelectedFlavour(Flavour.standard);
                  setCustomFlavour("");
                  setCustomFlavourError("");
                }}
                title="Back to dropdown"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Select
              value={selectedFlavour}
              onValueChange={(v) => {
                setSelectedFlavour(v as Flavour | typeof OTHERS_VALUE);
                setCustomFlavourError("");
              }}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_FLAVOURS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FLAVOUR_LABELS[f]}
                  </SelectItem>
                ))}
                <SelectItem value={OTHERS_VALUE}>Others</SelectItem>
              </SelectContent>
            </Select>
          )}
          {customFlavourError && (
            <p className="text-xs text-destructive flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3" />
              {customFlavourError}
            </p>
          )}
        </div>

        {/* Location */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            Location
          </Label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Site A, KL…"
            className="text-sm"
          />
        </div>
      </div>

      {/* Submit status alert */}
      {submitStatus === "success" && (
        <Alert className="border-green-500/30 bg-green-500/10">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <AlertDescription className="text-green-400">
            {submitMessage}
          </AlertDescription>
        </Alert>
      )}
      {submitStatus === "error" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{submitMessage}</AlertDescription>
        </Alert>
      )}

      {/* Data Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/40 hover:bg-transparent bg-muted/20">
              <TableHead className="text-xs font-semibold text-muted-foreground w-8">
                #
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">
                Unit ID *
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                Total Pkts *
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                Normal Pkts
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                Stored Pkts *
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                Valid GPS *
              </TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow
                key={row.id}
                className={`border-border/20 ${row.error ? "bg-destructive/5" : "hover:bg-muted/10"}`}
              >
                <TableCell className="text-xs text-muted-foreground">
                  {idx + 1}
                </TableCell>
                <TableCell>
                  <Input
                    value={row.unitId}
                    onChange={(e) =>
                      updateRow(row.id, "unitId", e.target.value)
                    }
                    placeholder="S18025"
                    className="h-7 text-xs font-mono"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.totalPkts}
                    onChange={(e) =>
                      updateRow(row.id, "totalPkts", e.target.value)
                    }
                    placeholder="0"
                    type="number"
                    min="0"
                    className="h-7 text-xs text-right tabular-nums"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.normalPkts}
                    onChange={(e) =>
                      updateRow(row.id, "normalPkts", e.target.value)
                    }
                    placeholder="0"
                    type="number"
                    min="0"
                    className="h-7 text-xs text-right tabular-nums"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.storedPkts}
                    onChange={(e) =>
                      updateRow(row.id, "storedPkts", e.target.value)
                    }
                    placeholder="0"
                    type="number"
                    min="0"
                    className="h-7 text-xs text-right tabular-nums"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.validGpsPkts}
                    onChange={(e) =>
                      updateRow(row.id, "validGpsPkts", e.target.value)
                    }
                    placeholder="0"
                    type="number"
                    min="0"
                    className="h-7 text-xs text-right tabular-nums"
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Row error messages */}
      {rows.some((r) => r.error) && (
        <div className="space-y-1">
          {rows
            .filter((r) => r.error)
            .map((r) => (
              <p
                key={r.id}
                className="text-xs text-destructive flex items-center gap-1.5"
              >
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                Row {rows.indexOf(r) + 1}: {r.error}
              </p>
            ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={addRow}
            className="h-8 text-xs border-border/60"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Row
          </Button>
          {[5, 10].map((n) => (
            <Button
              key={n}
              variant="outline"
              size="sm"
              onClick={() => addMultipleRows(n)}
              className="h-8 text-xs border-border/60"
            >
              +{n} Rows
            </Button>
          ))}
          <Badge
            variant="secondary"
            className="bg-muted text-muted-foreground text-xs"
          >
            {rows.filter((r) => r.unitId.trim()).length} / {rows.length} filled
          </Badge>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={submitStatus === "submitting"}
          className="h-8 text-xs bg-primary hover:bg-primary/90"
        >
          {submitStatus === "submitting" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save {rows.filter((r) => r.unitId.trim()).length} Record
              {rows.filter((r) => r.unitId.trim()).length !== 1 ? "s" : ""}
            </>
          )}
        </Button>
      </div>

      {/* Tagged as info */}
      <p className="text-xs text-muted-foreground">
        Records will be tagged as:{" "}
        <span className="text-foreground font-medium">
          {getModelDisplayLabel()}
        </span>
        {" / "}
        <span className="text-foreground font-medium">
          {getFlavourDisplayLabel()}
        </span>
        {location.trim() && (
          <>
            {" / "}
            <span className="text-foreground font-medium">
              {location.trim()}
            </span>
          </>
        )}
        {" for week "}
        <span className="text-foreground font-medium">{weekLabel}</span>
      </p>
    </div>
  );
}

export default DataEntryForm;

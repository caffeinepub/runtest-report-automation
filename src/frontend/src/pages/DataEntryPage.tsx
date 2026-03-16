import { CSVImportSection } from "@/components/CSVImportSection";
import { DataEntryForm } from "@/components/DataEntryForm";
import { WeekNavigator } from "@/components/WeekNavigator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getISOWeekLabel } from "@/hooks/useQueries";
import { Info, PenLine, Upload } from "lucide-react";
import type React from "react";
import { useCallback, useState } from "react";

const DataEntryPage: React.FC = () => {
  const [currentWeek, setCurrentWeek] = useState(() => getISOWeekLabel());

  const handleImportSuccess = useCallback((importedWeek: string) => {
    if (importedWeek) {
      setCurrentWeek(importedWeek);
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Data Entry</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import GPS tracker data from CSV/XLS files or enter records manually.
        </p>
      </div>

      {/* Week selector */}
      <Card className="border-border/40 bg-card/60">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Selected Week</span>
            <WeekNavigator
              currentWeek={currentWeek}
              onWeekChange={setCurrentWeek}
            />
          </div>
        </CardContent>
      </Card>

      {/* Entry tabs */}
      <Tabs defaultValue="import">
        <TabsList className="bg-muted/40 border border-border/30">
          <TabsTrigger
            value="import"
            className="text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-navy-950"
          >
            <Upload className="h-3 w-3 mr-1" />
            File Import
          </TabsTrigger>
          <TabsTrigger
            value="manual"
            className="text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-navy-950"
          >
            <PenLine className="h-3 w-3 mr-1" />
            Manual Entry
          </TabsTrigger>
        </TabsList>

        {/* File Import Tab */}
        <TabsContent value="import" className="mt-4">
          <Card className="border-border/40 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Import from File
              </CardTitle>
              <CardDescription className="text-xs">
                Upload a Waggle Portal CSV or XLS export. Select the Model and
                Flavour before uploading.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CSVImportSection
                selectedWeek={currentWeek}
                onImportSuccess={handleImportSuccess}
              />
            </CardContent>
          </Card>

          {/* Info card about column mapping */}
          <Card className="border-amber-500/20 bg-amber-500/5 mt-4">
            <CardContent className="pt-4 pb-4">
              <div className="flex gap-3">
                <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-amber-300">
                    Custom Column Mapping
                  </p>
                  <p className="text-xs text-muted-foreground">
                    After uploading a file, expand the{" "}
                    <strong className="text-amber-400">
                      Custom Column Mapping
                    </strong>{" "}
                    section to select which CSV/XLS fields (e.g. Temperature,
                    Battery, Latitude) should appear as additional columns in
                    the Dashboard and Reports table. Your selection is saved
                    automatically.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manual Entry Tab */}
        <TabsContent value="manual" className="mt-4">
          <Card className="border-border/40 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Manual Data Entry
              </CardTitle>
              <CardDescription className="text-xs">
                Enter GPS tracker report data manually for the selected week.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataEntryForm />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DataEntryPage;

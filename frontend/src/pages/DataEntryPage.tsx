import { DataEntryForm } from '@/components/DataEntryForm';
import CSVImportSection from '@/components/CSVImportSection';
import { Separator } from '@/components/ui/separator';
import { PlusCircle } from 'lucide-react';

export function DataEntryPage() {
  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
          <PlusCircle className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Data Entry</h1>
          <p className="text-sm text-muted-foreground">
            Enter weekly packet data for GPS units — supports bulk entry and CSV import
          </p>
        </div>
      </div>

      {/* CSV Import Section */}
      <CSVImportSection />

      {/* Divider */}
      <div className="flex items-center gap-3">
        <Separator className="flex-1 bg-border" />
        <span className="text-xs text-muted-foreground uppercase tracking-widest px-2">
          or enter manually
        </span>
        <Separator className="flex-1 bg-border" />
      </div>

      {/* Manual Entry Instructions */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Manual entry:</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>Select the unit model (N13.5, N13, or N12.5)</li>
          <li>Enter the ISO week label (e.g. <span className="font-mono text-primary">2024-W12</span>)</li>
          <li>Add rows for each unit — use Quick Add buttons to add multiple rows at once</li>
          <li>Fill in Unit ID and the three packet counts for each unit</li>
          <li>Click <strong>Save All Entries</strong> — existing entries for the same unit/week will be updated</li>
        </ol>
      </div>

      <DataEntryForm />
    </div>
  );
}

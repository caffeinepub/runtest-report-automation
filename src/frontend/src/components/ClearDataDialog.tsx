import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, TriangleAlert } from "lucide-react";

interface ClearDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ClearDataDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
}: ClearDataDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-navy-950 border border-red-500/30 max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0">
              <TriangleAlert className="w-5 h-5 text-red-400" />
            </div>
            <AlertDialogTitle className="text-foreground text-lg font-semibold">
              Clear All Data
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-muted-foreground text-sm leading-relaxed pl-[52px]">
            This will{" "}
            <span className="text-red-400 font-medium">
              permanently delete all report data
            </span>{" "}
            including every unit record, packet count, and GPS entry across all
            weeks and models.
            <br />
            <br />
            <span className="font-medium text-foreground/80">
              This action cannot be undone.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 mt-2">
          <AlertDialogCancel
            disabled={isLoading}
            className="bg-transparent border-border text-muted-foreground hover:bg-navy-800 hover:text-foreground"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isLoading}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-red-600 hover:bg-red-700 text-white border-0 focus:ring-red-500 min-w-[120px]"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Clearing…
              </span>
            ) : (
              "Yes, Clear All"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import { ClearDataDialog } from "@/components/ClearDataDialog";
import { Button } from "@/components/ui/button";
import { useClearAllData } from "@/hooks/useQueries";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  ClipboardList,
  LayoutDashboard,
  PlusCircle,
  Satellite,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/entry", label: "Data Entry", icon: PlusCircle },
  { path: "/report", label: "Reports", icon: ClipboardList },
];

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  const clearAllData = useClearAllData();

  const handleConfirmClear = () => {
    clearAllData.mutate(undefined, {
      onSuccess: () => {
        setDialogOpen(false);
        toast.success("All data has been cleared successfully.");
        navigate({ to: "/" });
      },
      onError: (err) => {
        toast.error(
          `Failed to clear data: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      },
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-navy-950/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Satellite className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground leading-none">
                RunTest
              </h1>
              <p className="text-xs text-muted-foreground leading-none mt-0.5">
                GPS Report Automation
              </p>
            </div>
          </div>

          {/* Navigation + Clear button */}
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-1">
              {navItems.map(({ path, label, icon: Icon }) => {
                const isActive = location.pathname === path;
                return (
                  <Link
                    key={path}
                    to={path}
                    className={`nav-link flex items-center gap-2 ${isActive ? "nav-link-active" : "nav-link-inactive"}`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Divider */}
            <div className="w-px h-6 bg-border mx-1 hidden sm:block" />

            {/* Overall Clear button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-400/60 gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs font-medium">
                Overall Clear
              </span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border bg-navy-950/80 py-4">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            © {new Date().getFullYear()} RunTest Report Automation. All rights
            reserved.
          </span>
          <span className="flex items-center gap-1">
            Built with <span className="text-primary">♥</span> using{" "}
            <a
              href={`https://caffeine.ai/?utm_source=Caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname || "runtest-report")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              caffeine.ai
            </a>
          </span>
        </div>
      </footer>

      {/* Clear Data Confirmation Dialog */}
      <ClearDataDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleConfirmClear}
        isLoading={clearAllData.isPending}
      />
    </div>
  );
}

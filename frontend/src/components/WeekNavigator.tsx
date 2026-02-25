import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAdjacentWeek, parseWeekLabel } from '@/hooks/useQueries';

interface WeekNavigatorProps {
  currentWeek: string;
  onWeekChange: (week: string) => void;
  availableWeeks?: string[];
}

export function WeekNavigator({ currentWeek, onWeekChange, availableWeeks }: WeekNavigatorProps) {
  const parsed = parseWeekLabel(currentWeek);
  const displayLabel = parsed ? `Week ${parsed.week}, ${parsed.year}` : currentWeek;

  const prevWeek = getAdjacentWeek(currentWeek, -1);
  const nextWeek = getAdjacentWeek(currentWeek, 1);

  const hasNext = availableWeeks ? availableWeeks.includes(nextWeek) : true;
  const hasPrev = availableWeeks ? availableWeeks.includes(prevWeek) : true;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onWeekChange(prevWeek)}
        disabled={!hasPrev}
        className="h-8 w-8 border-border bg-secondary hover:bg-muted"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <div className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-secondary border border-border min-w-[160px] justify-center">
        <Calendar className="w-3.5 h-3.5 text-primary" />
        <span className="text-sm font-medium font-mono">{displayLabel}</span>
      </div>

      <Button
        variant="outline"
        size="icon"
        onClick={() => onWeekChange(nextWeek)}
        disabled={!hasNext}
        className="h-8 w-8 border-border bg-secondary hover:bg-muted"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

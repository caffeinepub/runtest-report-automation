import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WeekNavigatorProps {
  currentWeek: string;
  onWeekChange: (week: string) => void;
  availableWeeks?: string[];
}

function parseWeekLabel(label: string): { year: number; week: number } | null {
  const match = label.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  return { year: parseInt(match[1], 10), week: parseInt(match[2], 10) };
}

function getAdjacentWeek(label: string, delta: number): string {
  const parsed = parseWeekLabel(label);
  if (!parsed) return label;
  let { year, week } = parsed;
  week += delta;
  if (week < 1) {
    year -= 1;
    week = 52;
  } else if (week > 52) {
    year += 1;
    week = 1;
  }
  return `${year}-W${String(week).padStart(2, '0')}`;
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

export default WeekNavigator;

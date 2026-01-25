import { useMemo, useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FoodEntry } from '@/types';

interface CalendarViewProps {
  entries: FoodEntry[];
  goals: Map<string, number>;
  defaultGoal: number;
}

export function CalendarView({ entries, goals, defaultGoal }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const dailyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of entries) {
      const current = totals.get(entry.date) || 0;
      totals.set(entry.date, current + entry.protein);
    }
    return totals;
  }, [entries]);

  const startDay = getDay(monthStart);
  const paddingDays = Array(startDay).fill(null);
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between bg-card rounded-2xl p-3 shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h3 className="font-semibold text-lg">{format(currentMonth, 'MMMM yyyy')}</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Calendar */}
      <div className="bg-card rounded-2xl p-4 shadow-sm">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map((day, i) => (
            <div
              key={i}
              className="text-center text-xs text-muted-foreground font-medium py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {paddingDays.map((_, index) => (
            <div key={`padding-${index}`} className="aspect-square" />
          ))}
          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const protein = dailyTotals.get(dateStr) || 0;
            const goal = goals.get(dateStr) || defaultGoal;
            const goalMet = protein >= goal;
            const hasEntry = protein > 0;
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={dateStr}
                className={cn(
                  'aspect-square flex flex-col items-center justify-center rounded-xl text-sm relative transition-colors',
                  isToday && 'bg-primary/10',
                  goalMet && 'bg-green-50',
                  !isSameMonth(day, currentMonth) && 'opacity-40'
                )}
              >
                <span
                  className={cn(
                    'font-medium text-sm',
                    isToday && 'text-primary font-bold',
                    goalMet && !isToday && 'text-green-600',
                    !hasEntry && !isToday && 'text-muted-foreground'
                  )}
                >
                  {format(day, 'd')}
                </span>
                {hasEntry && (
                  <span className={cn(
                    'text-[10px] font-medium mt-0.5',
                    goalMet ? 'text-green-600' : 'text-primary'
                  )}>
                    {protein}g
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-md bg-primary/10" />
          <span>Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-md bg-green-50 border border-green-200" />
          <span>Goal met</span>
        </div>
      </div>
    </div>
  );
}

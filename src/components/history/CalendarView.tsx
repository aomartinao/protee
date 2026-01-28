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
import { ChevronLeft, ChevronRight, Dumbbell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { calculateMPSHits } from '@/lib/utils';
import type { FoodEntry } from '@/types';

interface CalendarViewProps {
  entries: FoodEntry[];
  goals: Map<string, number>;
  defaultGoal: number;
  mpsTrackingEnabled?: boolean;
  weekStartsOn?: 'sunday' | 'monday';
}

export function CalendarView({
  entries,
  goals,
  defaultGoal,
  mpsTrackingEnabled = true,
  weekStartsOn = 'monday',
}: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Convert setting to number: 0 for Sunday, 1 for Monday
  const weekStartDay = weekStartsOn === 'sunday' ? 0 : 1;

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Calculate daily totals and MPS hits
  const dailyData = useMemo(() => {
    const data = new Map<string, { protein: number; calories: number; mpsHits: number }>();

    // Group entries by date
    const entriesByDate = new Map<string, FoodEntry[]>();
    for (const entry of entries) {
      const existing = entriesByDate.get(entry.date) || [];
      existing.push(entry);
      entriesByDate.set(entry.date, existing);
    }

    // Calculate totals for each date
    for (const [date, dayEntries] of entriesByDate) {
      const protein = dayEntries.reduce((sum, e) => sum + e.protein, 0);
      const calories = dayEntries.reduce((sum, e) => sum + (e.calories || 0), 0);
      const mpsHits = calculateMPSHits(dayEntries).length;
      data.set(date, { protein, calories, mpsHits });
    }

    return data;
  }, [entries]);

  // Calculate padding days based on week start preference
  const firstDayOfMonth = getDay(monthStart); // 0 = Sunday, 1 = Monday, ...
  const paddingDays = Array((firstDayOfMonth - weekStartDay + 7) % 7).fill(null);

  // Weekday headers based on week start preference
  const weekDaysFromSunday = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const weekDays = weekStartDay === 1
    ? [...weekDaysFromSunday.slice(1), weekDaysFromSunday[0]] // Mon-Sun
    : weekDaysFromSunday; // Sun-Sat

  // Calculate monthly stats - only count days with entries
  const monthStats = useMemo(() => {
    let totalProtein = 0;
    let goalMetDays = 0;
    let totalMpsHits = 0;
    let daysWithEntries = 0;

    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const data = dailyData.get(dateStr);
      if (data && data.protein > 0) {
        totalProtein += data.protein;
        totalMpsHits += data.mpsHits;
        daysWithEntries++;
        const goal = goals.get(dateStr) || defaultGoal;
        if (data.protein >= goal) goalMetDays++;
      }
    }

    return { totalProtein, goalMetDays, totalMpsHits, daysWithEntries };
  }, [days, dailyData, goals, defaultGoal]);

  // Render MPS dots (up to 3)
  const renderMpsDots = (count: number) => {
    const dotsToShow = Math.min(count, 3);
    return (
      <div className="absolute top-0.5 right-0.5 flex gap-0.5">
        {Array.from({ length: dotsToShow }).map((_, i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-purple-500"
            title={`${count} MPS hit${count > 1 ? 's' : ''}`}
          />
        ))}
      </div>
    );
  };

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

      {/* Monthly Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl p-3 text-center shadow-sm">
          <span className="text-xl font-bold text-primary">
            {monthStats.daysWithEntries > 0 ? Math.round(monthStats.totalProtein / monthStats.daysWithEntries) : 0}g
          </span>
          <p className="text-xs text-muted-foreground mt-0.5">Daily avg</p>
        </div>
        <div className="bg-card rounded-2xl p-3 text-center shadow-sm">
          <span className="text-xl font-bold text-green-600">{monthStats.goalMetDays}</span>
          <p className="text-xs text-muted-foreground mt-0.5">Goals hit</p>
        </div>
        {mpsTrackingEnabled && (
          <div className="bg-card rounded-2xl p-3 text-center shadow-sm">
            <div className="flex items-center justify-center gap-1">
              <Dumbbell className="h-4 w-4 text-purple-500" />
              <span className="text-xl font-bold text-purple-600">{monthStats.totalMpsHits}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">MPS hits</p>
          </div>
        )}
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
            const data = dailyData.get(dateStr);
            const protein = data?.protein || 0;
            const mpsHits = data?.mpsHits || 0;
            const goal = goals.get(dateStr) || defaultGoal;
            const goalMet = protein >= goal;
            const hasEntry = protein > 0;
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={dateStr}
                className={cn(
                  'aspect-square flex flex-col items-center justify-center rounded-xl text-sm relative transition-colors',
                  isToday && 'ring-2 ring-primary ring-offset-1',
                  goalMet && 'bg-green-50 dark:bg-green-950/30',
                  !isSameMonth(day, currentMonth) && 'opacity-40'
                )}
              >
                <span
                  className={cn(
                    'font-medium text-sm',
                    isToday && 'text-primary font-bold',
                    goalMet && !isToday && 'text-green-600 dark:text-green-400',
                    !hasEntry && !isToday && 'text-muted-foreground'
                  )}
                >
                  {format(day, 'd')}
                </span>
                {hasEntry && (
                  <span className={cn(
                    'text-[10px] font-medium mt-0.5',
                    goalMet ? 'text-green-600 dark:text-green-400' : 'text-primary'
                  )}>
                    {protein}g
                  </span>
                )}
                {/* MPS indicator - multiple dots */}
                {mpsTrackingEnabled && mpsHits > 0 && renderMpsDots(mpsHits)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-md ring-2 ring-primary ring-offset-1" />
          <span>Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800" />
          <span>Goal met</span>
        </div>
        {mpsTrackingEnabled && (
          <div className="flex items-center gap-1.5">
            <div className="flex gap-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            </div>
            <span>MPS hits</span>
          </div>
        )}
      </div>
    </div>
  );
}

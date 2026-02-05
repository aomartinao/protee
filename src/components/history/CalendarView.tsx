import { useMemo, useState, useRef, useEffect } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  getDay,
} from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Zap, ExternalLink } from 'lucide-react';
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
  monthOffset: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

interface SelectedDayData {
  date: string;
  protein: number;
  calories: number;
  mpsHits: number;
  goal: number;
  goalMet: boolean;
}

export function CalendarView({
  entries,
  goals,
  defaultGoal,
  mpsTrackingEnabled = true,
  weekStartsOn = 'monday',
  monthOffset,
  onPrevMonth,
  onNextMonth,
}: CalendarViewProps) {
  const navigate = useNavigate();
  const [selectedDay, setSelectedDay] = useState<SelectedDayData | null>(null);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    if (!selectedDay) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSelectedDay(null);
      }
    };

    // Small delay to avoid immediate close on the same tap that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [selectedDay]);

  // Close popover when month changes
  useEffect(() => {
    setSelectedDay(null);
  }, [monthOffset]);

  const handleDayClick = (dayData: SelectedDayData, event: React.MouseEvent) => {
    const calendarRect = calendarRef.current?.getBoundingClientRect();
    if (!calendarRect) return;

    const x = event.clientX - calendarRect.left;
    const y = event.clientY - calendarRect.top;

    setPopoverPosition({ x, y });
    setSelectedDay(dayData);
  };

  const handleViewDay = (dateStr: string) => {
    setSelectedDay(null);
    navigate(`/?date=${dateStr}`);
  };

  // Calculate current month based on offset
  const currentMonth = useMemo(() => {
    return addMonths(new Date(), monthOffset);
  }, [monthOffset]);

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
    let totalCalories = 0;
    let goalMetDays = 0;
    let totalMpsHits = 0;
    let daysWithEntries = 0;

    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const data = dailyData.get(dateStr);
      if (data && data.protein > 0) {
        totalProtein += data.protein;
        totalCalories += data.calories;
        totalMpsHits += data.mpsHits;
        daysWithEntries++;
        const goal = goals.get(dateStr) || defaultGoal;
        if (data.protein >= goal) goalMetDays++;
      }
    }

    return { totalProtein, totalCalories, goalMetDays, totalMpsHits, daysWithEntries };
  }, [days, dailyData, goals, defaultGoal]);

  // Render MPS dots (up to 5) - centered at bottom of day cell
  const renderMpsDots = (count: number) => {
    const dotsToShow = Math.min(count, 5);
    return (
      <div className="absolute bottom-0.5 left-0 right-0 flex justify-center gap-px">
        {Array.from({ length: dotsToShow }).map((_, i) => (
          <div
            key={i}
            className="w-1 h-1 rounded-full bg-purple-500"
            title={`${count} MPS hit${count > 1 ? 's' : ''}`}
          />
        ))}
      </div>
    );
  };

  // Month label
  const monthLabel = useMemo(() => {
    if (monthOffset === 0) {
      return 'This Month';
    }
    return format(currentMonth, 'MMMM yyyy');
  }, [currentMonth, monthOffset]);

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between bg-card rounded-2xl p-3 shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={onPrevMonth}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h3 className="font-semibold text-lg">{monthLabel}</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={onNextMonth}
          disabled={monthOffset >= 0}
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
          <p className="text-xs text-muted-foreground mt-0.5">Protein avg</p>
        </div>
        <div className="bg-card rounded-2xl p-3 text-center shadow-sm">
          <span className="text-xl font-bold text-green-600">{monthStats.goalMetDays}</span>
          <p className="text-xs text-muted-foreground mt-0.5">Goals hit</p>
        </div>
        <div className="bg-card rounded-2xl p-3 text-center shadow-sm">
          <div className="flex items-center justify-center gap-1">
            <Zap className="h-4 w-4 text-orange-500" />
            <span className="text-xl font-bold text-orange-600">
              {monthStats.daysWithEntries > 0 ? Math.round(monthStats.totalCalories / monthStats.daysWithEntries) : '–'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Calories avg</p>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-card rounded-2xl p-4 shadow-sm relative" ref={calendarRef}>
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
            const calories = data?.calories || 0;
            const mpsHits = data?.mpsHits || 0;
            const goal = goals.get(dateStr) || defaultGoal;
            const goalMet = protein >= goal;
            const hasEntry = protein > 0;
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={dateStr}
                onClick={(e) => handleDayClick({
                  date: dateStr,
                  protein,
                  calories,
                  mpsHits,
                  goal,
                  goalMet,
                }, e)}
                className={cn(
                  'aspect-square flex flex-col items-center justify-center rounded-xl text-sm relative transition-colors cursor-pointer active:scale-95',
                  isToday && 'ring-2 ring-primary ring-offset-1',
                  goalMet && 'bg-green-100',
                  !isSameMonth(day, currentMonth) && 'opacity-40'
                )}
              >
                <span
                  className={cn(
                    'font-medium text-sm',
                    isToday && 'text-primary font-bold',
                    goalMet && !isToday && 'text-green-700',
                    !hasEntry && !isToday && 'text-muted-foreground'
                  )}
                >
                  {format(day, 'd')}
                </span>
                {hasEntry && (
                  <span className={cn(
                    'text-[10px] font-medium mt-0.5',
                    goalMet ? 'text-green-700' : 'text-primary'
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

        {/* Popover */}
        {selectedDay && (
          <div
            ref={popoverRef}
            className="absolute z-50"
            style={{
              left: Math.min(Math.max(popoverPosition.x - 90, 10), calendarRef.current ? calendarRef.current.offsetWidth - 200 : 100),
              top: Math.max(popoverPosition.y - 160, 10),
            }}
          >
            <div className="bg-card/95 backdrop-blur-sm border border-border/50 rounded-xl p-3 shadow-xl text-sm min-w-[180px]">
              <p className="font-semibold mb-2">{format(new Date(selectedDay.date), 'EEEE, MMM d')}</p>
              <div className="space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Protein</span>
                  <span className={cn("font-bold", selectedDay.goalMet ? "text-green-600" : "text-primary")}>
                    {selectedDay.protein}g / {selectedDay.goal}g
                  </span>
                </div>
                {selectedDay.calories > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Calories</span>
                    <span className="font-medium text-orange-600">{selectedDay.calories} kcal</span>
                  </div>
                )}
                {mpsTrackingEnabled && selectedDay.mpsHits > 0 && (
                  <div className="flex justify-between gap-4 items-center">
                    <span className="text-muted-foreground">MPS hits</span>
                    <span className="font-medium text-purple-600">{selectedDay.mpsHits}</span>
                  </div>
                )}
                {selectedDay.goalMet && (
                  <div className="text-xs text-green-600 font-medium pt-1">Goal met!</div>
                )}
                {/* View day button */}
                <button
                  onClick={() => handleViewDay(selectedDay.date)}
                  className="w-full mt-2 pt-2 border-t border-border/50 flex items-center justify-center gap-1.5 text-primary hover:text-primary/80 transition-colors"
                >
                  <span className="text-xs font-medium">View day</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-md ring-2 ring-primary ring-offset-1" />
          <span>Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-md bg-green-100 border border-green-300" />
          <span>Goal met</span>
        </div>
        {mpsTrackingEnabled && (
          <div className="flex items-center gap-1.5">
            <div className="flex gap-px">
              <div className="w-1 h-1 rounded-full bg-purple-500" />
              <div className="w-1 h-1 rounded-full bg-purple-500" />
              <div className="w-1 h-1 rounded-full bg-purple-500" />
            </div>
            <span>MPS hits</span>
          </div>
        )}
      </div>
    </div>
  );
}

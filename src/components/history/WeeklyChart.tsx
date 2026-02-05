import { useMemo, useState, useRef, useEffect } from 'react';
import { format, subDays, addDays, startOfDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  ComposedChart,
  Line,
} from 'recharts';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Flame, Zap, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { calculateMPSHits } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { FoodEntry } from '@/types';

interface WeeklyChartProps {
  entries: FoodEntry[];
  goal: number;
  calorieGoal?: number;
  calorieTrackingEnabled?: boolean;
  mpsTrackingEnabled?: boolean;
  weekOffset: number;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  isSwiping?: boolean;
}

// Meal time categories based on consumedAt hour
function getMealType(entry: FoodEntry): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const time = entry.consumedAt || entry.createdAt;
  const hour = time.getHours();

  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'snack';
  return 'dinner'; // 18-5
}

// Shades of yellow/amber/orange palette
const MEAL_GRADIENT_IDS = {
  breakfast: 'breakfastGradient',
  lunch: 'lunchGradient',
  snack: 'snackGradient',
  dinner: 'dinnerGradient',
};

interface DayData {
  date: string;
  day: string;
  breakfast: number;
  lunch: number;
  snack: number;
  dinner: number;
  totalProtein: number;
  totalCalories: number;
  goalMet: boolean;
  mpsHits: number;
  isToday: boolean;
}

export function WeeklyChart({
  entries,
  goal,
  calorieGoal = 2000,
  calorieTrackingEnabled = false,
  mpsTrackingEnabled = true,
  weekOffset,
  onPrevWeek,
  onNextWeek,
  isSwiping = false,
}: WeeklyChartProps) {
  const navigate = useNavigate();
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

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

  // Close popover when swiping
  useEffect(() => {
    if (isSwiping) setSelectedDay(null);
  }, [isSwiping]);

  const handleBarClick = (data: DayData, event: React.MouseEvent) => {
    if (isSwiping) return;

    const chartRect = chartContainerRef.current?.getBoundingClientRect();
    if (!chartRect) return;

    // Position popover above the clicked point
    const x = event.clientX - chartRect.left;
    const y = event.clientY - chartRect.top;

    setPopoverPosition({ x, y: y - 10 });
    setSelectedDay(data);
  };

  const handleViewDay = (dateStr: string) => {
    setSelectedDay(null);
    navigate(`/?date=${dateStr}`);
  };
  const chartData = useMemo(() => {
    const today = startOfDay(new Date());
    const todayStr = format(today, 'yyyy-MM-dd');
    const data: DayData[] = [];

    // Calculate week start based on offset
    const baseDate = addDays(today, weekOffset * 7);

    for (let i = 6; i >= 0; i--) {
      const date = subDays(baseDate, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayEntries = entries.filter((e) => e.date === dateStr);

      // Group by meal type
      const mealTotals = { breakfast: 0, lunch: 0, snack: 0, dinner: 0 };
      let totalCalories = 0;

      for (const entry of dayEntries) {
        const mealType = getMealType(entry);
        mealTotals[mealType] += entry.protein;
        totalCalories += entry.calories || 0;
      }

      const totalProtein = Object.values(mealTotals).reduce((a, b) => a + b, 0);

      // Calculate MPS hits for this day
      const mpsHits = calculateMPSHits(dayEntries).length;

      data.push({
        date: dateStr,
        day: format(date, 'EEE'),
        ...mealTotals,
        totalProtein,
        totalCalories,
        goalMet: totalProtein >= goal,
        mpsHits,
        isToday: dateStr === todayStr,
      });
    }

    return data;
  }, [entries, goal, weekOffset]);

  // Week date range for display
  const weekRange = useMemo(() => {
    const today = startOfDay(new Date());
    const baseDate = addDays(today, weekOffset * 7);
    const weekStart = subDays(baseDate, 6);
    const weekEnd = baseDate;

    if (weekOffset === 0) {
      return 'This Week';
    }
    return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`;
  }, [weekOffset]);

  // Calculate stats - only count days with entries
  const daysWithEntries = chartData.filter(d => d.totalProtein > 0);
  const totalProtein = chartData.reduce((sum, d) => sum + d.totalProtein, 0);
  const avgProtein = daysWithEntries.length > 0
    ? Math.round(totalProtein / daysWithEntries.length)
    : 0;
  const goalMetDays = chartData.filter(d => d.goalMet).length;
  const totalCalories = chartData.reduce((sum, d) => sum + d.totalCalories, 0);
  const avgCalories = daysWithEntries.length > 0
    ? Math.round(totalCalories / daysWithEntries.length)
    : 0;

  // Calculate week-over-week trend
  const prevWeekStart = subDays(addDays(new Date(), weekOffset * 7), 13);
  const prevWeekEnd = subDays(addDays(new Date(), weekOffset * 7), 7);
  const prevWeekEntries = entries.filter(e => {
    const entryDate = new Date(e.date);
    return entryDate >= prevWeekStart && entryDate < prevWeekEnd;
  });
  const prevWeekTotal = prevWeekEntries.reduce((sum, e) => sum + e.protein, 0);

  const trendPercent = prevWeekTotal > 0
    ? Math.round(((totalProtein - prevWeekTotal) / prevWeekTotal) * 100)
    : 0;

  // Popover content component
  const renderPopoverContent = (data: DayData) => (
    <div className="bg-card/95 backdrop-blur-sm border border-border/50 rounded-xl p-3 shadow-xl text-sm min-w-[180px]">
      <p className="font-semibold mb-2">{format(new Date(data.date), 'EEEE, MMM d')}</p>
      <div className="space-y-1">
        {data.breakfast > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-300" />
              Breakfast
            </span>
            <span className="font-medium">{data.breakfast}g</span>
          </div>
        )}
        {data.lunch > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Lunch
            </span>
            <span className="font-medium">{data.lunch}g</span>
          </div>
        )}
        {data.snack > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Snack
            </span>
            <span className="font-medium">{data.snack}g</span>
          </div>
        )}
        {data.dinner > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              Dinner
            </span>
            <span className="font-medium">{data.dinner}g</span>
          </div>
        )}
        <div className="border-t border-border/50 pt-1.5 mt-1.5 flex justify-between gap-4">
          <span className="font-medium">Protein</span>
          <span className={cn("font-bold", data.goalMet ? "text-green-600" : "text-primary")}>
            {data.totalProtein}g
          </span>
        </div>
        {calorieTrackingEnabled && data.totalCalories > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Calories</span>
            <span className={cn(
              "font-medium",
              data.totalCalories > calorieGoal ? "text-red-500" : "text-orange-600"
            )}>
              {data.totalCalories} kcal
            </span>
          </div>
        )}
        {mpsTrackingEnabled && data.mpsHits > 0 && (
          <div className="flex justify-between gap-4 items-center">
            <span className="text-muted-foreground">MPS hits</span>
            <span className="font-medium text-purple-600">{data.mpsHits}</span>
          </div>
        )}
        {/* View day button */}
        <button
          onClick={() => handleViewDay(data.date)}
          className="w-full mt-2 pt-2 border-t border-border/50 flex items-center justify-center gap-1.5 text-primary hover:text-primary/80 transition-colors"
        >
          <span className="text-xs font-medium">View day</span>
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  );

  // Calculate max for Y axis
  const maxProtein = Math.max(...chartData.map(d => d.totalProtein), goal);
  const yAxisMax = Math.ceil(maxProtein * 1.15 / 10) * 10;

  // Calculate max for calories Y axis
  const maxCalories = Math.max(...chartData.map(d => d.totalCalories), calorieGoal);
  const calorieYAxisMax = Math.ceil(maxCalories * 1.15 / 100) * 100;

  return (
    <div className="space-y-4">
      {/* Week Navigation */}
      <div className="flex items-center justify-between bg-card rounded-2xl p-3 shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={onPrevWeek}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h3 className="font-semibold text-lg">{weekRange}</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={onNextWeek}
          disabled={weekOffset >= 0}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl p-4 text-center shadow-sm">
          <div className="flex items-center justify-center gap-1">
            <span className="text-2xl font-bold text-primary">{avgProtein}g</span>
            {trendPercent !== 0 && (
              <span className={cn(
                "text-xs flex items-center",
                trendPercent > 0 ? "text-green-600" : "text-red-500"
              )}>
                {trendPercent > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Protein avg</p>
        </div>
        <div className="bg-card rounded-2xl p-4 text-center shadow-sm">
          <div className="flex items-center justify-center gap-1">
            <Flame className="h-5 w-5 text-green-600" />
            <span className="text-2xl font-bold text-green-600">{goalMetDays}</span>
            <span className="text-lg text-muted-foreground">/7</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Goals hit</p>
        </div>
        <div className="bg-card rounded-2xl p-4 text-center shadow-sm">
          <div className="flex items-center justify-center gap-1">
            <Zap className="h-5 w-5 text-orange-500" />
            <span className="text-2xl font-bold text-orange-600">{avgCalories || '–'}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Calories avg</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card rounded-2xl p-4 shadow-sm">
        <div className="h-56 relative" ref={chartContainerRef}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: calorieTrackingEnabled ? 35 : 10, left: 0, bottom: 0 }}>
              <defs>
                {/* Yellow/amber/orange gradient palette */}
                <linearGradient id={MEAL_GRADIENT_IDS.breakfast} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FDE68A" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#FCD34D" stopOpacity={0.85} />
                </linearGradient>
                <linearGradient id={MEAL_GRADIENT_IDS.lunch} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FCD34D" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#FBBF24" stopOpacity={0.85} />
                </linearGradient>
                <linearGradient id={MEAL_GRADIENT_IDS.snack} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FBBF24" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.85} />
                </linearGradient>
                <linearGradient id={MEAL_GRADIENT_IDS.dinner} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#EA580C" stopOpacity={0.85} />
                </linearGradient>
              </defs>

              {/* Protein goal line */}
              <ReferenceLine
                y={goal}
                yAxisId="protein"
                stroke="#9ca3af"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />

              {/* Calorie goal line */}
              {calorieTrackingEnabled && (
                <ReferenceLine
                  y={calorieGoal}
                  yAxisId="calories"
                  stroke="#f97316"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                />
              )}

              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                yAxisId="protein"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                width={32}
                domain={[0, yAxisMax]}
              />
              {calorieTrackingEnabled && (
                <YAxis
                  yAxisId="calories"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#f97316' }}
                  width={32}
                  domain={[0, calorieYAxisMax]}
                  tickFormatter={(value) => value >= 1000 ? `${value/1000}k` : value}
                />
              )}
              {/* Stacked bars with yellow/orange palette */}
              <Bar
                dataKey="breakfast"
                stackId="protein"
                yAxisId="protein"
                fill={`url(#${MEAL_GRADIENT_IDS.breakfast})`}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="lunch"
                stackId="protein"
                yAxisId="protein"
                fill={`url(#${MEAL_GRADIENT_IDS.lunch})`}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="snack"
                stackId="protein"
                yAxisId="protein"
                fill={`url(#${MEAL_GRADIENT_IDS.snack})`}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="dinner"
                stackId="protein"
                yAxisId="protein"
                fill={`url(#${MEAL_GRADIENT_IDS.dinner})`}
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                onClick={(_data, index, event) => {
                  if (event && index !== undefined && chartData[index]) {
                    handleBarClick(chartData[index], event as unknown as React.MouseEvent);
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    stroke={entry.isToday ? 'hsl(var(--primary))' : 'transparent'}
                    strokeWidth={entry.isToday ? 2 : 0}
                  />
                ))}
              </Bar>

              {/* Calorie line */}
              {calorieTrackingEnabled && (
                <Line
                  type="monotone"
                  dataKey="totalCalories"
                  yAxisId="calories"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={{ fill: '#f97316', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  connectNulls={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Custom popover */}
          {selectedDay && (
            <div
              ref={popoverRef}
              className="absolute z-50"
              style={{
                left: Math.min(Math.max(popoverPosition.x - 90, 10), chartContainerRef.current ? chartContainerRef.current.offsetWidth - 200 : 100),
                top: Math.max(popoverPosition.y - 180, 10),
              }}
            >
              {renderPopoverContent(selectedDay)}
            </div>
          )}
        </div>

        {/* MPS dots below chart - aligned with bars */}
        {mpsTrackingEnabled && (
          <div className="flex mt-1" style={{ paddingLeft: 32, paddingRight: calorieTrackingEnabled ? 35 : 10 }}>
            {chartData.map((day, index) => (
              <div key={index} className="flex-1 flex gap-0.5 justify-center">
                {day.mpsHits > 0 && Array.from({ length: Math.min(day.mpsHits, 5) }).map((_, i) => (
                  <div key={i} className="w-1 h-1 rounded-full bg-purple-500" />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded bg-gradient-to-b from-yellow-200 to-yellow-300" />
            <span>Brkfst</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded bg-gradient-to-b from-yellow-300 to-amber-400" />
            <span>Lunch</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded bg-gradient-to-b from-amber-400 to-amber-500" />
            <span>Snack</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded bg-gradient-to-b from-amber-500 to-orange-600" />
            <span>Dinner</span>
          </div>
          {calorieTrackingEnabled && (
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 rounded bg-orange-500" />
              <span>kcal</span>
            </div>
          )}
          {mpsTrackingEnabled && (
            <div className="flex items-center gap-1">
              <div className="w-1 h-1 rounded-full bg-purple-500" />
              <span>MPS</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

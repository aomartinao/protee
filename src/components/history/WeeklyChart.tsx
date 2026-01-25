import { useMemo } from 'react';
import { format, subDays, startOfDay } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { FoodEntry } from '@/types';

interface WeeklyChartProps {
  entries: FoodEntry[];
  goal: number;
}

export function WeeklyChart({ entries, goal }: WeeklyChartProps) {
  const chartData = useMemo(() => {
    const today = startOfDay(new Date());
    const data = [];

    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayEntries = entries.filter((e) => e.date === dateStr);
      const totalProtein = dayEntries.reduce((sum, e) => sum + e.protein, 0);

      data.push({
        date: dateStr,
        day: format(date, 'EEE'),
        protein: totalProtein,
        goalMet: totalProtein >= goal,
      });
    }

    return data;
  }, [entries, goal]);

  // Calculate stats
  const totalProtein = chartData.reduce((sum, d) => sum + d.protein, 0);
  const avgProtein = Math.round(totalProtein / 7);
  const goalMetDays = chartData.filter(d => d.goalMet).length;

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl p-4 text-center shadow-sm">
          <span className="text-2xl font-bold text-primary">{avgProtein}g</span>
          <p className="text-xs text-muted-foreground mt-1">Daily avg</p>
        </div>
        <div className="bg-card rounded-2xl p-4 text-center shadow-sm">
          <span className="text-2xl font-bold text-foreground">{totalProtein}g</span>
          <p className="text-xs text-muted-foreground mt-1">Total</p>
        </div>
        <div className="bg-card rounded-2xl p-4 text-center shadow-sm">
          <span className="text-2xl font-bold text-green-600">{goalMetDays}</span>
          <p className="text-xs text-muted-foreground mt-1">Goals met</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card rounded-2xl p-4 shadow-sm">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                width={40}
              />
              <ReferenceLine
                y={goal}
                stroke="hsl(var(--primary))"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                strokeOpacity={0.6}
              />
              <Bar dataKey="protein" radius={[6, 6, 0, 0]} maxBarSize={36}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.goalMet
                        ? 'hsl(142 76% 36%)'
                        : 'hsl(var(--primary))'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-5 mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-primary" />
            <span>Protein</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-600" />
            <span>Goal met</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 border-t-2 border-dashed border-primary/60" />
            <span>{goal}g goal</span>
          </div>
        </div>
      </div>
    </div>
  );
}

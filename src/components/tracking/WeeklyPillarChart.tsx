import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Check } from 'lucide-react';
import type { ChartDataPoint } from '@/hooks/useTrackingData';

interface WeeklyPillarChartProps {
  data: ChartDataPoint[];
  label: string;
  unit: string;
  color: string;
  bgColor: string;
}

export function WeeklyPillarChart({
  data,
  label,
  unit,
  color,
  bgColor,
}: WeeklyPillarChartProps) {
  const { average, goalsMet, goalValue, yMax } = useMemo(() => {
    const nonZero = data.filter((d) => d.value > 0);
    const avg =
      nonZero.length > 0
        ? Math.round((nonZero.reduce((s, d) => s + d.value, 0) / nonZero.length) * 10) / 10
        : 0;
    const met = data.filter((d) => d.goalMet).length;
    const goal = data[0]?.goal ?? 0;
    const maxVal = Math.max(...data.map((d) => d.value), goal);
    return {
      average: avg,
      goalsMet: met,
      goalValue: goal,
      yMax: Math.ceil(maxVal * 1.2) || 10,
    };
  }, [data]);

  if (data.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">{label}</h4>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            avg <span className="font-semibold text-foreground">{average}{unit}</span>
          </span>
          <span className="flex items-center gap-0.5">
            <Check className="h-3 w-3 text-green-500" />
            <span className="font-semibold text-foreground">{goalsMet}</span>/{data.length}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`pillarGrad-${label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.9} />
                <stop offset="100%" stopColor={color} stopOpacity={0.5} />
              </linearGradient>
            </defs>

            <ReferenceLine
              y={goalValue}
              stroke="#9ca3af"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />

            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              width={28}
              domain={[0, yMax]}
            />

            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={32}>
              {data.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.goalMet ? `url(#pillarGrad-${label})` : bgColor}
                  stroke={entry.isToday ? color : 'none'}
                  strokeWidth={entry.isToday ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

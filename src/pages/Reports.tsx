import { useState, useMemo } from 'react';
import { Moon, Dumbbell, Beef } from 'lucide-react';
import { useSettings, useRecentEntries } from '@/hooks/useProteinData';
import {
  useRecentSleepEntries,
  useRecentTrainingEntries,
  useSleepChartData,
  useProteinChartData,
} from '@/hooks/useTrackingData';
import { PillarCard } from '@/components/tracking/PillarCard';
import { WeeklyPillarChart } from '@/components/tracking/WeeklyPillarChart';
import { cn } from '@/lib/utils';
import type { MuscleGroup } from '@/types';

const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  full_body: 'Full Body',
  cardio: 'Cardio',
  rest: 'Rest',
  other: 'Other',
};

const MUSCLE_GROUP_COLORS: Record<MuscleGroup, string> = {
  push: 'bg-red-400',
  pull: 'bg-blue-400',
  legs: 'bg-amber-400',
  full_body: 'bg-purple-400',
  cardio: 'bg-pink-400',
  rest: 'bg-gray-300',
  other: 'bg-gray-400',
};

export function Reports() {
  const [timeRange, setTimeRange] = useState<7 | 30>(7);
  const { settings } = useSettings();

  const foodEntries = useRecentEntries(timeRange);
  const sleepEntries = useRecentSleepEntries(timeRange);
  const trainingEntries = useRecentTrainingEntries(timeRange);

  const sleepGoal = settings.sleepGoalMinutes ?? 480;
  const trainingGoal = settings.trainingGoalPerWeek ?? 4;
  const proteinGoal = settings.defaultGoal;

  // Protein stats
  const proteinStats = useMemo(() => {
    const dailyTotals = new Map<string, number>();
    for (const e of foodEntries) {
      dailyTotals.set(e.date, (dailyTotals.get(e.date) ?? 0) + e.protein);
    }
    const values = Array.from(dailyTotals.values());
    const avg = values.length > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0;
    const goalMet = values.filter((v) => v >= proteinGoal).length;
    return { avg, goalMet, days: values.length };
  }, [foodEntries, proteinGoal]);

  // Sleep stats
  const sleepStats = useMemo(() => {
    const dailyTotals = new Map<string, number>();
    for (const e of sleepEntries) {
      dailyTotals.set(e.date, (dailyTotals.get(e.date) ?? 0) + e.duration);
    }
    const values = Array.from(dailyTotals.values());
    const avgMinutes = values.length > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0;
    const goalMet = values.filter((v) => v >= sleepGoal).length;
    return { avgMinutes, goalMet, days: values.length };
  }, [sleepEntries, sleepGoal]);

  // Training stats
  const trainingStats = useMemo(() => {
    const activeSessions = trainingEntries.filter((e) => e.muscleGroup !== 'rest');
    const total = activeSessions.length;

    // Muscle group breakdown
    const groups = new Map<MuscleGroup, number>();
    for (const e of activeSessions) {
      groups.set(e.muscleGroup, (groups.get(e.muscleGroup) ?? 0) + 1);
    }

    return { total, groups };
  }, [trainingEntries]);

  // Chart data
  const proteinChartData = useProteinChartData(foodEntries, proteinGoal, Math.min(timeRange, 7));
  const sleepChartData = useSleepChartData(sleepEntries, sleepGoal, Math.min(timeRange, 7));

  const formatSleepHours = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-28">
      {/* Time Range Toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Reports</h2>
        <div className="flex rounded-xl bg-muted p-1">
          {([7, 30] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-lg transition-all duration-200',
                timeRange === range
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground'
              )}
            >
              {range}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="space-y-2">
        <PillarCard
          icon={Beef}
          iconColor="text-amber-500"
          iconBgColor="bg-amber-500/15"
          title="Protein"
          current={`${proteinStats.avg}g`}
          goal={`${proteinGoal}g`}
          subtitle={`avg / day \u00B7 ${proteinStats.goalMet}/${proteinStats.days} goals hit`}
          isGoalMet={proteinStats.avg >= proteinGoal}
        />

        {settings.sleepTrackingEnabled && (
          <PillarCard
            icon={Moon}
            iconColor="text-blue-500"
            iconBgColor="bg-blue-500/15"
            title="Sleep"
            current={formatSleepHours(sleepStats.avgMinutes)}
            goal={formatSleepHours(sleepGoal)}
            subtitle={`avg / night \u00B7 ${sleepStats.goalMet}/${sleepStats.days} goals hit`}
            isGoalMet={sleepStats.avgMinutes >= sleepGoal}
          />
        )}

        {settings.trainingTrackingEnabled && (
          <PillarCard
            icon={Dumbbell}
            iconColor="text-emerald-500"
            iconBgColor="bg-emerald-500/15"
            title="Training"
            current={`${trainingStats.total}`}
            goal={`${timeRange === 7 ? trainingGoal : Math.round(trainingGoal * (30 / 7))}`}
            unit="sessions"
            subtitle={`${timeRange}d total`}
            isGoalMet={trainingStats.total >= (timeRange === 7 ? trainingGoal : Math.round(trainingGoal * (30 / 7)))}
          />
        )}
      </div>

      {/* Protein Chart */}
      <WeeklyPillarChart
        data={proteinChartData}
        label="Protein"
        unit="g"
        color="#f59e0b"
        bgColor="#fef3c7"
      />

      {/* Sleep Chart */}
      {settings.sleepTrackingEnabled && (
        <WeeklyPillarChart
          data={sleepChartData}
          label="Sleep"
          unit="h"
          color="#3b82f6"
          bgColor="#dbeafe"
        />
      )}

      {/* Training Breakdown */}
      {settings.trainingTrackingEnabled && trainingStats.total > 0 && (
        <div className="bg-card rounded-2xl p-4 shadow-sm">
          <h4 className="text-sm font-semibold mb-3">Training Breakdown</h4>
          <div className="space-y-2">
            {Array.from(trainingStats.groups.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([group, count]) => {
                const pct = Math.round((count / trainingStats.total) * 100);
                return (
                  <div key={group} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">
                      {MUSCLE_GROUP_LABELS[group]}
                    </span>
                    <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', MUSCLE_GROUP_COLORS[group])}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-10 text-right">
                      {count} <span className="text-muted-foreground">({pct}%)</span>
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Empty states */}
      {!settings.sleepTrackingEnabled && !settings.trainingTrackingEnabled && foodEntries.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No data for this period. Start logging to see your progress.
        </div>
      )}
    </div>
  );
}

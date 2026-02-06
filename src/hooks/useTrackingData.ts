import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, subDays, startOfDay } from 'date-fns';
import {
  db,
  getSleepEntriesForDate,
  getTrainingSessions7Days,
  getTrainingEntriesForDate,
} from '@/db';
import { getToday } from '@/lib/utils';
import type { SleepEntry, TrainingEntry } from '@/types';

// ============================================================
// Sleep hooks
// ============================================================

export function useTodaySleep(): SleepEntry[] {
  const today = getToday();
  const entries = useLiveQuery(() => getSleepEntriesForDate(today), [today]);
  return entries || [];
}

export function useSleepForDate(date: string): SleepEntry[] {
  const entries = useLiveQuery(() => getSleepEntriesForDate(date), [date]);
  return entries || [];
}

export function useRecentSleepEntries(days: number): SleepEntry[] {
  const cutoff = format(subDays(new Date(), days), 'yyyy-MM-dd');
  const entries = useLiveQuery(
    () =>
      db.sleepEntries
        .where('date')
        .aboveOrEqual(cutoff)
        .toArray()
        .then((all) => all.filter((e) => !e.deletedAt)),
    [cutoff]
  );
  return entries || [];
}

// ============================================================
// Training hooks
// ============================================================

export function useTodayTraining(): TrainingEntry[] {
  const today = getToday();
  const entries = useLiveQuery(() => getTrainingEntriesForDate(today), [today]);
  return entries || [];
}

export function useTrainingForDate(date: string): TrainingEntry[] {
  const entries = useLiveQuery(() => getTrainingEntriesForDate(date), [date]);
  return entries || [];
}

export function useTrainingSessions7Days(): TrainingEntry[] {
  const entries = useLiveQuery(() => getTrainingSessions7Days());
  return entries || [];
}

export function useRecentTrainingEntries(days: number): TrainingEntry[] {
  const cutoff = format(subDays(new Date(), days), 'yyyy-MM-dd');
  const entries = useLiveQuery(
    () =>
      db.trainingEntries
        .where('date')
        .aboveOrEqual(cutoff)
        .toArray()
        .then((all) => all.filter((e) => !e.deletedAt)),
    [cutoff]
  );
  return entries || [];
}

// ============================================================
// Chart data helpers
// ============================================================

export interface ChartDataPoint {
  date: string;
  day: string;
  value: number;
  goal: number;
  goalMet: boolean;
  isToday: boolean;
}

export function useSleepChartData(
  sleepEntries: SleepEntry[],
  goalMinutes: number,
  days: number = 7
): ChartDataPoint[] {
  return useMemo(() => {
    const today = startOfDay(new Date());
    const todayStr = format(today, 'yyyy-MM-dd');
    const goalHours = goalMinutes / 60;
    const data: ChartDataPoint[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(today, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayEntries = sleepEntries.filter((e) => e.date === dateStr);
      const totalHours = dayEntries.reduce((sum, e) => sum + e.duration, 0) / 60;

      data.push({
        date: dateStr,
        day: format(date, 'EEE'),
        value: Math.round(totalHours * 10) / 10,
        goal: Math.round(goalHours * 10) / 10,
        goalMet: totalHours >= goalHours,
        isToday: dateStr === todayStr,
      });
    }

    return data;
  }, [sleepEntries, goalMinutes, days]);
}

export function useProteinChartData(
  foodEntries: { date: string; protein: number }[],
  goal: number,
  days: number = 7
): ChartDataPoint[] {
  return useMemo(() => {
    const today = startOfDay(new Date());
    const todayStr = format(today, 'yyyy-MM-dd');
    const data: ChartDataPoint[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(today, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayEntries = foodEntries.filter((e) => e.date === dateStr);
      const totalProtein = dayEntries.reduce((sum, e) => sum + e.protein, 0);

      data.push({
        date: dateStr,
        day: format(date, 'EEE'),
        value: Math.round(totalProtein),
        goal,
        goalMet: totalProtein >= goal,
        isToday: dateStr === todayStr,
      });
    }

    return data;
  }, [foodEntries, goal, days]);
}

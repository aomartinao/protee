import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  getEntriesForDate,
  getEntriesForDateRange,
  deleteFoodEntry,
  restoreFoodEntry,
  saveUserSettings,
  getAllDailyGoals,
  getDailyGoal,
} from '@/db';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useStore } from '@/store/useStore';
import { useAuthStore, triggerSync } from '@/store/useAuthStore';
import { getToday, getDateRange, formatDate } from '@/lib/utils';
import type { FoodEntry, StreakInfo } from '@/types';
import { subDays } from 'date-fns';

export function useTodayEntries() {
  const today = getToday();
  const entries = useLiveQuery(() => getEntriesForDate(today), [today]);
  return entries || [];
}

export function useAllEntries() {
  const entries = useLiveQuery(() => db.foodEntries.toArray());
  return entries || [];
}

export function useRecentEntries(days: number = 30) {
  const { start, end } = getDateRange(days);
  const entries = useLiveQuery(
    () => getEntriesForDateRange(start, end),
    [start, end]
  );
  return entries || [];
}

export function useDeleteEntry() {
  return useCallback(async (id: number) => {
    // Get the entry name before deleting for the toast message
    const entry = await db.foodEntries.get(id);
    const foodName = entry?.foodName;

    // Delete the entry (soft delete)
    await deleteFoodEntry(id);

    // Show undo toast
    toast({
      description: foodName ? `"${foodName}" deleted` : 'Entry deleted',
      action: React.createElement(ToastAction, {
        altText: 'Undo',
        onClick: async () => {
          // Restore the entry
          await restoreFoodEntry(id);
          triggerSync();
        },
      }, 'Undo'),
      duration: 5000,
    });

    // Trigger sync after deletion
    triggerSync();
  }, []);
}

export function useDailyGoals(): Map<string, number> {
  const goals = useLiveQuery(() => getAllDailyGoals());

  const goalMap = new Map<string, number>();
  if (goals) {
    for (const goal of goals) {
      goalMap.set(goal.date, goal.goal);
    }
  }

  return goalMap;
}

export function useSettings() {
  const { settings, settingsLoaded, setSettings, loadSettingsFromDb } = useStore();
  const { syncSettings, user } = useAuthStore();

  // Load settings from IndexedDB on mount (atomic update in store)
  useEffect(() => {
    loadSettingsFromDb();
  }, [loadSettingsFromDb]);

  const updateSettings = useCallback(
    async (newSettings: Partial<typeof settings>) => {
      setSettings(newSettings);
      const merged = { ...settings, ...newSettings };
      await saveUserSettings(merged);

      // Sync to cloud if logged in
      if (user) {
        syncSettings(merged);
      }
    },
    [settings, setSettings, user, syncSettings]
  );

  return { settings, updateSettings, settingsLoaded };
}

export function useStreak(entries: FoodEntry[], defaultGoal: number): StreakInfo {
  const [streak, setStreak] = useState<StreakInfo>({
    currentStreak: 0,
    longestStreak: 0,
    lastGoalMetDate: null,
  });

  useEffect(() => {
    // Calculate streak
    const dailyTotals = new Map<string, number>();
    for (const entry of entries) {
      const current = dailyTotals.get(entry.date) || 0;
      dailyTotals.set(entry.date, current + entry.protein);
    }

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastGoalMetDate: string | null = null;

    // Check backwards from today
    const today = new Date();
    let checkDate = today;
    let isCurrentStreak = true;

    for (let i = 0; i < 365; i++) {
      const dateStr = formatDate(checkDate);
      const protein = dailyTotals.get(dateStr) || 0;
      const goalMet = protein >= defaultGoal;

      if (goalMet) {
        tempStreak++;
        if (!lastGoalMetDate) {
          lastGoalMetDate = dateStr;
        }
        if (isCurrentStreak) {
          currentStreak = tempStreak;
        }
      } else {
        // Allow skipping today if no entries yet
        if (i === 0 && protein === 0) {
          // Skip today, don't break streak
        } else {
          if (tempStreak > longestStreak) {
            longestStreak = tempStreak;
          }
          if (isCurrentStreak) {
            isCurrentStreak = false;
          }
          tempStreak = 0;
        }
      }

      checkDate = subDays(checkDate, 1);
    }

    // Final check for longest streak
    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
    }

    setStreak({
      currentStreak,
      longestStreak: Math.max(longestStreak, currentStreak),
      lastGoalMetDate,
    });
  }, [entries, defaultGoal]);

  return streak;
}

export interface RemainingProtein {
  remaining: number;
  goal: number;
  consumed: number;
}

export function useRemainingProtein(): RemainingProtein {
  const { settings } = useStore();
  const today = getToday();
  const entries = useLiveQuery(() => getEntriesForDate(today), [today]) || [];
  const dailyGoal = useLiveQuery(() => getDailyGoal(today), [today]);

  return useMemo(() => {
    const goal = dailyGoal?.goal ?? settings.defaultGoal;
    const consumed = entries.reduce((sum, entry) => sum + entry.protein, 0);
    const remaining = Math.max(0, goal - consumed);

    return { remaining, goal, consumed };
  }, [entries, dailyGoal, settings.defaultGoal]);
}

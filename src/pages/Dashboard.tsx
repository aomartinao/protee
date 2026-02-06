import { useState, useMemo, useCallback, useEffect } from 'react';
import { format, subDays, addDays, isToday, startOfDay, parseISO } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { DailyProgress } from '@/components/tracking/DailyProgress';
import { FoodEntryEditDialog } from '@/components/FoodEntryEditDialog';
import { useSettings, useStreak, useRecentEntries, useDeleteEntry } from '@/hooks/useProteinData';
import { useTodaySleep, useTrainingSessions7Days } from '@/hooks/useTrackingData';
import { useStore } from '@/store/useStore';
import { updateFoodEntry } from '@/db';
import { triggerSync } from '@/store/useAuthStore';
import { refineAnalysis } from '@/services/ai/client';
import type { FoodEntry, ConfidenceLevel } from '@/types';

export function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const dateParam = searchParams.get('date');

  // Initialize date from URL param or default to today
  const [selectedDate, setSelectedDate] = useState(() => {
    if (dateParam) {
      try {
        const parsed = parseISO(dateParam);
        if (!isNaN(parsed.getTime())) {
          return startOfDay(parsed);
        }
      } catch {
        // Invalid date, fall through to today
      }
    }
    return new Date();
  });

  // Clear URL param after initial load (don't keep it in the URL)
  useEffect(() => {
    if (dateParam) {
      setSearchParams({}, { replace: true });
    }
  }, [dateParam, setSearchParams]);
  const recentEntries = useRecentEntries(30);
  const { settings } = useSettings();
  const streak = useStreak(recentEntries, settings.defaultGoal);
  const deleteEntry = useDeleteEntry();
  const { setDashboardState } = useStore();
  const todaySleep = useTodaySleep();
  const weekTraining = useTrainingSessions7Days();

  const todaySleepMinutes = todaySleep.reduce((sum, e) => sum + e.duration, 0);
  const weekTrainingSessions = weekTraining.length;

  // Edit dialog state
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);

  // Filter entries for the selected date
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const entriesForDate = useMemo(
    () => recentEntries.filter((e) => e.date === selectedDateStr),
    [recentEntries, selectedDateStr]
  );

  const handlePrevDay = () => {
    setSelectedDate((d) => subDays(d, 1));
  };

  const handleNextDay = () => {
    const tomorrow = addDays(startOfDay(new Date()), 1);
    if (selectedDate < tomorrow) {
      setSelectedDate((d) => addDays(d, 1));
    }
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  const handleEditEntry = (entry: FoodEntry) => {
    setEditingEntry(entry);
  };

  const handleSaveEdit = useCallback(async (entryId: number, updates: Partial<FoodEntry>) => {
    await updateFoodEntry(entryId, updates);
    triggerSync();
  }, []);

  const handleRefineEdit = useCallback(async (
    originalAnalysis: {
      foodName: string;
      protein: number;
      calories: number;
      confidence: ConfidenceLevel;
      consumedAt?: { parsedDate: string; parsedTime: string };
    },
    refinement: string
  ) => {
    const hasApiAccess = settings.claudeApiKey || settings.hasAdminApiKey;
    const useProxy = !settings.claudeApiKey && settings.hasAdminApiKey;

    if (!hasApiAccess) return null;

    try {
      const result = await refineAnalysis(settings.claudeApiKey || null, originalAnalysis, refinement, useProxy);
      return {
        foodName: result.foodName,
        protein: result.protein,
        calories: result.calories,
      };
    } catch (error) {
      console.error('Refinement failed:', error);
      return null;
    }
  }, [settings.claudeApiKey, settings.hasAdminApiKey]);

  const handleDeleteEntry = useCallback((id: number) => {
    deleteEntry(id);
  }, [deleteEntry]);

  const canGoNext = !isToday(selectedDate);
  const isSelectedToday = isToday(selectedDate);
  const hasAIAccess = !!(settings.claudeApiKey || settings.hasAdminApiKey);

  // Update header state for "Today" button
  useEffect(() => {
    setDashboardState(!isSelectedToday, handleToday);
    return () => setDashboardState(false, null); // Cleanup when leaving Dashboard
  }, [isSelectedToday, setDashboardState]);

  return (
    <div className="min-h-full flex flex-col">
      <DailyProgress
        entries={entriesForDate}
        goal={settings.defaultGoal}
        calorieGoal={settings.calorieGoal}
        calorieTrackingEnabled={settings.calorieTrackingEnabled}
        mpsTrackingEnabled={settings.mpsTrackingEnabled}
        sleepTrackingEnabled={settings.sleepTrackingEnabled}
        trainingTrackingEnabled={settings.trainingTrackingEnabled}
        sleepGoalMinutes={settings.sleepGoalMinutes}
        trainingGoalPerWeek={settings.trainingGoalPerWeek}
        todaySleepMinutes={todaySleepMinutes}
        weekTrainingSessions={weekTrainingSessions}
        streak={streak}
        selectedDate={selectedDate}
        isToday={isSelectedToday}
        onPrevDay={handlePrevDay}
        onNextDay={canGoNext ? handleNextDay : undefined}
        onToday={!isSelectedToday ? handleToday : undefined}
        onEditEntry={handleEditEntry}
        onDeleteEntry={handleDeleteEntry}
      />

      <FoodEntryEditDialog
        entry={editingEntry}
        open={!!editingEntry}
        onOpenChange={(open) => !open && setEditingEntry(null)}
        onSave={handleSaveEdit}
        onRefine={handleRefineEdit}
        showCalories={settings.calorieTrackingEnabled}
        hasAIAccess={hasAIAccess}
      />
    </div>
  );
}

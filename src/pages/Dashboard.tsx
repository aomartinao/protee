import { DailyProgress } from '@/components/tracking/DailyProgress';
import { GoalSetter } from '@/components/tracking/GoalSetter';
import { useTodayEntries, useSettings, useStreak, useRecentEntries } from '@/hooks/useProteinData';

export function Dashboard() {
  const todayEntries = useTodayEntries();
  const recentEntries = useRecentEntries(30);
  const { settings, updateSettings } = useSettings();
  const streak = useStreak(recentEntries, settings.defaultGoal);

  const handleSaveGoal = async (goal: number, calorieGoal?: number) => {
    await updateSettings({ defaultGoal: goal, calorieGoal });
  };

  return (
    <div className="min-h-full">
      <div className="flex justify-end px-4 pt-2">
        <GoalSetter
          currentGoal={settings.defaultGoal}
          currentCalorieGoal={settings.calorieGoal}
          calorieTrackingEnabled={settings.calorieTrackingEnabled}
          onSave={handleSaveGoal}
        />
      </div>
      <DailyProgress
        entries={todayEntries}
        goal={settings.defaultGoal}
        calorieGoal={settings.calorieGoal}
        calorieTrackingEnabled={settings.calorieTrackingEnabled}
        streak={streak}
      />
    </div>
  );
}

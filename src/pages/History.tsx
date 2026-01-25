import { useState, useCallback } from 'react';
import { HistoryList } from '@/components/history/HistoryList';
import { WeeklyChart } from '@/components/history/WeeklyChart';
import { CalendarView } from '@/components/history/CalendarView';
import { useRecentEntries, useDeleteEntry, useDailyGoals, useSettings } from '@/hooks/useProteinData';
import { updateFoodEntry } from '@/db';
import { triggerSync } from '@/store/useAuthStore';
import { cn } from '@/lib/utils';
import type { FoodEntry } from '@/types';

type TabValue = 'list' | 'week' | 'month';

export function History() {
  const [activeTab, setActiveTab] = useState<TabValue>('list');
  const entries = useRecentEntries(90);
  const deleteEntry = useDeleteEntry();
  const dailyGoals = useDailyGoals();
  const { settings } = useSettings();

  const handleEdit = useCallback(async (entry: FoodEntry) => {
    if (!entry.id) return;

    await updateFoodEntry(entry.id, {
      foodName: entry.foodName,
      protein: entry.protein,
      calories: entry.calories,
      date: entry.date,
      consumedAt: entry.consumedAt,
      updatedAt: new Date(),
    });

    triggerSync();
  }, []);

  const tabs: { value: TabValue; label: string }[] = [
    { value: 'list', label: 'List' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
  ];

  return (
    <div className="min-h-full">
      {/* Tab Navigation */}
      <div className="px-4 pt-2 pb-4">
        <div className="bg-muted/50 p-1 rounded-xl flex">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                'flex-1 py-2 text-sm font-medium rounded-lg transition-all',
                activeTab === tab.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4">
        {activeTab === 'list' && (
          <HistoryList
            entries={entries}
            goals={dailyGoals}
            defaultGoal={settings.defaultGoal}
            calorieTrackingEnabled={settings.calorieTrackingEnabled}
            onDelete={deleteEntry}
            onEdit={handleEdit}
          />
        )}

        {activeTab === 'week' && (
          <WeeklyChart entries={entries} goal={settings.defaultGoal} />
        )}

        {activeTab === 'month' && (
          <CalendarView
            entries={entries}
            goals={dailyGoals}
            defaultGoal={settings.defaultGoal}
          />
        )}
      </div>
    </div>
  );
}

import { useState, useCallback, useRef } from 'react';
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
  const [activeTab, setActiveTab] = useState<TabValue>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const entries = useRecentEntries(180); // Extended to 6 months for navigation
  const deleteEntry = useDeleteEntry();
  const dailyGoals = useDailyGoals();
  const { settings } = useSettings();

  // Swipe handling
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);
  const [isSwiping, setIsSwiping] = useState(false);

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

  // Navigation handlers
  const handlePrevWeek = useCallback(() => setWeekOffset(prev => prev - 1), []);
  const handleNextWeek = useCallback(() => setWeekOffset(prev => Math.min(prev + 1, 0)), []);
  const handlePrevMonth = useCallback(() => setMonthOffset(prev => prev - 1), []);
  const handleNextMonth = useCallback(() => setMonthOffset(prev => Math.min(prev + 1, 0)), []);

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
    setIsSwiping(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - swipeStartX.current;
    const deltaY = e.touches[0].clientY - swipeStartY.current;

    // Only consider horizontal swipes
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
      setIsSwiping(true);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isSwiping) return;

    const deltaX = e.changedTouches[0].clientX - swipeStartX.current;
    const SWIPE_THRESHOLD = 50;

    if (activeTab === 'week') {
      if (deltaX > SWIPE_THRESHOLD) {
        handlePrevWeek();
      } else if (deltaX < -SWIPE_THRESHOLD) {
        handleNextWeek();
      }
    } else if (activeTab === 'month') {
      if (deltaX > SWIPE_THRESHOLD) {
        handlePrevMonth();
      } else if (deltaX < -SWIPE_THRESHOLD) {
        handleNextMonth();
      }
    }

    setIsSwiping(false);
  };

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

      {/* Tab Content with swipe support */}
      <div
        className="px-4"
        onTouchStart={activeTab !== 'list' ? handleTouchStart : undefined}
        onTouchMove={activeTab !== 'list' ? handleTouchMove : undefined}
        onTouchEnd={activeTab !== 'list' ? handleTouchEnd : undefined}
      >
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
          <WeeklyChart
            entries={entries}
            goal={settings.defaultGoal}
            calorieGoal={settings.calorieGoal}
            calorieTrackingEnabled={settings.calorieTrackingEnabled}
            mpsTrackingEnabled={settings.mpsTrackingEnabled}
            weekOffset={weekOffset}
            onPrevWeek={handlePrevWeek}
            onNextWeek={handleNextWeek}
            isSwiping={isSwiping}
          />
        )}

        {activeTab === 'month' && (
          <CalendarView
            entries={entries}
            goals={dailyGoals}
            defaultGoal={settings.defaultGoal}
            mpsTrackingEnabled={settings.mpsTrackingEnabled}
            weekStartsOn={settings.weekStartsOn}
            monthOffset={monthOffset}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
          />
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HistoryList } from '@/components/history/HistoryList';
import { WeeklyChart } from '@/components/history/WeeklyChart';
import { CalendarView } from '@/components/history/CalendarView';
import { useRecentEntries, useDeleteEntry, useDailyGoals, useSettings } from '@/hooks/useProteinData';

export function History() {
  const [activeTab, setActiveTab] = useState('list');
  const entries = useRecentEntries(90);
  const deleteEntry = useDeleteEntry();
  const dailyGoals = useDailyGoals();
  const { settings } = useSettings();

  return (
    <div className="p-4 space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="chart">Week</TabsTrigger>
          <TabsTrigger value="calendar">Month</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <HistoryList
            entries={entries}
            goals={dailyGoals}
            defaultGoal={settings.defaultGoal}
            calorieTrackingEnabled={settings.calorieTrackingEnabled}
            onDelete={deleteEntry}
          />
        </TabsContent>

        <TabsContent value="chart" className="mt-4">
          <WeeklyChart entries={entries} goal={settings.defaultGoal} />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <CalendarView
            entries={entries}
            goals={dailyGoals}
            defaultGoal={settings.defaultGoal}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

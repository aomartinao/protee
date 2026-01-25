import { useState, useMemo, useCallback } from 'react';
import { format, subDays, addDays, isToday, startOfDay } from 'date-fns';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { DailyProgress } from '@/components/tracking/DailyProgress';
import { useSettings, useStreak, useRecentEntries, useDeleteEntry } from '@/hooks/useProteinData';
import { updateFoodEntry } from '@/db';
import { triggerSync } from '@/store/useAuthStore';
import { refineAnalysis } from '@/services/ai/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { FoodEntry } from '@/types';

export function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const recentEntries = useRecentEntries(30);
  const { settings } = useSettings();
  const streak = useStreak(recentEntries, settings.defaultGoal);
  const deleteEntry = useDeleteEntry();

  // Edit dialog state
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [editName, setEditName] = useState('');
  const [editProtein, setEditProtein] = useState('');
  const [editCalories, setEditCalories] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editRefinement, setEditRefinement] = useState('');
  const [isRefining, setIsRefining] = useState(false);

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
    setEditName(entry.foodName);
    setEditProtein(entry.protein.toString());
    setEditCalories(entry.calories?.toString() || '');
    const timeSource = entry.consumedAt || entry.createdAt;
    setEditTime(format(timeSource, 'HH:mm'));
  };

  const handleSaveEdit = useCallback(async () => {
    if (!editingEntry?.id) return;

    let consumedAt: Date | undefined;
    if (editTime) {
      const [hours, minutes] = editTime.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      consumedAt = date;
    }

    await updateFoodEntry(editingEntry.id, {
      foodName: editName,
      protein: parseInt(editProtein, 10) || 0,
      calories: editCalories ? parseInt(editCalories, 10) : undefined,
      consumedAt,
      updatedAt: new Date(),
    });

    triggerSync();
    setEditingEntry(null);
    setEditRefinement('');
  }, [editingEntry, editName, editProtein, editCalories, editTime]);

  const handleRefineEdit = useCallback(async () => {
    if (!editRefinement.trim() || !settings.claudeApiKey) return;

    setIsRefining(true);
    try {
      const originalAnalysis = {
        foodName: editName,
        protein: parseInt(editProtein, 10) || 0,
        calories: editCalories ? parseInt(editCalories, 10) : 0,
        confidence: editingEntry?.confidence || ('medium' as const),
        consumedAt: editTime
          ? { parsedDate: format(new Date(), 'yyyy-MM-dd'), parsedTime: editTime }
          : undefined,
      };

      const result = await refineAnalysis(settings.claudeApiKey, originalAnalysis, editRefinement);

      setEditName(result.foodName);
      setEditProtein(result.protein.toString());
      if (result.calories !== undefined) {
        setEditCalories(result.calories.toString());
      }
      if (result.consumedAt) {
        setEditTime(result.consumedAt.parsedTime);
      }

      setEditRefinement('');
    } catch (error) {
      console.error('Refinement failed:', error);
    } finally {
      setIsRefining(false);
    }
  }, [editRefinement, settings.claudeApiKey, editName, editProtein, editCalories, editTime, editingEntry]);

  const handleDeleteEntry = useCallback((id: number) => {
    deleteEntry(id);
  }, [deleteEntry]);

  const canGoNext = !isToday(selectedDate);
  const isSelectedToday = isToday(selectedDate);

  return (
    <div className="min-h-full flex flex-col">
      <DailyProgress
        entries={entriesForDate}
        goal={settings.defaultGoal}
        calorieGoal={settings.calorieGoal}
        calorieTrackingEnabled={settings.calorieTrackingEnabled}
        mpsTrackingEnabled={settings.mpsTrackingEnabled}
        streak={streak}
        selectedDate={selectedDate}
        isToday={isSelectedToday}
        onPrevDay={handlePrevDay}
        onNextDay={canGoNext ? handleNextDay : undefined}
        onToday={!isSelectedToday ? handleToday : undefined}
        onEditEntry={handleEditEntry}
        onDeleteEntry={handleDeleteEntry}
      />

      {/* Edit Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Food Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Protein (g)</label>
                <Input
                  type="number"
                  value={editProtein}
                  onChange={(e) => setEditProtein(e.target.value)}
                  min={0}
                  max={500}
                  className="h-11"
                />
              </div>
              {settings.calorieTrackingEnabled && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Calories</label>
                  <Input
                    type="number"
                    value={editCalories}
                    onChange={(e) => setEditCalories(e.target.value)}
                    min={0}
                    max={10000}
                    className="h-11"
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Time</label>
              <Input
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                className="h-11"
              />
            </div>

            {/* AI Refinement Section */}
            {settings.claudeApiKey && (
              <div className="pt-4 border-t space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  Or describe what changed
                </label>
                <div className="flex gap-2">
                  <Input
                    value={editRefinement}
                    onChange={(e) => setEditRefinement(e.target.value)}
                    placeholder="e.g., it was 200g not 100g, add fries..."
                    disabled={isRefining}
                    className="h-11"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleRefineEdit();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-11 w-11"
                    onClick={handleRefineEdit}
                    disabled={!editRefinement.trim() || isRefining}
                  >
                    {isRefining ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setEditingEntry(null); setEditRefinement(''); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

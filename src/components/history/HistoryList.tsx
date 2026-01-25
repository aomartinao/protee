import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Trash2, Edit2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { FoodEntry, DailyStats } from '@/types';

interface HistoryListProps {
  entries: FoodEntry[];
  goals: Map<string, number>;
  defaultGoal: number;
  calorieTrackingEnabled?: boolean;
  onDelete: (id: number) => void;
  onEdit?: (entry: FoodEntry) => void;
}

export function HistoryList({ entries, goals, defaultGoal, calorieTrackingEnabled, onDelete, onEdit }: HistoryListProps) {
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [editName, setEditName] = useState('');
  const [editProtein, setEditProtein] = useState('');
  const [editCalories, setEditCalories] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  const handleEditClick = (entry: FoodEntry) => {
    setEditingEntry(entry);
    setEditName(entry.foodName);
    setEditProtein(entry.protein.toString());
    setEditCalories(entry.calories?.toString() || '');
    setEditDate(entry.date);
    const timeSource = entry.consumedAt || entry.createdAt;
    setEditTime(format(timeSource, 'HH:mm'));
  };

  const handleSaveEdit = () => {
    if (!editingEntry || !onEdit) return;

    let consumedAt: Date | undefined;
    if (editDate && editTime) {
      const [year, month, day] = editDate.split('-').map(Number);
      const [hours, minutes] = editTime.split(':').map(Number);
      consumedAt = new Date(year, month - 1, day, hours, minutes);
    }

    const updatedEntry: FoodEntry = {
      ...editingEntry,
      foodName: editName,
      protein: parseInt(editProtein, 10) || 0,
      calories: editCalories ? parseInt(editCalories, 10) : undefined,
      date: editDate || editingEntry.date,
      consumedAt,
    };

    onEdit(updatedEntry);
    setEditingEntry(null);
  };

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, DailyStats>();

    const sorted = [...entries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    for (const entry of sorted) {
      if (!groups.has(entry.date)) {
        const goal = goals.get(entry.date) || defaultGoal;
        groups.set(entry.date, {
          date: entry.date,
          totalProtein: 0,
          totalCalories: 0,
          goal,
          entries: [],
          goalMet: false,
        });
      }

      const stats = groups.get(entry.date)!;
      stats.entries.push(entry);
      stats.totalProtein += entry.protein;
      stats.totalCalories += entry.calories || 0;
      stats.goalMet = stats.totalProtein >= stats.goal;
    }

    const result = Array.from(groups.values());
    for (const day of result) {
      day.entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return result;
  }, [entries, goals, defaultGoal]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">No entries yet</p>
        <p className="text-sm text-muted-foreground mt-1">Start logging your meals!</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 pb-4">
        {groupedByDate.map((day) => (
          <div key={day.date} className="space-y-2">
            {/* Day Header */}
            <div className="flex items-center justify-between px-1 sticky top-0 bg-background py-2 -mx-4 px-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">
                  {format(parseISO(day.date), 'EEEE, MMM d')}
                </h3>
                {day.goalMet && (
                  <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    <CheckCircle className="h-3 w-3" />
                    Goal met
                  </span>
                )}
              </div>
              <div className="text-sm">
                <span className="font-semibold">{day.totalProtein}g</span>
                <span className="text-muted-foreground"> / {day.goal}g</span>
                {calorieTrackingEnabled && day.totalCalories > 0 && (
                  <span className="text-amber-600 ml-2">· {day.totalCalories} kcal</span>
                )}
              </div>
            </div>

            {/* Entries */}
            <div className="bg-card rounded-2xl overflow-hidden shadow-sm divide-y divide-border/50">
              {day.entries.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 p-3">
                  {/* Image or Protein Badge */}
                  {entry.imageData ? (
                    <img
                      src={entry.imageData}
                      alt={entry.foodName}
                      className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">{entry.protein}g</span>
                    </div>
                  )}

                  {/* Entry Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{entry.foodName}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(entry.consumedAt || entry.createdAt, 'h:mm a')}
                      <span className="mx-1">·</span>
                      <span className="capitalize">{entry.source}</span>
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="text-right flex-shrink-0">
                    <span className="font-bold text-primary">{entry.protein}g</span>
                    {calorieTrackingEnabled && entry.calories ? (
                      <p className="text-xs text-amber-600">{entry.calories} kcal</p>
                    ) : null}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 flex-shrink-0">
                    {onEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                        onClick={() => handleEditClick(entry)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive"
                      onClick={() => entry.id && onDelete(entry.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

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
              {calorieTrackingEnabled && (
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="h-11"
                />
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
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingEntry(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useMemo, useState, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { CheckCircle, Dumbbell } from 'lucide-react';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { FoodEntryEditDialog } from '@/components/FoodEntryEditDialog';
import { refineAnalysis } from '@/services/ai/client';
import { useSettings } from '@/hooks/useProteinData';
import { calculateMPSHits } from '@/lib/utils';
import type { FoodEntry, DailyStats, ConfidenceLevel } from '@/types';

interface HistoryListProps {
  entries: FoodEntry[];
  goals: Map<string, number>;
  defaultGoal: number;
  calorieTrackingEnabled?: boolean;
  onDelete: (id: number) => void;
  onEdit?: (entry: FoodEntry) => void;
}

export function HistoryList({ entries, goals, defaultGoal, calorieTrackingEnabled, onDelete, onEdit }: HistoryListProps) {
  const { settings } = useSettings();
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);

  const handleEditClick = (entry: FoodEntry) => {
    setEditingEntry(entry);
  };

  const handleSaveEdit = useCallback(async (entryId: number, updates: Partial<FoodEntry>) => {
    if (!onEdit || !editingEntry) return;

    // Merge updates with the original entry
    const updatedEntry: FoodEntry = {
      ...editingEntry,
      ...updates,
    };

    onEdit(updatedEntry);
  }, [onEdit, editingEntry]);

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
      day.entries.sort((a, b) => {
        const timeA = new Date(a.consumedAt || a.createdAt).getTime();
        const timeB = new Date(b.consumedAt || b.createdAt).getTime();
        return timeB - timeA; // Most recent first
      });
    }

    return result;
  }, [entries, goals, defaultGoal]);

  // Calculate MPS hits for all entries to mark them with an icon
  const mpsHitIds = useMemo(() => {
    if (!settings.mpsTrackingEnabled) return new Set<number>();

    // Calculate MPS hits per day
    const allHitIds = new Set<number>();
    for (const day of groupedByDate) {
      const dayHits = calculateMPSHits(day.entries);
      for (const hit of dayHits) {
        if (hit.id) allHitIds.add(hit.id);
      }
    }
    return allHitIds;
  }, [groupedByDate, settings.mpsTrackingEnabled]);

  const hasAIAccess = !!(settings.claudeApiKey || settings.hasAdminApiKey);

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
            <div className="space-y-1.5">
              {day.entries.map((entry) => (
                <SwipeableRow
                  key={entry.id}
                  itemName={entry.foodName}
                  onEdit={onEdit ? () => handleEditClick(entry) : undefined}
                  onDelete={entry.id ? () => onDelete(entry.id!) : undefined}
                >
                  <div className="flex items-center gap-3 p-2.5">
                    {/* Image or Protein Badge - matching Today's styling */}
                    {entry.imageData ? (
                      <img
                        src={entry.imageData}
                        alt={entry.foodName}
                        loading="lazy"
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-primary">{entry.protein}g</span>
                      </div>
                    )}

                    {/* Entry Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.foodName}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(entry.consumedAt || entry.createdAt), 'h:mm a')}
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="text-right flex-shrink-0 flex items-center gap-1.5">
                      {settings.mpsTrackingEnabled && entry.id && mpsHitIds.has(entry.id) && (
                        <Dumbbell className="h-3.5 w-3.5 text-purple-500" />
                      )}
                      <div>
                        <span className="text-sm font-semibold text-primary">{entry.protein}g</span>
                        {calorieTrackingEnabled && entry.calories ? (
                          <p className="text-xs text-amber-600">{entry.calories} kcal</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </SwipeableRow>
              ))}
            </div>
          </div>
        ))}
      </div>

      <FoodEntryEditDialog
        entry={editingEntry}
        open={!!editingEntry}
        onOpenChange={(open) => !open && setEditingEntry(null)}
        onSave={handleSaveEdit}
        onRefine={handleRefineEdit}
        showCalories={calorieTrackingEnabled}
        hasAIAccess={hasAIAccess}
      />
    </>
  );
}

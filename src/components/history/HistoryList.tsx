import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { FoodEntry, DailyStats } from '@/types';

interface HistoryListProps {
  entries: FoodEntry[];
  goals: Map<string, number>;
  defaultGoal: number;
  calorieTrackingEnabled?: boolean;
  onDelete: (id: number) => void;
}

export function HistoryList({ entries, goals, defaultGoal, calorieTrackingEnabled, onDelete }: HistoryListProps) {
  const groupedByDate = useMemo(() => {
    const groups = new Map<string, DailyStats>();

    // Sort entries by date descending
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

    return Array.from(groups.values());
  }, [entries, goals, defaultGoal]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No entries yet.</p>
        <p className="text-sm">Start logging your protein intake!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groupedByDate.map((day) => (
        <div key={day.date} className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">
                {format(parseISO(day.date), 'EEEE, MMM d')}
              </h3>
              {day.goalMet && (
                <Badge variant="success" className="text-xs">
                  Goal met
                </Badge>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {day.totalProtein}g / {day.goal}g
              {calorieTrackingEnabled && day.totalCalories > 0 && (
                <span className="ml-2 text-amber-600">· {day.totalCalories} kcal</span>
              )}
            </span>
          </div>

          <div className="space-y-2">
            {day.entries.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    {entry.imageData && (
                      <img
                        src={entry.imageData}
                        alt={entry.foodName}
                        className="w-12 h-12 rounded object-cover"
                      />
                    )}
                    <div>
                      <p className="font-medium text-sm">{entry.foodName}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground capitalize">
                          {entry.source}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(entry.createdAt, 'h:mm a')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <span className="font-bold text-primary">{entry.protein}g</span>
                      {calorieTrackingEnabled && entry.calories && (
                        <span className="text-xs text-amber-600 ml-1">· {entry.calories} kcal</span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => entry.id && onDelete(entry.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

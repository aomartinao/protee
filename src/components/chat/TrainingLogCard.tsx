import { Check, X, Dumbbell, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TrainingEntry, MuscleGroup } from '@/types';

interface TrainingLogCardProps {
  entry: Partial<TrainingEntry>;
  weeklyProgress?: { done: number; goal: number };
  onConfirm?: () => void;
  onCancel?: () => void;
  isConfirmed?: boolean;
}

const muscleGroupConfig: Record<MuscleGroup, { label: string; color: string }> = {
  push: { label: 'Push', color: 'text-blue-600 bg-blue-50' },
  pull: { label: 'Pull', color: 'text-purple-600 bg-purple-50' },
  legs: { label: 'Legs', color: 'text-orange-600 bg-orange-50' },
  full_body: { label: 'Full Body', color: 'text-green-600 bg-green-50' },
  cardio: { label: 'Cardio', color: 'text-red-600 bg-red-50' },
  rest: { label: 'Rest Day', color: 'text-gray-600 bg-gray-50' },
  other: { label: 'Other', color: 'text-slate-600 bg-slate-50' },
};

export function TrainingLogCard({
  entry,
  weeklyProgress,
  onConfirm,
  onCancel,
  isConfirmed = false,
}: TrainingLogCardProps) {
  const group = entry.muscleGroup ? muscleGroupConfig[entry.muscleGroup] : null;

  return (
    <div className="bg-card rounded-2xl p-4 shadow-sm border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Dumbbell className="h-5 w-5 text-emerald-500 shrink-0" />
          <h4 className="font-semibold text-foreground">Training</h4>
        </div>
        {group && (
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', group.color)}>
            {group.label}
          </span>
        )}
      </div>

      {/* Duration */}
      {entry.duration && (
        <div className="mt-3">
          <span className="text-3xl font-bold text-emerald-500">{entry.duration}</span>
          <span className="text-sm text-muted-foreground ml-1">min</span>
        </div>
      )}

      {/* Notes */}
      {entry.notes && (
        <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>
      )}

      {/* Weekly progress */}
      {weeklyProgress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>This week</span>
            <span className="font-medium">{weeklyProgress.done}/{weeklyProgress.goal}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                weeklyProgress.done >= weeklyProgress.goal ? 'bg-emerald-500' : 'bg-emerald-400'
              )}
              style={{ width: `${Math.min(100, (weeklyProgress.done / weeklyProgress.goal) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions - pending */}
      {!isConfirmed && (
        <div className="flex gap-2 mt-4">
          {onCancel && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-10 px-3 rounded-xl text-muted-foreground"
              onClick={onCancel}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="flex-1 h-10 rounded-xl"
            onClick={onConfirm}
          >
            <Check className="h-4 w-4 mr-1.5" />
            Confirm
          </Button>
        </div>
      )}

      {/* Confirmed state */}
      {isConfirmed && (
        <div className="flex items-center gap-1.5 mt-4 text-green-600 text-sm">
          <CheckCircle className="h-4 w-4" />
          <span className="font-medium">Logged</span>
        </div>
      )}
    </div>
  );
}

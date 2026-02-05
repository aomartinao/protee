import { Check, X, Moon, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SleepEntry } from '@/types';

interface SleepLogCardProps {
  entry: Partial<SleepEntry>;
  sleepGoalMinutes?: number;
  onConfirm?: () => void;
  onCancel?: () => void;
  isConfirmed?: boolean;
}

const qualityConfig: Record<string, { label: string; color: string }> = {
  poor: { label: 'Poor', color: 'text-red-600 bg-red-50' },
  fair: { label: 'Fair', color: 'text-amber-600 bg-amber-50' },
  good: { label: 'Good', color: 'text-blue-600 bg-blue-50' },
  great: { label: 'Great', color: 'text-green-600 bg-green-50' },
};

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function SleepLogCard({
  entry,
  sleepGoalMinutes,
  onConfirm,
  onCancel,
  isConfirmed = false,
}: SleepLogCardProps) {
  const duration = entry.duration ?? 0;
  const quality = entry.quality ? qualityConfig[entry.quality] : null;
  const meetsGoal = sleepGoalMinutes ? duration >= sleepGoalMinutes : null;

  return (
    <div className="bg-card rounded-2xl p-4 shadow-sm border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Moon className="h-5 w-5 text-indigo-500 shrink-0" />
          <h4 className="font-semibold text-foreground">Sleep</h4>
        </div>
        {quality && (
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', quality.color)}>
            {quality.label}
          </span>
        )}
      </div>

      {/* Duration */}
      <div className="flex items-baseline gap-4 mt-3">
        <div>
          <span className="text-3xl font-bold text-indigo-500">{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Time range */}
      {(entry.bedtime || entry.wakeTime) && (
        <p className="text-sm text-muted-foreground mt-1">
          {entry.bedtime && entry.wakeTime
            ? `${entry.bedtime} → ${entry.wakeTime}`
            : entry.bedtime
            ? `Bedtime: ${entry.bedtime}`
            : `Wake: ${entry.wakeTime}`}
        </p>
      )}

      {/* Goal status */}
      {meetsGoal !== null && (
        <p className={cn('text-xs font-medium mt-2', meetsGoal ? 'text-green-600' : 'text-amber-600')}>
          {meetsGoal
            ? `Goal met (${formatDuration(sleepGoalMinutes!)})`
            : `Below goal (${formatDuration(sleepGoalMinutes!)})`}
        </p>
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

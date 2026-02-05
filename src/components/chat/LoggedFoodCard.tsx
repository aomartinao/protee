import { CheckCircle, Dumbbell, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { FoodEntry } from '@/types';

interface LoggedFoodCardProps {
  entry: Partial<FoodEntry>;
  showCalories?: boolean;
  isMPSHit?: boolean;
  className?: string;
}

export function LoggedFoodCard({
  entry,
  showCalories = false,
  isMPSHit = false,
  className,
}: LoggedFoodCardProps) {
  const isCancelled = !!entry.deletedAt;

  const confidenceColor =
    entry.confidence === 'high'
      ? 'text-green-600 bg-green-50'
      : entry.confidence === 'medium'
      ? 'text-amber-600 bg-amber-50'
      : 'text-red-600 bg-red-50';

  const timestamp = entry.consumedAt || entry.createdAt;

  return (
    <div className={cn(
      'bg-card rounded-xl p-3 shadow-sm border border-border/50 overflow-hidden',
      isCancelled && 'opacity-50',
      className
    )}>
      <div className="flex items-center gap-3">
        {/* Image or protein badge */}
        {entry.imageData ? (
          <img
            src={entry.imageData}
            alt={entry.foodName}
            loading="lazy"
            className={cn(
              "w-12 h-12 rounded-lg object-cover flex-shrink-0",
              isCancelled && "grayscale"
            )}
          />
        ) : (
          <div className={cn(
            "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0",
            isCancelled ? "bg-muted" : "bg-primary/10"
          )}>
            <span className={cn(
              "text-sm font-bold",
              isCancelled ? "text-muted-foreground line-through" : "text-primary"
            )}>{entry.protein}g</span>
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-medium text-sm truncate",
              isCancelled && "line-through text-muted-foreground"
            )}>{entry.foodName}</span>
            {isMPSHit && !isCancelled && (
              <Dumbbell className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {timestamp && format(timestamp, 'h:mm a')}
            </span>
            {isCancelled ? (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-red-600 bg-red-50">
                cancelled
              </span>
            ) : entry.confidence && (
              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', confidenceColor)}>
                {entry.confidence}
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="text-right flex-shrink-0">
          <div className="flex items-center gap-1">
            {isCancelled ? (
              <>
                <XCircle className="h-3.5 w-3.5 text-red-400" />
                <span className="font-semibold text-muted-foreground line-through">{entry.protein}g</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                <span className="font-semibold text-primary">{entry.protein}g</span>
              </>
            )}
          </div>
          {showCalories && entry.calories !== undefined && entry.calories > 0 && !isCancelled && (
            <span className="text-xs text-amber-600">{entry.calories} kcal</span>
          )}
        </div>
      </div>
    </div>
  );
}

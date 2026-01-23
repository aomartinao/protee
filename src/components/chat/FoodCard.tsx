import { Check, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FoodEntry } from '@/types';

interface FoodCardProps {
  entry: Partial<FoodEntry>;
  onConfirm?: () => void;
  onEdit?: () => void;
  showActions?: boolean;
  showCalories?: boolean;
}

export function FoodCard({
  entry,
  onConfirm,
  onEdit,
  showActions = true,
  showCalories = false,
}: FoodCardProps) {
  const confidenceVariant =
    entry.confidence === 'high'
      ? 'success'
      : entry.confidence === 'medium'
      ? 'warning'
      : 'error';

  return (
    <div className="bg-background rounded-lg p-3 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium">{entry.foodName}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-bold text-primary">
              {entry.protein}g
            </span>
            <span className="text-sm text-muted-foreground">protein</span>
            {showCalories && entry.calories !== undefined && entry.calories > 0 && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-2xl font-bold text-amber-500">
                  {entry.calories}
                </span>
                <span className="text-sm text-muted-foreground">kcal</span>
              </>
            )}
          </div>
        </div>
        {entry.confidence && (
          <Badge variant={confidenceVariant} className={cn('capitalize')}>
            {entry.confidence}
          </Badge>
        )}
      </div>

      {showActions && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={onEdit}
          >
            <Edit2 className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button size="sm" className="flex-1" onClick={onConfirm}>
            <Check className="h-4 w-4 mr-1" />
            Confirm
          </Button>
        </div>
      )}
    </div>
  );
}

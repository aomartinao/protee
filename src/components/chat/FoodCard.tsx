import { useState } from 'react';
import { Check, Edit2, CheckCircle, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { FoodEntry } from '@/types';
import { format } from 'date-fns';

interface FoodCardProps {
  entry: Partial<FoodEntry>;
  onConfirm?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
  onSaveEdit?: (updates: Partial<FoodEntry>) => void;
  showActions?: boolean;
  showCalories?: boolean;
  isConfirmed?: boolean;
}

export function FoodCard({
  entry,
  onConfirm,
  onEdit,
  onDelete,
  onCancel,
  onSaveEdit,
  showActions = true,
  showCalories = false,
  isConfirmed = false,
}: FoodCardProps) {
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(entry.foodName || '');
  const [editedProtein, setEditedProtein] = useState(entry.protein?.toString() || '0');
  const [editedCalories, setEditedCalories] = useState(entry.calories?.toString() || '');
  const [editedTime, setEditedTime] = useState(
    entry.consumedAt ? format(entry.consumedAt, 'HH:mm') : format(new Date(), 'HH:mm')
  );

  const confidenceColor =
    entry.confidence === 'high'
      ? 'text-green-600 bg-green-50'
      : entry.confidence === 'medium'
      ? 'text-amber-600 bg-amber-50'
      : 'text-red-600 bg-red-50';

  const handleEditClick = () => {
    if (onSaveEdit) {
      // Inline edit mode - transform card
      setEditedName(entry.foodName || '');
      setEditedProtein(entry.protein?.toString() || '0');
      setEditedCalories(entry.calories?.toString() || '');
      setEditedTime(entry.consumedAt ? format(entry.consumedAt, 'HH:mm') : format(new Date(), 'HH:mm'));
      setIsEditing(true);
    } else if (onEdit) {
      // Legacy behavior - call onEdit callback
      onEdit();
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    if (!onSaveEdit) return;

    // Build consumedAt from time input
    const baseDate = entry.consumedAt ? new Date(entry.consumedAt) : new Date();
    const [hours, minutes] = editedTime.split(':').map(Number);
    const consumedAt = new Date(baseDate);
    consumedAt.setHours(hours, minutes, 0, 0);

    onSaveEdit({
      foodName: editedName,
      protein: parseInt(editedProtein, 10) || 0,
      calories: editedCalories ? parseInt(editedCalories, 10) : undefined,
      consumedAt,
    });
    setIsEditing(false);
  };

  // Edit mode UI
  if (isEditing && !isConfirmed) {
    return (
      <div className="bg-card rounded-2xl p-4 shadow-sm border border-primary/50">
        <div className="space-y-3">
          {/* Food name input */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Food</label>
            <Input
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              className="h-10 mt-1"
              placeholder="Food name"
            />
          </div>

          {/* Protein and calories row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">Protein (g)</label>
              <Input
                type="number"
                value={editedProtein}
                onChange={(e) => setEditedProtein(e.target.value)}
                className="h-10 mt-1"
                min={0}
                max={500}
              />
            </div>
            {showCalories && (
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground">Calories</label>
                <Input
                  type="number"
                  value={editedCalories}
                  onChange={(e) => setEditedCalories(e.target.value)}
                  className="h-10 mt-1"
                  min={0}
                  max={10000}
                  placeholder="kcal"
                />
              </div>
            )}
          </div>

          {/* Time input */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Time</label>
            <Input
              type="time"
              value={editedTime}
              onChange={(e) => setEditedTime(e.target.value)}
              className="h-10 mt-1"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1 h-10 rounded-xl"
              onClick={handleCancelEdit}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1 h-10 rounded-xl"
              onClick={handleSaveEdit}
            >
              <Check className="h-4 w-4 mr-1.5" />
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl p-4 shadow-sm border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-foreground truncate">{entry.foodName}</h4>
          {entry.consumedAt && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(entry.consumedAt, 'h:mm a')}
            </p>
          )}
        </div>
        {entry.confidence && (
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', confidenceColor)}>
            {entry.confidence}
          </span>
        )}
      </div>

      {/* Nutrition Stats */}
      <div className="flex items-baseline gap-4 mt-3">
        <div>
          <span className="text-3xl font-bold text-primary">{entry.protein}</span>
          <span className="text-sm text-muted-foreground ml-1">g protein</span>
        </div>
        {showCalories && entry.calories !== undefined && entry.calories > 0 && (
          <div>
            <span className="text-3xl font-bold text-amber-500">{entry.calories}</span>
            <span className="text-sm text-muted-foreground ml-1">kcal</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {showActions && !isConfirmed && (
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
            variant="outline"
            className="flex-1 h-10 rounded-xl"
            onClick={handleEditClick}
          >
            <Edit2 className="h-4 w-4 mr-1.5" />
            Edit
          </Button>
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

      {/* Confirmed state - show edit/delete buttons */}
      {isConfirmed && showActions && (
        <div className="flex gap-2 mt-4">
          <div className="flex items-center gap-1.5 flex-1 text-green-600 text-sm">
            <CheckCircle className="h-4 w-4" />
            <span className="font-medium">Added</span>
          </div>
          {onEdit && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
              onClick={onEdit}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { FoodEntry, ConfidenceLevel } from '@/types';

interface FoodEntryEditDialogProps {
  entry: FoodEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (entryId: number, updates: Partial<FoodEntry>) => Promise<void>;
  onRefine?: (originalAnalysis: {
    foodName: string;
    protein: number;
    calories: number;
    confidence: ConfidenceLevel;
    consumedAt?: { parsedDate: string; parsedTime: string };
  }, refinement: string) => Promise<{ foodName: string; protein: number; calories?: number } | null>;
  showCalories?: boolean;
  hasAIAccess?: boolean;
}

export function FoodEntryEditDialog({
  entry,
  open,
  onOpenChange,
  onSave,
  onRefine,
  showCalories = false,
  hasAIAccess = false,
}: FoodEntryEditDialogProps) {
  const [editName, setEditName] = useState('');
  const [editProtein, setEditProtein] = useState('');
  const [editCalories, setEditCalories] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editRefinement, setEditRefinement] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize form when entry changes
  useEffect(() => {
    if (entry) {
      setEditName(entry.foodName);
      setEditProtein(entry.protein.toString());
      setEditCalories(entry.calories?.toString() || '');
      setEditDate(entry.date);
      const timeSource = entry.consumedAt || entry.createdAt;
      setEditTime(format(timeSource, 'HH:mm'));
      setEditRefinement('');
    }
  }, [entry]);

  const handleSave = async () => {
    if (!entry?.id) return;

    setIsSaving(true);
    try {
      let consumedAt: Date | undefined;
      if (editDate && editTime) {
        const [year, month, day] = editDate.split('-').map(Number);
        const [hours, minutes] = editTime.split(':').map(Number);
        consumedAt = new Date(year, month - 1, day, hours, minutes);
      }

      const updates: Partial<FoodEntry> = {
        foodName: editName,
        protein: parseInt(editProtein, 10) || 0,
        calories: editCalories ? parseInt(editCalories, 10) : undefined,
        date: editDate || entry.date,
        consumedAt,
        updatedAt: new Date(),
      };

      await onSave(entry.id, updates);
      onOpenChange(false);
      setEditRefinement('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefine = async () => {
    if (!onRefine || !editRefinement.trim() || !hasAIAccess) return;

    setIsRefining(true);
    try {
      const originalAnalysis = {
        foodName: editName,
        protein: parseInt(editProtein, 10) || 0,
        calories: editCalories ? parseInt(editCalories, 10) : 0,
        confidence: (entry?.confidence || 'medium') as ConfidenceLevel,
        consumedAt: editDate && editTime
          ? { parsedDate: editDate, parsedTime: editTime }
          : undefined,
      };

      const result = await onRefine(originalAnalysis, editRefinement);
      if (result) {
        setEditName(result.foodName);
        setEditProtein(result.protein.toString());
        if (result.calories !== undefined) {
          setEditCalories(result.calories.toString());
        }
        setEditRefinement('');
      }
    } finally {
      setIsRefining(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setEditRefinement('');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-md max-h-[70vh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
        style={{
          top: '5%',
          transform: 'translateX(-50%)',
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit Entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
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
            {showCalories && (
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

          {/* AI Refinement Section */}
          {hasAIAccess && onRefine && (
            <div className="pt-4 border-t space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Or describe what changed
              </label>
              <div className="flex gap-2">
                <Input
                  value={editRefinement}
                  onChange={(e) => setEditRefinement(e.target.value)}
                  placeholder="e.g., it was 200g not 100g..."
                  disabled={isRefining}
                  className="h-11"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleRefine();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-11 w-11"
                  onClick={handleRefine}
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
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

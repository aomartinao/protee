import { useState, useEffect } from 'react';
import { Target, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface GoalSetterProps {
  currentGoal: number;
  currentCalorieGoal?: number;
  calorieTrackingEnabled?: boolean;
  onSave: (goal: number, calorieGoal?: number) => void;
}

export function GoalSetter({ currentGoal, currentCalorieGoal, calorieTrackingEnabled, onSave }: GoalSetterProps) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState(currentGoal.toString());
  const [calorieGoal, setCalorieGoal] = useState(currentCalorieGoal?.toString() || '');

  useEffect(() => {
    setGoal(currentGoal.toString());
    setCalorieGoal(currentCalorieGoal?.toString() || '');
  }, [currentGoal, currentCalorieGoal, open]);

  const handleSave = () => {
    const numGoal = parseInt(goal, 10);
    const numCalorieGoal = calorieGoal ? parseInt(calorieGoal, 10) : undefined;
    if (numGoal > 0 && numGoal <= 500) {
      onSave(numGoal, numCalorieGoal);
      setOpen(false);
    }
  };

  const presets = [100, 120, 150, 180, 200];
  const caloriePresets = [1500, 1800, 2000, 2200, 2500];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Target className="h-4 w-4" />
          Goal: {currentGoal}g
          {calorieTrackingEnabled && currentCalorieGoal && (
            <span className="text-amber-600">· {currentCalorieGoal} kcal</span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Daily Goals</DialogTitle>
          <DialogDescription>
            Choose your daily nutrition targets.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Protein Goal */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4 text-primary" />
              Protein Goal
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset}
                  variant={goal === preset.toString() ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGoal(preset.toString())}
                >
                  {preset}g
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                min={1}
                max={500}
                className="w-24"
              />
              <span className="text-muted-foreground">grams per day</span>
            </div>
          </div>

          {/* Calorie Goal */}
          {calorieTrackingEnabled && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Zap className="h-4 w-4 text-amber-500" />
                Calorie Goal
              </div>
              <div className="flex flex-wrap gap-2">
                {caloriePresets.map((preset) => (
                  <Button
                    key={preset}
                    variant={calorieGoal === preset.toString() ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCalorieGoal(preset.toString())}
                  >
                    {preset}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={calorieGoal}
                  onChange={(e) => setCalorieGoal(e.target.value)}
                  min={500}
                  max={10000}
                  className="w-24"
                  placeholder="2000"
                />
                <span className="text-muted-foreground">kcal per day</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Goals</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

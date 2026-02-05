import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { getFrequentMeals, type FrequentMeal } from '@/db';

interface QuickLogShortcutsProps {
  onSelect: (prefillText: string) => void;
  disabled?: boolean;
}

export function QuickLogShortcuts({ onSelect, disabled }: QuickLogShortcutsProps) {
  const [frequentMeals, setFrequentMeals] = useState<FrequentMeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadFrequentMeals() {
      try {
        const meals = await getFrequentMeals(5, 30);
        setFrequentMeals(meals);
      } catch (error) {
        console.error('Failed to load frequent meals:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadFrequentMeals();
  }, []);

  if (isLoading || frequentMeals.length === 0) {
    return null;
  }

  return (
    <div className="px-4 pb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <Clock className="h-3 w-3" />
        <span>Quick log</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {frequentMeals.map((meal) => (
          <button
            key={meal.foodName}
            onClick={() => onSelect(meal.originalName)}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-full transition-colors"
          >
            <span className="truncate max-w-[140px]">{meal.originalName}</span>
            <span className="text-primary font-medium">{meal.protein}g</span>
          </button>
        ))}
      </div>
    </div>
  );
}

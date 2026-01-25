import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Dumbbell, Plus } from 'lucide-react';
import { ProgressRing } from './ProgressRing';
import { Button } from '@/components/ui/button';
import { calculateMPSHits, cn, formatTime } from '@/lib/utils';
import type { FoodEntry, StreakInfo } from '@/types';

function getMPSWindowStatus(lastHitTime: Date | null): {
  minutesSince: number | null;
  label: string;
  dotColor: string;
} {
  if (!lastHitTime) {
    return { minutesSince: null, label: 'Ready', dotColor: 'bg-green-500' };
  }

  const now = new Date();
  const minutesSince = Math.floor((now.getTime() - lastHitTime.getTime()) / 60000);

  if (minutesSince < 90) {
    return { minutesSince, label: formatTimeSince(minutesSince), dotColor: 'bg-orange-500' };
  } else if (minutesSince < 120) {
    return { minutesSince, label: formatTimeSince(minutesSince), dotColor: 'bg-yellow-500' };
  } else {
    return { minutesSince, label: formatTimeSince(minutesSince), dotColor: 'bg-green-500' };
  }
}

function formatTimeSince(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) {
    return `${mins}m`;
  }
  return `${hours}h ${mins}m`;
}

interface DailyProgressProps {
  entries: FoodEntry[];
  goal: number;
  calorieGoal?: number;
  calorieTrackingEnabled?: boolean;
  mpsTrackingEnabled?: boolean;
  streak: StreakInfo;
}

export function DailyProgress({ entries, goal, calorieGoal, calorieTrackingEnabled, mpsTrackingEnabled, streak }: DailyProgressProps) {
  const navigate = useNavigate();

  const totalProtein = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.protein, 0),
    [entries]
  );

  const totalCalories = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.calories || 0), 0),
    [entries]
  );

  const mpsHits = useMemo(
    () => mpsTrackingEnabled ? calculateMPSHits(entries) : [],
    [entries, mpsTrackingEnabled]
  );

  const lastMPSHitTime = useMemo(() => {
    if (mpsHits.length === 0) return null;
    const lastHit = mpsHits[mpsHits.length - 1];
    return lastHit.consumedAt || lastHit.createdAt;
  }, [mpsHits]);

  const mpsWindowStatus = getMPSWindowStatus(lastMPSHitTime);

  const showDualRings = calorieTrackingEnabled && calorieGoal;

  return (
    <div className="flex flex-col min-h-full">
      {/* Hero Section - Progress Ring(s) */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-4 py-8 cursor-pointer"
        onClick={() => navigate('/chat')}
      >
        {showDualRings ? (
          <div className="flex gap-6 items-center">
            <ProgressRing
              current={totalProtein}
              goal={goal}
              size={140}
              strokeWidth={10}
              variant="protein"
              label="Protein"
              unit="g"
            />
            <ProgressRing
              current={totalCalories}
              goal={calorieGoal}
              size={140}
              strokeWidth={10}
              variant="calories"
              label="Calories"
              unit=""
            />
          </div>
        ) : (
          <ProgressRing current={totalProtein} goal={goal} size={200} strokeWidth={12} />
        )}

        {/* Tap to log hint */}
        <p className="text-xs text-muted-foreground mt-4">Tap to log food</p>
      </div>

      {/* Bottom Section - Stats & Entries */}
      <div className="bg-card rounded-t-3xl shadow-lg px-4 pt-5 pb-4 space-y-4">
        {/* Quick Stats Row */}
        <div className="flex items-center justify-around">
          {/* Streak */}
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5 text-orange-500">
              <Flame className="h-5 w-5" />
              <span className="text-2xl font-bold">{streak.currentStreak}</span>
            </div>
            <span className="text-xs text-muted-foreground">day streak</span>
          </div>

          {/* Divider */}
          <div className="h-10 w-px bg-border" />

          {/* MPS or Entries count */}
          {mpsTrackingEnabled ? (
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1.5 text-purple-500">
                <Dumbbell className="h-5 w-5" />
                <span className="text-2xl font-bold">{mpsHits.length}</span>
                <span className="text-sm text-muted-foreground">/3</span>
              </div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                {mpsHits.length > 0 ? (
                  <>
                    <span className={cn('w-1.5 h-1.5 rounded-full', mpsWindowStatus.dotColor)} />
                    {mpsWindowStatus.label}
                  </>
                ) : 'MPS hits'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-foreground">{entries.length}</span>
              <span className="text-xs text-muted-foreground">entries today</span>
            </div>
          )}

          {/* Divider */}
          <div className="h-10 w-px bg-border" />

          {/* Quick Add Button */}
          <Button
            size="icon"
            className="h-12 w-12 rounded-full shadow-md"
            onClick={(e) => {
              e.stopPropagation();
              navigate('/chat');
            }}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>

        {/* Today's Entries */}
        {entries.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
              Today's Entries
            </h3>
            <div className="space-y-1.5">
              {entries.slice().reverse().slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/50"
                >
                  {entry.imageData ? (
                    <img
                      src={entry.imageData}
                      alt={entry.foodName}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">{entry.protein}g</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{entry.foodName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(entry.consumedAt || entry.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-primary">{entry.protein}g</span>
                    {calorieTrackingEnabled && entry.calories ? (
                      <p className="text-xs text-amber-600">{entry.calories} kcal</p>
                    ) : null}
                  </div>
                </div>
              ))}
              {entries.length > 5 && (
                <button
                  className="w-full text-center text-xs text-muted-foreground py-2 hover:text-foreground transition-colors"
                  onClick={() => navigate('/history')}
                >
                  View all {entries.length} entries
                </button>
              )}
            </div>
          </div>
        )}

        {entries.length === 0 && (
          <div className="text-center py-6">
            <p className="text-muted-foreground">No entries yet today</p>
            <p className="text-sm text-muted-foreground mt-1">Tap above to log your first meal</p>
          </div>
        )}
      </div>
    </div>
  );
}

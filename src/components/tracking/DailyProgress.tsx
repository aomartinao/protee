import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Flame, Dumbbell, Plus, ChevronLeft, ChevronRight, History } from 'lucide-react';
import { ProgressRing } from './ProgressRing';
import { Button } from '@/components/ui/button';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
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
  selectedDate: Date;
  isToday: boolean;
  onPrevDay: () => void;
  onNextDay?: () => void;
  onToday?: () => void;
  onEditEntry?: (entry: FoodEntry) => void;
  onDeleteEntry?: (id: number) => void;
}

export function DailyProgress({
  entries,
  goal,
  calorieGoal,
  calorieTrackingEnabled,
  mpsTrackingEnabled,
  streak,
  selectedDate,
  isToday,
  onPrevDay,
  onNextDay,
  onToday,
  onEditEntry,
  onDeleteEntry,
}: DailyProgressProps) {
  const navigate = useNavigate();

  // Swipe state for date navigation
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);
  const [isSwiping, setIsSwiping] = useState(false);

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

  // Swipe handlers for date navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
    setIsSwiping(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - swipeStartX.current;
    const deltaY = e.touches[0].clientY - swipeStartY.current;

    // Only consider horizontal swipes
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
      setIsSwiping(true);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isSwiping) return;

    const deltaX = e.changedTouches[0].clientX - swipeStartX.current;
    const SWIPE_THRESHOLD = 50;

    if (deltaX > SWIPE_THRESHOLD) {
      onPrevDay();
    } else if (deltaX < -SWIPE_THRESHOLD && onNextDay) {
      onNextDay();
    }

    setIsSwiping(false);
  };

  const handleRingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSwiping) {
      navigate('/settings');
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* Date Label */}
      <div className="flex items-center justify-center px-4 py-2">
        <button
          onClick={onToday}
          className={cn(
            'text-center transition-colors',
            onToday && 'hover:text-primary active:text-primary'
          )}
        >
          <span className="font-semibold">
            {isToday ? 'Today' : format(selectedDate, 'EEEE')}
          </span>
          {!isToday && (
            <p className="text-xs text-muted-foreground">
              {format(selectedDate, 'MMM d')} · tap for today
            </p>
          )}
        </button>
      </div>

      {/* Hero Section - Progress Ring(s) with Navigation Arrows */}
      <div
        className="flex-1 flex flex-col justify-center"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Rings with arrows - centered together */}
        <div className="flex items-center justify-center gap-1">
          {/* Left Arrow */}
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onPrevDay();
            }}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>

          {/* Progress Rings - tap to open settings */}
          <div
            className="cursor-pointer"
            onClick={handleRingsClick}
          >
            {showDualRings ? (
              <div className="flex gap-4 items-center">
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
              <ProgressRing current={totalProtein} goal={goal} size={200} strokeWidth={12} label="Protein" />
            )}
          </div>

          {/* Right Arrow */}
          <div
            className={cn('h-10 w-10 flex-shrink-0', !onNextDay && 'opacity-30')}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => onNextDay?.()}
              disabled={!onNextDay}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        </div>

      </div>

      {/* Bottom Section - Stats & Entries */}
      <div className="mt-6 bg-card rounded-t-3xl shadow-lg flex flex-col min-h-[40vh]">
        {/* Quick Stats Row */}
        <div className="flex items-center justify-around px-4 py-4 border-b border-border/50">
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
              <span className="text-xs text-muted-foreground">entries</span>
            </div>
          )}

          {/* Divider */}
          <div className="h-10 w-px bg-border" />

          {/* Quick Add Button - only for today */}
          {isToday ? (
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
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-foreground">{entries.length}</span>
              <span className="text-xs text-muted-foreground">entries</span>
            </div>
          )}
        </div>

        {/* Entries Section - Scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {entries.length > 0 ? (
            <div className="space-y-1.5">
              {[...entries].sort((a, b) => {
                const timeA = (a.consumedAt || a.createdAt).getTime();
                const timeB = (b.consumedAt || b.createdAt).getTime();
                return timeB - timeA; // Most recent first
              }).map((entry) => (
                <SwipeableRow
                  key={entry.id}
                  itemName={entry.foodName}
                  onEdit={isToday && onEditEntry ? () => onEditEntry(entry) : undefined}
                  onDelete={isToday && onDeleteEntry && entry.id ? () => onDeleteEntry(entry.id!) : undefined}
                >
                  <div className="flex items-center gap-3 p-2.5">
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
                </SwipeableRow>
              ))}
            </div>
          ) : (
            <div
              className={cn(
                "flex flex-col items-center justify-center py-8 text-center",
                isToday && "cursor-pointer hover:bg-muted/30 rounded-xl transition-colors"
              )}
              onClick={isToday ? () => navigate('/chat') : undefined}
            >
              <p className="text-muted-foreground">
                {isToday ? 'Tap here to log your first meal' : 'No entries this day'}
              </p>
            </div>
          )}
        </div>

        {/* View History Link */}
        <button
          className="flex items-center justify-center gap-2 py-4 border-t border-border/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => navigate('/history')}
        >
          <History className="h-4 w-4" />
          View full history
        </button>
      </div>
    </div>
  );
}

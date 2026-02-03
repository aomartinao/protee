import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Flame, Dumbbell, ChevronLeft, ChevronRight, History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { ProgressRing } from './ProgressRing';
import { Button } from '@/components/ui/button';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { calculateMPSHits, cn, formatTime } from '@/lib/utils';
import type { FoodEntry, StreakInfo } from '@/types';

// MPS window thresholds (in minutes)
// Adding 5 minutes to account for eating time
const MPS_RED_THRESHOLD = 125;    // 2:05 - still in refractory period
const MPS_YELLOW_THRESHOLD = 185; // 3:05 - approaching optimal window
// After 3:05 - green, ready for next hit

function getMPSWindowStatus(lastHitTime: Date | null): {
  minutesSince: number | null;
  dotColor: string;
} {
  if (!lastHitTime) {
    return { minutesSince: null, dotColor: 'bg-green-500' };
  }

  // Ensure lastHitTime is a Date object (might be string from IndexedDB)
  const hitDate = lastHitTime instanceof Date ? lastHitTime : new Date(lastHitTime);
  const now = new Date();
  const minutesSince = Math.floor((now.getTime() - hitDate.getTime()) / 60000);

  if (minutesSince < MPS_RED_THRESHOLD) {
    return { minutesSince, dotColor: 'bg-red-500' };
  } else if (minutesSince < MPS_YELLOW_THRESHOLD) {
    return { minutesSince, dotColor: 'bg-amber-500' };
  } else {
    return { minutesSince, dotColor: 'bg-green-500' };
  }
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
  onEditEntry,
  onDeleteEntry,
}: DailyProgressProps) {
  const navigate = useNavigate();
  const { setShowFloatingAddButton } = useStore();

  // Show floating add button only on today
  useEffect(() => {
    setShowFloatingAddButton(isToday);
    return () => setShowFloatingAddButton(false);
  }, [isToday, setShowFloatingAddButton]);

  // Swipe state for date navigation
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);
  const [isSwiping, setIsSwiping] = useState(false);

  // MPS timer state - for live updating display
  const [colonVisible, setColonVisible] = useState(true);
  const [, setTickCount] = useState(0); // Force re-render every minute

  // Blink the colon every second
  useEffect(() => {
    if (!mpsTrackingEnabled) return;
    const blinkInterval = setInterval(() => {
      setColonVisible((v) => !v);
    }, 1000);
    return () => clearInterval(blinkInterval);
  }, [mpsTrackingEnabled]);

  // Update time display every minute
  useEffect(() => {
    if (!mpsTrackingEnabled) return;
    const minuteInterval = setInterval(() => {
      setTickCount((c) => c + 1);
    }, 60000);
    return () => clearInterval(minuteInterval);
  }, [mpsTrackingEnabled]);

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
    const time = lastHit.consumedAt || lastHit.createdAt;
    // Ensure it's a Date object
    return time instanceof Date ? time : new Date(time);
  }, [mpsHits]);

  // Create a Set of MPS hit entry IDs for quick lookup
  const mpsHitIds = useMemo(() => {
    return new Set(mpsHits.map(hit => hit.id).filter(Boolean));
  }, [mpsHits]);

  const mpsWindowStatus = getMPSWindowStatus(lastMPSHitTime);

  const effectiveCalorieGoal = calorieGoal || 2000; // Default to 2000 kcal
  const showDualRings = calorieTrackingEnabled;

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

  return (
    <div className="flex flex-col min-h-full relative">
      {/* Date Label */}
      <div className="flex items-center justify-center px-4 py-2">
        <div className="text-center">
          <span className="font-semibold">
            {isToday ? 'Today' : `${format(selectedDate, 'EEEE')}, ${format(selectedDate, 'MMM d')}`}
          </span>
        </div>
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

          {/* Progress Rings */}
          <div>
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
                  goal={effectiveCalorieGoal}
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
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex flex-col items-center focus:outline-none active:opacity-70 transition-opacity">
                  <div className="flex items-center gap-1.5 text-purple-500">
                    <Dumbbell className="h-5 w-5" />
                    <span className="text-2xl font-bold">{mpsHits.length}</span>
                    <span className="text-sm text-muted-foreground">/3</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">MPS hits</span>
                    {isToday && mpsHits.length > 0 && mpsWindowStatus.minutesSince !== null && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className={cn('w-1.5 h-1.5 rounded-full', mpsWindowStatus.dotColor)} />
                        <span className="font-mono">
                          {String(Math.floor(mpsWindowStatus.minutesSince / 60)).padStart(2, '0')}
                          <span className={colonVisible ? 'opacity-100' : 'opacity-0'}>:</span>
                          {String(mpsWindowStatus.minutesSince % 60).padStart(2, '0')}
                        </span>
                      </span>
                    )}
                  </div>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Muscle Protein Synthesis (MPS)</h4>
                  <p className="text-sm text-muted-foreground">
                    MPS is the process by which your body repairs and builds muscle in response to
                    strength training and protein intake. To stimulate MPS effectively, aim for
                    ~20–40g of high-quality protein per meal, spaced every 3–5 hours, for 3–4 protein
                    intakes per day, each providing enough leucine to trigger muscle building (aka MPS hits).
                    Consistently meeting total daily protein intake drives long-term muscle gain.
                  </p>
                  <a
                    href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Source: ISSN Position Stand →
                  </a>
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      <strong>How it's calculated:</strong> Each meal with ≥25g of protein counts as an MPS hit,
                      but only if it's been 3+ hours since your last hit. Aim for 3 hits per day.
                    </p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-foreground">{entries.length}</span>
              <span className="text-xs text-muted-foreground">entries</span>
            </div>
          )}

          {/* Divider and Entries count - only shown when MPS is enabled */}
          {mpsTrackingEnabled && (
            <>
              <div className="h-10 w-px bg-border" />
              <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-foreground">{entries.length}</span>
                <span className="text-xs text-muted-foreground">entries</span>
              </div>
            </>
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
                        loading="lazy"
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
                    <div className="text-right flex items-center gap-1.5">
                      {mpsTrackingEnabled && entry.id && mpsHitIds.has(entry.id) && (
                        <Dumbbell className="h-3.5 w-3.5 text-purple-500" />
                      )}
                      <div>
                        <span className="text-sm font-semibold text-primary">{entry.protein}g</span>
                        {calorieTrackingEnabled && entry.calories ? (
                          <p className="text-xs text-amber-600">{entry.calories} kcal</p>
                        ) : null}
                      </div>
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
              onClick={isToday ? () => navigate('/coach') : undefined}
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

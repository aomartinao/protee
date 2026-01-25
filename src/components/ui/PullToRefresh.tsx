import React, { useRef, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  disabled?: boolean;
  className?: string;
}

const PULL_THRESHOLD = 80;
const MAX_PULL = 120;

export function PullToRefresh({
  children,
  onRefresh,
  disabled = false,
  className,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || isRefreshing) return;

      const container = containerRef.current;
      if (!container) return;

      // Only start pull if at the top of scroll
      if (container.scrollTop <= 0) {
        setTouchStart(e.touches[0].clientY);
      }
    },
    [disabled, isRefreshing]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (touchStart === null || disabled || isRefreshing) return;

      const container = containerRef.current;
      if (!container) return;

      // Only pull if at the top
      if (container.scrollTop > 0) {
        setTouchStart(null);
        setPullDistance(0);
        return;
      }

      const currentY = e.touches[0].clientY;
      const diff = currentY - touchStart;

      if (diff > 0) {
        // Prevent default scroll when pulling
        e.preventDefault();
        // Apply resistance - the further you pull, the harder it gets
        const resistance = Math.min(diff * 0.5, MAX_PULL);
        setPullDistance(resistance);
      }
    },
    [touchStart, disabled, isRefreshing]
  );

  const handleTouchEnd = useCallback(async () => {
    if (touchStart === null) return;

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing && !disabled) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD); // Keep indicator visible

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }

    setTouchStart(null);
  }, [touchStart, pullDistance, isRefreshing, disabled, onRefresh]);

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const shouldTrigger = pullDistance >= PULL_THRESHOLD;

  return (
    <div className={cn('relative flex flex-col h-full', className)}>
      {/* Pull indicator */}
      <div
        className={cn(
          'absolute left-0 right-0 flex justify-center items-center transition-all duration-200 z-10',
          pullDistance > 0 || isRefreshing ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          height: pullDistance > 0 ? pullDistance : isRefreshing ? PULL_THRESHOLD : 0,
          top: 0,
        }}
      >
        <div
          className={cn(
            'p-2 rounded-full bg-muted',
            shouldTrigger || isRefreshing ? 'bg-primary/10' : ''
          )}
        >
          <RefreshCw
            className={cn(
              'h-5 w-5 text-muted-foreground transition-colors duration-200',
              isRefreshing && 'animate-spin text-primary',
              shouldTrigger && !isRefreshing && 'text-primary'
            )}
            style={
              isRefreshing
                ? undefined
                : { transform: `rotate(${progress * 180}deg)` }
            }
          />
        </div>
      </div>

      {/* Content container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: pullDistance > 0 || isRefreshing
            ? `translateY(${isRefreshing ? PULL_THRESHOLD : pullDistance}px)`
            : undefined,
          transition: touchStart === null ? 'transform 0.2s ease-out' : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}

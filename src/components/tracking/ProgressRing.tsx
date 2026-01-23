import { cn } from '@/lib/utils';

interface ProgressRingProps {
  current: number;
  goal: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function ProgressRing({
  current,
  goal,
  size = 200,
  strokeWidth = 12,
  className,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = Math.min((current / goal) * 100, 100);
  const offset = circumference - (percentage / 100) * circumference;
  const isGoalMet = current >= goal;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      {/* White background container */}
      <div
        className="absolute bg-card rounded-full shadow-sm"
        style={{
          width: size - strokeWidth * 2,
          height: size - strokeWidth * 2,
        }}
      />
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e1db"
          strokeWidth={strokeWidth}
        />
        {/* Gradient definition for progress - amber/yellow */}
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isGoalMet ? '#22c55e' : '#f5b800'} />
            <stop offset="100%" stopColor={isGoalMet ? '#16a34a' : '#d97706'} />
          </linearGradient>
        </defs>
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn(
            'transition-all duration-700 ease-out',
            isGoalMet && 'shimmer-on-complete'
          )}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className={cn(
          'text-4xl font-bold transition-colors duration-300',
          isGoalMet ? 'text-green-500' : 'text-foreground'
        )}>
          {Math.round(current)}
        </span>
        <span className="text-sm text-muted-foreground">
          / {goal}g
        </span>
        {isGoalMet && (
          <span className="text-xs text-green-500 font-medium mt-1 animate-slide-up-fade">
            Goal met!
          </span>
        )}
      </div>
    </div>
  );
}

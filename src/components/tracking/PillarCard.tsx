import { Check, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PillarCardProps {
  icon: LucideIcon;
  iconColor: string;
  iconBgColor: string;
  title: string;
  current: string;
  goal: string;
  unit?: string;
  subtitle?: string;
  isGoalMet: boolean;
  onClick?: () => void;
}

export function PillarCard({
  icon: Icon,
  iconColor,
  iconBgColor,
  title,
  current,
  goal,
  unit,
  subtitle,
  isGoalMet,
  onClick,
}: PillarCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 p-3 rounded-2xl bg-card shadow-sm border border-border/50',
        'text-left transition-all duration-200 active:scale-[0.97]',
        onClick && 'cursor-pointer'
      )}
    >
      {/* Icon */}
      <div className={cn('p-2 rounded-xl flex-shrink-0', iconBgColor)}>
        <Icon className={cn('h-5 w-5', iconColor)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{title}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold leading-tight">{current}</span>
          <span className="text-xs text-muted-foreground">/ {goal}{unit && ` ${unit}`}</span>
        </div>
        {subtitle && (
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Status */}
      <div className="flex-shrink-0">
        {isGoalMet ? (
          <div className="p-1 rounded-full bg-green-500/15">
            <Check className="h-3.5 w-3.5 text-green-500" />
          </div>
        ) : (
          <div className="p-1 rounded-full bg-amber-500/15">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          </div>
        )}
      </div>
    </button>
  );
}

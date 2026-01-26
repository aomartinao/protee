import { cn } from '@/lib/utils';

interface ProteinSpinnerProps {
  className?: string;
  isSpinning?: boolean;
  progress?: number; // 0-1 for pull progress
}

export function ProteinSpinner({ className, isSpinning, progress = 0 }: ProteinSpinnerProps) {
  // 5 amino acid circles that form a pentagon when folded
  const aminoAcids = [0, 1, 2, 3, 4];
  const colors = ['#60a5fa', '#4ade80', '#facc15', '#f87171', '#a78bfa']; // blue, green, yellow, red, purple

  return (
    <div
      className={cn('relative w-8 h-8', className)}
      style={{
        animation: isSpinning ? 'spin 1.5s linear infinite' : undefined,
      }}
    >
      <svg viewBox="0 0 32 32" className="w-full h-full">
        {/* Connecting bonds - render first so circles appear on top */}
        {aminoAcids.map((i) => {
          const nextI = (i + 1) % 5;
          const foldAmount = isSpinning ? 1 : progress;

          // Linear positions (unfolded - horizontal chain)
          const linearX1 = 4 + i * 6;
          const linearX2 = 4 + nextI * 6;
          const linearY = 16;

          // Folded positions (pentagon)
          const angle1 = (i * 72 - 90) * (Math.PI / 180);
          const angle2 = (nextI * 72 - 90) * (Math.PI / 180);
          const radius = 10;
          const foldedX1 = 16 + Math.cos(angle1) * radius;
          const foldedY1 = 16 + Math.sin(angle1) * radius;
          const foldedX2 = 16 + Math.cos(angle2) * radius;
          const foldedY2 = 16 + Math.sin(angle2) * radius;

          // Interpolate
          const x1 = linearX1 + (foldedX1 - linearX1) * foldAmount;
          const y1 = linearY + (foldedY1 - linearY) * foldAmount;
          const x2 = linearX2 + (foldedX2 - linearX2) * foldAmount;
          const y2 = linearY + (foldedY2 - linearY) * foldAmount;

          // Only show bond to next adjacent amino acid (not closing the pentagon when unfolded)
          if (i === 4 && foldAmount < 0.8) return null;

          return (
            <line
              key={`bond-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              className="text-muted-foreground/40"
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })}

        {/* Amino acid circles */}
        {aminoAcids.map((i) => {
          const foldAmount = isSpinning ? 1 : progress;

          // Linear positions (unfolded)
          const linearX = 4 + i * 6;
          const linearY = 16;

          // Folded positions (pentagon shape, rotated so first is at top)
          const angle = (i * 72 - 90) * (Math.PI / 180);
          const radius = 10;
          const foldedX = 16 + Math.cos(angle) * radius;
          const foldedY = 16 + Math.sin(angle) * radius;

          // Interpolate between linear and folded
          const x = linearX + (foldedX - linearX) * foldAmount;
          const y = linearY + (foldedY - linearY) * foldAmount;

          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={3.5}
              fill={colors[i]}
              className="transition-all"
              style={{
                filter: isSpinning ? 'brightness(1.1)' : undefined,
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}

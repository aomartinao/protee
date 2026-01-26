import { useEffect, useState, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface ProteinSpinnerProps {
  className?: string;
  isSpinning?: boolean;
  progress?: number; // 0-1 for pull progress
}

// Generate random fold parameters for varied shapes
function generateFoldPattern() {
  return {
    baseAngle: Math.random() * 360,
    angleMultiplier: 100 + Math.random() * 80, // 100-180 degrees per step
    radiusBase: 5 + Math.random() * 3,
    radiusVariation: 1 + Math.random() * 2,
    verticalSpread: 1 + Math.random() * 1.5,
    centerOffsetX: -3 + Math.random() * 6,
    centerOffsetY: -3 + Math.random() * 6,
  };
}

export function ProteinSpinner({ className, isSpinning, progress = 0 }: ProteinSpinnerProps) {
  // Animate fold/unfold when spinning
  const [animatedFold, setAnimatedFold] = useState(0);
  const [foldPattern, setFoldPattern] = useState(generateFoldPattern);
  const cycleCountRef = useRef(0);

  useEffect(() => {
    if (!isSpinning) {
      setAnimatedFold(0);
      return;
    }

    let animationFrame: number;
    let startTime: number | null = null;
    const duration = 1500; // 1.5 seconds per fold/unfold cycle
    let lastCycle = -1;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      // Oscillate between 0 and 1 using sine wave
      const cycleProgress = (elapsed % (duration * 2)) / (duration * 2);
      const fold = Math.sin(cycleProgress * Math.PI * 2) * 0.5 + 0.5;

      // Detect when we complete a full cycle (fold then unfold)
      const currentCycle = Math.floor(elapsed / (duration * 2));
      if (currentCycle !== lastCycle && fold < 0.1) {
        lastCycle = currentCycle;
        cycleCountRef.current++;
        // Generate new random pattern for next fold
        setFoldPattern(generateFoldPattern());
      }

      setAnimatedFold(fold);
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isSpinning]);

  // 8 amino acids for a more complex chain
  const aminoAcids = [0, 1, 2, 3, 4, 5, 6, 7];

  // Colors representing different amino acid types (hydrophobic, polar, charged, etc.)
  const colors = useMemo(() => [
    '#3b82f6', // blue - polar
    '#22c55e', // green - hydrophobic
    '#eab308', // yellow - polar
    '#ef4444', // red - charged
    '#8b5cf6', // purple - aromatic
    '#06b6d4', // cyan - polar
    '#f97316', // orange - hydrophobic
    '#ec4899', // pink - charged
  ], []);

  // Use animated fold when spinning, otherwise use progress
  const foldAmount = isSpinning ? animatedFold : progress;

  // Calculate positions for each amino acid
  const getPosition = (index: number) => {
    // Unfolded: wavy horizontal chain
    const waveAmplitude = 3;
    const linearX = 4 + index * 4.5;
    const linearY = 20 + Math.sin(index * 0.8) * waveAmplitude;

    // Folded: use random pattern for varied shapes
    const { baseAngle, angleMultiplier, radiusBase, radiusVariation, verticalSpread, centerOffsetX, centerOffsetY } = foldPattern;
    const helixAngle = ((baseAngle + index * angleMultiplier) * Math.PI) / 180;
    const helixRadius = radiusBase + (index % 3) * radiusVariation;
    const vSpread = (index - 3.5) * verticalSpread;

    const foldedX = 20 + centerOffsetX + Math.cos(helixAngle) * helixRadius;
    const foldedY = 20 + centerOffsetY + Math.sin(helixAngle) * (helixRadius * 0.6) + vSpread;

    // Depth simulation - items "further back" are smaller
    const depth = Math.sin(helixAngle + Math.PI / 4);
    const foldedSize = 2.5 + depth * 0.8;

    // Interpolate
    const x = linearX + (foldedX - linearX) * foldAmount;
    const y = linearY + (foldedY - linearY) * foldAmount;
    const size = 2.2 + (foldedSize - 2.2) * foldAmount;

    return { x, y, size, depth };
  };

  // Sort by depth for proper layering when folded
  const sortedAcids = [...aminoAcids].sort((a, b) => {
    if (foldAmount < 0.5) return 0;
    return getPosition(a).depth - getPosition(b).depth;
  });

  return (
    <div className={cn('relative w-10 h-10', className)}>
      <svg viewBox="0 0 40 40" className="w-full h-full">
        {/* Backbone bonds - curved lines connecting amino acids */}
        {aminoAcids.slice(0, -1).map((i) => {
          const pos1 = getPosition(i);
          const pos2 = getPosition(i + 1);

          // Create curved path between amino acids
          const midX = (pos1.x + pos2.x) / 2;
          const midY = (pos1.y + pos2.y) / 2 - (1 - foldAmount) * 2;

          return (
            <path
              key={`bond-${i}`}
              d={`M ${pos1.x} ${pos1.y} Q ${midX} ${midY} ${pos2.x} ${pos2.y}`}
              fill="none"
              stroke="currentColor"
              className="text-muted-foreground/30"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          );
        })}

        {/* Hydrogen bonds (secondary structure) - only visible when folding */}
        {foldAmount > 0.3 && (
          <>
            {/* Simulate hydrogen bonds in helix */}
            {[0, 2, 4].map((i) => {
              if (i + 3 >= aminoAcids.length) return null;
              const pos1 = getPosition(i);
              const pos2 = getPosition(i + 3);
              const opacity = Math.min((foldAmount - 0.3) * 2, 0.3);

              return (
                <line
                  key={`hbond-${i}`}
                  x1={pos1.x}
                  y1={pos1.y}
                  x2={pos2.x}
                  y2={pos2.y}
                  stroke="#94a3b8"
                  strokeWidth={0.5}
                  strokeDasharray="2,2"
                  opacity={opacity}
                />
              );
            })}
          </>
        )}

        {/* Amino acid residues - rendered in depth order */}
        {sortedAcids.map((i) => {
          const { x, y, size, depth } = getPosition(i);

          // Brightness based on depth when folded
          const brightness = foldAmount > 0.5 ? 0.85 + depth * 0.15 : 1;

          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={size}
              fill={colors[i]}
              style={{
                filter: `brightness(${brightness})`,
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}

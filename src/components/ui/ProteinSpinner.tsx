import { cn } from '@/lib/utils';

interface ProteinSpinnerProps {
  className?: string;
  isSpinning?: boolean;
  progress?: number; // 0-1 for pull progress
}

export function ProteinSpinner({ className, isSpinning, progress = 0 }: ProteinSpinnerProps) {
  // 8 amino acids for a more complex chain
  const aminoAcids = [0, 1, 2, 3, 4, 5, 6, 7];

  // Colors representing different amino acid types (hydrophobic, polar, charged, etc.)
  const colors = [
    '#3b82f6', // blue - polar
    '#22c55e', // green - hydrophobic
    '#eab308', // yellow - polar
    '#ef4444', // red - charged
    '#8b5cf6', // purple - aromatic
    '#06b6d4', // cyan - polar
    '#f97316', // orange - hydrophobic
    '#ec4899', // pink - charged
  ];

  const foldAmount = isSpinning ? 1 : progress;

  // Calculate positions for each amino acid
  const getPosition = (index: number) => {
    // Unfolded: wavy horizontal chain
    const waveAmplitude = 3;
    const linearX = 4 + index * 4.5;
    const linearY = 20 + Math.sin(index * 0.8) * waveAmplitude;

    // Folded: compact globular structure with alpha helix characteristics
    // Creates a 3D helix projected to 2D with depth
    const helixAngle = (index * 135) * (Math.PI / 180); // Golden angle for natural packing
    const helixRadius = 6 + (index % 3) * 2; // Varying radius for complexity
    const verticalSpread = (index - 3.5) * 1.5; // Spread along vertical axis

    const foldedX = 20 + Math.cos(helixAngle) * helixRadius;
    const foldedY = 20 + Math.sin(helixAngle) * (helixRadius * 0.6) + verticalSpread;

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
    <div
      className={cn('relative w-10 h-10', className)}
      style={{
        animation: isSpinning ? 'spin 2s ease-in-out infinite' : undefined,
      }}
    >
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
                transition: 'all 0.1s ease-out',
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}

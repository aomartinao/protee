import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface ProteinSpinnerProps {
  className?: string;
  isSpinning?: boolean;
  progress?: number; // 0-1 for pull progress
}

// Atom positions for a simple protein-like molecule structure
const ATOMS = [
  // Central backbone
  { x: 0, y: 0, z: 0, color: '#3b82f6', size: 4 },      // blue - central
  { x: 8, y: 2, z: 4, color: '#22c55e', size: 3.5 },    // green
  { x: -6, y: -3, z: 5, color: '#eab308', size: 3.5 },  // yellow
  { x: 4, y: -6, z: -3, color: '#ef4444', size: 3.5 },  // red
  { x: -4, y: 5, z: -4, color: '#8b5cf6', size: 3.5 },  // purple
  // Outer atoms
  { x: 10, y: -4, z: -2, color: '#06b6d4', size: 3 },   // cyan
  { x: -8, y: 4, z: 2, color: '#f97316', size: 3 },     // orange
  { x: 2, y: 8, z: 3, color: '#ec4899', size: 3 },      // pink
  { x: -3, y: -7, z: -5, color: '#10b981', size: 3 },   // emerald
];

// Bonds connecting atoms (pairs of atom indices)
const BONDS = [
  [0, 1], [0, 2], [0, 3], [0, 4],
  [1, 5], [2, 6], [4, 7], [3, 8],
  [1, 4], [2, 3],
];

export function ProteinSpinner({ className, isSpinning, progress = 0 }: ProteinSpinnerProps) {
  const [rotation, setRotation] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isSpinning) {
      // When not spinning, use progress for partial rotation
      setRotation({ x: progress * 30, y: progress * 45 });
      return;
    }

    let animationFrame: number;
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      // Smooth continuous rotation
      const rotY = (elapsed * 0.05) % 360;
      const rotX = Math.sin(elapsed * 0.001) * 15 + 10;

      setRotation({ x: rotX, y: rotY });
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isSpinning, progress]);

  // Apply 3D rotation to get screen coordinates
  const project = (x: number, y: number, z: number) => {
    const radX = (rotation.x * Math.PI) / 180;
    const radY = (rotation.y * Math.PI) / 180;

    // Rotate around Y axis
    const x1 = x * Math.cos(radY) - z * Math.sin(radY);
    const z1 = x * Math.sin(radY) + z * Math.cos(radY);

    // Rotate around X axis
    const y1 = y * Math.cos(radX) - z1 * Math.sin(radX);
    const z2 = y * Math.sin(radX) + z1 * Math.cos(radX);

    // Perspective projection
    const scale = 100 / (100 + z2);
    const screenX = 20 + x1 * scale;
    const screenY = 20 + y1 * scale;

    return { x: screenX, y: screenY, z: z2, scale };
  };

  // Project all atoms
  const projectedAtoms = ATOMS.map((atom, i) => ({
    ...atom,
    ...project(atom.x, atom.y, atom.z),
    index: i,
  }));

  // Sort by z for proper depth ordering (back to front)
  const sortedAtoms = [...projectedAtoms].sort((a, b) => a.z - b.z);

  // Project bonds
  const projectedBonds = BONDS.map(([i, j]) => {
    const a1 = projectedAtoms[i];
    const a2 = projectedAtoms[j];
    return {
      x1: a1.x,
      y1: a1.y,
      x2: a2.x,
      y2: a2.y,
      z: (a1.z + a2.z) / 2,
      opacity: 0.2 + 0.3 * ((a1.scale + a2.scale) / 2),
    };
  });

  // Sort bonds by z
  const sortedBonds = [...projectedBonds].sort((a, b) => a.z - b.z);

  return (
    <div className={cn('relative w-10 h-10', className)}>
      <svg viewBox="0 0 40 40" className="w-full h-full">
        {/* Render bonds first (behind atoms) */}
        {sortedBonds.map((bond, i) => (
          <line
            key={`bond-${i}`}
            x1={bond.x1}
            y1={bond.y1}
            x2={bond.x2}
            y2={bond.y2}
            stroke="currentColor"
            className="text-muted-foreground"
            strokeWidth={1.2}
            strokeLinecap="round"
            opacity={bond.opacity}
          />
        ))}

        {/* Render atoms */}
        {sortedAtoms.map((atom) => {
          // Size and brightness based on depth
          const size = atom.size * atom.scale;
          const brightness = 0.7 + atom.scale * 0.4;

          return (
            <g key={atom.index}>
              {/* Subtle glow effect */}
              <circle
                cx={atom.x}
                cy={atom.y}
                r={size * 1.3}
                fill={atom.color}
                opacity={0.15 * atom.scale}
              />
              {/* Main atom */}
              <circle
                cx={atom.x}
                cy={atom.y}
                r={size}
                fill={atom.color}
                style={{
                  filter: `brightness(${brightness})`,
                }}
              />
              {/* Highlight for 3D effect */}
              <circle
                cx={atom.x - size * 0.25}
                cy={atom.y - size * 0.25}
                r={size * 0.35}
                fill="white"
                opacity={0.3 * atom.scale}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

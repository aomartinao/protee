import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO, startOfDay, subDays, isAfter, isBefore, isSameDay } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM-dd');
}

export function formatDisplayDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy');
}

export function formatTime(date: Date): string {
  return format(date, 'h:mm a');
}

export function getToday(): string {
  return formatDate(new Date());
}

export function isToday(date: string): boolean {
  return isSameDay(parseISO(date), new Date());
}

export function getDateRange(days: number): { start: string; end: string } {
  const end = startOfDay(new Date());
  const start = subDays(end, days - 1);
  return {
    start: formatDate(start),
    end: formatDate(end),
  };
}

export function isDateInRange(date: string, start: string, end: string): boolean {
  const d = parseISO(date);
  const s = parseISO(start);
  const e = parseISO(end);
  return (isAfter(d, s) || isSameDay(d, s)) && (isBefore(d, e) || isSameDay(d, e));
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function compressImage(file: File, maxWidth = 800, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      ctx?.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export function getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high':
      return 'text-green-600';
    case 'medium':
      return 'text-yellow-600';
    case 'low':
      return 'text-red-600';
  }
}

export function getConfidenceBadgeColor(confidence: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high':
      return 'bg-green-100 text-green-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'low':
      return 'bg-red-100 text-red-800';
  }
}

/**
 * Calculate MPS (Muscle Protein Synthesis) hits from food entries.
 * An MPS hit requires:
 * - At least 25g protein in a single entry
 * - At least 3 hours since the previous MPS hit
 */
export interface MPSHit {
  entry: { id?: number; foodName: string; protein: number; consumedAt?: Date; createdAt: Date };
  time: Date;
}

export function calculateMPSHits<T extends { protein: number; consumedAt?: Date; createdAt: Date }>(
  entries: T[]
): T[] {
  const MIN_PROTEIN = 25;
  const MIN_GAP_HOURS = 3;
  const MIN_GAP_MS = MIN_GAP_HOURS * 60 * 60 * 1000;

  // Filter entries with enough protein and sort by time
  const eligibleEntries = entries
    .filter((e) => e.protein >= MIN_PROTEIN)
    .sort((a, b) => {
      const timeA = (a.consumedAt || a.createdAt).getTime();
      const timeB = (b.consumedAt || b.createdAt).getTime();
      return timeA - timeB;
    });

  const mpsHits: T[] = [];
  let lastHitTime: number | null = null;

  for (const entry of eligibleEntries) {
    const entryTime = (entry.consumedAt || entry.createdAt).getTime();

    if (lastHitTime === null || entryTime - lastHitTime >= MIN_GAP_MS) {
      mpsHits.push(entry);
      lastHitTime = entryTime;
    }
  }

  return mpsHits;
}

// Haptic feedback types for different interactions
export type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

// Trigger haptic feedback (Android vibration, iOS currently unsupported in PWAs)
export function triggerHaptic(type: HapticType = 'light'): void {
  // Vibration patterns in ms for different feedback types
  const patterns: Record<HapticType, number | number[]> = {
    light: 10,
    medium: 25,
    heavy: 50,
    success: [10, 50, 10],
    warning: [25, 50, 25],
    error: [50, 100, 50],
  };

  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(patterns[type]);
  }
}

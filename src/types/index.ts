export interface FoodEntry {
  id?: number;
  syncId?: string;           // UUID for sync - unique across all devices (set on persist)
  date: string;              // YYYY-MM-DD
  source: 'text' | 'photo' | 'manual' | 'label';
  foodName: string;
  protein: number;           // grams
  calories?: number;         // kcal
  confidence: 'high' | 'medium' | 'low';
  imageData?: string;        // base64 encoded image for photo entries
  createdAt: Date;
  updatedAt?: Date;          // For sync conflict resolution (set on persist)
  deletedAt?: Date;          // Soft delete for sync (null = not deleted)
}

export interface UserSettings {
  id?: number;
  defaultGoal: number;       // daily protein target in grams
  calorieGoal?: number;      // daily calorie target in kcal
  calorieTrackingEnabled?: boolean;
  theme: 'light' | 'dark' | 'system';
  claudeApiKey?: string;     // user provides their own key
}

export interface DailyGoal {
  id?: number;
  syncId?: string;           // UUID for sync - unique across all devices
  date: string;              // YYYY-MM-DD
  goal: number;              // protein target for this specific day
  calorieGoal?: number;      // calorie target for this specific day
  updatedAt?: Date;          // For sync conflict resolution
  deletedAt?: Date;          // Soft delete for sync
}

export interface ChatMessage {
  id?: number;                  // Local IndexedDB ID
  syncId: string;               // UUID for sync - unique across all devices
  type: 'user' | 'assistant' | 'system';
  content: string;
  imageData?: string;
  foodEntry?: FoodEntry;
  foodEntrySyncId?: string;     // Link to confirmed food entry
  isLoading?: boolean;
  timestamp: Date;
  updatedAt?: Date;             // For sync conflict resolution
  deletedAt?: Date;             // Soft delete for sync
}

export interface DailyStats {
  date: string;
  totalProtein: number;
  totalCalories: number;
  goal: number;
  calorieGoal?: number;
  entries: FoodEntry[];
  goalMet: boolean;
  calorieGoalMet?: boolean;
}

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastGoalMetDate: string | null;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface AIAnalysisResult {
  foodName: string;
  protein: number;
  calories: number;
  confidence: ConfidenceLevel;
  reasoning?: string;
}

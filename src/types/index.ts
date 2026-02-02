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
  consumedAt?: Date;         // When the food was consumed (for time tracking)
  createdAt: Date;
  updatedAt?: Date;          // For sync conflict resolution (set on persist)
  deletedAt?: Date;          // Soft delete for sync (null = not deleted)
  syncStatus?: 'pending' | 'synced' | 'failed';  // Track sync state per entry
}

export interface UserSettings {
  id?: number;
  defaultGoal: number;       // daily protein target in grams
  calorieGoal?: number;      // daily calorie target in kcal
  proteinTrackingEnabled?: boolean;  // default true
  calorieTrackingEnabled?: boolean;
  mpsTrackingEnabled?: boolean;      // Muscle Protein Synthesis hits tracking
  theme: 'light' | 'dark' | 'system';
  claudeApiKey?: string;     // user provides their own key
  hasAdminApiKey?: boolean;  // true if admin has provided a concealed API key (read-only, from server)
  dietaryPreferences?: DietaryPreferences;  // for Food Buddy
  advisorOnboarded?: boolean;               // whether user completed advisor onboarding
  advisorOnboardingStarted?: boolean;       // whether user has started onboarding (enables settings)
  logWelcomeShown?: boolean;                // whether the log welcome message has been shown
  // Locale settings
  weekStartsOn?: 'sunday' | 'monday';       // which day the week starts on
  timeFormat?: '12h' | '24h';               // time display format
  unitSystem?: 'metric' | 'imperial';       // measurement system
  energyUnit?: 'kcal' | 'kj';               // energy display unit
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
  advisorQuickReplies?: string[];  // ["Sweet", "Savory", "No preference"] for advisor mode
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

export interface ConsumedAtInfo {
  parsedDate: string;  // YYYY-MM-DD
  parsedTime: string;  // HH:mm
}

export interface AIAnalysisResult {
  foodName: string;
  protein: number;
  calories: number;
  confidence: ConfidenceLevel;
  reasoning?: string;
  consumedAt?: ConsumedAtInfo;
}

export interface DietaryPreferences {
  allergies: string[];           // ["peanuts", "shellfish"]
  intolerances: string[];        // ["lactose", "gluten"]
  dietaryRestrictions: string[]; // ["vegetarian", "halal"]
  dislikes: string[];            // ["chicken", "brussels sprouts"]
  favorites: string[];           // ["greek yogurt", "salmon"]
  sleepTime?: string;            // "23:00" HH:mm format
  additionalNotes?: string;
}

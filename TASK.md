# GRRROMODE: Data Layer Foundation

**GitHub Issue:** https://github.com/aomartinao/protee/issues/41
**Branch:** `grrromode-data-layer`

## Your Mission

Implement the data layer foundation for GRRROMODE - adding sleep and training tracking capabilities to Protee.

## Tasks

1. **Add types** (`src/types/index.ts`)
   - Add `SleepQuality` type: `'poor' | 'fair' | 'good' | 'great'`
   - Add `SleepEntry` interface with: syncId, date, duration (minutes), bedtime?, wakeTime?, quality?, source, and standard sync fields
   - Add `MuscleGroup` type: `'push' | 'pull' | 'legs' | 'full_body' | 'cardio' | 'rest' | 'other'`
   - Add `TrainingEntry` interface with: syncId, date, muscleGroup, duration?, notes?, source, and standard sync fields
   - Extend `UserSettings` with: sleepGoalMinutes?, sleepTrackingEnabled?, trainingGoalPerWeek?, trainingTrackingEnabled?, onboardingCompleted?

2. **Add Dexie tables** (`src/db/index.ts`)
   - Add `sleepEntries` and `trainingEntries` tables to Dexie schema (version 6)
   - Create helper functions: `getSleepEntriesForDate`, `addSleepEntry`, `getLastSleepEntry`, `getSleepAverageForDays`
   - Create helper functions: `getTrainingEntriesForDate`, `addTrainingEntry`, `getTrainingSessions7Days`, `getDaysSinceLastTraining`
   - Follow existing patterns from `FoodEntry` helpers

3. **Create Supabase migration** (`supabase/migrations/20260206_sleep_training.sql`)
   - Create `sleep_entries` table with RLS policies
   - Create `training_entries` table with RLS policies
   - Add new columns to `user_settings` table

4. **Extend sync service** (`src/services/sync.ts`)
   - Add push/pull functions for sleep entries
   - Add push/pull functions for training entries
   - Extend `fullSync` to include sleep/training
   - Extend settings sync for new fields

## Acceptance Criteria

- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] All CRUD operations work for sleep/training entries
- [ ] Soft deletes work correctly
- [ ] SyncId is generated for new entries

## Patterns to Follow

Look at existing `FoodEntry` implementation for:
- Type definitions
- Dexie schema and helpers
- Sync service patterns

## When Done

1. Commit with message: `feat(grrromode): Add sleep and training data layer`
2. Push branch: `git push -u origin grrromode-data-layer`
3. Create PR linked to issue #41

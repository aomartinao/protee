# GRRROMODE: AI/Coach Sleep & Training

**GitHub Issue:** https://github.com/aomartinao/protee/issues/42
**Branch:** `grrromode-coach-pillars`

## Your Mission

Extend the AI coach to understand and respond to sleep and training logging requests.

## Dependencies

**BLOCKED BY:** Issue #41 (Data Layer) must be merged first for type definitions.

When Data Layer is ready, merge it into your branch:
```bash
git fetch origin && git merge origin/grrromode-data-layer
```

## Tasks

1. **Add new types** (`src/services/ai/unified.ts`)
   - Add `SleepContext` interface: sleepLastNight?, sleepAvg7Days?, sleepGoal?
   - Add `TrainingContext` interface: trainingSessions7Days?, trainingGoalPerWeek?, daysSinceLastTraining?, lastMuscleGroup?
   - Add `log_sleep` and `log_training` to `MessageIntent`
   - Add `SleepAnalysis` interface: duration, bedtime?, wakeTime?, quality?
   - Add `TrainingAnalysis` interface: muscleGroup, duration?, notes?
   - Add new coaching types: `sleep_tip`, `sleep_celebration`, `training_progress`, `rest_day_reminder`

2. **Update system prompt** (`buildUnifiedSystemPrompt`)
   - Add sleep detection rules (when sleepTrackingEnabled)
   - Add training detection rules (when trainingTrackingEnabled)
   - Examples: "spal jsem 7 hodin" → log_sleep, "dělal jsem nohy" → log_training

3. **Add context building**
   - Accept `sleepContext` and `trainingContext` in `UnifiedContext`
   - Include in system prompt when available

4. **Parse new responses** (`parseUnifiedResponse`)
   - Handle `log_sleep` intent → return `SleepAnalysis`
   - Handle `log_training` intent → return `TrainingAnalysis`

## Example User Messages

**Sleep:**
- "spal jsem 7 hodin"
- "šel jsem spát v 11, vstal v 7"
- "dneska jen 5 hodin spánku"

**Training:**
- "dělal jsem nohy"
- "byl jsem v gymu na push"
- "rest day"
- "cardio 30 minut"

## Acceptance Criteria

- [ ] TypeScript compiles without errors
- [ ] AI correctly identifies sleep/training messages
- [ ] Returns properly structured analysis objects
- [ ] Respects enabled/disabled flags for each pillar

## When Done

1. Commit with message: `feat(grrromode): Add sleep and training intents to AI coach`
2. Push branch: `git push -u origin grrromode-coach-pillars`
3. Create PR linked to issue #42

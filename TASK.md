# GRRROMODE: Chat Integration

**GitHub Issue:** https://github.com/aomartinao/protee/issues/43
**Branch:** `grrromode-chat-integration`

## Your Mission

Integrate sleep and training logging into the chat UI, including confirmation cards and handlers.

## Dependencies

**BLOCKED BY:**
- Issue #41 (Data Layer) - for db functions
- Issue #42 (AI/Coach) - for intent handling

When both are ready, merge them:
```bash
git fetch origin
git merge origin/grrromode-data-layer
git merge origin/grrromode-coach-pillars
```

## Tasks

1. **Create SleepLogCard** (`src/components/chat/SleepLogCard.tsx`)
   - Display: duration formatted (7h 30m), time range, quality badge
   - Show goal status (met/not met)
   - Confirm/Cancel buttons for pending entries
   - Follow FoodCard pattern

2. **Create TrainingLogCard** (`src/components/chat/TrainingLogCard.tsx`)
   - Display: muscle group, duration, notes
   - Show weekly progress (2/3 sessions)
   - Color-coded muscle group badges
   - Confirm/Cancel buttons for pending entries

3. **Update UnifiedChat** (`src/pages/UnifiedChat.tsx`)
   - Add state: `pendingSleep`, `pendingTraining`
   - Add state: `sleepContext`, `trainingContext`
   - Load sleep/training context on mount
   - Update `getContext()` to include sleep/training context
   - Handle `log_sleep` intent in `processInput`:
     - Show SleepLogCard with confirm/cancel
     - On confirm: call `addSleepEntry`, show success message
   - Handle `log_training` intent similarly
   - Add imports for new components and db functions

## UI Flow

```
User: "spal jsem 7 hodin"
↓
[SleepLogCard - pending]
  7h sleep | great | [Confirm] [Cancel]
↓
User clicks Confirm
↓
Entry saved, card updates to confirmed state
Coach: "Super! 7 hodin je přesně to, co potřebuješ."
```

## Acceptance Criteria

- [ ] TypeScript compiles without errors
- [ ] Sleep logging flow works end-to-end
- [ ] Training logging flow works end-to-end
- [ ] Cancel removes pending card
- [ ] Confirmed entries persist in IndexedDB

## Patterns to Follow

Look at existing `FoodCard` and `pendingFood` handling for:
- Card component structure
- Confirm/cancel flow
- State management

## When Done

1. Commit with message: `feat(grrromode): Add chat integration for sleep and training`
2. Push branch: `git push -u origin grrromode-chat-integration`
3. Create PR linked to issue #43

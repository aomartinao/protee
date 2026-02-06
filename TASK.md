# GRRROMODE: Onboarding & Settings

**GitHub Issue:** https://github.com/aomartinao/protee/issues/45
**Branch:** `grrromode-onboarding`

## Your Mission

Create the onboarding wizard for new users and add sleep/training settings.

## Dependencies

**BLOCKED BY:** Issue #41 (Data Layer) - for settings type definitions

When Data Layer is ready:
```bash
git fetch origin && git merge origin/grrromode-data-layer
```

## Tasks

1. **Create OnboardingStep** (`src/components/onboarding/OnboardingStep.tsx`)
   - Reusable step wrapper: title, description, children
   - Centered layout with consistent styling

2. **Create Onboarding page** (`src/pages/Onboarding.tsx`)
   - Multi-step wizard with progress indicator
   - Steps: welcome, protein, sleep, training, complete
   - State for each setting (proteinGoal, sleepEnabled, sleepGoal, etc.)
   - Skip option for users who want defaults
   - On complete: save all settings, redirect to dashboard

   **Welcome Step:**
   - Show 3 pillars: Protein, Sleep, Training
   - Brief description of each

   **Protein Step:**
   - Goal selector: +/- buttons, preset buttons (100, 150, 180, 200)
   - Tip about 1.6-2.2g per kg

   **Sleep Step:**
   - Enable/disable toggle
   - If enabled: goal selector (6h, 7h, 8h, 9h)

   **Training Step:**
   - Enable/disable toggle
   - If enabled: sessions per week (2-6)

   **Complete Step:**
   - Summary of chosen goals
   - "Start Tracking" button

3. **Update Settings** (`src/pages/Settings.tsx`)
   - Add Sleep toggle + goal selector in Tracking section
   - Add Training toggle + goal selector in Tracking section
   - Add "Re-run onboarding" in Data section

4. **Gate app behind onboarding** (`src/App.tsx`)
   - Create `OnboardingGate` component
   - Check `onboardingCompleted` setting
   - Skip for existing users (who have data)
   - Show Onboarding for new users

## Onboarding Flow

```
[Welcome] → [Protein Goal] → [Sleep?] → [Training?] → [Complete!]
     ↓            ↓              ↓            ↓            ↓
   Skip ─────────────────────────────────────────────→ Dashboard
```

## Acceptance Criteria

- [ ] TypeScript compiles without errors
- [ ] New users see onboarding on first visit
- [ ] Existing users skip onboarding
- [ ] Settings save correctly
- [ ] "Re-run onboarding" works from Settings
- [ ] All toggles work in Settings

## Important Notes

- Use `window.location.href = '/'` after completing onboarding (not `navigate()`)
- This forces the OnboardingGate to re-check settings

## When Done

1. Commit with message: `feat(grrromode): Add Onboarding and Settings UI`
2. Push branch: `git push -u origin grrromode-onboarding`
3. Create PR linked to issue #45

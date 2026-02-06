# GRRROMODE: Dashboard & Reports UI

**GitHub Issue:** https://github.com/aomartinao/protee/issues/44
**Branch:** `grrromode-dashboard`

## Your Mission

Create the 3-pillar dashboard view and Reports page for visualizing progress across protein, sleep, and training.

## Dependencies

**BLOCKED BY:** Issue #41 (Data Layer) - for type definitions and db functions

When Data Layer is ready:
```bash
git fetch origin && git merge origin/grrromode-data-layer
```

## Tasks

1. **Create PillarCard** (`src/components/tracking/PillarCard.tsx`)
   - Reusable card showing: icon, title, current/goal, subtitle
   - Props: icon, iconColor, iconBgColor, title, current, goal, unit, subtitle, isGoalMet, onClick
   - Show check/alert icon based on goal status

2. **Create WeeklyPillarChart** (`src/components/tracking/WeeklyPillarChart.tsx`)
   - Bar chart showing last 7 days
   - Props: data (date, value, goal)[], label, unit, color, bgColor
   - Show goal line, highlight days that met goal
   - Display average and goals met count

3. **Create Reports page** (`src/pages/Reports.tsx`)
   - Time range toggle: 7 days / 30 days
   - Summary cards for each pillar (using PillarCard)
   - Weekly charts for protein and sleep
   - Training breakdown by muscle group
   - Load data using db helper functions

4. **Update Dashboard** (`src/pages/Dashboard.tsx`)
   - Add sleep and training pillar cards below protein ring
   - Only show when respective tracking is enabled
   - Show on "Today" view only
   - Cards link to Coach for logging

5. **Update Navigation**
   - Add Reports to MobileNav (`src/components/layout/MobileNav.tsx`)
   - Add Reports route to App.tsx

## Dashboard Layout (Today view)

```
┌─────────────────────────────┐
│     [Protein Ring]          │
│      150g / 180g            │
├─────────────────────────────┤
│  ┌─────────┐  ┌─────────┐   │
│  │ 😴 Sleep │  │ 🏋️ Train │  │
│  │ 7h / 8h │  │  2 / 3   │  │
│  │  good   │  │  legs    │  │
│  └─────────┘  └─────────┘   │
├─────────────────────────────┤
│     [Food entries list]     │
└─────────────────────────────┘
```

## Acceptance Criteria

- [ ] TypeScript compiles without errors
- [ ] Dashboard shows all 3 pillars when enabled
- [ ] Reports page loads and displays data
- [ ] Charts render correctly
- [ ] Navigation works

## When Done

1. Commit with message: `feat(grrromode): Add Dashboard and Reports UI`
2. Push branch: `git push -u origin grrromode-dashboard`
3. Create PR linked to issue #44

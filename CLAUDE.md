# CLAUDE.md - Project Instructions for Claude Code

## Project Context
- **Project:** Protee (PWA)
- **Stack:** React/TypeScript, Vite, Vercel deployment
- **Structure:** Multi-worktree setup with parallel development branches
- **Workflow:** Multiple Claude Code instances working on separate features

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents for research, exploration, or parallel analysis that would clutter main context
- One task per subagent for focused execution
- Skip subagents for straightforward, single-file changes
- Keep main context window clean for core implementation work

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Keep lessons.md under 50 lines — focus on high-impact patterns only
- Review lessons at session start for this project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Run the app, check logs, demonstrate correctness
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a senior engineer approve this?"

### 5. Demand Elegance (Balanced)
- For changes touching 3+ files or core architecture: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Go fix failing CI tests without being told how
- **Exception:** See Sensitive Zones below

---

## Task Management

For tasks estimated **over 30 minutes**:
1. **Plan First:** Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan:** Check in before starting implementation
3. **Track Progress:** Mark items complete as you go
4. **Explain Changes:** High-level summary at each step
5. **Document Results:** Add review section to `tasks/todo.md`
6. **Capture Lessons:** Update `tasks/lessons.md` after corrections

For **quick tasks under 30 minutes**: Skip formal tracking, just execute and summarize.

---

## Database Access

### Credentials Location
- Database credentials are stored in `.env` (gitignored)
- Variables: `SUPABASE_SECRET_KEY`, `DATABASE_PASSWORD`

### Security Rules — CRITICAL
- **NEVER read or display `.env` contents** — secrets would appear in conversation logs
- **NEVER echo/print credential values** — use variables without displaying them
- **Use environment variables in commands:**
  ```bash
  # CORRECT - value never appears in output
  source .env && psql "postgresql://postgres:${DATABASE_PASSWORD}@db.xxx.supabase.co:5432/postgres" -c "SELECT 1"

  # WRONG - would expose the password
  cat .env  # Never do this
  echo $DATABASE_PASSWORD  # Never do this
  ```

### Database Commands — PRIMARY METHOD
Use psql directly (works in all worktrees, no setup needed):
```bash
# Single command
source .env && psql "postgresql://postgres:${DATABASE_PASSWORD}@db.paifkqqqwhtqhyxgibvl.supabase.co:5432/postgres" -c "SELECT * FROM users LIMIT 5"

# Interactive session
source .env && psql "postgresql://postgres:${DATABASE_PASSWORD}@db.paifkqqqwhtqhyxgibvl.supabase.co:5432/postgres"

# Run migration file
source .env && psql "postgresql://postgres:${DATABASE_PASSWORD}@db.paifkqqqwhtqhyxgibvl.supabase.co:5432/postgres" -f migrations/001_example.sql
```

**AVOID:** `supabase db push` — requires linking per worktree, often fails

---

## Sensitive Zones — ALWAYS Ask Before Changing

These areas require explicit user approval before modification:

- **Authentication/Authorization** — Login, logout, session handling, permissions
- **Environment variables** — .env files, secrets, API keys
- **Payment/billing code** — Anything touching money
- **Database schemas** — Migrations, model changes
- **Security middleware** — Rate limiting, CORS, input validation
- **Package.json scripts** — Build commands, deployment scripts
- **Destructive operations** — Deleting files, removing features

**For these zones:** Explain what you want to change and WHY, then wait for approval.

---

## Git Safety (Critical)

### Always Do
- Run `git status` before any commit
- Commit frequently with descriptive messages
- Use conventional commit format: `feat:`, `fix:`, `refactor:`, `docs:`
- Stay on your assigned branch — don't switch branches

### Never Do Without Explicit Approval
- Force push (`git push --force`)
- Rebase shared branches
- Delete branches
- Modify `.gitignore` in ways that might expose secrets
- Commit directly to `main`

### Context Awareness
- You're likely working in a **worktree**, not the main repo
- Other Claude instances may be working on parallel branches
- Don't modify files outside your branch's scope
- If unsure about Git state, STOP and ask

### Worktree Rules — IMPORTANT
- **At session start, check if you're in a worktree:**
  ```bash
  git rev-parse --git-dir
  ```
  - If output is `.git` → you're in the **main repo**, normal workflow
  - If output is a path like `/Users/mho/clauding/protee/.git/worktrees/...` → you're in a **worktree**
- **In worktrees: NEVER run `git checkout main`** — main is used by the main repo
- **In worktrees:** To get updates from main, use:
  ```bash
  git fetch origin && git merge origin/main
  ```
- Check your branch with `git branch --show-current` if unsure

---

## Core Principles

- **Simplicity First:** Make every change as simple as possible. Minimal code impact.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Changes should only touch what's necessary. Avoid introducing bugs.
- **Verify Everything:** If you can't prove it works, it's not done.

---

## When to STOP and Ask

- You've tried 3 approaches and none work
- You need information only the user has (API keys, business logic, preferences)
- You're about to do something in a Sensitive Zone
- You're confused about requirements or scope
- Something feels wrong but you can't pinpoint why

**Don't spin wheels.** Ask early, ask clearly.

---

## Project-Specific Commands

```bash
# Development server
npm run dev -- --port 3000    # (adjust port per worktree: 3000, 3001, 3002)

# Build
npm run build

# Type checking
npx tsc --noEmit
```

---

## Communication Style

- Be concise — skip preamble and caveats
- Lead with what you did, then explain why if relevant
- When presenting options, give a clear recommendation
- If blocked, say what you need to get unblocked

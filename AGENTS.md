# Codex contributor instructions

This is an exploratory, local-first EA FC 27 SBC optimiser project.

## Workflow

- Read README.md and the current GitHub issue before starting.
- Make changes on a feature branch with a focused PR.
- Prefer the smallest working spike over premature architecture.
- Use TypeScript with WXT for the browser extension. Add React, Dexie or solvers only when a feature needs them.
- Include clear run/build/test instructions; run checks and state their results in the PR.
- Use Vitest and synthetic/sanitised fixture markup for parser tests.

## Hard boundaries

- Never ask for or store EA passwords, access tokens, session cookies or private request headers.
- No HTTP calls to authenticated EA APIs or scraping endpoints.
- No network interception, hidden application state access, user impersonation, or automated Web App actions.
- No automatic clicks, scrolling, bidding, transfers, or SBC submissions.
- Only attempt to read user-visible rendered DOM after an explicit opt-in action.
- Do not assume user-driven navigation makes browser scraping compliant with EA's terms. Clearly note the risk.
- Keep data in browser storage; any export must be deliberate.
- Never commit real club identifiers, raw sensitive page HTML, or auth-related data.
- If a field is not in visible DOM markup, mark it unknown instead of fabricating it.

## Data modelling

Keep observations distinct from verified owned-card inventory. Do not equate repeated DOM sightings with duplicate ownership, and never mark unseen cards as sold or submitted without confirmation.

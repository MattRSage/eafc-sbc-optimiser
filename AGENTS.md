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
- Permit user-initiated, read-only club inventory import through the signed-in Web App's own internal services. This exception includes the inventory requests those services make and the inventory data they return. Do not construct direct authenticated HTTP requests or collect authentication material.
- Access internal application services and inventory state only for that explicit import. No unrelated hidden-state access, network interception, user impersonation, or automated Web App actions beyond read-only inventory retrieval.
- No automatic clicks, scrolling, bidding, transfers, or SBC submissions.
- Require an explicit opt-in action for DOM observation and a deliberate start action for each inventory import. No automatic import on login or background synchronisation.
- Do not assume user-driven navigation makes browser scraping compliant with EA's terms. Clearly note the risk.
- Keep data in browser storage; any export must be deliberate.
- Never commit real club identifiers, raw sensitive page HTML, or auth-related data.
- If a field is absent from the permitted source, mark it unknown instead of fabricating it. Preserve whether evidence came from visible DOM or an internal inventory service.

## Data modelling

Keep observations distinct from verified owned-card inventory. Do not equate repeated DOM sightings with duplicate ownership, and never mark unseen cards as sold or submitted without confirmation.

## Import decision (2026-11-17)

The project owner approved the read-only internal-service import exception after reviewing EasySBC and the unresolved EA terms and account-enforcement risk. This is project authorisation, not EA approval. See [the import policy](docs/import-policy.md). All other boundaries remain in force.

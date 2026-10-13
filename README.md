# EA FC 27 SBC Optimiser

A local-first browser companion for managing an EA SPORTS FC 27 Ultimate Team club inventory and recommending cost-efficient Squad Building Challenge (SBC) solutions.

> **Status:** Phase 1 extension shell and synthetic DOM demo. Live selectors remain unverified. No owned-card importer or solver yet.

## Goal

Build an inventory from player cards you encounter while **manually browsing** the official EA FC Web App, then use that inventory to plan SBC solutions that minimise sacrificed player value and coins spent.

### Product principles

- **User-controlled:** The user navigates the EA Web App themselves. No automated scrolling, clicking, SBC submission or transfers.
- **Opt-in observation:** The extension remains inactive until explicitly enabled and can be paused or disabled.
- **Visible information only:** Investigate whether rendered, user-visible player-card DOM elements expose enough information. Do not read hidden app state, inspect private API responses, or retrieve tokens/cookies.
- **Local-first:** Keep club data in browser storage; offer deliberate JSON/CSV export. No backend or telemetry required for the MVP.
- **Conservative inventory reconciliation:** Duplicates, untradeable status, SBC storage and disappearing cards require careful treatment. A card not seen during a session is **not** automatically deleted.
- **Protection controls:** Let users mark players as protected so solvers never recommend submitting them.
- **Account safety:** Browser extensions and data extraction may violate EA's terms even when browsing is manual. Evaluate the policy risk before installing or using an extension on a live account; user-driven navigation does not guarantee compliance.

## Proposed stack

| Concern | Initial choice |
| --- | --- |
| Extension build tooling | WXT |
| Language | TypeScript |
| UI | Minimal popup first; React only if needed |
| Validation | Zod |
| Testing | Vitest |
| Persistence after proof of concept | IndexedDB, potentially via Dexie |
| SBC optimisation after inventory | Evaluate GLPK.js or another suitable constraint solver |

The stack is deliberately provisional: test the DOM feasibility before building the full product.

## Roadmap

1. **DOM feasibility proof of concept:** Identify player-card markup; build an opt-in, read-only diagnostic extension; manually browse and test extraction; export a redacted JSON sample.
2. **Club inventory:** Persist extracted observations locally; deduplicate appropriately; filter, protect and edit owned items; support main club and SBC storage.
3. **SBC requirement capture:** Support manual input first and potentially read visible SBC requirements where practical.
4. **Optimisation:** Solve rating, item score and other constraints; preserve protected players; minimise purchases and opportunity cost.
5. **Inventory exchange:** Export structured, privacy-reviewed data for analysis in ChatGPT; no direct account integration necessary.

## Definition of done: Phase 1

- A locally loadable Chrome extension with explicit start/stop capture.
- Read-only access to the DOM of the official Web App; no automation or intercepted network calls.
- A diagnostic view/count of candidate player-card elements and supported fields.
- A change observer that handles manually triggered navigation and does not accumulate duplicate observations.
- JSON export that excludes credentials, cookies, URLs with tokens and unrelated personal data.
- Tests using **sanitised, synthetic DOM fixtures**, and a short report describing missing fields and extraction limitations.
- If the card UI is not exposed via usable DOM elements, report the limitation instead of reaching into private app APIs.

## Getting started

Use Node.js 24 LTS and npm.

```sh
npm install
npm run typecheck
npm test
npm run build
```

To load the extension in Chrome:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Select **Load unpacked** and choose `.output/chrome-mv3` in this repository.
3. Open the extension popup and select **Open synthetic demo**.
4. Select **Enable capture** in the demo. Expect two distinct descriptions and two sightings.
5. Select **Add another Alex card**, then **Refresh diagnostics**. Expect two descriptions and three sightings.
6. Select **Disable capture** to stop observation. Select **Clear session** to stop and erase the session.
7. Select **Review JSON export**, deselect fields to redact, inspect the preview, then select **Download reviewed JSON**.

The popup controls the active supported EA tab. The demo has its own controls and session. Diagnostics update when you use a control or select **Refresh diagnostics**. Live capture currently reports unverified selectors and extracts no player fields. See the [feasibility report](docs/feasibility.md) for exact live inspection steps and limitations.

GitHub Actions runs typecheck, Vitest, and the production build on pull requests and pushes to `main`. A separate job runs the synthetic Chromium smoke test. Live DOM and account-policy verification remain tracked in [issue #3](https://github.com/MattRSage/eafc-sbc-optimiser/issues/3).

For the automated browser demonstration:

```sh
npx playwright install chromium
npm run build
npm run test:browser
```

The browser test uses a temporary profile and synthetic data only. It records a reviewed JSON export and screenshot in ignored `test-results/`. For iterative extension development, run `npm run dev`; use the production build for the documented permission and network boundaries.

No EA credentials or session data should ever be committed to this repository.

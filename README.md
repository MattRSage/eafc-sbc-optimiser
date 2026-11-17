# EA FC 27 SBC Optimiser

A local-first browser companion for managing an EA SPORTS FC 27 Ultimate Team club inventory and recommending cost-efficient Squad Building Challenge (SBC) solutions.

> **Status:** User-started club and SBC storage import now has a page-context adapter, progress, cancellation, result review, and deliberate local persistence with profiles, protection, corrections, and reviewed export. Synthetic tests pass; live ownership, identity, and coverage remain unverified. DOM observations stay separate. No solver yet.

## Goal

Build a full-club inventory through an explicitly started, read-only import using the official EA FC Web App's internal services, then plan SBC solutions that minimise sacrificed player value and coins spent. The adapter supports a narrow internal-service contract, with separate synthetic tests for pagination and failure handling. DOM observations remain separate. See the [adapter reference](docs/web-app-import.md) and [manual validation procedure](docs/validate-live-import.md).

The owner approved this direction on 2026-11-17 with unresolved EA terms and account-enforcement risk. See the [import policy](docs/import-policy.md) for the scope and retained restrictions.

### Product principles

- **User-controlled:** The user navigates the EA Web App themselves. No automated scrolling, clicking, SBC submission or transfers.
- **Opt-in observation:** The extension remains inactive until explicitly enabled and can be paused or disabled.
- **Read-only inventory import:** Permit internal inventory services only after a deliberate start action. Do not collect authentication material, intercept network traffic, or access unrelated application state. Existing DOM capture remains limited to visible information.
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

The stack is deliberately provisional: validate the read-only import with synthetic service fixtures and separate manual live checks before building the full product.

## Roadmap

1. **DOM feasibility proof of concept:** Identify player-card markup; build an opt-in, read-only diagnostic extension; manually browse and test extraction; export a redacted JSON sample.
2. **Club inventory:** Build the user-initiated internal-service importer, with cancellation and explicit partial-import status. Validate instance identity and source coverage before treating records as owned inventory. Persist locally and support filtering, protection, and manual corrections.
3. **SBC requirement capture:** Support manual input first and potentially read visible SBC requirements where practical.
4. **Optimisation:** Solve rating, item score and other constraints; preserve protected players; minimise purchases and opportunity cost.
5. **Inventory exchange:** Export structured, privacy-reviewed data for analysis in ChatGPT; no direct account integration necessary.

## Definition of done: Phase 1 (DOM spike)

- A locally loadable Chrome extension with explicit start/stop capture.
- Read-only access to the DOM of the official Web App; no automation or intercepted network calls.
- A diagnostic view/count of candidate player-card elements and supported fields.
- A change observer that handles manually triggered navigation and does not accumulate duplicate observations.
- JSON export that excludes credentials, cookies, URLs with tokens and unrelated personal data.
- Tests using **sanitised, synthetic DOM fixtures**, and a short report describing missing fields and extraction limitations.
- If the card UI is not exposed via usable DOM elements, report the limitation instead of reaching into private app APIs.

## Provide live DOM evidence

Follow the [Chrome DevTools inspection guide](docs/manual-inspection.md) to provide a few manually transcribed card examples with invented values, plus notes on scrolling, filtering, pagination, and node reuse. Never share raw page HTML or credentials. The [feasibility decision](docs/feasibility.md) records the supplied layout evidence, remaining browsing and identity gaps, and account-policy questions.

The synthetic demo now includes **Recycle first card** and **Hide or show first card** controls. They test manual browsing scenarios without an EA account. Tradeability and SBC storage labels are supported in synthetic fixtures; unavailable values remain unknown. No description or sighting count is an owned quantity.

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

The popup controls the active supported EA tab. The demo has its own controls and session. Diagnostics update when you use a control or select **Refresh diagnostics**. Live capture reads name, rating, and position in the supplied main layout, or name, position, and nation/league/club abbreviations in bio view. Hidden fields remain unknown. The views retain separate raw observations and can contribute to one provisional candidate while the same card container remains continuously visible. Candidates are never automatically confirmed as owned cards. See the [feasibility report](docs/feasibility.md) for exact live inspection steps and limitations.

Select **Refresh diagnostics** after rendering settles to see separate sighting, raw observation, candidate, and confirmed-item counts. Select **Mark for review** beside a candidate to flag it for this capture session. **Review candidate JSON export** includes redacted raw evidence, candidate fields, and provenance in `sbc-inventory-candidates-v1`. **Review JSON export** retains the original `sbc-dom-observations-v1` format. See [candidate reconciliation](docs/reconciliation.md) for continuity rules, limits, and confirmation semantics.

GitHub Actions runs typecheck, Vitest, and the production build on pull requests and pushes to `main`. A separate job runs the synthetic Chromium smoke test. The earlier DOM investigation is recorded in closed [issue #3](https://github.com/MattRSage/eafc-sbc-optimiser/issues/3). The [import policy](docs/import-policy.md) records the subsequent change in direction.

For the automated browser demonstration:

```sh
npx playwright install chromium
npm run build
npm run test:browser
```

The browser test uses a temporary profile and synthetic data only. It records a reviewed JSON export and screenshot in ignored `test-results/`. For iterative extension development, run `npm run dev`; use the production build for the documented permission and network boundaries.

No EA credentials or session data should ever be committed to this repository.

## Import club inventory

After loading the extension, sign into the official Web App yourself. Open the popup and select **Import club**. The popup shows progress and separate club and SBC storage coverage. **Cancel import** prevents subsequent requests. **Review imported items** shows the retained result after the run stops.

Closing the popup keeps the explicitly started run active in that tab. Reopen the popup to check progress or cancel. Reloading the Web App clears the in-memory results. Each new import requires another deliberate start. Saving reviewed results to local inventory is a separate, deliberate action. No automatic import or background synchronisation runs.

A complete service traversal names club and SBC storage as its sources; real ownership and complete real-club coverage remain unverified. Follow the [manual validation procedure](docs/validate-live-import.md) for live checks.

## Save and review local inventory

1. After an import stops, select **Review imported items**.
2. Create a local profile with an invented label, or select an existing profile. Use separate profiles for separate accounts or clubs.
3. Confirm that the reviewed import belongs to the selected profile. Account changes cannot be detected automatically.
4. Select **Save reviewed import to profile**. Saved records, coverage, protection flags, and corrections survive popup and Web App reloads.
5. Filter by name or ID, source, protection, or missing status. Select **Protect player** to retain a protection choice for future planning. No solver is included.
6. To correct a field, expand **Manual corrections and reported evidence**. Enter a JSON object such as `{"name":"Example player","rating":84}` and select **Save manual corrections**. Use `{}` to clear overrides.
7. To export, select fields and then **Review selected fields**. Inspect the preview before selecting **Download reviewed inventory JSON**. IDs are excluded by default.

Corrections support name, rating, position, and tradeable. They remain separate from reported evidence and persist across imports. Missing records remain stored until you confirm their removal. A failed or partial import never deletes previous records. The [local inventory reference](docs/local-inventory.md) defines freshness and coverage.

To erase saved inventory, select the erase checkbox and then **Clear local inventory**. This removes every saved profile, protection choice, and correction. In-memory imports and DOM sessions are separate; reload the Web App to discard the import, or use **Clear session** for DOM observations.

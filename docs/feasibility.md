# DOM feasibility report

## Result

The extension shell works with synthetic cards. Live EA card extraction remains unverified. No authenticated Web App DOM was inspected during implementation, and `liveProfile` is deliberately `null`. Enabling capture on the supported page starts the observer but performs no card queries. Zero candidates means "no verified selector", not an empty club.

## Issue #3 investigation: 2026-10-13

**Decision: keep live extraction disabled.** No authenticated session or sanitised real-card fixture was available to this investigation. The public Web App document exposed no player-card text to the research browser. This does not establish whether signed-in cards use DOM, canvas, virtualisation, or pagination. No EA selectors were invented.

| Evidence | Finding | Limit |
| --- | --- | --- |
| [EA's current help page](https://help.ea.com/en/articles/ea-sports-fc/early-web-and-companion-app-start/) | Identifies FC 27 and links to the Web App | Does not document card markup |
| [Linked public Web App](https://www.ea.com/ea-sports-fc/ultimate-team/web-app/) | Public entry point uses `www.ea.com` and `/ea-sports-fc/ultimate-team/web-app/` | Signed-in routes and locale redirects remain unverified |
| Authenticated rendered cards | Not inspected | All live field selectors and identity semantics remain unknown |
| Synthetic fixture and Chromium demo | Exercise parsing, repeated sightings, node reuse, hiding, and opt-in lifecycle | No evidence of the EA layout or complete club coverage |

The existing match pattern `https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*` remains narrow and unchanged. Do not add wildcard hosts or localized paths without observed signed-in origin/path evidence. The public help page confirms the FC 27 product; the user's displayed app version still needs recording.

The [current EA User Agreement](https://www.ea.com/legal/user-agreement), dated May 14, 2026 when reviewed, restricts copying and extracting service data in section 2 unless authorized or legally permitted. Section 8 describes account sanctions. This implementation does not establish permission for DOM extraction. Read-only access and manual navigation do not remove account-policy risk. Older dated agreements must not substitute for checking the current terms.

The next required input is a few manually transcribed, sanitised card examples and a browsing evidence record. Follow [Collect a sanitised Web App DOM example](manual-inspection.md). No credentials, raw page HTML, network responses, or actual instance identifiers are needed. Live selector and inventory work remains blocked on that evidence and policy acceptability.

## Fields and confidence

The parser accepts only short, visible text within selected card fields. It does not read attributes, image sources, HTML dumps, hidden application state, or network data. Empty, hidden, invalid, oversized, and suspicious values become `null`, displayed as unknown. This text filter is a precaution, not a complete personal-data classifier. Review every export.

| Field | Synthetic evidence | Live evidence |
| --- | --- | --- |
| Name, rating, position | Both fixture cards | Unknown |
| Club, league, nation, card type | Alex fixture only | Unknown |
| Visible identifier | Alex fixture only; excluded from export by default | Unknown |
| Tradeability, SBC storage | Explicit text on Alex fixture; missing on Sam | Unknown |
| Owned instance identity | Not inferred from `visibleId` | Unknown |

`tradeable` and `sbcStorage` preserve short visible labels as text, or `null`. They are not inferred booleans. `visibleId` is unclassified visible text, not a verified unique instance key. No field is read from attributes.

All synthetic exports carry `synthetic-only` confidence. Fixture selectors were authored for the synthetic markup and are never applied to the EA page. They provide no evidence of real selector stability.

## Observation limits

Each new visible DOM element with some readable information or changed nonempty description counts as a sighting. Empty recycled placeholders remain candidates but add no sighting or retained observation. Unchanged nodes on unrelated mutations do not increase sightings. Matching descriptions collapse into one retained observation. Two identical owned cards cannot be distinguished this way. A description is not a verified player definition either: different card variants can share the same visible fields, while one player can produce different partial descriptions across views. No owned-card records or definition-to-instance links are created. An accurate inventory requires independently verified instance identity or explicit manual confirmation. A recycled node with a different description adds a new observation, but recycling it to identical content may be undetectable. A card returning after a scan that saw it absent counts as another sighting.

The UI reports current visible candidates from the last scan, distinct descriptions retained this session, and sightings separately. None is an owned-card count. Removing a card from view never deletes prior observations. Stopping freezes diagnostics. Restarting scans the current view. Clearing stops capture and deletes the session. Each tab is independent; reload, navigation to a new document, or extension reload loses its session. Closing the popup does not stop an enabled tab.

Mutation scans are coalesced over 100 ms. Read-only scroll and resize listeners rescan after manual viewport changes. At most 500 distinct descriptions are retained; diagnostics and exports flag truncation. Virtualized lists reveal only rendered cards. Transitions shorter than the scan interval may be missed. Closed shadow roots, canvas, and iframe contents are unsupported.

Visibility checks skip background tabs and reject hidden, inert, aria-hidden, transparent, non-rendered, and out-of-viewport elements and text ancestors. They do not prove that a card is unobscured by another element or fully inside a clipping container. CSS-only animations and stylesheet changes may not trigger a scan. Verify those cases before adding a live profile. Image-only badges, pseudo-element text, and non-text fields remain unknown.

## Export and account boundaries

Capture is off until explicitly enabled. The content script runs in the isolated world. There is no background worker, persistent storage, telemetry, fetch, network interception, or automated Web App interaction. Extension pages also use `connect-src 'none'`. The production manifest has no extra API permissions and matches only the configured Web App path. WXT development mode may add development tooling; load the production build for these guarantees.

Export is deliberate. Review opens a frozen snapshot, with visible identifiers redacted by default. Uncheck any other fields, inspect the exact JSON preview, then download. Export uses a fixed field allowlist and excludes page URLs, page HTML, unrelated properties, timestamps, and browser context. Nothing is uploaded. The only retained copy after session loss is a file the user deliberately downloaded.

EA may prohibit extensions or extraction even when navigation is manual. This spike does not establish permission or account safety. Assess EA's current terms and account risk before any live-account inspection. If usable visible DOM is absent, record that result and stop. Do not substitute authenticated APIs or hidden stores.

## Remaining manual verification

Use the [Chrome DevTools inspection guide and evidence template](manual-inspection.md). It covers card field transcription, sanitisation, scrolling, filtering, pagination, node recycling, duplicate identity, localization, and SBC storage. These real-app behaviours remain unknown until recorded by a person inspecting their own visible UI.

Only add a narrow live profile after reviewing that evidence and policy acceptability. Test each observed layout separately with invented values. Keep live selectors separate from fixture selectors, review the source/confidence labels, and verify opt-in, stop, redaction, and manual navigation on the supported view before claiming live extraction.

## Reproducible synthetic demonstration

Run `npm run build` and `npm run test:browser` after installing Playwright Chromium. The browser test loads the actual unpacked extension into a temporary profile, exercises capture and export on its synthetic demo, and saves `test-results/synthetic-export.json` and `test-results/demo.png` locally. Test output is ignored by Git.

Two initial cards yield two descriptions and two sightings. Adding another Alex yields three candidates, two descriptions, and three sightings. Adding while disabled changes no counts. Re-enabling sees the added card. Export redacts names and identifiers, then verifies that the downloaded bytes equal the preview. Tests also check hidden text, offscreen cards, session reset, and content-script messages against a routed synthetic page. That page uses the configured URL but is fulfilled entirely by the test without contacting EA.

Run `npm test` for fixture parser, lifecycle, deduplication, capacity, and export tests. The jsdom tests stub geometry; Chromium checks actual rendering. No test logs into EA or controls the real Web App.

Issue #3 validation on 2026-10-13 with Node 24.19.0: `npm run typecheck`, all 15 Vitest tests, `npm run build`, and `npm run test:browser` passed. Chromium exercised the added recycle/hide/show controls and confirmed zero external requests. Existing GitHub Actions already runs all four checks; no workflow change was needed.

Validation used a temporary clean copy of the tracked project files plus the new inspection guide, with the existing installed dependencies. Unrelated untracked `… 2.*` copies appeared in the working directory, including an extra WXT entrypoint, and were excluded without modifying them. Chromium required execution outside the filesystem sandbox. The [recorded synthetic export](synthetic-export.json) is the actual downloaded, redacted result from that clean run. Live-account verification remains outstanding.

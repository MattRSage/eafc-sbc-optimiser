# DOM feasibility report

## Result

The extension shell works with synthetic cards. Live EA card extraction remains unverified. No authenticated Web App DOM was inspected during implementation, and `liveProfile` is deliberately `null`. Enabling capture on the supported page starts the observer but performs no card queries. Zero candidates means "no verified selector", not an empty club.

The configured hostname is `www.ea.com`, with the exact match pattern `https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*`. EA links to its Web App from [the official Web App page](https://www.ea.com/games/ea-sports-fc/ultimate-team/web-app). Other hosts, localized paths, and future redirects are unsupported. The target FC 27 version and logged-in markup need manual verification.

## Fields and confidence

The parser accepts only short, visible text within selected card fields. It does not read attributes, image sources, HTML dumps, hidden application state, or network data. Empty, hidden, invalid, oversized, and suspicious values become `null`, displayed as unknown. This text filter is a precaution, not a complete personal-data classifier. Review every export.

| Field | Synthetic evidence | Live evidence |
| --- | --- | --- |
| Name, rating, position | Both fixture cards | Unknown |
| Club, league, nation, card type | Alex fixture only | Unknown |
| Visible identifier | Alex fixture only; excluded from export by default | Unknown |
| Owned instance, tradeability, storage location | Not inferred | Unknown |

All synthetic exports carry `synthetic-only` confidence. Fixture selectors were authored for the synthetic markup and are never applied to the EA page. They provide no evidence of real selector stability.

## Observation limits

Each new visible DOM element or changed description counts as a sighting. Unchanged nodes on unrelated mutations do not increase sightings. Matching descriptions collapse into one retained observation. Two identical owned cards cannot be distinguished this way. A recycled node with a different description adds a new observation, but recycling it to identical content may be undetectable. A card returning after a scan that saw it absent counts as another sighting.

The UI reports current visible candidates from the last scan, distinct descriptions retained this session, and sightings separately. None is an owned-card count. Removing a card from view never deletes prior observations. Stopping freezes diagnostics. Restarting scans the current view. Clearing stops capture and deletes the session. Each tab is independent; reload, navigation to a new document, or extension reload loses its session. Closing the popup does not stop an enabled tab.

Mutation scans are coalesced over 100 ms. Read-only scroll and resize listeners rescan after manual viewport changes. At most 500 distinct descriptions are retained; diagnostics and exports flag truncation. Virtualized lists reveal only rendered cards. Transitions shorter than the scan interval may be missed. Closed shadow roots, canvas, and iframe contents are unsupported.

Visibility checks skip background tabs and reject hidden, inert, aria-hidden, transparent, non-rendered, and out-of-viewport elements and text ancestors. They do not prove that a card is unobscured by another element or fully inside a clipping container. CSS-only animations and stylesheet changes may not trigger a scan. Verify those cases before adding a live profile. Image-only badges, pseudo-element text, and non-text fields remain unknown.

## Export and account boundaries

Capture is off until explicitly enabled. The content script runs in the isolated world. There is no background worker, persistent storage, telemetry, fetch, network interception, or automated Web App interaction. Extension pages also use `connect-src 'none'`. The production manifest has no extra API permissions and matches only the configured Web App path. WXT development mode may add development tooling; load the production build for these guarantees.

Export is deliberate. Review opens a frozen snapshot, with visible identifiers redacted by default. Uncheck any other fields, inspect the exact JSON preview, then download. Export uses a fixed field allowlist and excludes page URLs, page HTML, unrelated properties, timestamps, and browser context. Nothing is uploaded. The only retained copy after session loss is a file the user deliberately downloaded.

EA may prohibit extensions or extraction even when navigation is manual. This spike does not establish permission or account safety. Assess EA's current terms and account risk before any live-account inspection. If usable visible DOM is absent, record that result and stop. Do not substitute authenticated APIs or hidden stores.

## Remaining manual verification

1. Decide whether live-account inspection is acceptable under EA's current policies. Do not provide credentials or session data to Codex.
2. Load the production extension using the README instructions. Keep capture disabled.
3. Manually open the official Web App. Check the final hostname and path in the address bar without copying query parameters. If outside the configured path, record only the hostname/path and review a narrow manifest change.
4. Manually navigate to a player-card view. Use DevTools **Elements** to inspect one visibly rendered card. Do not inspect Network, cookies, storage, JavaScript stores, or authenticated responses.
5. For each field, identify the smallest visible text element. Record selectors only after observing the actual markup. Record image-only or absent fields as unknown. Never use hidden attributes as identifiers.
6. Repeat on several visible card types and on manually opened club and SBC storage views. Check whether selectors overlap unrelated UI. Check clipped, hidden, and recycled nodes while manually scrolling. Do not save whole-page HTML.
7. Create a minimal sanitized fixture with invented player values and only necessary markup. Remove account identifiers, URLs, attributes containing session data, and unrelated content. Add tests for the observed layout and visibility cases.
8. Replace `liveProfile = null` with that reviewed selector profile in a separate change. Keep synthetic selectors separate and update confidence labels to reflect the limited evidence.
9. Reload the extension and page. Confirm zero reads before opt-in, enable capture, manually navigate, and compare visible cards with candidate counts and coverage. Disable capture and confirm counts stay frozen during further navigation.
10. Review a small JSON export locally. Check unknown fields, duplicate limitations, redaction, and absence of sensitive content. Share only a reviewed, sanitized sample if appropriate.

## Reproducible synthetic demonstration

Run `npm run build` and `npm run test:browser` after installing Playwright Chromium. The browser test loads the actual unpacked extension into a temporary profile, exercises capture and export on its synthetic demo, and saves `test-results/synthetic-export.json` and `test-results/demo.png` locally. Test output is ignored by Git.

Two initial cards yield two descriptions and two sightings. Adding another Alex yields three candidates, two descriptions, and three sightings. Adding while disabled changes no counts. Re-enabling sees the added card. Export redacts names and identifiers, then verifies that the downloaded bytes equal the preview. Tests also check hidden text, offscreen cards, session reset, and content-script messages against a routed synthetic page. That page uses the configured URL but is fulfilled entirely by the test without contacting EA.

Run `npm test` for fixture parser, lifecycle, deduplication, capacity, and export tests. The jsdom tests stub geometry; Chromium checks actual rendering. No test logs into EA or controls the real Web App.

Verified on 2026-10-13 with Node 24.19.0: `npm install`, `npm run typecheck`, all 10 Vitest tests, `npm run build`, and the Chromium demonstration passed. npm reported zero vulnerabilities. The [recorded synthetic export](synthetic-export.json) is the actual downloaded, redacted fixture result. Live-account verification remains outstanding.

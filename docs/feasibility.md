# DOM feasibility report

## Decision

A narrow, opt-in player-list profile is now supported by two user-supplied DOM samples: one card in main view and the same card after a manual switch to bio view. The user confirmed that the first sample came from the player list and that its name, rating, and position were visible. The second sample shows the bio panel displayed and the main panel hidden.

This is enough to test partial text observations. It is not enough to build an accurate owned-card inventory. No unique owned-instance identifier is visible in either sample. No automated authenticated inspection was performed.

The extension remains off until **Enable observer** is selected. It uses the reviewed `liveProfile` on the existing supported URL. The UI and export identify the profile as sample-backed, not as a verified inventory importer. Zero candidates can mean an unsupported layout, not an empty club.

## Evidence and scope

| Evidence | Finding | Limit |
| --- | --- | --- |
| [EA's current help page](https://help.ea.com/en/articles/ea-sports-fc/early-web-and-companion-app-start/), reviewed 2026-10-13 | Identifies FC 27 and links to the Web App | Does not document card markup |
| [Linked public Web App](https://www.ea.com/ea-sports-fc/ultimate-team/web-app/) | Public entry point uses `www.ea.com` and `/ea-sports-fc/ultimate-team/web-app/` | Signed-in routes and locale redirects remain unverified |
| User-supplied main-view list item | Outer name, rating, and current position have DOM text | One card and layout only |
| User-supplied bio-view list item | Three visible text rows and current position; main view has `display: none` | Row meaning follows the supplied layout; no labelled schema or instance identity |
| Sanitised fixtures and Chromium | Reproduce selectors, visibility switching, opt-in lifecycle, and partial observations | Do not establish real scrolling, pagination, or complete club coverage |

The match pattern remains `https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*`. No wildcard hosts, localized routes, or additional permissions were added. The user still needs to record the final signed-in hostname/path without query strings or fragments.

## Supported fields

The candidate selector is `li.listFUTItem > .rowContent > .entityContainer:has(> .player.item)`. Field selectors are scoped to that container. The outer `.name` is intentional: the supplied card also contains an empty `.main-view.name`.

| Field | Main view | Bio view | Interpretation |
| --- | --- | --- | --- |
| Name | Direct `.name` child | Same outer name | Displayed name only, not a definition or instance key |
| Rating | Main `.playerOverview > .rating` | Unknown while main view is hidden | Integer text in the range 1–100 |
| Position | Main `.playerOverview > .position` | Bio header `.currentPosition` | Current position only; alternatives are not concatenated |
| Nation | Unknown while bio is hidden | First bio row's left label | Displayed abbreviation, not a resolved country ID |
| League | Unknown while bio is hidden | Second bio row's left label | Displayed abbreviation, not a resolved league ID |
| Club | Unknown while bio is hidden | Third bio row's left label | Displayed abbreviation, not a resolved club ID |
| Card type/rarity | Unknown | Unknown | `specials` and `loan` classes do not establish an exact visible type |
| Tradeability | Unknown | Unknown | `untradeable` class alone is not visible status text |
| SBC storage | Unknown | Unknown | No explicit visible evidence supplied |
| Unique card identifier | Unknown | Unknown | No visible instance identifier supplied |

The bio selector requires a position header followed by exactly three `.ut-item-row` elements. Missing, additional, or differently named rows fail closed for nation, league, and club. The three same-shaped rows could still be reordered by EA without detection. This profile is limited to the supplied order; further layout and locale evidence is required before broadening it.

Only visible text is read. Hidden panels, hidden descendants, attributes, image URLs, canvas contents, and application state are excluded. Short text filters reject empty, oversized, suspicious, and invalid values, returning `null`. They are not a complete personal-data classifier; review every export.

## Fixture provenance

`tests/fixtures/player-list-main.html` and `player-list-bio.html` are minimal reconstructions of the two supplied list items. They preserve the list/card nesting, outer and empty inner name elements, bio row order, position labels, class-only status cues, and main/bio `display: none` changes.

All player values and abbreviations are invented. Image URLs, image elements, canvas elements, inline colours, unrelated stats, buttons, and status decoration were removed. No raw attachment, real player value, asset identifier, or account data was committed. Geometry in these fixtures does not reproduce the EA stylesheet.

The existing `cards.html` remains a separate synthetic demo. It supports invented tradeability and SBC storage text to exercise those fields without claiming evidence for live selectors.

## Observation and identity limits

Each new visible element with readable information or changed nonempty description counts as a sighting. Empty recycled placeholders remain candidates but add no observation. Unchanged descriptions on unrelated mutations do not add sightings. Matching descriptions collapse into one retained observation; a revisit can add a sighting without adding a description.

Main and bio views produce separate partial descriptions. The hidden rating is not copied into the bio observation. The extension does not merge by player name or element identity: one player can have different card variants, two owned copies can look identical, and a recycled node can represent another card. None of the counts represents owned quantity. No verified player definitions, owned-card records, or definition-to-instance links are created. Ownership requires independent visible instance evidence or explicit manual confirmation in future inventory work.

Removing a card from view never deletes retained observations. Stopping freezes diagnostics and cancels pending scans. Restarting scans the current view. Clearing stops capture and erases the session. Each tab is independent; reload or navigation to a new document loses the session. Closing the popup does not stop an enabled tab. Nothing is persisted outside the tab unless the user deliberately downloads an export.

MutationObserver scans are coalesced over 100 ms. Read-only scroll and resize listeners rescan after manual viewport changes. At most 500 distinct descriptions are retained, with truncation flagged. Transitions shorter than the interval may be missed. Real virtualisation, filtering, pagination, and node reuse have not been observed; the tests simulate those DOM changes only.

Visibility checks reject background tabs, hidden or inert ancestors, `aria-hidden`, transparent or non-rendered elements, and elements outside the viewport. They do not prove that text is unobscured or fully inside a clipping container. CSS-only animations may not trigger a scan. Closed shadow roots, canvas-only fields, pseudo-elements, and iframe contents are unsupported.

## Export and account boundaries

Capture is explicitly opt-in and runs in the isolated world. There are no EA API calls, network interception, automated navigation, clicks, scrolling, transfers, submissions, telemetry, or hidden-state access. Extension pages use `connect-src 'none'`. Use the production build for these boundaries; WXT development mode adds development tooling.

**Review JSON export** freezes the displayed snapshot. The user selects fields, inspects the exact preview, and deliberately downloads it. Identifiers are excluded by default. Export uses a fixed field allowlist and contains no page URL, HTML, timestamps, or browser context. Live observations use `source: live-sample`, `confidence: sample-backed-layout`, and `ownership: unknown`. Synthetic observations remain labelled `synthetic-only`.

The [current EA User Agreement](https://www.ea.com/legal/user-agreement), dated May 14, 2026 when reviewed, restricts copying and extracting service data in section 2 unless authorized or legally permitted. Section 8 describes account sanctions. This implementation does not establish permission for DOM extraction. Read-only access and manual navigation do not remove account-policy risk.

## Remaining manual verification

Follow the [Chrome DevTools guide and evidence template](manual-inspection.md) for additional layouts, card types, locale differences, final signed-in hostname/path, clipping, manual scrolling, filtering, pagination, and duplicate identity. Do not send raw page HTML, credentials, network responses, or real instance identifiers.

If live use is acceptable for your account, load the production extension, keep capture off initially, and open the player list yourself. Select **Enable observer**, then **Refresh diagnostics**. Manually switch main and bio views and refresh again. Expect partial descriptions rather than imported cards; rating should be unknown in the bio description. Select **Disable observer** and verify that further manual navigation does not change counts. Review and redact any deliberate export.

If a layout does not match, stop and collect a sanitised example. Do not substitute hidden fields, asset IDs, authenticated APIs, or application stores. Issue #3 remains open for broader live validation and ownership feasibility.

## Validation

Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:browser`. The browser suite loads the built extension into a temporary Chromium profile. The content-script test serves sanitised local fixtures at the configured URL using Playwright routing; it never contacts EA. All other HTTP requests are blocked and asserted absent.

The unit suite covers both supplied layouts, unknown fields, hidden-panel exclusion, malformed bio rows, class-only status, unrelated items, opt-in, view changes, repeated observations, recycled nodes, removal, and stop/restart. Chromium checks the real rendered main/bio visibility transition through the content-script bridge, alongside the original synthetic demo and reviewed export/download.

Unrelated untracked `… 2.*` copies remain in the shared workspace, including an extra WXT entrypoint. Validation uses a clean copy of intended project files and existing installed dependencies, leaving those copies untouched. Chromium requires execution outside the filesystem sandbox. On 2026-10-13 with Node 24.19.0, type checking, all 22 unit tests, the production build, and the Chromium integration suite passed. Chromium asserted zero external requests.

# Candidate reconciliation

A candidate describes compatible visible observations from one uninterrupted card container. It does not establish an owned item or a copy count. Session-local candidate and observation numbers are debugging references, never EA identifiers.

## Evidence and settling

The observer samples rendered fields on mutation delivery. Candidate publication waits for 250 ms without a changed sample, configurable through the third `Capture` constructor argument. A name followed by rating and position produces one candidate with provenance pointing to each raw sample. A stable name-only card still becomes an incomplete candidate.

A card that disappears before settling publishes the evidence already sampled, so a short visit does not disappear from the results. Stop cancels pending publication, retains raw debugging samples, and ends correlation. Re-enable starts new correlations. Clear stops capture and erases the session, including review flags.

Text changes inside a known card rescan that card. Structural changes outside known cards, scrolling, resizing, and tab visibility changes scan the root. Detached containers end correlation even when reinserted within one mutation delivery. Mutation delivery cannot recover intermediate markup created and removed synchronously before the browser exposes a rendered sample.

## Identity and conflicts

Compatible main and bio samples merge only inside a continuous visible container generation. Fields absent from the current view retain values previously seen visibly in that generation. Other missing fields stay `null`. The source and rendered view accompany every raw sample. Field confidence is `observed` or `unknown`, referring to visible text, not verified identity or ownership.

A conflicting non-null field starts a new candidate and flags both generations for review. Empty placeholders, loss of a previously visible name, detachments, and visibility gaps also end correlation. Changes to visibility-related attributes on a card or ancestor conservatively end correlation even if the final element is visible. Revisits remain separate. Same-name candidates receive a review flag and are never collapsed by name or rating.

A recycled node can briefly show a new name with old visible statistics. Those are raw observations, not verified facts about the new player. Later conflicts split candidates and retain both samples. Reuse between indistinguishable versions without any observable discontinuity remains undetectable. The `identity-unverified` flag therefore applies to every candidate, including apparently complete ones.

No candidate disappears because a card scrolls away. Missing cards do not imply sales or submissions. Up to 500 raw samples and 500 legacy distinct descriptions are retained. The UI and exports report truncation when either limit is reached. Sightings can continue beyond that limit.

## Locations and future confirmation

Captured candidates have location `unknown`. The current live layout does not verify main-club or SBC-storage context. Visible status text remains raw evidence and does not establish a location or a card-version key.

`InventoryItem` and `confirmInventory` define a future explicit confirmation boundary. No capture or UI action creates an owned item in this increment, so the confirmed-item count is zero. Fixture tests supply user-confirmed location and exact-version keys. The helper rejects a second confirmed item with the same known exact version in the main club, permits different versions and unknown versions, and allows identical versions in SBC Storage. It also rejects confirming the same candidate twice. Unknown-version records still need identity review before a later solver can safely use them.

## Review and exports

The candidate list labels records provisional, lists review reasons, and offers **Mark for review**. Flags remain in the tab's in-memory capture session until clear or page reload. Refresh diagnostics retrieves settled candidates and flags. Nothing is automatically persisted or uploaded.

The original export stays `sbc-dom-observations-v1`. The separate `sbc-inventory-candidates-v1` export contains raw samples, reconciled candidates, field provenance, review reasons, and explicit unconfirmed ownership. Deselecting a field removes its value from candidates and raw samples and clears its provenance. Visible identifiers remain deselected by default. Only **Download reviewed JSON** writes the preview to a local download.

## Verification limits

Run the checks from the repository root after `npm install` and `npx playwright install chromium`:

```sh
npm run typecheck
npm test
npm run build
npm run test:browser
```

Vitest exercises progressive rendering, partial cards, conflicts, node recycling, brief disappearance, revisits, configurable settling, stop and clear, provenance, redaction, and future confirmation rules. Chromium checks the built extension with synthetic markup, main-to-bio continuity, progressive rendering, review flags, candidate export, stop and clear, and zero external requests. The browser script's DOM actions apply only to fixtures.

These tests do not verify live EA virtualization, exact card-version identifiers, owned quantities, or complete club coverage. Further manually transcribed, sanitised evidence is needed for those claims under [issue #3](https://github.com/MattRSage/eafc-sbc-optimiser/issues/3). Manual browsing and visible DOM extraction may still violate EA's terms. No authenticated APIs, hidden state, network interception, or automated Web App actions are introduced.

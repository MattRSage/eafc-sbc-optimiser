# Validate a live inventory import manually

EA terms and account-enforcement risk remain unresolved. Project authorisation is not EA approval. Read the [import policy](import-policy.md) before using the extension on an account.

1. Build the extension with `npm run build` on Node.js 24.
2. Load `.output/chrome-mv3` through Chrome's **Load unpacked** control, or reload an existing installation.
3. Open the official Web App and sign in yourself. Do not share credentials, session cookies, tokens, private headers, or page HTML.
4. Open the extension popup. Confirm that no import runs before you select **Import club**. DOM capture is a separate opt-in control.
5. Select **Import club**. Watch the accepted item, page, request, and source-coverage counts.
6. If the import stops, record only the displayed problem code and coverage labels. Keep authentication, rate-limit, unsupported-service, or malformed-response failures outstanding. Do not bypass them with direct requests.
7. Select **Review imported items** when the run stops. Compare the club and storage counts with the Web App using manual navigation.
8. Compare selected cards and ratings locally. Check two copies of one definition for distinct instance IDs. Confirm that stored cards appear under SBC storage. Compare available names, category IDs and untradeable status. Missing names, position labels, ambiguous tradeability and default rarity remain unknown.
9. Start another import and select **Cancel import** while it runs. Confirm that the status remains cancelled after an in-flight response would have returned. Confirm that later pages are not added.
10. Start a fresh import manually. Compare counts and instance identity locally with the earlier run while keeping the club unchanged.
11. Reload the tab. Confirm that the import is idle and results are cleared.
12. Record a sanitised validation summary containing the date, Web App version if visible, aggregate count comparisons, passed checks, and problem codes. Record each untested check as outstanding. Do not include real instance IDs, raw responses, screenshots containing account data, or sensitive HTML.

Keep actual live evidence separate from the synthetic test results in [the adapter reference](web-app-import.md). A passing synthetic test or complete service traversal does not establish complete real-club coverage.

## Recorded scope (2026-11-17)

The user reported 325 club players and empty SBC storage after #14, confirmed those totals, and confirmed protection survived reopening and repeat import/save. This is user-reported evidence, not independent verification of every identity or coverage case. No real identifiers or raw payloads are recorded.

Outstanding: nonempty SBC storage, duplicate card identities, live cancellation, and accuracy of enriched player details. Cancellation remains covered by automated tests. Repeat the relevant steps above to extend this evidence; do not treat the aggregate totals as proof of all cases.

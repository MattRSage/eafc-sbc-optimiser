# Web App inventory adapter reference

Issue #9 adds an in-memory import through the signed-in Web App's inventory services. The popup provides **Import club**, progress, **Cancel import**, and **Review imported items**. Closing the popup leaves the explicitly started run active in that tab. Reopening the popup restores progress. Reloading or leaving the tab discards results. Reviewed results can now be saved separately to [local inventory](local-inventory.md). There is no automatic save, restart, or background synchronisation.

## Supported service contract

The adapter constructs `UTSearchCriteriaDTO` with `type = SearchType.PLAYER`, `offset`, and `count = 100`. Club requests start at offset zero and advance by 100. Each club criteria object overrides the inherited `cacheable` getter with `false`, so the service returns the fetched batch rather than a search of its growing cache. SBC storage uses a separate bounded whole-collection request with count 10,000 and requires `endOfList === true`.

| Source | Read operation | Successful observable response | Explicit final marker |
| --- | --- | --- | --- |
| Club | `services.Club.search(criteria)` | `{ success: true, response: { items, retrievedAll } }` | `retrievedAll === true` |
| SBC storage | `services.Item.searchStorageItems(criteria)` | `{ success: true, response: { items, endOfList } }` | `endOfList === true` |

Both operations must return an object with `observe(owner, callback)` and `unobserve(owner)`. The callback's second argument supplies the response. Missing methods produce `unsupported-service`. Missing final markers, oversized pages, empty nonfinal pages, invalid identities, and invalid ratings stop the run. There are no alternate endpoint attempts or retries.

Each source has a maximum of 100 service calls and a 15-second timeout per call. Club retrieval finishes before storage retrieval starts. The extension makes at most 200 service calls per run. The Web App may use its own caches or requests inside each call. The adapter does not inspect those requests or control the Web App's authentication.

## Inventory fields

| Normalized field | Service evidence | Validation and limits |
| --- | --- | --- |
| `instanceId` | `item.id` | Positive safe integer converted to string, or bounded nonzero identifier string |
| `definitionId` | `item.definitionId` | Same validation as instance identity; distinct copies retain distinct instance IDs |
| `rating` | `item.rating` | Integer 1–99; zero and absent values become unknown |
| `name`, `position`, `tradeable` | None retained in this spike | Always unknown |
| `provenance` | Adapter and selected source | `internal-inventory-service`, plus `club` or `sbc-storage` |

The public item entity supplies defaults, including `tradable = false`. Such defaults do not prove that an optional field was present in the service payload. The adapter therefore leaves tradeability unknown. Names and position labels need a separately validated mapping. Concept items are rejected. Extra entity fields never cross the page bridge.

The `OwnedInstance` type describes the engine's reported instance records. It does not certify real ownership. Results do not enter the DOM observation or confirmed-card stores.

## Completion and cancellation

`importClub` retains the issue #8 contract. `importInventory` runs both sources and reports their coverage separately. A complete result requires explicit final markers from both sources. The popup labels this **Complete service traversal: club + SBC storage**, with live coverage still unverified.

If storage fails, the result retains accepted club records and reports partial storage coverage. An instance reported by both sources stops storage retrieval with `conflicting-instance`; the earlier club record remains. A cancelled or failed import never establishes full coverage. Missing records never imply a sale or submission.

Cancellation detaches the active observable and prevents subsequent service calls. The Web App may finish a request already in flight. Its late callback cannot publish a completed result. Each new import has a fresh run ID, so stale bridge messages cannot replace the current result. A 20-second content-script watchdog cancels a run whose progress bridge stops responding.

## Injection and message boundary

Only the extension's content script can request background injection. The background checks the sender's top-level frame and exact Web App URL prefix. The manifest adds `scripting` and a host permission for the Web App. Chrome host permissions grant access at the origin level; the content-script match and background URL check restrict this implementation to the Web App path.

`inventory.js` is an unlisted script with no web-accessible-resource entry. It is injected into the MAIN world only after **Import club**. An initial `ready` and `begin` exchange confirms that the initiating run is still active before any service access. The handshake expires after one second. Page messages cannot inject the importer or start another run after it exits.

The message channel accepts only the current run's initial `begin`, `cancel`, and outbound progress. No message supplies a service name, method, URL, query, or endpoint. The content script checks the message source, origin, run ID, operation, and normalized snapshot. The bridge retains only known fields.

A same-origin page can observe or forge page-world messages. The run ID is a correlation value, not authentication. Shape validation does not turn page data into trusted ownership evidence. This extension does not defend against a compromised Web App.

## Evidence and persistence handoff

On 2026-11-17, the public, unsigned-in [official Web App bundle](https://www.ea.com/ea-sports-fc/ultimate-team/web-app/js/compiled_2.js?_=11414) exposed the two read operations, observable callbacks, final-marker fields, and item identity fields. The [club results controller](https://www.ea.com/ea-sports-fc/ultimate-team/web-app/js/compiled_3.js?_=11414) advances pagination through `criteria.offset` and `criteria.count`. This was inspection of public JavaScript, not a signed-in service response or proof of FC 27 compatibility. No competitor code was used.

Synthetic Vitest and Chromium fixtures verify the implemented contract. They cover opt-in, bridge filtering, sequential pagination, distinct copies, cancellation, late callbacks, repeat import, unsupported services, malformed responses, authentication failures, and incomplete storage coverage. The existing engine tests cover rate limits, repeated pages, request bounds, timeouts, and partial results.

Actual live import evidence: **none collected**. Identity stability, service defaults, effective page sizes, final-marker semantics, cache freshness, and complete real-club coverage remain unverified. Concurrent club changes can make pagination inconsistent. The adapter fails closed if the live service shape differs from this contract.

The persistence session must retain source coverage and verification status alongside records. It must not infer ownership validation from `status: complete`, merge DOM sightings into these records, or delete previous records because they are missing from a new run. The [manual validation procedure](validate-live-import.md) lists the remaining checks.

## Live validation diagnostics

A user-run live import stopped with `malformed`; a subsequent diagnostic run accepted 100 items, then stopped on a 200-item response with `malformed-page-size` and `retrievedAll === false`. This establishes a validation failure, not an empty club or a known root cause. The adapter now reports fixed `malformed-*` codes identifying envelope, response, items, page-size, end-marker, empty-page, item, concept, rating, instance-id, definition-id, or observable validation failures. These codes contain no response values or identifiers. Public `ocompiled.js?_=11414` inspection establishes that `getClubItems` selects either a repository search or the newly fetched batch based on `criteria.cacheable`. The default criteria getter enables caching. The adapter now disables this per club request without modifying shared prototypes or repositories. The same public code shows storage returning a collection with `endOfList: true`; it has a separate 10,000-item safety bound. Synthetic tests reproduce growing and prepopulated caches and repeat imports. Live validation of the fix remains outstanding.

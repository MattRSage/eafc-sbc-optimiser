# Synthetic inventory import contract

`src/inventory/import.ts` implements an in-memory club import engine. It has no live adapter, persistence, UI integration, or EA requests. `tests/import.test.ts` supplies synthetic services. DOM observations and provisional candidates remain separate.

## Service boundary

`InventoryService.readClubPage({ cursor, signal })` returns a promise of an untrusted value. The first cursor is `null`; subsequent cursors come from the preceding page. The normalized response shape is:

```json
{
  "items": [
    {
      "instanceId": "synthetic-instance-a",
      "definitionId": "synthetic-definition-a",
      "name": "Invented Player",
      "rating": 80,
      "position": "GK",
      "tradeable": false
    }
  ],
  "nextCursor": null
}
```

Both IDs must be nonempty strings. `instanceId` identifies one owned copy; `definitionId` identifies the card definition shared by copies. Optional fields may be absent or null and become null (unknown). Supplied names and positions must be nonempty strings, ratings must be integers from 0 to 99, and tradeability must be boolean. Other fields are discarded. A malformed item rejects the entire page.

`nextCursor` must explicitly be null for the final page, including an empty final page. Otherwise it must be a nonempty opaque string. The engine does not infer completion from page length. An adapter must establish an authoritative end condition before emitting null.

`service.evidence` supplies either `synthetic-service` or `internal-inventory-service` provenance. Every accepted item also records its source as `club`. Synthetic evidence never establishes real ownership.

Adapters report authentication, rate-limit, and service failures with `InventoryServiceError`. Other rejections become `service`. Error text and raw responses are never copied into snapshots or logs. There are no retries.

## Lifecycle and completion

`idleImport()` returns an idle snapshot without invoking a service. A future UI must call `importClub` only after a deliberate start action. The engine alone cannot prove user consent.

| Status | Meaning |
| --- | --- |
| `idle` | No import has started. |
| `running` | The club import is active. |
| `cancelled` | The caller aborted. Previously accepted pages remain available. |
| `partial` | At least one page was accepted before an error or request limit. |
| `failed` | An error occurred before any page was accepted. |
| `complete` | All accepted club pages passed validation and the last page explicitly ended pagination. |

`complete` applies only to this club run. `coverage.club` becomes complete only at that point. `coverage['sbc-storage']` remains `not-implemented` in every state; a complete club run does not establish full inventory coverage. Cancellation before starting leaves club coverage `not-started`; interrupted active runs retain `partial` coverage.

The default maximum is 100 requests with a 15-second timeout per request. Options can change these positive integer bounds. Requests run sequentially. The engine stops on repeated page instance-ID lists, repeated cursors, malformed data, conflicting instance identity, service failures, cancellation, or exhausted bounds. Cancellation and timeout abort the active request and settle the engine even if the service ignores its signal. The adapter must honor the signal where possible; the engine cannot undo a service operation already started.

The first accepted record for an instance wins. Overlapping pages and duplicate records do not inflate ownership. A later record with the same instance ID but a different definition ID rejects the entire page. Changes to optional fields on repeated instances are not reconciled in this spike.

`onProgress` receives detached snapshots at startup, after accepted nonfinal pages, and on termination. `requests` counts attempted calls; `pages` counts accepted pages. Progress callbacks must not throw. Cancellation discards a response that arrives after abort. Results contain only accepted pages and never modify an earlier import. Missing items do not establish sale or submission; callers must not use this snapshot as a deletion list.

## Adapter handoff

The next session must verify instance-ID stability, card-definition identity, pagination and end conditions, available fields, service failure mapping, and cancellation behavior. Club mutations during pagination are unresolved: this engine does not guarantee an atomic snapshot. SBC storage retrieval and cross-source instance reconciliation remain unimplemented.

The adapter must use only the signed-in Web App's own read-only inventory services for an explicit import. It must not extract authentication material or construct authenticated HTTP requests. Project authorization is not EA approval, and terms and account-enforcement risk remain unresolved. See [the import policy](import-policy.md).

## Verification

From the repository root, run:

```sh
npm install
npm run typecheck
npm test
npm run build
```

For the import tests alone, run `npm test -- tests/import.test.ts`. All fixtures use invented identifiers and values; no live account is needed.

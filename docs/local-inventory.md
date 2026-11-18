# Local inventory reference

The popup stores reviewed imports in the extension's IndexedDB database, `sbc-local-inventory`. No new permissions, backend, telemetry, or dependency is required. The existing import remains in memory until the user saves its stopped result.

## Profiles and identity

Each local profile has a random local ID and a user-supplied label. Profiles do not contain account identifiers or authentication data. Every save requires the user to select a profile and confirm that the import belongs to that account or club. The extension cannot detect account switches. An incorrect confirmation can combine records from different accounts, so profile selection is a user responsibility.

Reconciliation uses the imported instance ID within that profile. Two copies with the same definition ID remain separate. A repeated import updates existing instances. A changed definition for an existing instance, or duplicate instance IDs within one snapshot, rejects the entire save. A source change updates the existing record without creating a second copy.

Instance IDs pass the existing adapter's shape validation. This does not establish real ownership or live identity stability. DOM observations never enter this store.

## Saved evidence and freshness

Each record retains allowlisted reported fields, service provenance, last-seen time, protection, and manual corrections. The profile also retains the latest saved import's status, problem, source coverage, request count, page count, and save time. This is the latest receipt, not an import history. Re-saving an old result records the save time, not a new service retrieval.

| Freshness | Meaning |
| --- | --- |
| `seen` | The instance appears in the latest saved import. |
| `missing-unconfirmed` | The instance is absent and its previous source reports complete traversal. It remains stored. |
| `not-rechecked` | The instance is absent and its previous source does not report complete traversal. It remains stored. |

Coverage describes the latest saved traversal, not the completeness of all retained records. A failed or cancelled import retains prior cards and marks absent records as not rechecked when their sources are incomplete. Neither absence nor complete traversal establishes a sale or submission. Removal requires confirmation on the specific missing record.

Protection flags survive imports. Manual overrides accept name, rating, position, and tradeable, with a user-correction timestamp. Null explicitly means unknown. Re-import updates reported evidence but keeps the overrides. The correction form offers Imported (clear the override), Unknown (save null), and Custom (enter a value) for each field. Choosing Imported restores the reported value. Rows identify corrected fields, while a nested diagnostics section retains the imported evidence. Identity and source fields cannot be corrected.

## Persistence and export

A single read/write transaction reads the current document, applies a change, and writes the document and receipt together. Concurrent writers serialize in IndexedDB. An aborted write leaves the previous committed document intact. The UI reports a save failure and does not claim success before transaction completion.

Exports contain the selected allowlisted fields, a format marker, the latest import receipt, and the live-verification warning. Profile labels and local profile IDs are excluded. Imported instance and definition IDs are unchecked by default. Deselecting a field also removes that field from nested manual corrections. Changing field selection invalidates the preview; downloading uses exactly the reviewed preview.

Clear-local-inventory replaces the stored document with an empty document in one transaction. It removes all profiles, records, protection choices, corrections, and receipts. It does not clear DOM observation sessions or the tab's in-memory import. Browser storage can also be lost if the extension is removed or the browser profile is erased.

## Verification limits

Synthetic unit tests cover reconciliation, source movement, failures, missing instances, correction validation, protection, profile isolation, and export filtering. Synthetic Chromium tests exercise the built popup, reloads, repeated saves, profile confirmation, filters, corrections, protection, reviewed downloads, clearing, and a deliberately aborted IndexedDB transaction.

No signed-in live import has been performed. Identity stability, cache freshness, pagination semantics, FC 27 compatibility, and real club coverage remain unverified. The [live validation procedure](validate-live-import.md) still applies. After that validation, save the reviewed import, reload the popup, select the profile, repeat the import, and check that distinct copies and protection choices remain intact. Record live evidence separately from synthetic results. EA terms and account-enforcement risk remain unresolved.

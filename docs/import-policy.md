# Read-only club import policy

## Decision

On 2026-11-17, the project owner approved user-initiated club import through the signed-in EA Web App's internal inventory services. The goal is full-club import without browsing every card. The owner accepted the unresolved EA terms and account-enforcement risk discussed before approval. This decision does not establish EA permission.

The extension now implements the [inventory adapter](web-app-import.md) alongside the DOM spike described in [the feasibility report](feasibility.md). The adapter has synthetic test coverage. Scoped user-reported live checks are recorded in the [validation procedure](validate-live-import.md); full live identity and coverage validation remains outstanding.

## Permitted scope

- Start each import through an explicit user action after the user signs into the official Web App themselves.
- Call the Web App's own read-only inventory services, including paginated retrieval of club players and SBC storage.
- Read the inventory results and the internal inventory state needed for that import. Let the Web App manage authentication without extracting credentials, cookies, tokens, or private headers.
- Retain only the inventory fields needed by the optimiser in browser storage. Require deliberate review for export.

The exception does not permit direct authenticated HTTP clients, arbitrary endpoint scraping, network interception, unrelated hidden-state access, automatic imports on login, or ongoing background synchronisation. Automatic clicks, scrolling, bidding, transfers, squad changes, and SBC submissions remain prohibited. Do not copy competitor implementation code.

## Implementation requirements

An importer must support cancellation, bounded pagination, and clear incomplete-result reporting. Stop on authentication failures, service errors, repeated pages, or unexpected response shapes. Do not retry indefinitely or bypass rate limits.

Validate service results at the boundary using synthetic fixtures. Keep source provenance and distinguish card definitions from owned item instances. Missing fields remain unknown. DOM sightings never establish duplicate ownership, and missing records never establish a sale or submission without confirmation.

Tests must cover opt-in, pagination termination, cancellation, partial results, malformed responses, and duplicate instance handling. Keep real identifiers, raw responses, and authentication data out of fixtures, logs, and commits.

## Policy evidence reviewed

- [EA's FC rules](https://help.ea.com/en/articles/ea-sports-fc/fc-rules/) advise against third-party browser extensions and restrict modifications to interactions with EA.
- [EA's User Agreement](https://www.ea.com/legal/user-agreement) restricts data extraction and unauthorised third-party programs. Read-only access does not establish an exemption.
- [EA's Community API announcement](https://www.ea.com/games/ea-sports-fc/news/pitch-notes-fc26-community-api-update), dated 27 July 2026, names FUT.GG, FUTBIN, and FUTWIZ as approved launch partners and states that applications are closed. This is not evidence of EasySBC approval or permission for this project.
- [EasySBC's FAQ](https://www.easysbc.io/tr/legal/faq) describes its own assessment of compliance and does not guarantee safety. Its commercial availability does not establish EA authorisation.

The owner's approval supersedes the earlier DOM-only development restriction for this narrow import scope. It does not waive the remaining boundaries in [AGENTS.md](../AGENTS.md).

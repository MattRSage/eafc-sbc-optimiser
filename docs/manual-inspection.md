# Collect a sanitised Web App DOM example

Use this guide to provide evidence for [Issue #3](https://github.com/MattRSage/eafc-sbc-optimiser/issues/3). A narrow profile now supports the supplied player-list main and bio layouts. More evidence is needed for other layouts, browsing behaviour, and owned-card identity. Account-policy acceptability remains unresolved. See the [feasibility decision](feasibility.md).

## Prepare Chrome

1. Review [EA's current User Agreement](https://www.ea.com/legal/user-agreement), especially sections 2 and 8. Manual browsing does not establish permission for extension-based extraction. Do not proceed if inspection is unacceptable for your account.
2. Open the Web App yourself through [EA's help page](https://help.ea.com/en/articles/ea-sports-fc/early-web-and-companion-app-start/). Sign in yourself if necessary. Never send credentials to this project.
3. Keep extension capture disabled. This inspection does not require enabling the observer.
4. Record only the final hostname and path, such as `www.ea.com/ea-sports-fc/ultimate-team/web-app/`. Omit query strings and fragments. Record the displayed game version, UI language, and inspection date.
5. Manually open your club's player list. Open Chrome DevTools with **View > Developer > Developer Tools**, then select **Elements**.

Use only Elements and its Styles or Computed panels. Do not use Network, Application, Sources, the Console, page source, HAR exports, or saved whole pages. Do not send screenshots containing your club name, account name, balances, or other account information.

## Transcribe one visible card

1. Use the Elements picker to select a player name that you can currently see in the Web App.
2. Expand the nearest ancestor that contains exactly that player's card. Avoid selecting the list, application root, or page body.
3. In a new local text file outside this repository, manually transcribe the minimal tag nesting and reusable CSS class names around the visible fields. Do not use **Copy outerHTML** or **Copy element** on the live page. Those can include hidden attributes and account data.
4. Replace values as you transcribe: use `Alex Example`, `84`, `CM`, `Example United`, `Demo League`, and `Example Nation`. Replace any visibly printed identifier with `DEMO-1`. Preserve whether two examples showed the same or different identifiers using invented placeholders only.
5. Omit all other attributes, including `id`, `data-*`, event handlers, image sources, links, and inline styles. Omit scripts, comments, hidden descendants, and unrelated text. Keep only generic class names that you checked contain no account-specific values. If a necessary class contains an identifier, replace it and note that replacement.
6. For each field in the table below, record whether it is visible text, image-only, absent, or only present after you manually open details. Record the nearest reusable selector only when you observed it in Elements. Leave it unknown otherwise.
7. Review the resulting text before sharing. It must contain no real instance identifiers, account identifiers, URLs, credentials, or session data. The fixture is a hand-transcribed approximation, so note any removed markup that affects layout or visibility.

Do not infer nation or club from an image filename. Do not interpret a DOM `id` or `data-*` value as an owned-card identifier. A printed identifier could still identify a player definition rather than an owned copy. If details are shown in a separate panel, keep that example separate and describe which visible card you selected. Do not assume every card inherits the open panel's properties.

Repeat for one ordinary card, one different card type, and one card with missing or image-only properties. If available, include two apparently identical owned copies and a card in SBC storage. A few minimal examples are enough; do not collect your whole club.

## Check manual list behaviour

Keep the inspected card selected in Elements. Perform these actions yourself and write down what you observe. Do not run scripts to navigate, scroll, or count cards.

| Manual action | Evidence to record |
| --- | --- |
| Scroll until the selected card leaves view, then return | Does the selected node remain connected, disappear, or show another player's text? Is offscreen content still in Elements? |
| Change one filter, then reset it | Are card nodes replaced or reused? Is there a blank/loading phase? Does the same card return? |
| Use next and previous page, if present | Record whether pagination exists and whether old nodes disappear or change. Do not assume infinite scrolling. |
| Open and close player details | Which extra fields appear? Are they part of the card or a separate panel? |
| View two identical-looking copies, if available | Which visible text distinguishes the copies? If none, record instance identity as unknown. |
| Manually open SBC storage, if available | Is storage membership visible on each card, or only in the page heading? |
| Resize the window or switch list layout | Do classes, text, clipping, or hidden duplicates change? |

For visibility questions, inspect Styles or Computed and record only the relevant property, such as `display: none` or `overflow: hidden`. Do not copy complete style sheets. If you cannot tell whether a node is recycled, record unknown.

## Return this evidence record

Copy this template into your reply alongside the reviewed minimal examples. Do not include raw live HTML.

```text
Inspection date:
Game version shown:
UI language:
Final hostname/path only:
View: club list / manually opened details / SBC storage
Example labels: A, B, C
Markup provenance: manually transcribed from Elements; values invented
Classes or structure removed/changed during sanitisation:

Field          Visible text / image-only / absent   Observed relative selector
Name:
Overall rating:
Position:
Club:
League:
Nation:
Card type/rarity:
Tradeable status:
SBC storage status:
Printed identifier:

Identifier scope: unknown / evidence for definition / evidence for owned copy
Evidence supporting that scope, using invented identifiers:
Scroll/revisit behaviour:
Filter/reset behaviour:
Pagination behaviour (or no visible pagination):
Node reuse or replacement:
Loading placeholders:
Clipping/hidden duplicate markup:
Details-panel relationship:
Unexamined cases:
```

Further examples can extend the narrow selector profile only after review and fixture tests. If visible text cannot distinguish owned copies, the product must keep observations separate from inventory and require manual ownership confirmation. Missing fields remain unknown.

## Reproduce observer behaviour without an EA account

Load the production extension and open its synthetic demo as described in the [README](../README.md). Select **Enable capture**, then use a control and select **Refresh diagnostics** after each step:

| Action | Visible candidates | Retained descriptions | Sightings |
| --- | ---: | ---: | ---: |
| Enable capture on a fresh demo | 2 | 2 | 2 |
| Recycle first card | 2 | 2 | 3 |
| Hide or show first card | 1 | 2 | 3 |
| Hide or show first card again | 2 | 2 | 4 |
| Disable capture, then recycle first card | 2 | 2 | 4 |
| Enable capture again | 2 | 2 | 5 |

Recycling replaces the first card's contents while preserving its element. Both descriptions already exist in the initial fixture. These counts exercise observer behaviour only and say nothing about owned quantities or the real EA layout.

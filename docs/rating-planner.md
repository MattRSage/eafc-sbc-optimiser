# Experimental rating-only planner

This spike recommends cards from a saved local profile for an 11-player Puzzle SBC with a minimum squad rating and no other requirements. It rejects Item Score and other constraints. It never reads the Web App, fills a squad, submits cards, or requests prices. Recommendations are provisional and do not establish ownership.

## Use the planner

1. Select a saved local profile in the popup.
2. Open **Experimental rating-only SBC planner** and enter the minimum rating.
3. Check the challenge in the game yourself. Confirm that it requires exactly 11 players and only a minimum rating. Leave the confirmation unchecked for any other challenge.
4. Review each candidate you want considered. Confirm that the card is currently owned, real, non-loan and eligible for that Puzzle SBC. Enter a player identity label. Use the same label for every version of one footballer and different labels for different people, including namesakes.
5. Select **Find local squad**. Review the suggested instances, provisional calculated rating, objective and excluded records. An incomplete search may show a valid best-so-far squad, but cannot establish optimality or impossibility.
6. Verify the actual game rating and every requirement yourself before any manual submission.

Review labels and confirmations exist only in memory. Changing profiles, inventory filters or saved records resets the review. Changing planner requirements or eligibility clears the previous recommendation. Every search rereads local storage and rejects a review if its profile changed in another popup. Results describe a snapshot and cannot track later account changes.

## Eligibility and identity

Protected cards, duplicate instance IDs, unknown or invalid ratings, missing-unconfirmed records, not-rechecked records and SBC storage records are excluded. Storage is deliberately unsupported until its live eligibility is established. Manual rating corrections replace imported ratings for planning, including explicit unknown overrides. Results mark corrected ratings.

The importer does not retain reliable loan flags or a base-player identity across special versions. The planner therefore requires per-run user evidence rather than inferring eligibility or extracting more application state. Unreviewed cards remain excluded. A review must confirm that a card is neither a loan nor a concept. No automatic eligibility guarantee is claimed.

The search permits at most one instance of each definition and one of each reviewed player identity. Definition IDs alone cannot identify every version of a footballer. Correct user labels are necessary. Unknown names, positions, tradeability and category IDs are irrelevant to the supported constraint and do not disqualify an otherwise reviewed card. DOM observations never enter the planner.

## Rating evidence and release gate

Reviewed on 2026-11-18:

- [EA's SBC help](https://help.ea.com/en/articles/ea-sports-fc/sbcs/) confirms that FC 27 Puzzle SBCs retain squad-rating requirements and distinguishes them from Streamlined Item Score SBCs. It does not specify rounding or a rating formula.
- [KalunBot's calculator explanation](https://kalunbot.com/herramientas/calculadora-media-sbc) describes adding excess above the unrounded mean, rounding the corrected total, then dividing by 11 and flooring. Its publisher identifies this as a community-derived formula and defers to the game.
- [RingX's calculator](https://ringx.cc/free-tools/sbc-rating-calculator) provides examples, but its prose omits rounding the corrected total. For nine 84s and two 83s, its listed result is 84; flooring the unrounded corrected average gives 83. The round-total model gives 84. This inconsistency prevents treating the prose as authoritative.

The implemented **provisional community model** is:

```text
sum = sum of the 11 ratings
mean = sum / 11
bonus = sum(max(0, rating - mean))
squad rating = floor(round(sum + bonus) / 11)
```

Production calculation uses integer numerators to avoid floating-point boundary drift. The independent validator computes the formula separately from the selected source records.

Synthetic examples include eleven 84s → 84, nine 84s plus two 83s → 84, eight 84s plus three 83s → 83, and eight 85s plus two 87s and one 88 → 86. These validate the implementation of the stated model, not FC 27 itself. The arithmetic mean of the last example is about 85.64.

**Issue #17's evidence criterion is still open.** Before treating this as a verified FC 27 recommender, obtain manually recorded in-game results for the boundary examples, with game version and date. Do not automate EA interactions or collect raw account data. If the observed rating differs, update the formula and fixtures before removing the provisional label. The implementation PR remains draft pending this evidence.

## Objective and bounds

The objective minimises the sum of squared card ratings. Squaring penalises higher ratings; it does not represent coin value, rarity, gameplay value or market cost. Protect valuable cards explicitly. Optimal means optimal only within the reviewed eligible records under this objective and provisional model.

The pure search enumerates distinct combinations with cost and optimistic rating bounds. It supports up to 2,000 saved records, visits at most 250,000 candidate steps and has recursion depth at most 11. It runs synchronously after the local storage check. The deterministic step limit is a computation bound, not a wall-clock guarantee. Larger pools can exhaust it. The UI reports incomplete search separately from an exhaustive no-solution result. No records are silently truncated. Every returned squad passes an independent source-based validator.

## Verification

Run `npm run typecheck`, `npm test`, `npm run build` and `npm run test:browser`. Install synthetic-test Chromium with `npx playwright install chromium` if needed.

Vitest covers rounding examples, unsupported constraints, protection, unknown fields, corrections, stale records, storage exclusion, review eligibility, duplicate instances, definitions and player labels, insufficient cards, impossible requirements and search exhaustion. Small fixtures compare objective values against exhaustive enumeration. Browser verification seeds invented IndexedDB records, enters requirements and reviews, checks recommendations and invalidation, and verifies no network requests. No live EA actions are part of these tests.

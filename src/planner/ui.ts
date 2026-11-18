import { transact, verification, type Profile } from '../inventory/store';
import { prepare, solve, type Reviews } from './solver';

export function mountPlanner(root: HTMLElement, profile: Profile | undefined) {
  root.innerHTML = `<details><summary>Experimental rating-only SBC planner</summary>
    <p>Supports 11-player Puzzle SBCs with minimum squad rating only. Item Score, chemistry, quality, rarity, positions, clubs, nations and leagues are unsupported.</p>
    <p>Rating uses a provisional community formula. FC 27 rounding has not been independently verified. Check the squad rating in the game before any manual submission.</p>
    <p>Objective: minimise the sum of squared card ratings to discourage sacrificing high-rated cards. This is not a coin-price estimate.</p>
    <p>${verification} Storage, protected, missing and not-rechecked records are excluded. Unknown name, position and tradeability do not affect this rating-only model. Manual rating corrections apply.</p>
    <label>Minimum squad rating <input id="planner-rating" type="number" min="1" max="99" value="84"></label>
    <label><input id="planner-shape" type="checkbox">I checked the challenge: exactly 11 players, minimum rating only, no other constraints.</label>
    <p>Review each candidate you want to use. Confirm that it is currently owned, a real non-loan player card eligible for this Puzzle SBC. Enter the same player label for every version of the same footballer (use a distinct label for different people with the same name). Labels and eligibility confirmations are used only for this review and are not saved. Unreviewed cards are excluded.</p>
    <div id="planner-candidates"></div>
    <button id="planner-solve" ${profile ? '' : 'disabled'}>Find local squad</button>
    <p id="planner-status" role="status">${profile ? 'Review candidates before searching.' : 'Choose a saved profile first.'}</p>
    <div id="planner-result"></div></details>`;
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const reviews: Reviews = Object.create(null);
  const clearResult = () => { el('planner-result').replaceChildren(); el('planner-status').textContent = 'Requirements or eligibility changed. Search again.'; };
  const blocked = new Map(prepare(profile?.items ?? [], {}).excluded.map(e => [e.instanceId, e.reason]));
  for (const item of profile?.items ?? []) {
    const card = { ...item.reported, ...item.corrections };
    const row = document.createElement('p');
    const reason = blocked.get(card.instanceId);
    const label = document.createElement('label');
    const eligible = document.createElement('input'); eligible.type = 'checkbox';
    const player = document.createElement('input'); player.type = 'text'; player.maxLength = 100; player.placeholder = 'Player identity label';
    player.setAttribute('aria-label', `Player identity for ${card.instanceId}`);
    eligible.setAttribute('aria-label', `Eligible ${card.instanceId}`);
    if (reason !== 'Eligibility or player identity not reviewed') {
      row.textContent = `${card.name ?? 'Unknown name'} · ${card.instanceId}: excluded — ${reason}`;
    } else {
      label.append(eligible, `${card.name ?? 'Unknown name'} · ${card.rating} · ${card.instanceId} — confirmed eligible `);
      row.append(label, player);
      const update = () => { reviews[card.instanceId] = { eligible: eligible.checked, playerKey: player.value }; clearResult(); };
      eligible.onchange = update; player.oninput = update;
    }
    el('planner-candidates').append(row);
  }
  el('planner-rating').oninput = clearResult; el('planner-shape').onchange = clearResult;
  el('planner-solve').onclick = async () => {
    clearResult();
    const button = el<HTMLButtonElement>('planner-solve'); button.disabled = true;
    try {
      if (!profile) throw new Error('Choose a saved profile first.');
      const latest = (await transact()).profiles.find(p => p.id === profile.id);
      if (JSON.stringify(latest) !== JSON.stringify(profile)) throw new Error('Saved inventory changed. Reselect the profile or reopen the popup, then review candidates again.');
      if (!root.isConnected || !root.contains(button)) return;
      const result = solve(profile.items, reviews, { size: 11, minRating: Number(el<HTMLInputElement>('planner-rating').value), otherConstraints: !el<HTMLInputElement>('planner-shape').checked });
      const status = result.status === 'optimal' ? 'Optimal for the reviewed candidates and stated objective.' : result.status === 'no-solution' ? 'No solution among reviewed eligible cards.' : 'Search limit reached. Search is incomplete; this does not prove no solution or optimality.';
      el('planner-status').textContent = `${status} ${result.visited} search steps. ${result.excluded.length} excluded records.`;
      const output = el('planner-result');
      if (result.squad) {
        const summary = document.createElement('p');
        summary.textContent = `Suggested 11 cards · calculated rating ${result.rating} · required ${el<HTMLInputElement>('planner-rating').value} · sum of squared ratings ${result.cost}. ${result.status === 'incomplete' ? 'Best found so far.' : ''} Provisional rating model; manually verify current ownership, eligibility, identities and all game requirements. Submission stays manual.`;
        const list = document.createElement('ul');
        for (const card of result.squad) {
          const row = document.createElement('li'); row.textContent = `${card.name ?? 'Unknown name'} · ${card.rating}${card.corrected ? ' (manual correction)' : ''} · ${card.instanceId} · player: ${card.playerKey}`; list.append(row);
        }
        output.append(summary, list);
      }
      const exclusions = document.createElement('details');
      const summary = document.createElement('summary'); summary.textContent = 'Excluded records'; exclusions.append(summary);
      for (const excluded of result.excluded) {
        const row = document.createElement('p'); row.textContent = `${excluded.instanceId}: ${excluded.reason}`; exclusions.append(row);
      }
      output.append(exclusions);
    } catch (error) { el('planner-status').textContent = error instanceof Error ? error.message : 'Local search failed.'; }
    finally { button.disabled = false; }
  };
}

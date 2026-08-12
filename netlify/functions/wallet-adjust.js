import { json, noContent, readJson } from './_shared/http.js';
import { adjustBalance, bindBlobs } from './_shared/walletStore.js';

// Roulette (and any other in-app cash delta) settles through here when the
// paid wallet is active, so Netlify Blobs stays the source of truth.
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return noContent();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  bindBlobs(event);

  const body = readJson(event);
  if (!body) return json(400, { error: 'invalid_json' });

  const playerId = String(body.playerId || '').trim();
  const deltaCents = Math.floor(Number(body.deltaCents));
  if (!playerId) return json(400, { error: 'player_id_required' });
  if (!Number.isFinite(deltaCents) || deltaCents === 0) {
    return json(400, { error: 'invalid_delta' });
  }
  // Cap a single adjust so a buggy client can't wipe or inflate wildly.
  if (Math.abs(deltaCents) > 1_000_000) {
    return json(400, { error: 'delta_too_large' });
  }

  const result = await adjustBalance(playerId, deltaCents);
  if (!result.ok) {
    return json(402, {
      error: result.reason,
      balanceCents: result.wallet.balanceCents,
      balance: result.wallet.balanceCents / 100,
    });
  }

  return json(200, {
    ok: true,
    balanceCents: result.wallet.balanceCents,
    balance: result.wallet.balanceCents / 100,
    ownedGameIds: result.wallet.ownedGameIds,
  });
}

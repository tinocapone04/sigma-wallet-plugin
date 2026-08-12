import { json, noContent, readJson } from './_shared/http.js';
import { priceForGame } from './_shared/prices.js';
import { bindBlobs, purchaseGame } from './_shared/walletStore.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return noContent();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  bindBlobs(event);

  const body = readJson(event);
  if (!body) return json(400, { error: 'invalid_json' });

  const playerId = String(body.playerId || '').trim();
  const gameId = String(body.gameId || '').trim();
  if (!playerId) return json(400, { error: 'player_id_required' });
  if (!gameId) return json(400, { error: 'game_id_required' });

  const priceCents = priceForGame(gameId);
  if (priceCents === null) return json(404, { error: 'unknown_game' });

  const result = await purchaseGame(playerId, gameId, priceCents);
  if (!result.ok) {
    return json(402, {
      error: result.reason,
      balanceCents: result.wallet.balanceCents,
      ownedGameIds: result.wallet.ownedGameIds,
    });
  }

  return json(200, {
    ok: true,
    gameId,
    priceCents,
    balanceCents: result.wallet.balanceCents,
    balance: result.wallet.balanceCents / 100,
    ownedGameIds: result.wallet.ownedGameIds,
  });
}

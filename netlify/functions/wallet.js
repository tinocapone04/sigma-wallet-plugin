import { json, noContent } from './_shared/http.js';
import { bindBlobs, getWallet } from './_shared/walletStore.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return noContent();
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  bindBlobs(event);

  const playerId = String(event.queryStringParameters?.playerId || '').trim();
  if (!playerId) return json(400, { error: 'player_id_required' });

  const wallet = await getWallet(playerId);
  return json(200, {
    balanceCents: wallet.balanceCents,
    // Dollars for the existing Roulette UI which speaks in whole dollars.
    balance: wallet.balanceCents / 100,
    ownedGameIds: wallet.ownedGameIds,
    currency: 'usd',
  });
}

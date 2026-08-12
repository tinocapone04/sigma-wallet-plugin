import { json, noContent, readJson } from './_shared/http.js';
import { bindBlobs, creditCheckoutSession, getWallet } from './_shared/walletStore.js';

// Local/smoke-test only. Disabled unless ALLOW_DEV_CREDIT=true.
// Simulates a successful Checkout webhook so you can exercise purchase /
// Roulette without Stripe keys or the Stripe CLI.
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return noContent();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (process.env.ALLOW_DEV_CREDIT !== 'true') {
    return json(403, { error: 'dev_credit_disabled' });
  }
  bindBlobs(event);

  const body = readJson(event);
  if (!body) return json(400, { error: 'invalid_json' });

  const playerId = String(body.playerId || '').trim();
  const amountCents = Math.floor(Number(body.amountCents) || 0);
  if (!playerId) return json(400, { error: 'player_id_required' });
  if (amountCents < 100 || amountCents > 100000) {
    return json(400, { error: 'invalid_amount' });
  }

  const sessionId = `dev_${playerId}_${Date.now()}`;
  const result = await creditCheckoutSession(playerId, sessionId, amountCents);
  const wallet = result.wallet || (await getWallet(playerId));
  return json(200, {
    ok: true,
    credited: result.credited,
    sessionId,
    balanceCents: wallet.balanceCents,
    balance: wallet.balanceCents / 100,
    ownedGameIds: wallet.ownedGameIds,
  });
}

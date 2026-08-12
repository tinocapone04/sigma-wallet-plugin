import Stripe from 'stripe';
import { json, noContent, readJson } from './_shared/http.js';
import { bindBlobs, creditCheckoutSession, getWallet } from './_shared/walletStore.js';

// Webhook-free crediting: the UI calls this after Stripe.js fires `onComplete`.
// We retrieve the Checkout Session server-side, confirm it is actually paid,
// then credit the ledger. creditCheckoutSession is idempotent by session id,
// so a (still-configured) webhook firing later can't double-credit.
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return noContent();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  bindBlobs(event);

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return json(503, { error: 'stripe_not_configured' });

  const body = readJson(event);
  if (!body) return json(400, { error: 'invalid_json' });

  const playerId = String(body.playerId || '').trim();
  const sessionId = String(body.sessionId || '').trim();
  if (!playerId) return json(400, { error: 'player_id_required' });
  if (!sessionId) return json(400, { error: 'session_id_required' });

  const stripe = new Stripe(secret);

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error('checkout-credit retrieve failed', err.message);
    return json(502, { error: 'session_retrieve_failed', message: err.message });
  }

  if (session.metadata?.playerId && session.metadata.playerId !== playerId) {
    return json(403, { error: 'player_mismatch' });
  }
  if (session.payment_status !== 'paid') {
    return json(402, { error: 'payment_not_completed', status: session.payment_status });
  }

  const amountCents = Number(session.amount_total ?? session.metadata?.amountCents ?? 0);
  if (!amountCents) return json(400, { error: 'invalid_amount' });

  const result = await creditCheckoutSession(playerId, session.id, amountCents);
  const wallet = result.wallet || (await getWallet(playerId));
  return json(200, {
    ok: true,
    credited: result.credited,
    sessionId: session.id,
    balanceCents: wallet.balanceCents,
    balance: wallet.balanceCents / 100,
    ownedGameIds: wallet.ownedGameIds,
  });
}

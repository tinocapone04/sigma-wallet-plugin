import Stripe from 'stripe';
import { json, noContent, readJson } from './_shared/http.js';
import { bindBlobs, creditCheckoutSession } from './_shared/walletStore.js';

const MIN_CENTS = 100;
const ALLOWED = new Set([500, 1000, 2500, 5000]);

// One-click top-up: charge Stripe's test Visa (4242…) server-side so users
// never see Checkout or enter card details. Test-mode keys only.
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return noContent();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  bindBlobs(event);

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return json(503, { error: 'stripe_not_configured' });
  if (!secret.startsWith('sk_test_')) {
    return json(403, { error: 'auto_topup_test_mode_only' });
  }

  const body = readJson(event);
  if (!body) return json(400, { error: 'invalid_json' });

  const playerId = String(body.playerId || '').trim();
  const amountCents = Math.floor(Number(body.amountCents));
  if (!playerId) return json(400, { error: 'player_id_required' });
  if (!Number.isFinite(amountCents) || amountCents < MIN_CENTS) {
    return json(400, { error: 'invalid_amount' });
  }
  if (!ALLOWED.has(amountCents) && amountCents % 100 !== 0) {
    return json(400, { error: 'invalid_amount' });
  }

  const stripe = new Stripe(secret);

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      confirm: true,
      // Stripe test helper ≡ card 4242 4242 4242 4242
      payment_method: 'pm_card_visa',
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      metadata: {
        playerId,
        amountCents: String(amountCents),
      },
      description: `Sigma Wallet top-up $${(amountCents / 100).toFixed(2)}`,
    });
  } catch (err) {
    console.error('auto topup stripe error', err);
    return json(502, { error: 'stripe_charge_failed', message: err.message });
  }

  if (paymentIntent.status !== 'succeeded') {
    return json(402, {
      error: 'payment_not_succeeded',
      status: paymentIntent.status,
      paymentIntentId: paymentIntent.id,
    });
  }

  // Credit immediately (same idempotency key space as Checkout webhooks).
  const result = await creditCheckoutSession(playerId, paymentIntent.id, amountCents);
  return json(200, {
    ok: true,
    credited: result.credited,
    paymentIntentId: paymentIntent.id,
    balanceCents: result.wallet.balanceCents,
    balance: result.wallet.balanceCents / 100,
    ownedGameIds: result.wallet.ownedGameIds,
  });
}

import Stripe from 'stripe';
import { json, noContent, readJson, siteUrl } from './_shared/http.js';

const MIN_CENTS = 100; // $1
const MAX_CENTS = 10000; // $100
const ALLOWED = new Set([500, 1000, 2500, 5000]); // presets + room for custom within bounds

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return noContent();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return json(503, { error: 'stripe_not_configured' });

  const body = readJson(event);
  if (!body) return json(400, { error: 'invalid_json' });

  const playerId = String(body.playerId || '').trim();
  const amountCents = Math.floor(Number(body.amountCents));
  if (!playerId) return json(400, { error: 'player_id_required' });
  if (!Number.isFinite(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return json(400, { error: 'invalid_amount' });
  }
  // Prefer presets; still allow any dollar amount in range for flexibility.
  if (!ALLOWED.has(amountCents) && amountCents % 100 !== 0) {
    return json(400, { error: 'invalid_amount' });
  }

  const stripe = new Stripe(secret);
  const origin = siteUrl(event);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: 'Sigma Wallet top-up',
              description: `Add $${(amountCents / 100).toFixed(2)} to your shared wallet`,
            },
          },
        },
      ],
      metadata: {
        playerId,
        amountCents: String(amountCents),
      },
      success_url: `${origin}/?topup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?topup=cancel`,
    });

    return json(200, { checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    console.error('checkout error', err);
    return json(500, { error: 'checkout_failed', message: err.message });
  }
}

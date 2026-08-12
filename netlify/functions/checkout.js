import Stripe from 'stripe';
import { json, noContent, readJson, siteUrl } from './_shared/http.js';
import { bindBlobs } from './_shared/walletStore.js';
import { saveCheckoutIntent } from './_shared/checkoutIntent.js';

const MIN_CENTS = 100; // $1
const MAX_CENTS = 10000; // $100
const ALLOWED = new Set([500, 1000, 2500, 5000]);

function sanitizeHttpUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return noContent();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  bindBlobs(event);

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return json(503, { error: 'stripe_not_configured' });

  const body = readJson(event);
  if (!body) return json(400, { error: 'invalid_json' });

  const playerId = String(body.playerId || '').trim();
  const amountCents = Math.floor(Number(body.amountCents));
  const returnUrl = sanitizeHttpUrl(body.returnUrl);
  if (!playerId) return json(400, { error: 'player_id_required' });
  if (!Number.isFinite(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return json(400, { error: 'invalid_amount' });
  }
  if (!ALLOWED.has(amountCents) && amountCents % 100 !== 0) {
    return json(400, { error: 'invalid_amount' });
  }

  const stripe = new Stripe(secret);
  const origin = siteUrl(event);

  // Always return through our API so we can wait for the Stripe webhook credit,
  // then bounce to Sigma (returnUrl) or the wallet UI.
  const success_url = `${origin}/api/checkout-return?session_id={CHECKOUT_SESSION_ID}&status=success`;
  const cancel_url = `${origin}/api/checkout-return?session_id={CHECKOUT_SESSION_ID}&status=cancel`;

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
      success_url,
      cancel_url,
    });

    await saveCheckoutIntent(session.id, { playerId, returnUrl, amountCents });

    return json(200, { checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    console.error('checkout error', err);
    return json(500, { error: 'checkout_failed', message: err.message });
  }
}

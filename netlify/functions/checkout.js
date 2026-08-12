import Stripe from 'stripe';
import { json, noContent, readJson } from './_shared/http.js';
import { bindBlobs } from './_shared/walletStore.js';
import {
  ensureCustomerWithDefaultCard,
  isSigmaEmail,
  normalizePlayerEmail,
} from './_shared/stripeCustomer.js';

const MIN_CENTS = 100;
const ALLOWED = new Set([500, 1000, 2500, 5000]);

// Embedded Checkout: returns a client_secret the wallet UI mounts in-page, so
// payment happens inside the plugin iframe instead of a new tab. Nothing ever
// redirects, so there is no success_url / checkout-return hop - the webhook
// credits the ledger and the client polls /api/wallet for the new balance.
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return noContent();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  bindBlobs(event);

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return json(503, { error: 'stripe_not_configured' });

  const body = readJson(event);
  if (!body) return json(400, { error: 'invalid_json' });

  const rawPlayerId = String(body.playerId || '').trim();
  const displayName = String(body.displayName || '').trim() || undefined;
  const amountCents = Math.floor(Number(body.amountCents));
  if (!rawPlayerId) return json(400, { error: 'player_id_required' });

  if (process.env.REQUIRE_SIGMA_EMAIL === 'true' && !isSigmaEmail(rawPlayerId)) {
    return json(400, {
      error: 'sigma_email_required',
      message: 'playerId must match *@sigmacomputing.com',
    });
  }

  const playerId = isSigmaEmail(rawPlayerId)
    ? normalizePlayerEmail(rawPlayerId)
    : rawPlayerId;

  if (!Number.isFinite(amountCents) || amountCents < MIN_CENTS) {
    return json(400, { error: 'invalid_amount' });
  }
  if (!ALLOWED.has(amountCents) && amountCents % 100 !== 0) {
    return json(400, { error: 'invalid_amount' });
  }

  const stripe = new Stripe(secret);

  try {
    const { customerId, email } = await ensureCustomerWithDefaultCard(stripe, playerId, {
      displayName,
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      ui_mode: uiMode(),
      // Stripe rejects `return_url` alongside 'never'; the UI stays put and
      // reacts to Stripe.js `onComplete` instead.
      redirect_on_completion: 'never',
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
        ...(email ? { email } : {}),
      },
      saved_payment_method_options: {
        allow_redisplay_filters: ['always'],
        payment_method_save: 'enabled',
      },
    });

    return json(200, {
      clientSecret: session.client_secret,
      sessionId: session.id,
      customerId,
      email: email || null,
    });
  } catch (err) {
    console.error('checkout error', err);
    return json(500, {
      error: 'checkout_failed',
      message: err.message,
    });
  }
}

// Stripe renamed the embedded enum from 'embedded' to 'embedded_page'
// (2026-03-25 API version). Allow pinning via env for older accounts.
function uiMode() {
  return process.env.STRIPE_CHECKOUT_UI_MODE || 'embedded_page';
}

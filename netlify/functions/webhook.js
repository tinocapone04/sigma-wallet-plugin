import Stripe from 'stripe';
import { json } from './_shared/http.js';
import { bindBlobs, creditCheckoutSession } from './_shared/walletStore.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  bindBlobs(event);

  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) return json(503, { error: 'stripe_not_configured' });

  const stripe = new Stripe(secret);
  const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  if (!signature) return json(400, { error: 'missing_signature' });

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('webhook signature failed', err.message);
    return json(400, { error: 'invalid_signature' });
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const playerId = session.metadata?.playerId;
    const amountCents = Number(session.amount_total ?? session.metadata?.amountCents ?? 0);
    if (!playerId || !amountCents) {
      console.error('webhook missing playerId/amount', session.id);
      return json(400, { error: 'incomplete_session' });
    }
    if (session.payment_status && session.payment_status !== 'paid') {
      return json(200, { received: true, credited: false, reason: 'not_paid' });
    }
    const result = await creditCheckoutSession(playerId, session.id, amountCents);
    return json(200, { received: true, credited: result.credited, balanceCents: result.wallet.balanceCents });
  }

  return json(200, { received: true });
}

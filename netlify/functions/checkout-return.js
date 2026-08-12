import Stripe from 'stripe';
import { json, siteUrl } from './_shared/http.js';
import { bindBlobs, getWallet } from './_shared/walletStore.js';
import { getCheckoutIntent } from './_shared/checkoutIntent.js';

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

function withQuery(url, params) {
  const u = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') u.searchParams.set(key, String(value));
  }
  return u.toString();
}

function redirect(location) {
  return {
    statusCode: 302,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
    },
    body: '',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Poll until the Stripe webhook has credited this session (or we time out).
async function waitForWebhookCredit(playerId, sessionId, { attempts = 10, delayMs = 400 } = {}) {
  if (!playerId || !sessionId) return false;
  for (let i = 0; i < attempts; i += 1) {
    const wallet = await getWallet(playerId);
    if ((wallet.creditedSessionIds || []).includes(sessionId)) return true;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return false;
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  bindBlobs(event);

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return json(503, { error: 'stripe_not_configured' });

  const sessionId = String(event.queryStringParameters?.session_id || '').trim();
  const status = String(event.queryStringParameters?.status || 'success').trim();
  if (!sessionId) return json(400, { error: 'session_id_required' });

  const origin = siteUrl(event);
  const stripe = new Stripe(secret);

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error('checkout-return retrieve failed', err.message);
    return redirect(`${origin}/?topup=cancel`);
  }

  const intent = await getCheckoutIntent(sessionId).catch(() => null);
  const playerId = intent?.playerId || session.metadata?.playerId || '';
  const returnUrl = sanitizeHttpUrl(intent?.returnUrl);

  if (status === 'success' && session.payment_status === 'paid' && playerId) {
    // Credit is owned by /api/webhook; wait briefly so Sigma sees the new balance.
    await waitForWebhookCredit(playerId, sessionId);
  }

  if (returnUrl) {
    return redirect(withQuery(returnUrl, {
      walletTopup: status === 'success' ? 'success' : 'cancel',
    }));
  }

  // No Sigma returnUrl — land on the wallet UI itself.
  const qs = new URLSearchParams({
    topup: status === 'success' ? 'success' : 'cancel',
    session_id: sessionId,
  });
  if (playerId) qs.set('playerId', playerId);
  return redirect(`${origin}/?${qs.toString()}`);
}

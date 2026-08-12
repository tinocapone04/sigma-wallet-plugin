import { getStore } from '@netlify/blobs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Pending Checkout sessions: returnUrl + playerId keyed by Stripe session id.
// Lives outside Stripe metadata (500-char limit) so long Sigma workbook URLs work.
// The webhook credits the wallet; checkout-return waits for that credit then redirects.

function filePath() {
  return process.env.CHECKOUT_INTENT_PATH || join(process.cwd(), '.checkout-intents.json');
}

function inLambda() {
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function intentBlobStore() {
  try {
    return getStore('checkout-intents');
  } catch (err) {
    console.error('checkout intent getStore failed', err?.message || err);
    return null;
  }
}

function readFileIntents() {
  const path = filePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function writeFileIntents(all) {
  const path = filePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(all, null, 2));
}

export async function saveCheckoutIntent(sessionId, intent) {
  if (!sessionId) return;
  const payload = {
    playerId: String(intent.playerId || ''),
    returnUrl: intent.returnUrl || null,
    amountCents: Number(intent.amountCents) || 0,
    createdAt: Date.now(),
  };
  const store = await intentBlobStore();
  if (store) {
    await store.setJSON(sessionId, payload);
    return payload;
  }
  if (inLambda()) throw new Error('blobs_unavailable');
  const all = readFileIntents();
  all[sessionId] = payload;
  writeFileIntents(all);
  return payload;
}

export async function getCheckoutIntent(sessionId) {
  if (!sessionId) return null;
  const store = await intentBlobStore();
  if (store) {
    return (await store.get(sessionId, { type: 'json' })) || null;
  }
  if (inLambda()) throw new Error('blobs_unavailable');
  return readFileIntents()[sessionId] || null;
}

import { connectLambda, getStore } from '@netlify/blobs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Wallet ledger keyed by playerId. Prefers Netlify Blobs in production /
// `netlify dev`; falls back to a local JSON file so unit tests and bare
// Node handlers can still exercise the ledger without a Blobs context.

const EMPTY = () => ({
  balanceCents: 0,
  ownedGameIds: [],
  creditedSessionIds: [],
});

function filePath() {
  // Prefer an explicit path; otherwise write next to the project cwd.
  // Avoid import.meta.url - Netlify's local bundler emits CJS and strips it.
  return process.env.WALLET_STORE_PATH || join(process.cwd(), '.wallet-store.json');
}

function readFileStore() {
  const path = filePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function writeFileStore(all) {
  const path = filePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(all, null, 2));
}

function inLambda() {
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * Lambda-compatible Netlify Functions (export `handler`) do not auto-inject
 * Blobs. Call this once per request before any getWallet/saveWallet.
 */
export function bindBlobs(event) {
  if (!event) return;
  try {
    connectLambda(event);
  } catch (err) {
    console.error('connectLambda failed', err?.message || err);
  }
}

async function blobStore() {
  try {
    // Default (eventual) consistency — `strong` needs uncachedEdgeURL which
    // Lambda-compat connectLambda context does not always provide.
    return getStore('wallets');
  } catch (err) {
    console.error('getStore failed', err?.message || err);
    return null;
  }
}

export async function getWallet(playerId) {
  if (!playerId) return EMPTY();
  const store = await blobStore();
  if (store) {
    const value = await store.get(playerId, { type: 'json' });
    return value ? { ...EMPTY(), ...value } : EMPTY();
  }
  if (inLambda()) {
    throw new Error('blobs_unavailable');
  }
  const all = readFileStore();
  return all[playerId] ? { ...EMPTY(), ...all[playerId] } : EMPTY();
}

export async function saveWallet(playerId, wallet) {
  const next = {
    balanceCents: Math.max(0, Math.floor(Number(wallet.balanceCents) || 0)),
    ownedGameIds: Array.from(new Set(wallet.ownedGameIds || [])),
    creditedSessionIds: Array.from(new Set(wallet.creditedSessionIds || [])),
  };
  const store = await blobStore();
  if (store) {
    await store.setJSON(playerId, next);
    return next;
  }
  if (inLambda()) {
    throw new Error('blobs_unavailable');
  }
  const all = readFileStore();
  all[playerId] = next;
  writeFileStore(all);
  return next;
}

export async function creditCheckoutSession(playerId, sessionId, amountCents) {
  const wallet = await getWallet(playerId);
  if (wallet.creditedSessionIds.includes(sessionId)) {
    return { wallet, credited: false };
  }
  wallet.creditedSessionIds.push(sessionId);
  wallet.balanceCents += Math.max(0, Math.floor(amountCents));
  const saved = await saveWallet(playerId, wallet);
  return { wallet: saved, credited: true };
}

export async function purchaseGame(playerId, gameId, priceCents) {
  const wallet = await getWallet(playerId);
  if (wallet.ownedGameIds.includes(gameId)) {
    return { ok: false, reason: 'already_owned', wallet };
  }
  if (wallet.balanceCents < priceCents) {
    return { ok: false, reason: 'insufficient_funds', wallet };
  }
  wallet.balanceCents -= priceCents;
  wallet.ownedGameIds.push(gameId);
  const saved = await saveWallet(playerId, wallet);
  return { ok: true, wallet: saved };
}

export async function adjustBalance(playerId, deltaCents) {
  const wallet = await getWallet(playerId);
  const next = wallet.balanceCents + Math.floor(Number(deltaCents) || 0);
  if (next < 0) {
    return { ok: false, reason: 'insufficient_funds', wallet };
  }
  wallet.balanceCents = next;
  const saved = await saveWallet(playerId, wallet);
  return { ok: true, wallet: saved };
}

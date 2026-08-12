import { getStore } from '@netlify/blobs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Map playerId → Stripe Customer that already has test Visa 4242 on file,
// so Checkout shows a saved card to confirm instead of an empty card form.
// Sigma work emails (`*@sigmacomputing.com`) resolve via Stripe email lookup
// so account formation matches the real CurrentUserEmail().

/** @type {RegExp} */
export const SIGMA_EMAIL_RE = /^[^\s@]+@sigmacomputing\.com$/i;

export function isSigmaEmail(value) {
  return SIGMA_EMAIL_RE.test(String(value || '').trim());
}

export function normalizePlayerEmail(playerId) {
  const raw = String(playerId || '').trim();
  if (!raw) return null;
  if (isSigmaEmail(raw)) return raw.toLowerCase();
  if (raw.includes('@')) return raw.toLowerCase();
  return null;
}

function filePath() {
  return process.env.STRIPE_CUSTOMER_MAP_PATH || join(process.cwd(), '.stripe-customers.json');
}

function inLambda() {
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function mapStore() {
  try {
    return getStore('stripe-customers');
  } catch (err) {
    console.error('stripe-customers getStore failed', err?.message || err);
    return null;
  }
}

function readFileMap() {
  const path = filePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function writeFileMap(all) {
  const path = filePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(all, null, 2));
}

async function getMappedCustomerId(playerId) {
  const store = await mapStore();
  if (store) {
    const row = await store.get(playerId, { type: 'json' });
    return row?.customerId || null;
  }
  if (inLambda()) throw new Error('blobs_unavailable');
  return readFileMap()[playerId]?.customerId || null;
}

async function setMappedCustomerId(playerId, customerId) {
  const payload = { customerId, updatedAt: Date.now() };
  const store = await mapStore();
  if (store) {
    await store.setJSON(playerId, payload);
    return;
  }
  if (inLambda()) throw new Error('blobs_unavailable');
  const all = readFileMap();
  all[playerId] = payload;
  writeFileMap(all);
}

async function findCustomerByEmail(stripe, email) {
  if (!email) return null;
  const listed = await stripe.customers.list({ email, limit: 5 });
  return listed.data.find((c) => !c.deleted) || null;
}

async function ensureDefaultTestCard(stripe, customerId) {
  const existing = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
    limit: 10,
  });
  const visa4242 = existing.data.find((pm) => pm.card?.last4 === '4242');
  if (visa4242) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: visa4242.id },
    });
    return visa4242.id;
  }

  const pm = await stripe.paymentMethods.create({
    type: 'card',
    card: { token: 'tok_visa' },
  });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pm.id },
  });
  return pm.id;
}

/**
 * Every wallet user gets a Stripe Customer with the same demo Visa on file.
 * `*@sigmacomputing.com` playerIds form/lookup the Stripe customer by that email.
 */
export async function ensureCustomerWithDefaultCard(stripe, playerId, { displayName } = {}) {
  if (!String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')) {
    throw new Error('default_card_test_mode_only');
  }

  const rawId = String(playerId || '').trim();
  if (!rawId) throw new Error('player_id_required');

  const email = normalizePlayerEmail(rawId);
  const sigma = isSigmaEmail(rawId);
  // Blob map key: prefer canonical Sigma email so casing variants share one customer.
  const mapKey = sigma ? email : rawId;
  const name = String(displayName || rawId).trim() || rawId;

  let customerId = await getMappedCustomerId(mapKey);
  let customer = null;

  if (customerId) {
    try {
      customer = await stripe.customers.retrieve(customerId);
      if (customer?.deleted) customer = null;
    } catch {
      customer = null;
    }
  }

  // Sigma emails: also resolve via Stripe email search (Account information).
  if (!customer && email && sigma) {
    customer = await findCustomerByEmail(stripe, email);
    if (customer) {
      customerId = customer.id;
      await setMappedCustomerId(mapKey, customerId);
    }
  }

  if (!customer) {
    customer = await stripe.customers.create({
      email: email || undefined,
      name,
      metadata: {
        playerId: mapKey,
        demoCard: 'tok_visa',
        ...(sigma ? { emailDomain: 'sigmacomputing.com' } : {}),
      },
    });
    customerId = customer.id;
    await setMappedCustomerId(mapKey, customerId);
  } else {
    // Keep Account information in sync for Sigma work emails.
    const patch = {};
    if (email && customer.email !== email) patch.email = email;
    if (name && customer.name !== name) patch.name = name;
    if (Object.keys(patch).length) {
      customer = await stripe.customers.update(customerId, {
        ...patch,
        metadata: {
          ...(customer.metadata || {}),
          playerId: mapKey,
          demoCard: 'tok_visa',
          ...(sigma ? { emailDomain: 'sigmacomputing.com' } : {}),
        },
      });
    }
  }

  const paymentMethodId = await ensureDefaultTestCard(stripe, customerId);
  return { customerId, paymentMethodId, email: email || null, sigma };
}

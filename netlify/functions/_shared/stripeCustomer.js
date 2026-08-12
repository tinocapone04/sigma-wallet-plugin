import { getStore } from '@netlify/blobs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Map playerId → Stripe Customer that already has test Visa 4242 on file,
// so Checkout shows a saved card to confirm instead of an empty card form.

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

const DEMO_FIRST_NAMES = ['Alex', 'Jordan', 'Sam', 'Casey', 'Riley', 'Morgan', 'Quinn', 'Avery'];
const DEMO_LAST_NAMES = ['Nguyen', 'Patel', 'Garcia', 'Kim', 'Brooks', 'Chen', 'Rivera', 'Walsh'];
const DEMO_STREETS = ['123 Market St', '456 Oak Ave', '789 Pine Rd', '12 Cedar Blvd', '88 Harbor Way'];
const DEMO_CITIES = [
  { city: 'San Francisco', state: 'CA', postal_code: '94105' },
  { city: 'Austin', state: 'TX', postal_code: '78701' },
  { city: 'Seattle', state: 'WA', postal_code: '98101' },
  { city: 'Chicago', state: 'IL', postal_code: '60601' },
  { city: 'Boston', state: 'MA', postal_code: '02108' },
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** Cosmetic Customer fields only — does not autofill Checkout card form fields. */
function randomDemoBilling() {
  const name = `${pick(DEMO_FIRST_NAMES)} ${pick(DEMO_LAST_NAMES)}`;
  const place = pick(DEMO_CITIES);
  return {
    name,
    address: {
      line1: pick(DEMO_STREETS),
      city: place.city,
      state: place.state,
      postal_code: place.postal_code,
      country: 'US',
    },
  };
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

  // Test-mode token for Visa 4242 4242 4242 4242
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
 * Checkout then opens with that card ready to confirm (Link / saved-card UI).
 * You cannot autofill PAN/CVC into Stripe's iframe — Dashboard cannot either.
 */
export async function ensureCustomerWithDefaultCard(stripe, playerId) {
  if (!String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')) {
    throw new Error('default_card_test_mode_only');
  }

  let customerId = await getMappedCustomerId(playerId);
  let customer = null;

  if (customerId) {
    try {
      customer = await stripe.customers.retrieve(customerId);
      if (customer?.deleted) customer = null;
    } catch {
      customer = null;
    }
  }

  if (!customer) {
    const email = playerId.includes('@') ? playerId : undefined;
    const billing = randomDemoBilling();
    customer = await stripe.customers.create({
      email,
      name: billing.name,
      address: billing.address,
      metadata: { playerId, demoCard: 'tok_visa' },
    });
    customerId = customer.id;
    await setMappedCustomerId(playerId, customerId);
  }

  const paymentMethodId = await ensureDefaultTestCard(stripe, customerId);
  return { customerId, paymentMethodId };
}

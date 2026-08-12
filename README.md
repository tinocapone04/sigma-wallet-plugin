# Sigma Wallet Plugin

Owns Stripe Checkout + the shared wallet ledger (Netlify Functions + Blobs).
The game library plugin calls this site’s `/api/*` with the same `playerId`
(viewer email) for purchases and Roulette settles — it does not host Stripe.

## Quick start

```bash
cd sigma-wallet-plugin
npm install
cp .env.example .env   # fill STRIPE_SECRET_KEY (+ webhook secret)
npm run dev:full       # http://localhost:8890 (Vite + /api)
```

Stripe CLI webhook forward:

```bash
stripe listen --forward-to localhost:8890/api/webhook
```

## API

| Endpoint | Role |
|---|---|
| `POST /api/checkout` | `{ playerId, amountCents, returnUrl? }` → Checkout URL |
| `GET /api/checkout-return` | After Stripe: wait for webhook credit, redirect to `returnUrl` / wallet UI |
| `POST /api/webhook` | Credits wallet on `checkout.session.completed` |
| `GET /api/wallet?playerId=` | Balance + owned games |
| `POST /api/purchase` | Debit + unlock game |
| `POST /api/wallet-adjust` | Roulette delta |
| `POST /api/dev-credit` | Local only when `ALLOW_DEV_CREDIT=true` |

Prices: `netlify/functions/_shared/prices.js` — keep in sync with
`priceCents` in `sigma-game-library-plugin/src/games/registry.js`.

## Sigma

### As a plugin
Bind viewer email (`CurrentUserEmail()`) in the editor panel. That email is
`playerId` for every wallet API call from this plugin and from the game library.

### As an Embed (iframe)
No plugin registration needed. Add a Sigma **Embed** whose URL includes the
viewer identity as query params (same `playerId` the game library uses):

```
https://sigma-wallet-plugin.netlify.app/?playerId={{CurrentUserEmail()}}&displayName={{CurrentUserFullName()}}&returnUrl=https%3A%2F%2Fapp.sigmacomputing.com%2FYOUR_ORG%2Fworkbook%2FYOUR_WORKBOOK
```

- `playerId` (required) — also accepts `email`
- `displayName` (optional) — also accepts `name`
- `returnUrl` (optional) — your Sigma workbook URL (URL-encoded). Stored with
  the Checkout session; after Stripe, `/api/checkout-return` **waits for the
  webhook to credit the wallet**, then 302s you back to this workbook.
  A **Back to Sigma** button also appears when this is set.

Flow: Checkout → Stripe → webhook credits ledger → `checkout-return` redirects
to Sigma. Checkout opens in a **new tab** when possible so the workbook stays open.

**Note:** Stripe Checkout cannot load inside a Sigma iframe.


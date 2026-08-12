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
| `POST /api/checkout` | `{ playerId, amountCents }` → Checkout URL |
| `POST /api/webhook` | Credits wallet on `checkout.session.completed` |
| `GET /api/wallet?playerId=` | Balance + owned games |
| `POST /api/purchase` | Debit + unlock game |
| `POST /api/wallet-adjust` | Roulette delta |
| `POST /api/dev-credit` | Local only when `ALLOW_DEV_CREDIT=true` |

Prices: `netlify/functions/_shared/prices.js` — keep in sync with
`priceCents` in `sigma-game-library-plugin/src/games/registry.js`.

## Sigma

Bind viewer email (`CurrentUserEmail()`) in the editor panel. That email is
`playerId` for every wallet API call from this plugin and from the game library.

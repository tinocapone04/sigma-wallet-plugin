# Sigma Wallet Plugin

Owns Stripe Checkout + the shared wallet ledger (Netlify Functions + Blobs).
Every user gets a Stripe Customer with **demo Visa 4242** already on file, so
Checkout opens the payment portal and they only confirm Pay (no card typing).
The game library calls this site’s `/api/*` with the same `playerId` (email).

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
| `POST /api/checkout` | Ensure demo card on file → Checkout Session URL |
| `GET /api/checkout-return` | Wait for webhook credit, redirect to `returnUrl` / wallet UI |
| `POST /api/webhook` | Credits wallet on `checkout.session.completed` |
| `POST /api/topup` | Optional silent charge (`pm_card_visa`); UI uses Checkout |
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
```
https://sigma-wallet-plugin.netlify.app/?playerId={{CurrentUserEmail()}}&displayName={{CurrentUserFullName()}}&returnUrl=https%3A%2F%2Fapp.sigmacomputing.com%2FYOUR_ORG%2Fworkbook%2FYOUR_WORKBOOK
```

- `playerId` (required) — also accepts `email`
- `displayName` (optional) — also accepts `name`
- `returnUrl` (optional) — workbook URL; after Checkout + webhook credit, redirect here

Checkout opens in a new tab (Stripe blocks iframes). Demo Visa •••• 4242 is
pre-attached (test mode only via `tok_visa`).

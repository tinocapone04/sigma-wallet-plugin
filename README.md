# Sigma Wallet Plugin

Owns Stripe Checkout + the shared wallet ledger (Netlify Functions + Blobs).
Checkout is **embedded in this plugin** — no new tab, no redirect back to a
Netlify page. Every user gets a Stripe Customer with **demo Visa 4242** already
on file, so they only confirm Pay (no card typing). The game library calls this
site’s `/api/*` with the same `playerId` (email) and only ever spends the balance.

## Quick start

```bash
cd sigma-wallet-plugin
npm install
cp .env.example .env   # fill STRIPE_SECRET_KEY, VITE_STRIPE_PUBLISHABLE_KEY (+ webhook secret)
npm run dev:full       # http://localhost:8890 (Vite + /api)
```

Stripe CLI webhook forward:

```bash
stripe listen --forward-to localhost:8890/api/webhook
```

## How a top-up works

1. UI posts to `/api/checkout`, which creates a Checkout Session with
   `ui_mode: 'embedded_page'` and `redirect_on_completion: 'never'`.
2. The response is a **`client_secret`** (not a URL). The UI mounts Stripe’s
   Embedded Checkout inside the plugin with `@stripe/react-stripe-js`.
3. The player pays in place. Stripe.js fires `onComplete` — nothing navigates.
4. Stripe’s webhook credits the ledger; the client polls `/api/wallet` until
   the new balance appears, then posts `sigma-wallet-topup` to the opener/parent
   so the game library refreshes too.

Because `redirect_on_completion` is `never`, Stripe forbids `return_url` — that
is why there is no success page and no `checkout-return` endpoint.

## API

| Endpoint | Role |
|---|---|
| `POST /api/checkout` | Ensure demo card on file → Embedded Checkout `clientSecret` |
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
- `returnUrl` (optional) — workbook URL shown as a “Back to Sigma” link

Payment happens inside the iframe (Stripe blocks its *hosted* page in iframes,
but Embedded Checkout is built for it). Demo Visa •••• 4242 is pre-attached
(test mode only via `tok_visa`).

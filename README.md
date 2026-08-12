# Sigma Wallet Plugin

Owns Stripe Checkout + the shared wallet ledger (Netlify Functions + Blobs).
Checkout is **embedded in this plugin** as a second full-panel page — no new
tab, no redirect back to a Netlify page. Every user gets a Stripe Customer with
**demo Visa 4242** already on file, so Checkout shows email + ••••4242 + Pay
(Link / saved-card UI when Stripe offers it). The game library calls this
site’s `/api/*` with the same `playerId` (email) and only ever spends the balance.

## Quick start

```bash
cd sigma-wallet-plugin
npm install
cp .env.example .env   # fill STRIPE_SECRET_KEY, VITE_STRIPE_PUBLISHABLE_KEY (+ webhook secret)
npm run dev:full       # http://localhost:3030 (Vite + /api)
```

Crediting works without a webhook (see "How a top-up works"). The Stripe CLI
forward is optional and only needed if you want the webhook path too:

```bash
stripe listen --forward-to localhost:3030/api/webhook
```

## How a top-up works

1. User picks an amount on the fund page. The UI swaps to a checkout-only page
   (hero / balance / buttons hide).
2. UI posts to `/api/checkout`, which ensures a Customer + demo Visa (`tok_visa`)
   and creates a Checkout Session with `ui_mode: 'embedded_page'` and
   `redirect_on_completion: 'never'`.
3. The response is a **`client_secret`**. The UI mounts Stripe’s Embedded
   Checkout with `@stripe/react-stripe-js` (Stripe’s own Pay UI — not a custom form).
4. The player confirms Pay in place. Stripe.js fires `onComplete`.
5. The client posts to `/api/checkout-credit`, which retrieves the Checkout
   Session from Stripe, confirms `payment_status: paid`, and credits the Blobs
   ledger. This needs **no webhook** — crediting is synchronous in the response.
   (`creditCheckoutSession` is idempotent by session id, so an optional webhook
   can still run without double-crediting.)
6. The plugin reads the viewer's current balance from `walletSource`, adds the
   paid amount, stages that total into `walletMoneyControl`, and fires
   `creditWalletEvent` so the author-wired **Update row** action syncs the input
   table. The displayed Credits value also comes from this table, not the
   staging control or Blobs ledger.
7. It posts `sigma-wallet-topup` to the opener/parent so the game library can
   refresh, shows a short updating/success transition, then returns to the fund
   page.

Because `redirect_on_completion` is `never`, Stripe forbids `return_url` — that
is why there is no success page and no `checkout-return` endpoint.

### Demo card / autofill (#3)

You **cannot** autofill card number / CVC / expiry inside Stripe Checkout
(PCI — those fields are in Stripe’s iframe). The Stripe Dashboard has no
setting that does this either.

What we do instead (test mode only): attach `tok_visa` (Visa •••• 4242) as the
Customer’s default payment method so Checkout shows a **saved card** to
confirm. New Customers also get a random name + US billing address.

Checkout is picky about when it prefills that card. All of this is required,
and missing any one of them silently falls back to a blank card form:

- the card’s `allow_redisplay` is `always` (API-attached cards default to
  `unspecified`), or the session lists the other values in
  `saved_payment_method_options.allow_redisplay_filters`;
- the **payment method’s own** `billing_details` carry `name`, `email` and a
  full address — an address on the Customer alone does not count;
- the session is opened within 30 minutes of being created.

## API

| Endpoint | Role |
|---|---|
| `POST /api/checkout` | Ensure demo card on file → Embedded Checkout `clientSecret` |
| `POST /api/checkout-credit` | Verify paid session → credit ledger (no webhook needed) |
| `POST /api/webhook` | Optional: also credits on `checkout.session.completed` |
| `POST /api/topup` | Optional silent charge (`pm_card_visa`); UI uses Checkout |
| `GET /api/wallet?playerId=` | Balance + owned games |
| `POST /api/purchase` | Debit + unlock game |
| `POST /api/wallet-adjust` | Roulette delta |
| `POST /api/dev-credit` | Local only when `ALLOW_DEV_CREDIT=true` |

Prices: `netlify/functions/_shared/prices.js` — keep in sync with
`priceCents` in `sigma-game-library-plugin/src/games/registry.js`.

## Sigma

### As a plugin

1. Bind viewer email (`CurrentUserEmail()`) and optional display name in the
   editor panel. That email is `playerId` for every wallet API call.
2. To sync top-ups into a workbook **input table** (prefer the same table the
   game library uses for Roulette):
   - Bind `walletSource` to the money-balance input table
   - Bind `walletEmailCol` / `walletMoneyCol` to the email and money columns
   - Bind `walletMoneyControl` to a **Number** control (staging for the new total)
   - Bind `creditWalletEvent` (action-trigger)
3. On the plugin element, add an **Update row** action:
   - Trigger: Custom plugin → `creditWalletEvent`
   - Into: the wallet input table
   - Match by: Formula `CurrentUserEmail()` (table should be RLS-scoped to one row per viewer)
   - Set the money column **With values → Control** pointing at `walletMoneyControl`

If those bindings are missing, Stripe + Blobs still credit the API ledger; only
the workbook table sync is skipped.

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

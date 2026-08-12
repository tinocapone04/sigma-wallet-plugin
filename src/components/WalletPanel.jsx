import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { readReturnUrl } from '../utils/returnUrl.js';
import { useSigmaWalletWrite } from '../store/useSigmaWalletWrite.js';

const TOP_UP_OPTIONS = [
  { label: '$5', cents: 500 },
  { label: '$10', cents: 1000 },
  { label: '$25', cents: 2500 },
];

const MIN_DOLLARS = 1;

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

export default function WalletPanel({ wallet, playerId, onCheckoutChange }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [returnUrl, setReturnUrl] = useState(() => readReturnUrl());
  const sigmaWrite = useSigmaWalletWrite();

  useEffect(() => {
    setReturnUrl(readReturnUrl());
  }, []);

  useEffect(() => {
    onCheckoutChange?.(Boolean(checkout));
  }, [checkout, onCheckoutChange]);

  const fetchClientSecret = useCallback(async () => {
    if (!checkout?.clientSecret) throw new Error('missing_client_secret');
    return checkout.clientSecret;
  }, [checkout?.clientSecret]);

  const handleComplete = useCallback(async () => {
    setMessage('Payment received — crediting wallet…');
    try {
      // Credit directly from the verified Stripe session (no webhook needed).
      const data = checkout?.sessionId
        ? await wallet.creditCheckout?.(checkout.sessionId)
        : await wallet.refreshUntilCredited?.({
            previousBalanceCents: checkout?.previousBalanceCents,
          });
      const newBalance =
        data?.balance ??
        (data?.balanceCents != null ? data.balanceCents / 100 : wallet.balance);

      if (sigmaWrite.configured && newBalance != null) {
        setMessage('Payment received — updating workbook…');
        const result = await sigmaWrite.writeBalance(newBalance);
        setMessage(result.written ? 'Wallet updated.' : 'Wallet credited (workbook sync skipped).');
      } else if (sigmaWrite.configured) {
        setMessage('Wallet updated.');
      } else {
        setMessage('Wallet credited. Bind creditWalletEvent to sync the input table.');
      }

      // The game library listens for this to refresh without a reload.
      try {
        window.opener?.postMessage({ type: 'sigma-wallet-topup', status: 'success', playerId }, '*');
        window.parent?.postMessage({ type: 'sigma-wallet-topup', status: 'success', playerId }, '*');
      } catch {
        // ignore
      }
    } catch (err) {
      setMessage(`Paid, but the balance did not refresh (${err.message}).`);
    } finally {
      setCheckout(null);
      setBusy(false);
    }
  }, [wallet, checkout?.sessionId, checkout?.previousBalanceCents, playerId, sigmaWrite]);

  const checkoutOptions = useMemo(
    () => ({ fetchClientSecret, onComplete: handleComplete }),
    [fetchClientSecret, handleComplete],
  );

  if (!wallet || wallet.mode !== 'paid') return null;

  async function handleTopUp(cents) {
    if (!stripePromise) {
      setMessage('Set VITE_STRIPE_PUBLISHABLE_KEY to enable Stripe Checkout.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const previousBalanceCents = wallet.balanceCents ?? Math.round((wallet.balance || 0) * 100);
      const data = await wallet.topUp(cents);
      setCheckout({
        clientSecret: data.clientSecret,
        sessionId: data.sessionId,
        amountCents: cents,
        previousBalanceCents,
      });
    } catch (err) {
      setMessage(err.message || 'Top-up failed');
      setBusy(false);
    }
  }

  function handleCustomSubmit(event) {
    event.preventDefault();
    const dollars = Number(customAmount);
    if (!Number.isFinite(dollars) || dollars < MIN_DOLLARS) {
      setMessage(`Enter at least $${MIN_DOLLARS}.`);
      return;
    }
    const cents = Math.round(dollars * 100);
    if (cents % 100 !== 0) {
      setMessage('Use whole dollar amounts (e.g. 15, not 15.50).');
      return;
    }
    handleTopUp(cents);
  }

  function handleCancelCheckout() {
    setCheckout(null);
    setBusy(false);
    setMessage('Top-up canceled.');
  }

  const balanceLabel =
    wallet.status === 'ready' || wallet.status === 'loading'
      ? `$${(wallet.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';

  const actionsDisabled = busy || Boolean(checkout) || wallet.status === 'needs-config';

  // Page B: full-panel Stripe Checkout (hides fund UI via onCheckoutChange).
  if (checkout && stripePromise) {
    return (
      <section className="wallet-panel wallet-panel-checkout" aria-label="Checkout">
        <div className="wallet-checkout-embed">
          <div className="wallet-checkout-embed-header">
            <strong>Add ${(checkout.amountCents / 100).toFixed(2)}</strong>
            <button type="button" className="secondary-button" onClick={handleCancelCheckout}>
              Cancel
            </button>
          </div>
          {message && <p className="wallet-panel-message">{message}</p>}
          <EmbeddedCheckoutProvider stripe={stripePromise} options={checkoutOptions}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </section>
    );
  }

  // Page A: balance + top-up actions.
  return (
    <section className="wallet-panel" aria-label="Wallet">
      <div className="wallet-panel-main">
        <div className="wallet-panel-balance">
          <span className="wallet-panel-eyebrow">CREDITS</span>
          <strong>{balanceLabel}</strong>
          {playerId && <span className="wallet-panel-player">{playerId}</span>}
        </div>
        <div className="wallet-panel-actions">
          {TOP_UP_OPTIONS.map((opt) => (
            <button
              key={opt.cents}
              type="button"
              className="secondary-button wallet-topup-button"
              disabled={actionsDisabled}
              onClick={() => handleTopUp(opt.cents)}
            >
              Add {opt.label}
            </button>
          ))}
          <form className="wallet-custom-inline" onSubmit={handleCustomSubmit}>
            <span className="wallet-custom-prefix" aria-hidden="true">
              $
            </span>
            <input
              id="wallet-custom-amount"
              className="wallet-custom-input"
              type="number"
              inputMode="numeric"
              min={MIN_DOLLARS}
              step={1}
              placeholder="Other"
              aria-label="Custom amount in dollars"
              value={customAmount}
              disabled={actionsDisabled}
              onChange={(e) => setCustomAmount(e.target.value)}
            />
            <button className="secondary-button wallet-custom-submit" type="submit" disabled={actionsDisabled}>
              Add
            </button>
          </form>
          {returnUrl && (
            <a className="secondary-button wallet-return-link" href={returnUrl}>
              Back to Sigma
            </a>
          )}
        </div>
      </div>

      {wallet.status === 'error' && <p className="game-error">Wallet error: {wallet.error}</p>}
      {wallet.status === 'needs-config' && <p className="game-error">Waiting for viewer email / player id.</p>}
      {message && <p className="wallet-panel-message">{message}</p>}
      <p className="wallet-panel-hint">
        Pay right here — Stripe Checkout is embedded with demo Visa •••• 4242 already on file. Same playerId shares this
        balance with the game library.
        {!sigmaWrite.configured &&
          ' Bind walletMoneyControl + creditWalletEvent in the editor to sync the workbook input table.'}
      </p>
    </section>
  );
}

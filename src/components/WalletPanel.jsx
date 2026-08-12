import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [completion, setCompletion] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [returnUrl, setReturnUrl] = useState(() => readReturnUrl());
  const completionStartedRef = useRef(false);
  const returnTimerRef = useRef(null);
  const sigmaWrite = useSigmaWalletWrite(playerId);
  const creditCheckout = wallet?.creditCheckout;
  const refreshUntilCredited = wallet?.refreshUntilCredited;

  useEffect(() => {
    setReturnUrl(readReturnUrl());
    return () => clearTimeout(returnTimerRef.current);
  }, []);

  useEffect(() => {
    onCheckoutChange?.(Boolean(checkout));
  }, [checkout, onCheckoutChange]);

  const fetchClientSecret = useCallback(async () => {
    if (!checkout?.clientSecret) throw new Error('missing_client_secret');
    return checkout.clientSecret;
  }, [checkout?.clientSecret]);

  const handleComplete = useCallback(async () => {
    if (completionStartedRef.current) return;
    completionStartedRef.current = true;

    const amountDollars = (checkout?.amountCents || 0) / 100;
    setCompletion({
      status: 'processing',
      title: 'Payment received',
      detail: 'Updating your Sigma wallet…',
    });

    // Stripe has already confirmed payment. Credit the shared API ledger and
    // fire Sigma's Update-row action independently so one cannot suppress the
    // other. The Sigma target is input-table balance + the amount just paid.
    const [ledgerResult, sigmaResult] = await Promise.allSettled([
      checkout?.sessionId
        ? creditCheckout?.(checkout.sessionId)
        : refreshUntilCredited?.({
            previousBalanceCents: checkout?.previousBalanceCents,
          }),
      sigmaWrite.configured
        ? sigmaWrite.addToBalance(amountDollars)
        : Promise.resolve({ written: false, reason: 'not_configured' }),
    ]);

    if (ledgerResult.status === 'fulfilled') {
      // The game library listens for this to refresh without a reload.
      try {
        window.opener?.postMessage({ type: 'sigma-wallet-topup', status: 'success', playerId }, '*');
        window.parent?.postMessage({ type: 'sigma-wallet-topup', status: 'success', playerId }, '*');
      } catch {
        // ignore
      }
    }

    const sigmaWriteResult = sigmaResult.status === 'fulfilled' ? sigmaResult.value : null;
    const sigmaUpdated = Boolean(sigmaWriteResult?.written);
    const ledgerUpdated = ledgerResult.status === 'fulfilled';

    if (sigmaUpdated && ledgerUpdated) {
      setCompletion({
        status: 'success',
        title: `+$${amountDollars.toFixed(2)} added`,
        detail: `New balance: $${sigmaWriteResult.balance.toFixed(2)}`,
      });
      setMessage('Wallet updated.');
      returnTimerRef.current = setTimeout(() => {
        setCompletion(null);
        completionStartedRef.current = false;
        setCheckout(null);
        setBusy(false);
      }, 1400);
      return;
    }

    const reason =
      sigmaResult.status === 'rejected'
        ? sigmaResult.reason?.message
        : sigmaWriteResult?.reason;
    setCompletion({
      status: 'error',
      title: 'Payment received',
      detail: !sigmaUpdated
        ? `Sigma update needs attention${reason ? ` (${reason})` : ''}.`
        : 'The shared wallet ledger did not refresh.',
    });
    setMessage(
      sigmaUpdated
        ? 'Sigma balance updated; shared ledger sync failed.'
        : 'Paid, but the Sigma input-table action did not complete.',
    );
    setBusy(false);
  }, [
    checkout?.amountCents,
    checkout?.sessionId,
    checkout?.previousBalanceCents,
    creditCheckout,
    refreshUntilCredited,
    playerId,
    sigmaWrite.configured,
    sigmaWrite.addToBalance,
  ]);

  const returnToWallet = useCallback(() => {
    clearTimeout(returnTimerRef.current);
    setCompletion(null);
    completionStartedRef.current = false;
    setCheckout(null);
    setBusy(false);
  }, []);

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
    if (sigmaWrite.readConfigured && sigmaWrite.balance == null) {
      setMessage('Waiting for your balance row in the Wallet Input Table.');
      return;
    }
    setBusy(true);
    setMessage(null);
    setCompletion(null);
    completionStartedRef.current = false;
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
      setCheckout(null);
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
    returnToWallet();
    setMessage('Top-up canceled.');
  }

  const displayedBalance = sigmaWrite.readConfigured ? sigmaWrite.balance : wallet.balance;
  const balanceLabel =
    displayedBalance != null
      ? `$${displayedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';

  const actionsDisabled =
    busy ||
    Boolean(checkout) ||
    wallet.status === 'needs-config' ||
    (sigmaWrite.readConfigured && sigmaWrite.balance == null);

  // Page B: full-panel Stripe Checkout (hides fund UI via onCheckoutChange).
  if (checkout && stripePromise) {
    return (
      <section className="wallet-panel wallet-panel-checkout" aria-label="Checkout">
        <div className="wallet-checkout-embed">
          {completion ? (
            <div className={`wallet-payment-transition is-${completion.status}`} role="status" aria-live="polite">
              <span className="wallet-payment-transition-icon" aria-hidden="true">
                {completion.status === 'processing' ? '···' : completion.status === 'success' ? '✓' : '!'}
              </span>
              <h2>{completion.title}</h2>
              <p>{completion.detail}</p>
              {completion.status !== 'processing' && (
                <button type="button" className="secondary-button" onClick={returnToWallet}>
                  Back to wallet
                </button>
              )}
            </div>
          ) : (
            <>
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
            </>
          )}
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
      {sigmaWrite.readConfigured && sigmaWrite.balance == null && (
        <p className="game-error">Waiting for your balance row in the Wallet Input Table.</p>
      )}
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

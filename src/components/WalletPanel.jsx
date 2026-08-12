import { useEffect, useState } from 'react';

const TOP_UP_OPTIONS = [
  { label: '$5', cents: 500 },
  { label: '$10', cents: 1000 },
  { label: '$25', cents: 2500 },
];

export default function WalletPanel({ wallet, playerId }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const topup = params.get('topup');
    if (!topup) return undefined;

    async function finish() {
      if (topup === 'success') {
        setMessage('Funds added — refreshing wallet…');
        try {
          // Blobs reads are eventually consistent; retry once after a short wait.
          await wallet.refresh?.();
          await new Promise((r) => setTimeout(r, 1500));
          await wallet.refresh?.();
          setMessage('Wallet updated.');
        } catch (err) {
          setMessage(`Could not refresh wallet (${err.message}).`);
        }
      } else if (topup === 'cancel') {
        setMessage('Top-up canceled.');
      }
      params.delete('topup');
      params.delete('session_id');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', next);
    }

    finish();
    return undefined;
  }, [wallet]);

  if (!wallet || wallet.mode !== 'paid') return null;

  async function handleTopUp(cents) {
    setBusy(true);
    setMessage(null);
    try {
      await wallet.topUp(cents);
    } catch (err) {
      setMessage(err.message || 'Top-up failed');
      setBusy(false);
    }
  }

  async function handleDevCredit() {
    if (!wallet.devCredit) return;
    setBusy(true);
    setMessage(null);
    try {
      await wallet.devCredit(1000);
      setMessage('Dev credit applied (+$10).');
    } catch (err) {
      setMessage(err.message || 'Dev credit failed');
    } finally {
      setBusy(false);
    }
  }

  const balanceLabel =
    wallet.status === 'ready' || wallet.status === 'loading'
      ? `$${(wallet.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';

  return (
    <section className="wallet-panel" aria-label="Wallet">
      <div className="wallet-panel-main">
        <div className="wallet-panel-balance">
          <span className="wallet-panel-eyebrow">Balance</span>
          <strong>{balanceLabel}</strong>
          {playerId && <span className="wallet-panel-player">{playerId}</span>}
        </div>
        <div className="wallet-panel-actions">
          {TOP_UP_OPTIONS.map((opt) => (
            <button
              key={opt.cents}
              type="button"
              className="secondary-button wallet-topup-button"
              disabled={busy || wallet.status === 'needs-config'}
              onClick={() => handleTopUp(opt.cents)}
            >
              Add {opt.label}
            </button>
          ))}
          <button
            type="button"
            className="secondary-button"
            disabled={busy || wallet.status === 'loading'}
            onClick={() => wallet.refresh?.()}
          >
            Refresh
          </button>
          {wallet.devCredit && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy || wallet.status === 'needs-config'}
              onClick={handleDevCredit}
            >
              Dev +$10
            </button>
          )}
        </div>
      </div>
      {wallet.status === 'error' && <p className="game-error">Wallet error: {wallet.error}</p>}
      {wallet.status === 'needs-config' && <p className="game-error">Waiting for viewer email / player id.</p>}
      {message && <p className="wallet-panel-message">{message}</p>}
      <p className="wallet-panel-hint">
        Owned games: {(wallet.ownedGameIds || []).length ? wallet.ownedGameIds.join(', ') : 'none yet'}. Buy and play from
        the game library plugin — same playerId shares this balance.
      </p>
    </section>
  );
}

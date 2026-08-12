import { useCallback, useEffect, useState } from 'react';

// Talks to the shared wallet Netlify API when `VITE_API_BASE` is set.
// Top-up creates an Embedded Checkout session that the UI mounts in-page;
// each user already has demo Visa 4242 on file.

function apiBase() {
  const raw = import.meta.env.VITE_API_BASE;
  if (!raw || typeof raw !== 'string') return null;
  return raw.replace(/\/$/, '');
}

export function isPaidWalletConfigured() {
  return Boolean(apiBase());
}

async function apiFetch(path, options = {}) {
  const base = apiBase();
  if (!base) throw new Error('paid_wallet_not_configured');
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `http_${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function usePaidWallet(playerId, { displayName } = {}) {
  const configured = isPaidWalletConfigured();
  const [balanceCents, setBalanceCents] = useState(0);
  const [ownedGameIds, setOwnedGameIds] = useState([]);
  const [status, setStatus] = useState(configured ? (playerId ? 'loading' : 'needs-config') : 'disabled');
  const [error, setError] = useState(null);

  const applyWallet = useCallback((data) => {
    setBalanceCents(data.balanceCents ?? Math.round((data.balance || 0) * 100));
    setOwnedGameIds(data.ownedGameIds || []);
    setStatus('ready');
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!configured) return;
    if (!playerId) {
      setStatus('needs-config');
      return;
    }
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    try {
      const data = await apiFetch(`/api/wallet?playerId=${encodeURIComponent(playerId)}`);
      applyWallet(data);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [configured, playerId, applyWallet]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onMessage(event) {
      const data = event.data;
      if (!data || data.type !== 'sigma-wallet-topup') return;
      if (data.status === 'success') refresh();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refresh]);

  // Creates the session only; the caller mounts Stripe's embedded UI with the
  // returned client secret, so the player never leaves this page.
  const topUp = useCallback(
    async (amountCents) => {
      if (!playerId) throw new Error('player_id_required');
      const data = await apiFetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          playerId,
          amountCents,
          displayName: displayName || undefined,
        }),
      });
      if (!data.clientSecret) throw new Error('missing_client_secret');
      return data;
    },
    [playerId, displayName],
  );

  // Webhook-free crediting: after Stripe.js fires onComplete, ask the server
  // to verify the session (payment_status: paid) and credit the ledger. This
  // returns the new balance synchronously, so there's nothing to poll for.
  const creditCheckout = useCallback(
    async (sessionId) => {
      if (!playerId) throw new Error('player_id_required');
      if (!sessionId) throw new Error('session_id_required');
      const data = await apiFetch('/api/checkout-credit', {
        method: 'POST',
        body: JSON.stringify({ playerId, sessionId }),
      });
      applyWallet(data);
      return data;
    },
    [playerId, applyWallet],
  );

  // Kept for resilience: poll the ledger until a credit lands (e.g. if you
  // still run the Stripe webhook). Not used by the default onComplete path.
  const refreshUntilCredited = useCallback(
    async ({ previousBalanceCents, timeoutMs = 20000, intervalMs = 800 } = {}) => {
      if (!playerId) return null;
      const start = Date.now();
      let last = null;
      while (Date.now() - start < timeoutMs) {
        const data = await apiFetch(`/api/wallet?playerId=${encodeURIComponent(playerId)}`);
        last = data;
        applyWallet(data);
        const nextCents = data.balanceCents ?? Math.round((data.balance || 0) * 100);
        if (previousBalanceCents == null || nextCents > previousBalanceCents) return data;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return last;
    },
    [playerId, applyWallet],
  );

  const devCredit = useCallback(
    async (amountCents = 1000) => {
      if (!playerId) throw new Error('player_id_required');
      if (import.meta.env.VITE_ALLOW_DEV_CREDIT !== 'true') {
        throw new Error('dev_credit_disabled');
      }
      const data = await apiFetch('/api/dev-credit', {
        method: 'POST',
        body: JSON.stringify({ playerId, amountCents }),
      });
      applyWallet(data);
      return data;
    },
    [playerId, applyWallet],
  );

  const purchaseGame = useCallback(
    async (gameId) => {
      if (!playerId) throw new Error('player_id_required');
      const data = await apiFetch('/api/purchase', {
        method: 'POST',
        body: JSON.stringify({ playerId, gameId }),
      });
      applyWallet(data);
      return data;
    },
    [playerId, applyWallet],
  );

  const updateBalance = useCallback(
    async (newBalanceDollars) => {
      if (!playerId) return;
      const targetCents = Math.round(Number(newBalanceDollars) * 100);
      const deltaCents = targetCents - balanceCents;
      if (deltaCents === 0) return;
      const data = await apiFetch('/api/wallet-adjust', {
        method: 'POST',
        body: JSON.stringify({ playerId, deltaCents }),
      });
      applyWallet(data);
    },
    [playerId, balanceCents, applyWallet],
  );

  if (!configured) {
    return null;
  }

  return {
    status: !playerId ? 'needs-config' : status,
    balance: balanceCents / 100,
    balanceCents,
    ownedGameIds,
    error,
    mode: 'paid',
    refresh,
    refreshUntilCredited,
    creditCheckout,
    topUp,
    devCredit: import.meta.env.VITE_ALLOW_DEV_CREDIT === 'true' ? devCredit : undefined,
    purchaseGame,
    updateBalance,
  };
}

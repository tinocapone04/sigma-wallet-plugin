import { useCallback, useState } from 'react';
import { useLocalPlayerId } from './store/useLocalPlayerId.js';
import { useViewerIdentity } from './store/useViewerIdentity.js';
import { usePaidWallet, isPaidWalletConfigured } from './store/usePaidWallet.js';
import WalletPanel from './components/WalletPanel.jsx';

export default function App() {
  const { player, setDisplayName } = useLocalPlayerId();
  const identity = useViewerIdentity(player?.id);
  const playerId = identity.playerId;
  const displayName =
    identity.adapter === 'sigma' || identity.adapter === 'embed'
      ? identity.displayName
      : player?.displayName;
  const wallet = usePaidWallet(playerId);
  const [nameInput, setNameInput] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const handleCheckoutChange = useCallback((open) => setCheckoutOpen(open), []);

  if (identity.adapter === 'sigma' && !playerId) {
    return (
      <Screen>
        <p>
          Bind the &quot;Current-viewer element&quot; and &quot;Viewer email column&quot; fields in the plugin&apos;s
          editor panel to an element with a Calculation column set to <code>CurrentUserEmail()</code>.
          Or use a Sigma Embed URL with <code>?playerId=…</code> (see README).
        </p>
      </Screen>
    );
  }

  if (identity.adapter === 'local' && !playerId) {
    return (
      <Screen>
        <h1>Sigma Wallet</h1>
        <p>Pick a name (stored on this browser). Use the same email/id in the game library for a shared balance.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nameInput.trim()) setDisplayName(nameInput.trim());
          }}
        >
          <input
            className="name-input"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="e.g. alice@example.com"
            autoFocus
          />
          <button className="primary-button" type="submit">
            Continue
          </button>
        </form>
      </Screen>
    );
  }

  if (!isPaidWalletConfigured() || !wallet) {
    return (
      <Screen>
        <h1>Sigma Wallet</h1>
        <p>
          Set <code>VITE_API_BASE</code> to this site&apos;s origin (e.g. <code>http://localhost:3030</code> with{' '}
          <code>npm run dev:full</code>).
        </p>
      </Screen>
    );
  }

  return (
    <div className={`app${checkoutOpen ? ' app-checkout' : ''}`}>
      {!checkoutOpen && (
        <header className="wallet-hero">
          <p className="wallet-brand">Sigma Wallet</p>
          <h1>Fund your balance</h1>
          <p className="wallet-lede">
            Top up via Stripe Checkout — every user has demo Visa •••• 4242 on file to confirm. The game library spends
            the same wallet using your email as player id
            {displayName ? ` (${displayName})` : ''}.
          </p>
        </header>
      )}
      <WalletPanel wallet={wallet} playerId={playerId} onCheckoutChange={handleCheckoutChange} />
    </div>
  );
}

function Screen({ children }) {
  return (
    <div className="app">
      <div className="screen-centered">{children}</div>
    </div>
  );
}

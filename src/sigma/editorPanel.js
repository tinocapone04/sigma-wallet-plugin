// Editor panel for the wallet plugin.
// Identity: viewer email as playerId for the Netlify API (Stripe + Blobs).
// Wallet write: stage new total into a control, then fire creditWalletEvent so
// the workbook author can Update-row the money input table (same pattern as
// the game library's updateWalletEvent).
export const CONFIG_OPTIONS = [
  {
    type: 'element',
    name: 'viewerSource',
    label: 'Current-viewer element (any element with >= 1 row)',
  },
  {
    type: 'column',
    name: 'viewerEmailCol',
    label: 'Viewer email column (Calculation: CurrentUserEmail())',
    source: 'viewerSource',
    allowMultiple: false,
  },
  {
    type: 'column',
    name: 'viewerNameCol',
    label: 'Viewer display name column (Calculation: CurrentUserFullName())',
    source: 'viewerSource',
    allowMultiple: false,
  },

  // Sync Stripe top-ups into a Sigma input table. The table should already
  // have one row per employee (RLS scoped to CurrentUserEmail()). No email
  // staging control — the workbook author's Update row action matches "by"
  // Formula CurrentUserEmail() directly; only the new balance is staged.
  {
    type: 'element',
    name: 'walletSource',
    label: 'Wallet input table (money balance per employee)',
  },
  {
    type: 'column',
    name: 'walletEmailCol',
    label: 'Wallet: employee email column (matches CurrentUserEmail())',
    source: 'walletSource',
    allowMultiple: false,
  },
  {
    type: 'column',
    name: 'walletMoneyCol',
    label: 'Wallet: money balance column',
    source: 'walletSource',
    allowMultiple: false,
  },
  {
    type: 'variable',
    name: 'walletMoneyControl',
    label: 'Wallet: staging control for new balance',
    allowedTypes: ['number'],
  },
  {
    type: 'action-trigger',
    name: 'creditWalletEvent',
    label: 'Credit wallet after Stripe (wire to Update row)',
  },
];

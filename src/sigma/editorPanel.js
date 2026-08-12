// Editor panel for the wallet plugin - identity only. Money lives on the
// Netlify API (Stripe + Blobs), keyed by viewer email as playerId.
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
];

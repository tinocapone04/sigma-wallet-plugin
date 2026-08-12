/** @returns {string | null} */
export function readReturnUrl() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const fromQuery = (params.get('returnUrl') || '').trim();
  if (fromQuery) {
    const safe = sanitizeHttpUrl(fromQuery);
    if (safe) {
      try {
        sessionStorage.setItem('sigma_wallet_return_url', safe);
      } catch {
        // ignore
      }
      return safe;
    }
  }
  try {
    return sessionStorage.getItem('sigma_wallet_return_url');
  } catch {
    return null;
  }
}

/** @returns {string | null} */
export function sanitizeHttpUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function appendQueryParams(url, params) {
  const u = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') u.searchParams.set(key, String(value));
  }
  return u.toString();
}

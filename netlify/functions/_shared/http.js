const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

export function noContent() {
  return { statusCode: 204, headers: { ...CORS_HEADERS }, body: '' };
}

export function readJson(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function siteUrl(event) {
  return (
    process.env.URL
    || process.env.DEPLOY_PRIME_URL
    || (event.headers?.origin)
    || 'http://localhost:8890'
  ).replace(/\/$/, '');
}

const BASE = import.meta.env.VITE_API_URL || '';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    credentials: 'include',
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw body;
  return body;
}

export function registerUser({ name, email, password }) {
  return req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
}

export function loginUser({ email, password }) {
  return req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function getPublicTiers() {
  return req('/api/subscriptions/public/tiers');
}

// Public and cookie-free on purpose: a buyer checking a certificate has no
// account, and a plain GET with no custom headers needs no CORS preflight.
export async function verifyCertificate(code) {
  const res = await fetch(`${BASE}/api/public/certificates/verify/${encodeURIComponent(code)}`, {
    credentials: 'omit',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...body };
  return body;
}

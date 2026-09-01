// VITE_API_URL carries the /api suffix by project convention — see .env.example
// and breeding-app-shared's config/api.ts, which normalizes onto it. The request
// paths below spell /api out themselves, so strip a trailing /api from the base
// or every call lands on /api/api/... and 404s.
//
// Tolerant of either form, and of an empty value: with no base configured the
// paths stay relative and are served by the /api proxy that
// scripts/generate-netlify-redirects.cjs writes into build/_redirects.
export function resolveApiBase(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
}

const BASE = resolveApiBase(import.meta.env.VITE_API_URL);

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

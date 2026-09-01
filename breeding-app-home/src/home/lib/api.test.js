import { describe, expect, it } from 'vitest';
import { resolveApiBase } from './api';

describe('resolveApiBase', () => {
  // The project convention (every .env.example, and shared/config/api.ts) is that
  // VITE_API_URL already ends in /api. The request paths add /api themselves.
  it('strips the /api suffix the project convention includes', () => {
    expect(resolveApiBase('https://backend.example.com/api')).toBe('https://backend.example.com');
  });

  it('accepts a bare origin unchanged', () => {
    expect(resolveApiBase('https://backend.example.com')).toBe('https://backend.example.com');
  });

  it('tolerates trailing slashes', () => {
    expect(resolveApiBase('https://backend.example.com/api/')).toBe('https://backend.example.com');
    expect(resolveApiBase('https://backend.example.com/')).toBe('https://backend.example.com');
  });

  it('keeps a sub-path that merely contains api', () => {
    expect(resolveApiBase('https://backend.example.com/apiary')).toBe('https://backend.example.com/apiary');
  });

  it('falls back to a relative base so the Netlify /api proxy can serve it', () => {
    expect(resolveApiBase('')).toBe('');
    expect(resolveApiBase(undefined)).toBe('');
  });

  it('never produces a doubled /api for the paths the app requests', () => {
    const base = resolveApiBase('https://backend.example.com/api');
    for (const path of ['/api/auth/login', '/api/auth/register', '/api/subscriptions/public/tiers']) {
      expect(`${base}${path}`).not.toContain('/api/api/');
    }
  });
});

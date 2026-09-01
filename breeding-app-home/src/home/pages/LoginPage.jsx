import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { loginUser } from '../lib/api.js';
import Logo from '../components/Logo.jsx';

const BREEDER_APP = import.meta.env.VITE_BREEDER_APP_URL || '/';

export default function LoginPage() {
  const [form, setForm]         = useState({ email: '', password: '' });
  const [errors, setErrors]     = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading]   = useState(false);

  function validate() {
    const e = {};
    if (!form.email.trim()) e.email    = 'Email is required';
    if (!form.password)     e.password = 'Password is required';
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({}); setApiError(''); setLoading(true);
    try {
      await loginUser({ email: form.email.trim(), password: form.password });
      window.location.href = BREEDER_APP;
    } catch (err) {
      setApiError(err?.message || 'Invalid email or password.');
      setLoading(false);
    }
  }

  const set = k => e => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors(errs => ({ ...errs, [k]: '' }));
  };

  return (
    <section className="section section-soft" style={{ minHeight: 'calc(100vh - 140px)', display: 'flex', alignItems: 'center' }}>
      <div className="auth-card" style={{ maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ display: 'inline-flex', marginBottom: 12 }}>
            <Logo size={48} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--dark)', marginBottom: 4 }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Sign in to your Breeding Planner account
          </p>
        </div>

        {apiError && <div className="alert alert-error">{apiError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} autoComplete="email" />
            {errors.email && <div className="field-error">{errors.email}</div>}
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input id="login-password" type="password" placeholder="Your password" value={form.password} onChange={set('password')} autoComplete="current-password" />
            {errors.password && <div className="field-error">{errors.password}</div>}
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading} style={{ marginTop: 4 }}>
            {loading
              ? <><i className="ti ti-loader-2 spin" style={{ fontSize: 16 }} /> Signing in...</>
              : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', marginTop: '1.25rem' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: 'var(--gold-dk)', fontWeight: 500 }}>Sign up free</Link>
        </p>

        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #f0ece0', display: 'flex', justifyContent: 'center', gap: '1.5rem' }}>
          <a href={import.meta.env.VITE_LAB_APP_URL || '#'} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
            <i className="ti ti-flask" style={{ marginRight: 4 }} aria-hidden="true" />Lab login
          </a>
          <a href={import.meta.env.VITE_ADMIN_APP_URL || '#'} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
            <i className="ti ti-shield" style={{ marginRight: 4 }} aria-hidden="true" />Admin login
          </a>
        </div>
      </div>
    </section>
  );
}

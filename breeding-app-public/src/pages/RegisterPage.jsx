import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { registerUser, loginUser } from '../lib/api.js';
import Logo from '../components/Logo.jsx';

const BREEDER_APP = import.meta.env.VITE_BREEDER_APP_URL || '/';

export default function RegisterPage() {
  const [params] = useSearchParams();
  const [form, setForm]       = useState({ name: '', email: '', password: '' });
  const [errors, setErrors]   = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const plan = params.get('plan');

  function validate() {
    const e = {};
    if (!form.name.trim())                        e.name     = 'Name is required';
    if (!form.email.trim())                       e.email    = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email))   e.email    = 'Enter a valid email';
    if (!form.password)                           e.password = 'Password is required';
    else if (form.password.length < 8)            e.password = 'At least 8 characters';
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({}); setApiError(''); setLoading(true);
    try {
      await registerUser({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      await loginUser({ email: form.email.trim(), password: form.password });
      window.location.href = BREEDER_APP;
    } catch (err) {
      setApiError(err?.message || 'Registration failed. Please try again.');
      setLoading(false);
    }
  }

  const set = k => e => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors(errs => ({ ...errs, [k]: '' }));
  };

  return (
    <section className="section section-soft" style={{ minHeight: 'calc(100vh - 140px)', display: 'flex', alignItems: 'center' }}>
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ display: 'inline-flex', marginBottom: 12 }}>
            <Logo size={48} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--dark)', marginBottom: 4 }}>
            Create your account
          </h1>
          {plan && (
            <span className="badge-gold" style={{ fontSize: 11, marginTop: 6 }}>
              <i className="ti ti-tag" style={{ fontSize: 12 }} aria-hidden="true" />
              Plan: {plan}
            </span>
          )}
        </div>

        {apiError && <div className="alert alert-error">{apiError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="reg-name">Full name</label>
            <input id="reg-name" type="text" placeholder="Your name" value={form.name} onChange={set('name')} autoComplete="name" />
            {errors.name && <div className="field-error">{errors.name}</div>}
          </div>
          <div className="field">
            <label htmlFor="reg-email">Email</label>
            <input id="reg-email" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} autoComplete="email" />
            {errors.email && <div className="field-error">{errors.email}</div>}
          </div>
          <div className="field">
            <label htmlFor="reg-password">Password</label>
            <input id="reg-password" type="password" placeholder="At least 8 characters" value={form.password} onChange={set('password')} autoComplete="new-password" />
            {errors.password && <div className="field-error">{errors.password}</div>}
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading} style={{ marginTop: 4 }}>
            {loading
              ? <><i className="ti ti-loader-2 spin" style={{ fontSize: 16 }} /> Creating account...</>
              : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', marginTop: '1.25rem' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--gold-dk)', fontWeight: 500 }}>Sign in</Link>
        </p>
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--hint)', marginTop: 8 }}>
          By signing up you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </section>
  );
}

import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

// There is no signup backend for the waitlist yet, so joining is an email to
// the founder. The form only composes that email: nothing is stored or sent by
// this page, and the copy says so rather than pretending to submit.
const WAITLIST_ADDRESS = 'info@serpentora.com';

const PLAN_NAMES = {
  free: 'Free',
  hobby: 'Hobby',
  'hobby-plus': 'Hobby Plus',
  breeder: 'Breeder',
  professional: 'Professional',
};

const SEGMENTS = ['Hobbyist', 'Semi-pro or pro', 'Just curious'];

export default function WaitlistPage() {
  const [params] = useSearchParams();
  const plan = PLAN_NAMES[params.get('plan')] || '';
  const [segment, setSegment] = useState('');
  const [keeps, setKeeps] = useState('');

  function composeMailto() {
    const lines = [
      'Please add me to the Serpentora waitlist.',
      '',
      `Which best describes me: ${segment || '(not answered)'}`,
      `What I keep: ${keeps.trim() || '(not answered)'}`,
    ];
    if (plan) lines.push(`Plan I am interested in: ${plan}`);
    const subject = 'Join the Serpentora waitlist';
    return `mailto:${WAITLIST_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  }

  return (
    <section className="section section-soft" style={{ minHeight: 'calc(100vh - 140px)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 26, fontWeight: 500, lineHeight: 1.3, color: 'var(--dark)' }}>Join the waitlist</h1>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--muted)', marginTop: 8 }}>
          Serpentora is in active development. Join the waitlist to help shape it and get early access.
        </p>

        <div className="auth-card" style={{ maxWidth: 'none', marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--dark)' }}>Why join now</h2>
          <ul className="check-list" style={{ marginBottom: '1.5rem' }}>
            <li><i className="ti ti-check ck" aria-hidden="true" />Founding members keep the planned founding-member price for as long as they stay subscribed.</li>
            <li><i className="ti ti-check ck" aria-hidden="true" />Early access before the public launch, and a say in what gets built next.</li>
            <li><i className="ti ti-check ck" aria-hidden="true" />Payments are not live. Joining costs nothing and commits you to nothing.</li>
          </ul>

          <form onSubmit={(event) => { event.preventDefault(); window.location.href = composeMailto(); }}>
            <fieldset className="field" style={{ border: 'none' }}>
              <legend style={{ fontSize: 13, fontWeight: 500, color: 'var(--dark)', marginBottom: 5 }}>
                Which best describes you? <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
              </legend>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {SEGMENTS.map((option) => (
                  <label key={option} className="btn btn-outline btn-sm choice-chip" style={{ fontWeight: segment === option ? 600 : 400, borderColor: segment === option ? 'var(--gold)' : undefined }}>
                    <input
                      type="radio"
                      name="segment"
                      value={option}
                      checked={segment === option}
                      onChange={() => setSegment(option)}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="waitlist-keeps">
                What do you keep? <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="waitlist-keeps"
                value={keeps}
                onChange={(event) => setKeeps(event.target.value)}
                placeholder="Ball pythons, leopard geckos…"
              />
            </div>
            {plan && (
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: '1rem' }}>
                Plan you are interested in: <strong style={{ color: 'var(--dark)', fontWeight: 500 }}>{plan}</strong>
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-full">Join the waitlist</button>
            <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--muted)', marginTop: 10 }}>
              This opens your email app with a message to {WAITLIST_ADDRESS} already written. Nothing is
              sent until you send it. No email app? Write to{' '}
              <a href={`mailto:${WAITLIST_ADDRESS}`} style={{ color: 'var(--gold-dk)', fontWeight: 500 }}>{WAITLIST_ADDRESS}</a>{' '}
              directly.
            </p>
          </form>
        </div>

        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--muted)', marginTop: 24 }}>
          Want to see what the plans will cost? <Link to="/pricing" style={{ color: 'var(--gold-dk)', fontWeight: 500 }}>Planned pricing</Link>
        </p>
      </div>
    </section>
  );
}

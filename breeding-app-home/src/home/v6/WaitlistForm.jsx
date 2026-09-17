import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { joinWaitlist } from '../lib/api.js';

/**
 * The pre-launch waitlist form.
 *
 * The design is waitlist-only, but sign-up genuinely works today while the
 * waitlist endpoint does not exist yet. So the form tries the waitlist and, if
 * the call fails for any reason, says so plainly and offers the account route
 * rather than swallowing the address and showing a thank-you that isn't true.
 */
export default function WaitlistForm({ id }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle · sending · joined · failed

  async function submit(event) {
    event.preventDefault();
    if (!email.trim() || state === 'sending') return;
    setState('sending');
    try {
      await joinWaitlist({ email: email.trim() });
      setState('joined');
    } catch {
      setState('failed');
    }
  }

  if (state === 'joined') {
    return (
      <p className="v6-copy" style={{ maxWidth: '44ch', textAlign: 'center' }}>
        You’re on the list. We’ll write when the next wave opens — nothing else.
      </p>
    );
  }

  return (
    <div className="v6-stack" style={{ '--gap': '12px', alignItems: 'center', width: '100%' }}>
      <form
        onSubmit={submit}
        className="v6-cluster"
        style={{ justifyContent: 'center', paddingTop: 4 }}
      >
        <label htmlFor={id} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Your email address
        </label>
        <input
          id={id}
          type="email"
          required
          autoComplete="email"
          className="v6-field"
          placeholder="you@yourfacility.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="v6-btn v6-btn--cta" disabled={state === 'sending'}>
          {state === 'sending' ? 'Joining…' : 'Join the waitlist'}
        </button>
      </form>

      {state === 'failed' && (
        <p className="v6-note" role="status" style={{ maxWidth: '52ch', textAlign: 'center' }}>
          The waitlist didn’t take that just now, and we’d rather tell you than pretend.{' '}
          <Link to="/register">Create an account</Link> instead — it works today, and the free plan
          holds 20 animals.
        </p>
      )}
    </div>
  );
}

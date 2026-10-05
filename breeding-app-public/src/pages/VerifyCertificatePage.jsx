import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { verifyCertificate } from '../lib/api.js';

// People retype codes from paper, so spaces, dashes and case are forgiven here
// exactly as the server forgives them.
const normalizeCode = (value) => String(value || '').replace(/[\s-]+/g, '').toUpperCase();
const isWellFormed = (code) => /^[0-9A-F]{24}$/.test(code);

const formatIssued = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // UTC, because the certificate number's date stamp is UTC too: a result
  // reported late in the evening must show the same day on paper and here.
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/**
 * Violet for het, coral for visual, as everywhere else. Deliberately not the
 * italic het tag: the italic means "probabilistic", and a certified het is the
 * one het that is not.
 */
const tagFor = (line) => {
  if (/^het\s/i.test(line.result)) return 'verify-tag verify-tag-het';
  if (line.result === line.test) return 'verify-tag verify-tag-visual';
  return 'verify-tag verify-tag-neutral';
};

function ConfirmedCard({ result }) {
  const rows = [
    ['Certificate number', result.certificateNumber, true],
    ['Laboratory', result.labName || 'Not recorded'],
    ['Species', result.species || 'Not specified'],
    ['Issued', formatIssued(result.issuedAt)],
  ];

  return (
    <article className="verify-result verify-result-valid">
      <header className="verify-result-head">
        <div className="feat-icon verify-chip-lab" aria-hidden="true">
          <i className="ti ti-rosette-discount-check" />
        </div>
        <div>
          <h2 className="verify-result-title">Certificate confirmed</h2>
          <p className="verify-result-sub">
            This code matches a certificate issued through Serpentora
            {result.labName ? <> by <strong>{result.labName}</strong></> : null}.
          </p>
        </div>
      </header>

      <dl className="verify-facts">
        {rows.map(([label, value, mono]) => (
          <div key={label} className="verify-fact">
            <dt>{label}</dt>
            <dd className={mono ? 'verify-mono' : undefined}>{value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="verify-results-label">Certified results</h3>
      {result.testsSummary?.length ? (
        <ul className="verify-lines">
          {result.testsSummary.map((line, index) => (
            <li key={`${line.test}-${index}`} className="verify-line">
              <span>{line.test}</span>
              <span className={tagFor(line)}>{line.result}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="verify-result-sub">The laboratory recorded no individual test lines on this certificate.</p>
      )}
    </article>
  );
}

function NotFoundCard() {
  return (
    <article className="verify-result verify-result-missing">
      <header className="verify-result-head">
        <div className="feat-icon verify-chip-neutral" aria-hidden="true">
          <i className="ti ti-file-unknown" />
        </div>
        <div>
          <h2 className="verify-result-title">No certificate matches this code</h2>
          <p className="verify-result-sub">
            Check each character against the certificate and try again. If it still does not match,
            Serpentora cannot confirm this certificate. Ask the seller for the original document, or
            contact the laboratory named on it.
          </p>
        </div>
      </header>
    </article>
  );
}

export default function VerifyCertificatePage() {
  const { code: codeFromUrl } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(codeFromUrl || '');
  const [fieldError, setFieldError] = useState('');
  const [state, setState] = useState({ status: 'idle' });
  const lastChecked = useRef('');

  async function check(rawCode) {
    const code = normalizeCode(rawCode);
    if (!code) { setFieldError('Enter the verification code from the certificate.'); return; }
    if (!isWellFormed(code)) {
      setFieldError('A verification code is 24 characters: the digits 0 to 9 and the letters A to F.');
      return;
    }
    setFieldError('');
    lastChecked.current = code;
    setState({ status: 'loading' });
    // Keep the address shareable: the certificate PDF links to /verify/<code>.
    if (normalizeCode(codeFromUrl) !== code) navigate(`/verify/${code}`, { replace: true });

    try {
      const result = await verifyCertificate(code);
      setState({ status: result?.valid ? 'valid' : 'missing', result });
    } catch (error) {
      setState({ status: 'error', rateLimited: error?.status === 429 });
    }
  }

  // Arriving from the link printed on a certificate: check straight away.
  useEffect(() => {
    if (codeFromUrl && normalizeCode(codeFromUrl) !== lastChecked.current) {
      setInput(codeFromUrl);
      check(codeFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl]);

  const loading = state.status === 'loading';

  return (
    <section className="section section-soft verify-page">
      <div className="verify-wrap">
        <h1 className="verify-title">Check a lab certificate</h1>
        <p className="verify-sub">
          Enter the verification code printed on a Serpentora genetic test certificate to see which
          laboratory issued it and what it certifies.
        </p>

        <form
          className="verify-form"
          noValidate
          onSubmit={(event) => { event.preventDefault(); check(input); }}
        >
          <div className="field">
            <label htmlFor="verify-code">Verification code</label>
            <input
              id="verify-code"
              className="verify-input"
              value={input}
              onChange={(event) => { setInput(event.target.value); if (fieldError) setFieldError(''); }}
              placeholder="24 characters, e.g. 3F9A 1C…"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'verify-code-error' : undefined}
            />
            {fieldError && <div id="verify-code-error" className="field-error">{fieldError}</div>}
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading
              ? <><i className="ti ti-loader-2 spin" style={{ fontSize: 16 }} aria-hidden="true" /> Checking…</>
              : 'Check certificate'}
          </button>
        </form>

        <div aria-live="polite">
          {state.status === 'valid' && <ConfirmedCard result={state.result} />}
          {state.status === 'missing' && <NotFoundCard />}
          {state.status === 'error' && (
            <div className="alert alert-error verify-alert" role="alert">
              {state.rateLimited
                ? 'Too many checks from this connection. Wait a few minutes and try again.'
                : 'The verification service could not be reached. Try again in a moment.'}
            </div>
          )}
        </div>

        <p className="verify-note">
          A check confirms the certificate and its results only. It never shows the breeder, the
          animal's records or anything else in their account.
        </p>
      </div>
    </section>
  );
}

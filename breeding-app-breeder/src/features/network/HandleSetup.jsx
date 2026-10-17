import React, { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { networkApi, errorText } from './networkApi.js';
import { cleanHandleInput, handleInputProblem } from './networkFormat.js';
import { ErrorNote } from './NetworkBits.jsx';

/**
 * Choosing an @handle. It is how other breeders find you, so the screen says so plainly, and it
 * checks availability as you type. Also used to change an existing handle.
 */
export default function HandleSetup({ current = null, onDone, onCancel = null }) {
  const { t } = useTranslation();
  const id = useId();
  const [value, setValue] = useState(current || '');
  const [check, setCheck] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const handle = cleanHandleInput(value);
  const problem = handleInputProblem(handle);

  useEffect(() => {
    setCheck(null);
    if (problem || handle === current) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      networkApi.checkHandle(handle)
        .then((res) => { if (live) setCheck(res); })
        .catch(() => { if (live) setCheck(null); });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [handle, problem, current]);

  const problemText = {
    empty: '',
    short: t('network.handle.short', { defaultValue: 'At least 3 characters.' }),
    long: t('network.handle.long', { defaultValue: 'At most 24 characters.' }),
    characters: t('network.handle.characters', { defaultValue: 'Lower-case letters, digits, dots and underscores, starting with a letter.' }),
  }[problem] || '';

  const submit = async (event) => {
    event.preventDefault();
    if (problem) return;
    setSaving(true);
    setError('');
    try {
      const res = await networkApi.setHandle(handle);
      onDone?.(res?.me || null);
    } catch (err) {
      setError(errorText(err, t('network.handle.failed', { defaultValue: 'The handle could not be saved.' })));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="bn-panel bn-handle-setup" onSubmit={submit}>
      <h2>{current ? t('network.handle.changeTitle', { defaultValue: 'Change your handle' }) : t('network.handle.title', { defaultValue: 'Choose your @handle' })}</h2>
      <p className="bn-note">
        {t('network.handle.explain', {
          defaultValue: 'Other breeders find you by your handle, and only by your handle: nobody can look you up by email or browse a list of accounts. They see your handle and your breeder name, never your email address.',
        })}
      </p>
      <div className="bn-field">
        <label htmlFor={id}>{t('network.handle.label', { defaultValue: 'Handle' })}</label>
        <div style={{ position: 'relative' }}>
          <span aria-hidden="true" style={{ position: 'absolute', insetInlineStart: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--sk-text-muted)' }}>@</span>
          <input
            id={id}
            className="bn-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={30}
            style={{ paddingInlineStart: '1.6rem' }}
            aria-describedby={`${id}-state`}
          />
        </div>
        <small id={`${id}-state`} aria-live="polite">
          {problemText ? <span className="bn-bad">{problemText}</span> : null}
          {!problem && check?.available ? <span className="bn-ok">{t('network.handle.available', { defaultValue: '@{{handle}} is free.', handle })}</span> : null}
          {!problem && check && !check.available ? <span className="bn-bad">{check.reason}</span> : null}
        </small>
      </div>
      <ErrorNote error={error} />
      <div className="bn-row-actions">
        <button type="submit" className="bn-btn bn-btn--primary" disabled={saving || Boolean(problem) || (check && !check.available) || handle === current}>
          {saving ? t('network.saving', { defaultValue: 'Saving…' }) : t('network.handle.save', { defaultValue: 'Use this handle' })}
        </button>
        {onCancel ? (
          <button type="button" className="bn-btn bn-btn--ghost" onClick={onCancel}>{t('network.cancel', { defaultValue: 'Cancel' })}</button>
        ) : null}
      </div>
    </form>
  );
}

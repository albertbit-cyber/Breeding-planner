import React from 'react';
import { useTranslation } from 'react-i18next';
import { helpStore } from '../helpStore';

// Pinned while Help Mode is on, so nobody wonders why buttons stopped working.
export default function HelpModePill() {
  const { t } = useTranslation('help');
  return (
    <div className="help-pill" data-help-ui="">
      <span role="status" className="help-pill__status">
        <span className="help-pill__label">{t('ui.pill.label')}</span>
        <span className="help-pill__text">{t('ui.pill.text')}</span>
      </span>
      <button
        type="button"
        className="help-pill__exit appearance-btn appearance-btn--filled"
        onClick={() => helpStore.setMode(false)}
      >
        {t('ui.pill.exit')}
      </button>
    </div>
  );
}

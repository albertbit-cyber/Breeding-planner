import React from 'react';
import { useTranslation } from 'react-i18next';
import { helpStore, useHelpState } from '../helpStore';

// The ? in the top bar. Opens the Help menu; pressed while Help Mode is on.
export function HelpButton({ className = '' }) {
  const { t } = useTranslation('help');
  const mode = useHelpState(state => state.mode);
  const label = t('ui.button');
  return (
    <button
      type="button"
      data-help-ui=""
      data-help="help-button"
      className={`help-qbtn ${className}`}
      aria-label={label}
      title={label}
      aria-haspopup="dialog"
      data-active={mode ? '' : undefined}
      onClick={() => helpStore.openMenu()}
    >
      ?
    </button>
  );
}

// The ? in a window's header. Inside a window it toggles Help Mode directly: on means
// exit, off opens the menu, so the window itself can be explored.
export function DialogHelpButton({ className = '' }) {
  const { t } = useTranslation('help');
  const mode = useHelpState(state => state.mode);
  // Not a toggle for assistive tech: it opens the menu, or (while Help Mode is on) leaves it.
  const label = mode ? t('ui.menu.exit') : t('ui.dialogButton');
  return (
    <button
      type="button"
      data-help-ui=""
      data-help="help-button"
      className={`help-qbtn help-qbtn--dialog ${className}`}
      aria-label={label}
      title={label}
      data-active={mode ? '' : undefined}
      onClick={(event) => {
        // A window's own handlers (close on outside press) must not see this press.
        event.stopPropagation();
        if (mode) helpStore.setMode(false);
        else helpStore.openMenu();
      }}
    >
      ?
    </button>
  );
}

export default HelpButton;

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getTopic, resolveTopic } from '../registry';
import { helpStore } from '../helpStore';
import { placePopover } from '../popoverPlacement';
import { useHelpTranslator } from './useHelpTranslator';

const MAX_SEE_ALSO = 4;
// Room kept free at the bottom for the Help Mode pill (and the phone's bottom bar), so
// an explanation can never cover the way out of Help Mode.
const PILL_ROOM_DESKTOP = 76;
const PILL_ROOM_PHONE = 140;

// What Help Mode shows next to a pressed control.
export default function HelpPopover({ popover }) {
  const { t, translator } = useHelpTranslator();
  const ref = useRef(null);
  const gotItRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState(null);

  const topic = getTopic(popover.id);
  const resolved = useMemo(() => (topic ? resolveTopic(topic, translator) : null), [topic, translator]);
  const canExpand = !!resolved && (!!resolved.more || resolved.tips.length > 0 || resolved.related.length > 0);

  // A new control (or a See also swap) starts collapsed and takes focus on Got it.
  useLayoutEffect(() => {
    setExpanded(false);
    gotItRef.current?.focus({ preventScroll: true });
  }, [popover.seq]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = popover.anchor?.isConnected ? popover.anchor.getBoundingClientRect() : null;
    const next = placePopover(
      rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null,
      { width: node.offsetWidth, height: node.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight - (window.innerWidth <= 768 ? PILL_ROOM_PHONE : PILL_ROOM_DESKTOP) },
    );
    setPosition(prev => (prev && prev.top === next.top && prev.left === next.left ? prev : next));
  }, [popover.seq, popover.anchor, expanded, resolved]);

  useLayoutEffect(() => {
    const anchor = popover.anchor;
    if (!anchor?.setAttribute) return undefined;
    anchor.setAttribute('data-help-active', '');
    return () => anchor.removeAttribute('data-help-active');
  }, [popover.anchor]);

  const close = () => {
    const anchor = popover.anchor;
    helpStore.closePopover();
    if (anchor && typeof anchor.focus === 'function' && anchor.isConnected) anchor.focus({ preventScroll: true });
  };

  const title = resolved?.title || popover.name || t('ui.popover.unnamed');

  return (
    <div
      ref={ref}
      className="help-popover"
      role="dialog"
      aria-labelledby="help-popover-title"
      data-help-ui=""
      style={position ? { top: position.top, left: position.left } : { top: 0, left: 0, visibility: 'hidden' }}
    >
      <h2 id="help-popover-title" className="help-popover__title">{title}</h2>
      {resolved ? (
        <p className="help-popover__short">{resolved.short}</p>
      ) : (
        <p className="help-popover__short">{t('ui.popover.noTopic')}</p>
      )}
      {popover.disabled ? <p className="help-popover__note">{t('ui.popover.disabled')}</p> : null}

      {expanded && resolved ? (
        <>
          {resolved.more ? <p className="help-popover__more">{resolved.more}</p> : null}
          {resolved.tips.length ? (
            <>
              <h3 className="help-popover__h">{t('ui.popover.tips')}</h3>
              <ul className="help-popover__tips">
                {resolved.tips.map(tip => <li key={tip}>{tip}</li>)}
              </ul>
            </>
          ) : null}
          {resolved.related.length ? (
            <>
              <h3 className="help-popover__h">{t('ui.popover.seeAlso')}</h3>
              <div className="help-chips">
                {resolved.related.slice(0, MAX_SEE_ALSO).map(id => {
                  const related = getTopic(id);
                  return related ? (
                    <button key={id} type="button" className="help-chip" onClick={() => helpStore.showTopic(id)}>
                      {resolveTopic(related, translator).title}
                    </button>
                  ) : null;
                })}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      <div className="help-popover__actions">
        <button ref={gotItRef} type="button" className="help-btn appearance-btn appearance-btn--filled" onClick={close}>
          {t('ui.popover.gotIt')}
        </button>
        {canExpand ? (
          <button type="button" className="help-btn appearance-btn appearance-btn--ghost" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
            {expanded ? t('ui.popover.less') : t('ui.popover.more')}
          </button>
        ) : null}
        <button type="button" className="help-btn appearance-btn appearance-btn--ghost" onClick={() => helpStore.openManual(resolved ? popover.id : null)}>
          {resolved ? t('ui.popover.openManual') : t('ui.popover.noTopicManual')}
        </button>
      </div>
    </div>
  );
}

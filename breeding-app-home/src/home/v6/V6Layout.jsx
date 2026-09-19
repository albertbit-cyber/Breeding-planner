import React from 'react';
import { useLocation } from 'react-router-dom';
import './v6.css';
import { Masthead } from './SiteHeader.jsx';
import { SiteFooter } from './ClosingSections.jsx';
import { LookProvider, useLookState } from './useLook.js';

/**
 * The shell every v6 route wears: the skin, the two drifting glows, the
 * masthead and the footer.
 *
 * It exists because the site stopped being one page. The landing route used to
 * carry all nineteen sections in a single 17,000px scroll, which put the plans
 * at 91% depth; the deeper material now lives on its own routes and they all
 * need the same chrome.
 */

/** Restores the reading position when the router changes what is on screen. */
function useScrollForLocation() {
  const { pathname, hash } = useLocation();

  React.useEffect(() => {
    // Arriving at "/#calculator" from another route: the element exists only
    // after this render, so the scroll waits a frame.
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      const frame = requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ block: 'start' });
      });
      return () => cancelAnimationFrame(frame);
    }
    // A new page should start at its top, not wherever the last one was left.
    window.scrollTo(0, 0);
    return undefined;
  }, [pathname, hash]);
}

export default function V6Layout({ children }) {
  const look = useLookState();
  useScrollForLocation();

  return (
    <LookProvider value={look}>
      <div className="v6" data-look={look.look}>
        <div
          className="v6-glow"
          style={{ top: -180, left: -120, width: 720, height: 720, filter: 'blur(18px)' }}
        />
        <div
          className="v6-glow"
          style={{
            top: 620,
            right: -200,
            width: 760,
            height: 760,
            filter: 'blur(22px)',
            animationDuration: '34s',
            animationDirection: 'reverse',
          }}
        />

        <Masthead />
        {children}
        <SiteFooter />
      </div>
    </LookProvider>
  );
}

import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  const navLink = (to, label) => (
    <Link
      to={to}
      style={{
        fontSize: 13,
        color: pathname === to ? 'var(--gold-dk)' : '#5a5650',
        fontWeight: pathname === to ? 600 : 400,
        textDecoration: 'none',
      }}
    >
      {label}
    </Link>
  );

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      borderBottom: '1px solid var(--border)',
      padding: '.75rem 1.5rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: 'rgba(255,255,255,.97)', backdropFilter: 'blur(8px)',
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
        <img src="/Logo.png" alt="Breeding Planner" style={{ width: 72, height: 72, objectFit: 'contain', background: '#fff', borderRadius: 12, padding: 4, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }} />
        <div>
          <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--dark)', lineHeight: 1.2 }}>
            Breeding Planner
          </div>
          <div style={{ fontSize: 11, color: 'var(--hint)' }}>Morph management platform</div>
        </div>
      </Link>

      {/* Desktop */}
      <div className="desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        {navLink('/', 'Home')}
        {navLink('/pricing', 'Pricing')}
        <Link to="/login" style={{ fontSize: 13, color: '#5a5650', textDecoration: 'none' }}>Sign in</Link>
        <Link to="/register" className="btn btn-primary btn-sm">Get started free</Link>
      </div>

      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        className="mobile-menu-btn"
        style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
        aria-label="Toggle menu"
      >
        <i className={`ti ti-${open ? 'x' : 'menu-2'}`} style={{ fontSize: 22, color: '#5a5650' }} />
      </button>

      <style>{`
        @media (max-width: 640px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
        }
      `}</style>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#fff', borderBottom: '1px solid var(--border)',
          padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
        }}>
          <Link to="/"        onClick={() => setOpen(false)} style={{ fontSize: 14, color: '#5a5650' }}>Home</Link>
          <Link to="/pricing" onClick={() => setOpen(false)} style={{ fontSize: 14, color: '#5a5650' }}>Pricing</Link>
          <Link to="/login"   onClick={() => setOpen(false)} style={{ fontSize: 14, color: '#5a5650' }}>Sign in</Link>
          <Link to="/register" onClick={() => setOpen(false)} className="btn btn-primary btn-sm" style={{ width: 'fit-content' }}>
            Get started free
          </Link>
        </div>
      )}
    </nav>
  );
}

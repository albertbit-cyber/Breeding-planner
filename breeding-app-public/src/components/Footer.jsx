import React from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';

const BREEDER_APP = import.meta.env.VITE_BREEDER_APP_URL || '#';
const LAB_APP     = import.meta.env.VITE_LAB_APP_URL     || '#';
const ADMIN_APP   = import.meta.env.VITE_ADMIN_APP_URL   || '#';

export default function Footer() {
  return (
    <footer style={{ background: 'var(--dark)', borderTop: '1px solid var(--dark2)', padding: '1.5rem' }}>
      <div style={{
        maxWidth: 860, margin: '0 auto',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'var(--dark2)', border: '1px solid #3a3a34',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Logo size={26} />
          </div>
          <span style={{ fontSize: 13, color: '#5a5650', marginLeft: 4 }}> 2026 Breeding Planner</span>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {[['Breeder app', BREEDER_APP], ['Lab login', LAB_APP], ['Admin', ADMIN_APP]].map(([l, h]) => (
            <a key={l} href={h} style={{ fontSize: 12, color: '#5a5650', textDecoration: 'none' }}>{l}</a>
          ))}
          <Link to="/pricing" style={{ fontSize: 12, color: '#5a5650', textDecoration: 'none' }}>Pricing</Link>
          <a href="#" style={{ fontSize: 12, color: '#5a5650', textDecoration: 'none' }}>Privacy</a>
          <a href="#" style={{ fontSize: 12, color: '#5a5650', textDecoration: 'none' }}>Terms</a>
        </div>
      </div>
    </footer>
  );
}

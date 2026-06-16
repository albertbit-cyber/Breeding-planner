import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './App.css';
import './i18n/index.js';
import App from './AppEntry.jsx';
import reportWebVitals from './reportWebVitals';
import { seedDemoUsersIfNeeded } from './features/lab/utils/seedDemoUser';

// Seed demo users into localStorage for dev-mode login (no-op in production)
seedDemoUsersIfNeeded();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reportWebVitals();

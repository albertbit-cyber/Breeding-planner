import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './App.css';
import './i18n/index.js';
import App from './AppEntry.jsx';
import reportWebVitals from './reportWebVitals';
import { initSentry } from './shared/sentry';
import { installHelp } from './features/help/installHelp';

initSentry();
// Help Mode's guard must be registered before anything else listens on window.
installHelp();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

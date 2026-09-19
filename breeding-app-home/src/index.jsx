import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './home/home.css';
// i18n is deliberately NOT imported here. `src/i18n/index.js` statically pulls in
// all fifty locale files (~716KB of source) and nothing on this site renders a
// translated string — the marketing copy is English by design. Importing it put
// ten languages into the bundle of a page that speaks one. The module is kept for
// the day a route needs it; import it from that route, not from the shared entry.
import App from './AppEntry.jsx';
import reportWebVitals from './reportWebVitals';

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

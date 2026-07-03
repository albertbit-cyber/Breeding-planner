import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './App.css';
import './i18n/index.js';
import App from './AuthShell.jsx';
import reportWebVitals from './reportWebVitals';

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    const msg = 'React crash: ' + error.message + '\n' + (error.stack || '') + '\n\nComponent stack:\n' + (info.componentStack || '');
    if (window.__showCrash) window.__showCrash(msg);
  }
  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);

reportWebVitals();

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './App.css';
import './i18n/index.js';
import App from './AppEntry.jsx';
import DeviceStorageUnavailable from './components/DeviceStorageUnavailable.jsx';
import reportWebVitals from './reportWebVitals';
import { initSentry } from './shared/sentry';
import { initDeviceStore } from './platform/deviceStore.js';

initSentry();

const root = ReactDOM.createRoot(document.getElementById('root'));

// The collection is read synchronously while the app's state initialises, so the device
// store has to be loaded before the first render.
initDeviceStore()
  .catch((error) => ({ mode: 'unavailable', initError: String(error?.message || error) }))
  .then((status) => {
    root.render(
      <React.StrictMode>
        {status.mode === 'unavailable'
          ? <DeviceStorageUnavailable detail={status.initError} />
          : <App />}
      </React.StrictMode>
    );
  });

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

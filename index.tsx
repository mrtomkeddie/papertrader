import { registerSW } from 'virtual:pwa-register';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Register the PWA service worker only in production
if (import.meta.env.PROD) {
  registerSW({ immediate: true });
}

// Render the app immediately; seed the database asynchronously
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/* Auth gate and Firestore seeding are handled inside App for Google-only auth. */
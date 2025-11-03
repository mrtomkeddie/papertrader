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

// Minimal boot marker to help diagnose blank screen (removed after React mounts)
try {
  rootElement.textContent = 'Loading Paper Trader…';
} catch {}

const root = ReactDOM.createRoot(rootElement);
// Hide debug overlay shortly after mounting to confirm React is active
try {
  const dbg = document.getElementById('preload-debug');
  if (dbg) {
    dbg.textContent = 'React mounted.';
    setTimeout(() => { const d = document.getElementById('preload-debug'); if (d) d.style.display = 'none'; }, 600);
  }
} catch {}

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/* Auth gate and Firestore seeding are handled inside App for Google-only auth. */
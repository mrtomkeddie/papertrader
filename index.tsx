import { registerSW } from 'virtual:pwa-register';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initDb } from './services/database';
import { ensureSignedIn } from './services/firebase';

// Register the PWA service worker manually
registerSW({ immediate: true });

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

// Ensure we have a user session, then seed Firestore
ensureSignedIn().catch(err => {
  console.error('[auth] ensureSignedIn error:', err);
});

// Seed Firestore in the background and log any issues
initDb().catch(error => {
  console.error(
    "Failed to initialize database:",
    error instanceof Error ? error.message : String(error)
  );
});
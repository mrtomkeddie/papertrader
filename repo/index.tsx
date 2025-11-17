import { registerSW } from 'virtual:pwa-register';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Root-level error boundary to catch errors during App render
class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; message?: string }>{
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, message: error?.message || String(error) };
  }
  componentDidCatch(error: any, info: any) {
    console.error('[RootErrorBoundary] Caught error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16 }}>
          <div className="p-4 m-4 rounded-lg border border-red-500/40 bg-red-900/20 text-red-200">
            <h3 className="font-semibold mb-2">App failed to render</h3>
            <p className="text-sm">{this.state.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

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
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);

/* Auth gate and Firestore seeding are handled inside App for Google-only auth. */
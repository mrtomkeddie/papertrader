import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const firebaseEnv = {
      VITE_FIREBASE_API_KEY: env.VITE_FIREBASE_API_KEY || env.FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || '',
      VITE_FIREBASE_AUTH_DOMAIN: env.VITE_FIREBASE_AUTH_DOMAIN || env.FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || '',
      VITE_FIREBASE_PROJECT_ID: env.VITE_FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '',
      VITE_FIREBASE_STORAGE_BUCKET: env.VITE_FIREBASE_STORAGE_BUCKET || env.FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || '',
      VITE_FIREBASE_MESSAGING_SENDER_ID: env.VITE_FIREBASE_MESSAGING_SENDER_ID || env.FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      VITE_FIREBASE_APP_ID: env.VITE_FIREBASE_APP_ID || env.FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || '',
      VITE_FIREBASE_VAPID_KEY: env.VITE_FIREBASE_VAPID_KEY || env.FIREBASE_VAPID_KEY || process.env.FIREBASE_VAPID_KEY || '',
    };
    return {
      server: {
        port: 5174,
        strictPort: true,
        host: true,
      },
      envPrefix: ['VITE_', 'FIREBASE_'],
      plugins: [
        react(),
        VitePWA({
          strategies: 'injectManifest',
          srcDir: '.',
          filename: 'sw.js',
          registerType: 'autoUpdate',
          devOptions: { enabled: false, type: 'module' },
          manifest: {
            name: 'Paper Trader',
            short_name: 'PaperTrader',
            description: 'AI-assisted paper trading companion',
            start_url: '/#/dashboard',
            scope: '/',
            display: 'standalone',
            theme_color: '#111827',
            background_color: '#111827',
            icons: [
              { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
              { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
              { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
            ]
          }
        })
      ],
      define: {
        'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(firebaseEnv.VITE_FIREBASE_API_KEY),
        'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(firebaseEnv.VITE_FIREBASE_AUTH_DOMAIN),
        'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(firebaseEnv.VITE_FIREBASE_PROJECT_ID),
        'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(firebaseEnv.VITE_FIREBASE_STORAGE_BUCKET),
        'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(firebaseEnv.VITE_FIREBASE_MESSAGING_SENDER_ID),
        'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(firebaseEnv.VITE_FIREBASE_APP_ID),
        'import.meta.env.VITE_FIREBASE_VAPID_KEY': JSON.stringify(firebaseEnv.VITE_FIREBASE_VAPID_KEY),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

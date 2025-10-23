import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          devOptions: { enabled: true },
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
      // Vite exposes `VITE_*` variables via import.meta.env; no manual defines needed
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

# Public Assets for PWA & Favicon

Drop your brand assets in this folder. These paths are referenced by the app and the PWA manifest.

Required filenames:
- `/favicon.svg` (or `/favicon.ico`) — browser tab icon
- `/apple-touch-icon.png` — iOS home screen icon (PNG, 180x180)
- `/pwa-192x192.png` — PWA install icon (PNG, 192x192)
- `/pwa-512x512.png` — PWA install icon (PNG, 512x512)

Tips:
- Use a solid background and centered logo for best results.
- Prefer PNG for mobile icons; use SVG for the favicon when possible.
- If you change filenames, update `vite.config.ts` (icons in the PWA manifest) and `index.html` link tags accordingly.

After adding files:
1) Save/refresh your browser.
2) In Chrome DevTools → Application → Manifest, confirm icons are detected.
3) On mobile, revisit the site and you should see the install prompt or use “Add to Home Screen”.
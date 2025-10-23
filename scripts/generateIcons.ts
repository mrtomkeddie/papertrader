import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

async function ensurePublicDir(): Promise<string> {
  const publicDir = path.resolve(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  return publicDir;
}

function pickSource(publicDir: string): string {
  const candidates = [
    'papertraderlogo.svg',
    'fav.svg',
    'icon.png',
  ];
  for (const name of candidates) {
    const p = path.resolve(publicDir, name);
    if (fs.existsSync(p)) return p;
  }
  return path.resolve(publicDir, 'icon.png');
}

async function generate() {
  const publicDir = await ensurePublicDir();
  const src = pickSource(publicDir);
  if (!fs.existsSync(src)) {
    console.error(`[icons] Missing source. Place one of: icon.png, papertraderlogo.svg, fav.svg in repo/public.`);
    process.exit(1);
  }
  console.log(`[icons] Using source: ${path.basename(src)}`);

  const sizes = [
    { name: 'pwa-192x192.png', size: 192 },
    { name: 'pwa-512x512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon-32x32.png', size: 32 },
  ];

  for (const { name, size } of sizes) {
    const out = path.resolve(publicDir, name);
    await sharp(src)
      .resize(size, size, { fit: 'cover' })
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.log(`[icons] Wrote ${name}`);
  }

  console.log('[icons] Done.');
}

generate().catch(err => {
  console.error('[icons] Failed:', err);
  process.exit(1);
});
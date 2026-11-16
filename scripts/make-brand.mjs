// Genera le risorse grafiche dal logo ufficiale (brand/logo-ufficiale.png, trasparente).
// Uso: npm run icons   — non ridisegna il logo: ritaglia, ridimensiona e compone.
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const SRC = 'brand/logo-ufficiale.png';
mkdirSync('public/brand', { recursive: true });

// Blocchi verticali del logo ufficiale (misurati sul file): emblema, scritta, slogan.
const EMBLEM = { left: 100, top: 100, width: 1054, height: 770 }; // righe 100-870: sopra la scritta (901+)
const cropped = await sharp(SRC).extract(EMBLEM).png().toBuffer(); // passo 1: ritaglio
const trimmed = await sharp(cropped).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 }).png().toBuffer(); // passo 2: bordi vuoti
const meta = await sharp(trimmed).metadata();
await sharp(trimmed).resize({ width: 900 }).webp({ quality: 90, alphaQuality: 100 }).toFile('public/brand/emblem.webp');
await sharp(SRC).resize({ width: 1000 }).webp({ quality: 90, alphaQuality: 100 }).toFile('public/brand/logo-full.webp'); // per sfondi chiari: la scritta del logo è blu scuro

/** Sfondo come l'icona app della tavola: blu profondo con alone ciano/viola. */
function background(size, radius) {
  const r = radius ? Math.round(size * 0.225) : 0;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0E2142"/><stop offset="1" stop-color="#081220"/></linearGradient>
        <radialGradient id="c" cx="0.25" cy="0.2" r="0.7"><stop offset="0" stop-color="#00E5FF" stop-opacity="0.22"/><stop offset="1" stop-color="#00E5FF" stop-opacity="0"/></radialGradient>
        <radialGradient id="v" cx="0.85" cy="0.9" r="0.7"><stop offset="0" stop-color="#885CF6" stop-opacity="0.30"/><stop offset="1" stop-color="#885CF6" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/>
      <rect width="${size}" height="${size}" rx="${r}" fill="url(#c)"/>
      <rect width="${size}" height="${size}" rx="${r}" fill="url(#v)"/>
      <rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${r}" fill="none" stroke="#00E5FF" stroke-opacity="0.35" stroke-width="${Math.max(2, size / 128)}"/>
    </svg>`,
  );
}

async function icon(file, size, { rounded, fill }) {
  const target = Math.round(size * fill);
  const emblem = await sharp(trimmed).resize({ width: target, height: target, fit: 'inside' }).png().toBuffer();
  const em = await sharp(emblem).metadata();
  await sharp(background(size, rounded))
    .composite([{ input: emblem, left: Math.round((size - em.width) / 2), top: Math.round((size - em.height) / 2) }])
    .png()
    .toFile(file);
}

await icon('public/icon-512.png', 512, { rounded: true, fill: 0.74 });
await icon('public/icon-192.png', 192, { rounded: true, fill: 0.74 });
await icon('public/icon-maskable-512.png', 512, { rounded: false, fill: 0.56 }); // zona sicura delle maschere Android
await icon('public/apple-touch-icon.png', 180, { rounded: false, fill: 0.70 }); // iOS applica da solo gli angoli
await icon('public/favicon.png', 64, { rounded: true, fill: 0.80 });
console.log('Emblema ritagliato:', meta.width, 'x', meta.height, '— risorse generate in public/');

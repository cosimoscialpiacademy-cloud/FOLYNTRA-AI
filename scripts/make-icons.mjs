// Genera le icone PWA PNG dall'SVG originale (npm run icons).
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg');
await sharp(svg).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(svg).resize(512, 512).png().toFile('public/icon-512.png');
// maskable: contenuto ridotto entro l'area sicura, su fondo pieno
const inner = await sharp(svg).resize(384, 384).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0D1424' } }).composite([{ input: inner, left: 64, top: 64 }]).png().toFile('public/icon-maskable-512.png');
console.log('Icone generate.');

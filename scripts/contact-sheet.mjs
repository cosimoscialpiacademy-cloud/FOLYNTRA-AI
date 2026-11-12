// Utility di sviluppo: unisce PNG in un foglio contatti per controllare a vista le pagine esportate.
import sharp from 'sharp';
import fs from 'node:fs';
const [dir, prefix, out, cols] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.png')).sort();
const metas = await Promise.all(files.map((f) => sharp(`${dir}/${f}`).metadata()));
const w = metas[0].width, h = metas[0].height, c = Number(cols), rows = Math.ceil(files.length / c);
await sharp({ create: { width: c * (w + 6), height: rows * (h + 6), channels: 3, background: '#888' } })
  .composite(files.map((f, i) => ({ input: `${dir}/${f}`, left: (i % c) * (w + 6) + 3, top: Math.floor(i / c) * (h + 6) + 3 })))
  .png().toFile(out);

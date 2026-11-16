/** Scarica la copertina di un libro dal CDN di Amazon (URL fornito da Keepa) e la riduce per l'analisi. Solo server. */
import sharp from 'sharp';

export async function fetchCoverThumb(url: string, fetchImpl: typeof fetch = fetch): Promise<{ mediaType: 'image/jpeg'; data: string } | null> {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.hostname !== '127.0.0.1') return null;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8_000_000) return null;
    for (const q of [72, 62, 52, 42]) {
      const out = await sharp(buf).resize({ width: 480, height: 720, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: q }).toBuffer();
      const data = out.toString('base64');
      if (data.length <= 200_000) return { mediaType: 'image/jpeg', data };
    }
    return null;
  } catch {
    return null;
  }
}

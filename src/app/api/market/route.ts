import { z } from 'zod';
import { marketSignals, summarizeMarket } from '@/lib/niche/market';
import { fetchCoverThumb } from '@/lib/providers/covers';
import { KeepaError, searchTopBooks } from '@/lib/providers/keepa';
import { HttpError, errorResponse, rateLimit, requireCaller } from '@/lib/server-guard';
import { nowIso } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 90;
export const dynamic = 'force-dynamic';

const Body = z.object({
  keyword: z.string().trim().min(2).max(200),
  marketplace: z.enum(['amazon.it', 'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.es']),
  /** Se true scarica anche le 3 copertine dei libri con il miglior Sales Rank (per l'agente copertine). */
  covers: z.boolean().default(false),
});

/** Dati reali di mercato per una keyword (Keepa): libri in testa alla ricerca, segnali per la nicchia e, a richiesta, le 3 copertine migliori. */
export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await requireCaller(req);
    rateLimit(`market:${caller.id}`, 8, 60_000);
    const apiKey = process.env.KEEPA_API_KEY?.trim();
    if (!apiKey) throw new HttpError(503, 'Keepa non è configurato: aggiungi KEEPA_API_KEY nelle variabili del server (serve un piano API Keepa).');
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new HttpError(400, 'JSON non valido.');
    }
    const parsed = Body.safeParse(json);
    if (!parsed.success) throw new HttpError(400, `Richiesta non valida: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
    const { keyword, marketplace, covers } = parsed.data;
    let result;
    try {
      result = await searchTopBooks(keyword, marketplace, { apiKey, baseUrl: process.env.KEEPA_BASE_URL?.trim() || undefined, imageBase: process.env.AMAZON_IMAGE_BASE?.trim() || undefined, limit: 10 });
    } catch (err) {
      if (err instanceof KeepaError) throw new HttpError(err.status === 401 ? 502 : err.status, err.message);
      throw err;
    }
    const { books, tokensLeft } = result;
    if (!books.length) throw new HttpError(404, `Nessun libro trovato per «${keyword}» su ${marketplace}: prova una keyword più generica.`);
    const now = nowIso();
    const signals = marketSignals(books, marketplace, `Keepa API (${marketplace}, ${now.slice(0, 10)}): primi ${books.length} libri per «${keyword}»`, now);
    let coverShots: { asin: string; rank: number; note: string; mediaType: 'image/jpeg'; data: string }[] = [];
    if (covers) {
      const top = books.filter((b) => b.imageUrl).slice(0, 3);
      const imgs = await Promise.all(top.map((b) => fetchCoverThumb(b.imageUrl as string)));
      coverShots = top.flatMap((b, i) => (imgs[i] ? [{ asin: b.asin, rank: i + 1, note: `n.${i + 1} per Sales Rank${b.bsr ? ` ${b.bsr.toLocaleString('it-IT')}` : ''}${b.price ? ` · ${b.price.toFixed(2)}` : ''}${b.reviews !== null ? ` · ${b.reviews} recensioni` : ''}`.slice(0, 200), ...(imgs[i] as { mediaType: 'image/jpeg'; data: string }) }] : []));
    }
    console.info('[market]', JSON.stringify({ marketplace, found: books.length, covers: coverShots.length, tokensLeft }));
    return Response.json({ books, summary: summarizeMarket(books), signals, covers: coverShots, tokensLeft, fetchedAt: now }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'api/market');
  }
}

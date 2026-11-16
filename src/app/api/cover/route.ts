import { z } from 'zod';
import { CoverSchema } from '@/lib/bundle-schema';
import { RendererUnavailableError, withBrowser } from '@/lib/export/chromium';
import { renderEbookCoverJpg } from '@/lib/export/cover-render';
import { HttpError, errorResponse, rateLimit, requireCaller } from '@/lib/server-guard';
import type { CoverSpec } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const MAX_BODY = 4_000_000;

/** Disegna il fronte della copertina (JPEG 1600×2560, ridimensionabile dal client) per l'anteprima e per la valutazione dell'agente. */
export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await requireCaller(req);
    rateLimit(`cover:${caller.id}`, 20, 60_000);
    const raw = await req.text();
    if (raw.length > MAX_BODY) throw new HttpError(413, 'Richiesta troppo grande.');
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'JSON non valido.');
    }
    const parsed = z.object({ cover: CoverSchema }).safeParse(json);
    if (!parsed.success) throw new HttpError(400, `Copertina non valida: ${parsed.error.issues[0]?.path.join('.')} — ${parsed.error.issues[0]?.message}`);
    try {
      const jpg = await withBrowser((b) => renderEbookCoverJpg(b, parsed.data.cover as CoverSpec));
      return new Response(Buffer.from(jpg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
    } catch (err) {
      if (err instanceof RendererUnavailableError) throw new HttpError(503, err.message);
      throw err;
    }
  } catch (err) {
    return errorResponse(err, 'api/cover');
  }
}

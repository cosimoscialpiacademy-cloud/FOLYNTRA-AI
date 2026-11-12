import { ExportRequest } from '@/lib/bundle-schema';
import { RendererUnavailableError, withBrowser } from '@/lib/export/chromium';
import { renderInterior } from '@/lib/export/interior';
import { buildKit } from '@/lib/export/kit';
import { HttpError, errorResponse, rateLimit, requireCaller } from '@/lib/server-guard';
import type { BookBundle } from '@/lib/types';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const MAX_BODY = 6_000_000;

export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await requireCaller(req);
    rateLimit(`export:${caller.id}`, 8, 60_000);
    const raw = await req.text();
    if (raw.length > MAX_BODY) throw new HttpError(413, 'Libro troppo grande per l’esportazione in un’unica richiesta.');
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'JSON non valido.');
    }
    const parsed = ExportRequest.safeParse(json);
    if (!parsed.success) throw new HttpError(400, `Dati non validi: ${parsed.error.issues[0]?.path.join('.')} — ${parsed.error.issues[0]?.message}`);
    const bundle = parsed.data.bundle as BookBundle;
    const started = Date.now();
    try {
      if (parsed.data.format === 'interior') {
        const r = await withBrowser((b) => renderInterior(bundle, b));
        console.info('[export]', JSON.stringify({ format: 'interior', pages: r.pageCount, ms: Date.now() - started }));
        return new Response(Buffer.from(r.pdf), { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store', 'X-Folyntra-Pages': String(r.pageCount), 'X-Folyntra-Filename': encodeURIComponent(`${slugify(bundle.project.title)}-interno.pdf`) } });
      }
      const kit = await withBrowser((b) => buildKit(bundle, b));
      console.info('[export]', JSON.stringify({ format: 'kit', pages: kit.pageCount, ready: kit.kdpReady, bytes: kit.zip.length, ms: Date.now() - started }));
      return new Response(Buffer.from(kit.zip), { headers: { 'Content-Type': 'application/zip', 'Cache-Control': 'no-store', 'X-Folyntra-Pages': String(kit.pageCount), 'X-Folyntra-Ready': kit.kdpReady ? '1' : '0', 'X-Folyntra-Filename': encodeURIComponent(kit.fileName) } });
    } catch (err) {
      if (err instanceof RendererUnavailableError) throw new HttpError(503, err.message);
      throw err;
    }
  } catch (err) {
    return errorResponse(err, 'api/export');
  }
}

import { AiRequest, type AiEvent } from '@/lib/ai/schemas';
import { runAi } from '@/lib/ai/server';
import { HttpError, errorResponse, rateLimit, requireCaller } from '@/lib/server-guard';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const MAX_BODY = 1_800_000; // le richieste dell'agente copertine includono fino a 7 immagini ridimensionate

export async function POST(req: Request): Promise<Response> {
  try {
    const caller = await requireCaller(req);
    rateLimit(`ai:${caller.id}`, 30, 60_000);
    const raw = await req.text();
    if (raw.length > MAX_BODY) throw new HttpError(413, 'Richiesta troppo grande.');
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'JSON non valido.');
    }
    const parsed = AiRequest.safeParse(json);
    if (!parsed.success) throw new HttpError(400, `Richiesta non valida: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);

    const encoder = new TextEncoder();
    const abort = new AbortController();
    req.signal.addEventListener('abort', () => abort.abort(), { once: true });
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (e: AiEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
        try {
          for await (const event of runAi(parsed.data, abort.signal)) send(event);
        } catch {
          send({ t: 'error', message: 'Errore interno durante la generazione.', retryable: true });
        } finally {
          controller.close();
        }
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  } catch (err) {
    return errorResponse(err, 'api/ai');
  }
}

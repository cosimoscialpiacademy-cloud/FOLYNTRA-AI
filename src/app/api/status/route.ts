import { existsSync } from 'node:fs';
import { aiConfig, supabaseConfigured } from '@/lib/ai/server';
import { chromiumPath } from '@/lib/export/chromium';
import { checkAccessCode, errorResponse } from '@/lib/server-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Stato reale delle integrazioni: solo booleani, mai valori di chiavi. */
export async function GET(req: Request): Promise<Response> {
  try {
    return await status(req);
  } catch (err) {
    return errorResponse(err, 'api/status');
  }
}

async function status(req: Request): Promise<Response> {
  const ai = aiConfig();
  const access = checkAccessCode(req);
  return Response.json({
    access,
    ai: { mode: ai.mode, model: ai.model, reason: ai.reason, maxUsdPerBook: ai.maxUsdPerBook },
    supabase: supabaseConfigured(),
    renderer: chromiumPath() !== null,
    epubcheck: Boolean(process.env.EPUBCHECK_JAR && existsSync(process.env.EPUBCHECK_JAR)),
    providers: { keepa: Boolean(process.env.KEEPA_API_KEY), googleTrends: Boolean(process.env.GOOGLE_TRENDS_API_KEY), amazonAds: Boolean(process.env.AMAZON_ADS_CLIENT_ID) && process.env.ENABLE_AMAZON_ADS_LIVE === 'true' },
  });
}

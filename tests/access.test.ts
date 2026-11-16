import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aiConfig } from '../src/lib/ai/server';
import { HttpError, checkAccessCode, clientIp, requireCaller } from '../src/lib/server-guard';

const KEYS = ['APP_ACCESS_CODE', 'ANTHROPIC_API_KEY', 'ENABLE_EXTERNAL_PAID_APIS', 'ALLOW_UNAUTHENTICATED_AI', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }));
afterEach(() => KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }));

const req = (code?: string, ip = '203.0.113.1') =>
  new Request('http://x/api/ai', { headers: { 'x-forwarded-for': `10.9.9.9, ${ip}`, ...(code !== undefined ? { authorization: `Bearer ${code}` } : {}) } });

describe('codice di accesso', () => {
  it('senza APP_ACCESS_CODE non è richiesto', () => {
    expect(checkAccessCode(req())).toEqual({ required: false, valid: true });
  });

  it('un codice troppo corto (<8) non attiva la protezione: non deve sembrare sicuro', () => {
    process.env.APP_ACCESS_CODE = 'corto';
    expect(checkAccessCode(req()).required).toBe(false);
  });

  it('mancante, errato e giusto', () => {
    process.env.APP_ACCESS_CODE = 'codice-segreto-1';
    expect(checkAccessCode(req())).toEqual({ required: true, valid: false });
    expect(checkAccessCode(req('sbagliato', '198.51.100.7'))).toEqual({ required: true, valid: false });
    expect(checkAccessCode(req('codice-segreto-1'))).toEqual({ required: true, valid: true });
  });

  it('requireCaller rifiuta con 401 senza codice e accetta col codice giusto', async () => {
    process.env.APP_ACCESS_CODE = 'codice-segreto-1';
    await expect(requireCaller(req())).rejects.toMatchObject({ status: 401 });
    await expect(requireCaller(req('codice-segreto-1'))).resolves.toMatchObject({ authenticated: true });
  });

  it('blocca i tentativi ripetuti dallo stesso IP (429) ma non gli altri', () => {
    process.env.APP_ACCESS_CODE = 'codice-segreto-1';
    const ip = '192.0.2.55';
    for (let i = 0; i < 8; i++) expect(checkAccessCode(req(`errato-${i}`, ip)).valid).toBe(false);
    expect(() => checkAccessCode(req('errato-9', ip))).toThrow(HttpError);
    // anche il codice giusto resta bloccato finché dura la finestra? No: il blocco scatta solo sui tentativi errati.
    expect(checkAccessCode(req('codice-segreto-1', ip)).valid).toBe(true);
    expect(checkAccessCode(req('errato', '192.0.2.99')).valid).toBe(false);
  });

  it("l'IP è l'ultimo valore di x-forwarded-for (i precedenti sono falsificabili)", () => {
    expect(clientIp(req(undefined, '203.0.113.9'))).toBe('203.0.113.9');
  });
});

describe('quando è permessa la spesa AI reale', () => {
  const enable = () => { process.env.ANTHROPIC_API_KEY = 'sk-test'; process.env.ENABLE_EXTERNAL_PAID_APIS = 'true'; };

  it('chiave + abilitazione ma server pubblico NON protetto → mock, con motivo chiaro', () => {
    enable();
    const c = aiConfig();
    expect(c.mode).toBe('mock');
    expect(c.reason).toMatch(/APP_ACCESS_CODE/);
  });

  it('con codice di accesso valido → AI reale', () => {
    enable();
    process.env.APP_ACCESS_CODE = 'codice-segreto-1';
    expect(aiConfig().mode).toBe('anthropic');
  });

  it('senza ENABLE_EXTERNAL_PAID_APIS non si spende nulla anche con codice e chiave', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.APP_ACCESS_CODE = 'codice-segreto-1';
    expect(aiConfig().mode).toBe('mock');
  });
});

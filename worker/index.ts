/**
 * Cloudflare Worker for isaacandersonart.com.
 *
 * Every page and image is a static file served straight from Cloudflare's cache — this code runs
 * only for /api/* (see run_worker_first in wrangler.jsonc).
 *
 *   POST /api/ask   the Ask AI assistant (Claude), grounded in /assistant/knowledge.json
 *
 * Secrets / settings (Cloudflare dashboard → Worker → Settings → Variables, or wrangler):
 *   ANTHROPIC_API_KEY  required for AI answers. Without it the assistant still gives instant
 *                      FAQ answers and hands other questions to the studio.
 *   ASSISTANT_MODEL    default claude-opus-5-5
 *   ASSISTANT_EFFORT   low | medium | high — default low (quick replies)
 *   ANTHROPIC_BASE_URL optional — e.g. a Cloudflare AI Gateway URL for usage analytics
 */
import Anthropic from '@anthropic-ai/sdk';
import { askClaude, HANDOFF, type AskInput, type Knowledge } from './assistant';

export interface Env {
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY?: string;
  ASSISTANT_MODEL?: string;
  ASSISTANT_EFFORT?: string;
  ANTHROPIC_BASE_URL?: string;
  ASK_LIMITER?: RateLimit;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

let knowledge: { at: number; kb: Knowledge } | null = null;

/** The built catalogue + FAQ, cached in memory for a few minutes per Worker instance. */
async function loadKnowledge(env: Env, origin: string): Promise<Knowledge> {
  if (knowledge && Date.now() - knowledge.at < 5 * 60_000) return knowledge.kb;
  const res = await env.ASSETS.fetch(new Request(new URL('/assistant/knowledge.json', origin)));
  if (!res.ok) throw new Error(`knowledge.json ${res.status}`);
  knowledge = { at: Date.now(), kb: (await res.json()) as Knowledge };
  return knowledge.kb;
}

/** Validates and trims the visitor's request. Returns null when it isn't usable. */
export function parseInput(body: unknown): AskInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const question = typeof b.question === 'string' ? b.question.trim().slice(0, 500) : '';
  if (!question) return null;
  const history = Array.isArray(b.history)
    ? b.history
        .filter((t): t is { q: string; a: string } => !!t && typeof t.q === 'string' && typeof t.a === 'string')
        .slice(-3)
        .map((t) => ({ q: t.q.slice(0, 500), a: t.a.slice(0, 1000) }))
    : [];
  const page = typeof b.page === 'string' ? b.page.slice(0, 200) : '/';
  return { question, history, page };
}

async function handleAsk(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Only the site's own pages may use the assistant.
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  if (origin && new URL(origin).host !== url.host) return json({ error: 'forbidden' }, 403);

  if (!env.ANTHROPIC_API_KEY) return json({ error: 'assistant_unavailable' }, 503);

  if (env.ASK_LIMITER) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.ASK_LIMITER.limit({ key: `ask:${ip}` });
    if (!success) return json({ error: 'rate_limited' }, 429);
  }

  let input: AskInput | null = null;
  try {
    input = parseInput(await request.json());
  } catch {
    /* invalid JSON */
  }
  if (!input) return json({ error: 'bad_request' }, 400);

  const effort = (['low', 'medium', 'high'] as const).find((e) => e === env.ASSISTANT_EFFORT) ?? 'low';
  try {
    const kb = await loadKnowledge(env, url.origin);
    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      baseURL: env.ANTHROPIC_BASE_URL || undefined,
      maxRetries: 1,
      timeout: 25_000,
    });
    const reply = await askClaude(client, kb, input, { model: env.ASSISTANT_MODEL || 'claude-opus-5-5', effort });
    return json(reply);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ ...HANDOFF, error: 'busy' }, 429);
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('Ask AI: ANTHROPIC_API_KEY was rejected');
      return json({ error: 'assistant_unavailable' }, 503);
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Ask AI: Claude API error ${err.status}: ${err.message}`);
      return json({ ...HANDOFF, error: 'upstream' }, 502);
    }
    console.error('Ask AI failed', err);
    return json({ ...HANDOFF, error: 'internal' }, 500);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/ask') return handleAsk(request, env);
    if (pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

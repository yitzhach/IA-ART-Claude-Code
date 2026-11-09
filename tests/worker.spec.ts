import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseInput } from '../worker/index';
import { askClaude, knowledgeText, userText, HANDOFF, type Knowledge } from '../worker/assistant';

// Unit tests for the Ask AI Worker. They run in Node with a fake Claude client — no network, no API key.
// Uses the built catalogue, so run after `astro build` (npm test does).
const kb = (): Knowledge => JSON.parse(readFileSync('dist/assistant/knowledge.json', 'utf8'));

test.describe('Ask AI worker', () => {
  // Plain Node tests: run them once, not per browser project.
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'runs once'));

  test('parseInput trims, limits and rejects bad input', () => {
    expect(parseInput(null)).toBeNull();
    expect(parseInput({ question: '   ' })).toBeNull();
    const long = parseInput({ question: 'x'.repeat(900), history: Array(9).fill({ q: 'q', a: 'a' }), page: '/works/dawn/' })!;
    expect(long.question).toHaveLength(500);
    expect(long.history).toHaveLength(3);
    expect(long.page).toBe('/works/dawn/');
    expect(parseInput({ question: 'hi', history: [{ q: 1 }, 'x'] })!.history).toEqual([]);
  });

  test('the cached knowledge prompt is byte-identical on every request', () => {
    const a = knowledgeText(kb());
    const b = knowledgeText(kb());
    expect(a).toBe(b);
    expect(a).toContain('CATALOGUE');
    expect(a).toContain('"slug":"green-horizon"');
  });

  test('userText names the work the visitor is looking at', () => {
    const text = userText({ question: 'Is this available?', history: [], page: '/works/green-horizon/' }, kb());
    expect(text).toContain('"Green Horizon"');
    expect(text).toContain("Visitor's question: Is this available?");
  });

  const fakeClient = (reply: object, stop = 'end_turn') => {
    const calls: Record<string, unknown>[] = [];
    const client = {
      beta: {
        messages: {
          create: async (req: Record<string, unknown>) => {
            calls.push(req);
            return { stop_reason: stop, content: [{ type: 'text', text: typeof reply === 'string' ? reply : JSON.stringify(reply) }] };
          },
        },
      },
    };
    return { client: client as never, calls };
  };
  const input = { question: 'Anything warm for a dining room?', history: [], page: '/' };

  test('askClaude sends a cached, structured, fallback-enabled request and filters the reply', async () => {
    const { client, calls } = fakeClient({ answer: ' Try Warm Horizon. ', works: ['warm-horizon', 'made-up'], actions: ['inquire', 'hack'] });
    const reply = await askClaude(client, kb(), input, { model: 'claude-opus-5-5', effort: 'low' });
    expect(reply).toEqual({ answer: 'Try Warm Horizon.', works: ['warm-horizon'], actions: ['inquire'] });
    const req = calls[0] as any;
    expect(req.model).toBe('claude-opus-5-5');
    expect(req.fallbacks).toBe('default');
    expect(req.betas).toContain('server-side-fallback-2026-07-01');
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.output_config.effort).toBe('low');
    expect(req.system.at(-1).cache_control).toEqual({ type: 'ephemeral' });
  });

  test('refusals, truncation and malformed replies hand off to the studio', async () => {
    for (const [reply, stop] of [[{ answer: 'x', works: [], actions: [] }, 'refusal'], [{ answer: 'x' }, 'max_tokens'], ['not json', 'end_turn']] as const) {
      const { client } = fakeClient(reply as object, stop);
      expect(await askClaude(client, kb(), input, { model: 'm', effort: 'low' })).toEqual(HANDOFF);
    }
  });
});

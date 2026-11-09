import Anthropic from '@anthropic-ai/sdk';

/** Shape of /assistant/knowledge.json (built from the catalogue by Astro). */
export interface Knowledge {
  studio: Record<string, unknown>;
  faq: { id: string; q: string; a: string }[];
  works: {
    slug: string;
    title: string;
    titled: boolean;
    url: string;
    collections: string[];
    status: string;
    priceLabel: string;
    size: string;
    sizeCm: string;
    medium: string | null;
    year: number | null;
    statement: string | null;
    look: string | null;
  }[];
}

export interface AskInput {
  question: string;
  history: { q: string; a: string }[];
  page: string;
}

export interface AskReply {
  answer: string;
  works: string[];
  actions: string[];
}

export const ACTIONS = ['inquire', 'commission', 'available', 'wall'] as const;

const RULES = `You are the website assistant for Isaac Anderson Art — sculptural work in cement, plaster and steel by Isaac Anderson. Visitors are collectors, interior designers, architects and people who met Isaac at art fairs. Help them find a piece, understand commissions, and get in touch with the studio.

How to answer:
- Rely only on the STUDIO, FAQ and CATALOGUE data below. If the answer isn't there (an unlisted price, discounts, payment terms, care instructions, show dates, anything else), say the studio will confirm it and include "inquire" in actions. Never invent prices, sizes, availability, materials, dates or policies.
- Quote a work's price exactly as its priceLabel. "Price on request" means the visitor should ask the studio.
- Sold works can't be bought; offer a commission "in the same spirit" instead.
- Sizes are width × height in inches (cm also given). Each work's "look" describes what it looks like (palette,
  composition, surface) — use it to match requests about colour, mood or motif.
- When the visitor is looking for pieces, recommend up to 4 works by slug from the catalogue — available ones first unless they ask otherwise. Only use slugs that appear in the catalogue.
- Keep it short and warm: two to four plain sentences, no markdown, no headings. Use a numbered sequence only for the commission steps.
- If the visitor is on a work's page, questions like "this piece" refer to that work.
- You are the studio's AI assistant, not Isaac; say so if asked. For anything off-topic, answer briefly and steer back to the art.

actions (choose any that genuinely help): "inquire" = contact the studio, "commission" = start a commission, "available" = browse available works, "wall" = see the current work on their wall (only on a work's page).`;

const SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'The reply shown to the visitor. Plain text, 2–4 sentences.' },
    works: { type: 'array', items: { type: 'string' }, description: 'Slugs of recommended works, at most 4.' },
    actions: { type: 'array', items: { type: 'string', enum: [...ACTIONS] } },
  },
  required: ['answer', 'works', 'actions'],
  additionalProperties: false,
} as const;

/** Compact, deterministic knowledge text — identical bytes on every request so it caches. */
export function knowledgeText(kb: Knowledge): string {
  const works = kb.works.map((w) => ({
    slug: w.slug,
    title: w.title,
    collections: w.collections,
    status: w.status,
    priceLabel: w.priceLabel,
    size: w.size || 'unknown',
    sizeCm: w.sizeCm || undefined,
    medium: w.medium ?? undefined,
    year: w.year ?? undefined,
    statement: w.statement ?? undefined,
    look: w.look ?? undefined,
  }));
  return [
    `STUDIO\n${JSON.stringify(kb.studio)}`,
    `FAQ\n${kb.faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n')}`,
    `CATALOGUE (${works.length} works)\n${works.map((w) => JSON.stringify(w)).join('\n')}`,
  ].join('\n\n');
}

export function userText(input: AskInput, kb: Knowledge): string {
  const slug = input.page.match(/^\/?(?:works\/)?([a-z0-9-]+)\/?$/)?.[1];
  const current = slug ? kb.works.find((w) => w.slug === slug) : undefined;
  const parts: string[] = [];
  parts.push(current ? `The visitor is on the page for "${current.title}" (slug ${current.slug}).` : `The visitor is on ${input.page}.`);
  if (input.history.length) {
    parts.push('Earlier in this conversation:\n' + input.history.map((t) => `Visitor: ${t.q}\nAssistant: ${t.a}`).join('\n'));
  }
  parts.push(`Visitor's question: ${input.question}`);
  return parts.join('\n\n');
}

export const HANDOFF: AskReply = {
  answer: 'That’s one for the studio to answer directly — send your question and you’ll hear back within two working days.',
  works: [],
  actions: ['inquire'],
};

export async function askClaude(
  client: Anthropic,
  kb: Knowledge,
  input: AskInput,
  opts: { model: string; effort: 'low' | 'medium' | 'high' },
): Promise<AskReply> {
  // A declined question is re-run on a fallback model server-side. Haiku has no server-side fallback
  // (Anthropic says not to send the parameter), so a Haiku refusal simply hands off to the studio.
  const fallback = opts.model.startsWith('claude-haiku')
    ? {}
    : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };
  const response = await client.beta.messages.create({
    model: opts.model,
    max_tokens: 4096,
    ...fallback,
    output_config: { effort: opts.effort, format: { type: 'json_schema', schema: SCHEMA } },
    system: [
      { type: 'text', text: RULES },
      { type: 'text', text: knowledgeText(kb), cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userText(input, kb) }],
  });

  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return HANDOFF;
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
  if (!text) return HANDOFF;

  let parsed: Partial<AskReply>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return HANDOFF;
  }
  const known = new Set(kb.works.map((w) => w.slug));
  return {
    answer: typeof parsed.answer === 'string' && parsed.answer.trim() ? parsed.answer.trim() : HANDOFF.answer,
    works: (parsed.works ?? []).filter((s) => known.has(s)).slice(0, 4),
    actions: (parsed.actions ?? []).filter((a): a is (typeof ACTIONS)[number] => (ACTIONS as readonly string[]).includes(a)),
  };
}

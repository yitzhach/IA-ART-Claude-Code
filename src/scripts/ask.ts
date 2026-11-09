/**
 * Ask AI — the assistant panel's logic. Loaded only when a visitor opens the panel.
 *
 * 1. Questions that match the FAQ are answered instantly, on the device (no AI call).
 * 2. Anything else goes to /api/ask (a Cloudflare Worker that asks Claude, grounded in the
 *    catalogue and FAQ). If that isn't deployed or fails, the visitor is offered a one-tap
 *    hand-off to the studio with their question prefilled.
 */
import type { Faq } from '~/lib/faq';

interface Work {
  slug: string;
  title: string;
  url: string;
  thumb: string;
  collections: string[];
  collectionsLabel: string;
  status: string;
  priceLabel: string;
  width: number | null;
  height: number | null;
  size: string;
}
interface Knowledge {
  faq: Faq[];
  works: Work[];
}
interface AiReply {
  answer: string;
  works?: string[];
  actions?: string[];
}
type Turn = { q: string; a: string };

const STOP = new Set('a an the is are do does can i you your my me of to for in on it this that be with what how'.split(' '));

export async function init(dialog: HTMLDialogElement) {
  const log = dialog.querySelector<HTMLElement>('[data-ask-log]')!;
  const chips = dialog.querySelector<HTMLElement>('[data-ask-chips]')!;
  const form = dialog.querySelector<HTMLFormElement>('[data-ask-form]')!;
  const input = dialog.querySelector<HTMLInputElement>('[data-ask-input]')!;
  const currentWork = document.querySelector<HTMLElement>('[data-current-work]')?.dataset.currentWork;

  let kb: Knowledge = { faq: [], works: [] };
  try {
    kb = await (await fetch('/assistant/knowledge.json')).json();
  } catch {
    /* offline: the hand-off to the studio still works */
  }
  const bySlug = new Map(kb.works.map((w) => [w.slug, w]));
  const history: Turn[] = [];
  let aiAvailable = true;

  // ---------- rendering ----------
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };
  const scroll = () => log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });

  const say = (who: 'user' | 'bot', text: string) => {
    const msg = el('div', `msg msg--${who}`);
    for (const para of text.split(/\n{2,}/)) msg.append(el('p', '', para));
    log.append(msg);
    scroll();
    return msg;
  };

  const workCards = (works: Work[]) => {
    const list = el('ul', 'msg-works');
    for (const w of works.slice(0, 6)) {
      const li = el('li');
      const a = el('a');
      a.href = w.url;
      const img = el('img');
      img.src = w.thumb;
      img.alt = '';
      img.loading = 'lazy';
      const meta = el('span', 'msg-work-meta');
      meta.append(el('strong', '', w.title), el('span', '', [w.size, w.priceLabel].filter(Boolean).join(' · ')));
      a.append(img, meta);
      li.append(a);
      list.append(li);
    }
    return list;
  };

  const links = (items: { label: string; href?: string; ask?: string }[]) => {
    const row = el('div', 'msg-actions');
    for (const item of items) {
      if (item.href) {
        const a = el('a', 'msg-action', item.label);
        a.href = item.href;
        row.append(a);
      } else if (item.ask) {
        const b = el('button', 'msg-action', item.label);
        b.type = 'button';
        b.addEventListener('click', () => ask(item.ask!));
        row.append(b);
      }
    }
    return row;
  };

  const handoffHref = (q: string) => `/inquire/?q=${encodeURIComponent(q)}`;

  // ---------- understanding ----------
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9$\s'-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !STOP.has(w));

  /** Best FAQ entry for a question, or null if nothing matches confidently. */
  const matchFaq = (q: string): Faq | null => {
    const text = ` ${q.toLowerCase()} `;
    const ws = new Set(words(q));
    let best: Faq | null = null;
    let bestScore = 0;
    for (const f of kb.faq) {
      let score = 0;
      for (const k of f.keywords) {
        if (k.includes(' ') ? text.includes(k) : ws.has(k) || ws.has(k + 's')) score += k.includes(' ') ? 3 : 2;
      }
      if (score > bestScore) {
        best = f;
        bestScore = score;
      }
    }
    // A single generic word ("how", "when") isn't enough; one strong keyword is.
    return bestScore >= 2 ? best : null;
  };

  /** Works matching collection / availability / size words in a question. */
  const findWorks = (q: string): Work[] | null => {
    const t = q.toLowerCase();
    const coll = ['abstract', 'figurative', 'sculptural'].filter((c) => t.includes(c) || t.includes(c.slice(0, -2)));
    const wantAvailable = /\b(available|for sale|buy|purchase|in stock)\b/.test(t);
    const wantLarge = /\b(large|big|huge|statement|oversized)\b/.test(t);
    const wantSmall = /\b(small|little|compact)\b/.test(t);
    if (!coll.length && !wantAvailable && !wantLarge && !wantSmall) return null;
    let list = kb.works.filter((w) => !coll.length || coll.some((c) => w.collections.includes(c)));
    if (wantAvailable) list = list.filter((w) => w.status === 'available');
    const area = (w: Work) => (w.width ?? 0) * (w.height ?? 0);
    if (wantLarge) list = list.filter((w) => area(w) >= 48 * 48).sort((a, b) => area(b) - area(a));
    if (wantSmall) list = list.filter((w) => area(w) > 0 && area(w) <= 24 * 36).sort((a, b) => area(a) - area(b));
    return list;
  };

  // ---------- answering ----------
  async function askAi(q: string): Promise<AiReply | null> {
    if (!aiAvailable) return null;
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: history.slice(-3), page: currentWork ?? location.pathname }),
      });
      if (res.status === 404 || res.status === 405 || res.status === 503) aiAvailable = false;
      if (!res.ok) return null;
      return (await res.json()) as AiReply;
    } catch {
      return null;
    }
  }

  async function ask(question: string) {
    const q = question.trim().slice(0, 500);
    if (!q) return;
    chips.replaceChildren();
    say('user', q);

    // 1 · Instant answer from the FAQ (plus matching works when the question is about finding a piece).
    const hit = matchFaq(q);
    const found = findWorks(q);
    if (hit && (!found || hit.id === 'available')) {
      const msg = say('bot', hit.a);
      if (hit.id === 'available') {
        const avail = kb.works.filter((w) => w.status === 'available');
        if (avail.length) msg.append(workCards(avail));
      }
      if (hit.id === 'wall' && currentWork) {
        msg.append(links([{ label: 'View this piece on your wall', href: '#wall-view' }]));
      } else if (hit.links?.length) {
        msg.append(links(hit.links));
      }
      history.push({ q, a: hit.a });
      return;
    }
    if (found) {
      const text = found.length
        ? `Here ${found.length === 1 ? 'is 1 work' : `are ${found.length} works`} that fit. Open any for details, or ask me to narrow it down.`
        : 'Nothing in the catalogue matches that exactly right now — the studio can make a piece to your brief.';
      const msg = say('bot', text);
      if (found.length) msg.append(workCards(found));
      msg.append(links(found.length ? [{ label: 'See all works', href: '/works/' }] : [{ label: 'Start a commission', href: '/commissions/#inquire' }]));
      history.push({ q, a: text });
      return;
    }

    // 2 · Ask the AI.
    const thinking = say('bot', 'Thinking…');
    thinking.classList.add('is-thinking');
    const reply = await askAi(q);
    thinking.remove();
    if (reply?.answer) {
      const msg = say('bot', reply.answer);
      const works = (reply.works ?? []).map((s) => bySlug.get(s)).filter((w): w is Work => Boolean(w));
      if (works.length) msg.append(workCards(works));
      const acts = new Set(reply.actions ?? []);
      const items: { label: string; href?: string }[] = [];
      if (acts.has('available')) items.push({ label: 'Available works', href: '/works/?status=available' });
      if (acts.has('commission')) items.push({ label: 'Start a commission', href: '/commissions/#inquire' });
      if (acts.has('wall') && currentWork) items.push({ label: 'View on your wall', href: '#wall-view' });
      if (acts.has('inquire')) items.push({ label: 'Ask the studio', href: handoffHref(q) });
      if (items.length) msg.append(links(items));
      history.push({ q, a: reply.answer });
      return;
    }

    // 3 · Hand off to the studio.
    const msg = say('bot', 'I don’t have an instant answer for that one — but the studio does. Send your question and you’ll hear back within two working days.');
    msg.append(links([{ label: 'Send this question to the studio', href: handoffHref(q) }]));
  }

  // ---------- wiring ----------
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value;
    input.value = '';
    ask(q);
  });
  dialog.addEventListener('ask:question', (e) => ask((e as CustomEvent<string>).detail));
  dialog.addEventListener('click', (e) => {
    // Following an in-page link (e.g. #wall-view) closes the panel.
    const a = (e.target as HTMLElement).closest('a');
    if (a?.getAttribute('href')?.startsWith('#')) dialog.close();
  });

  const work = currentWork ? bySlug.get(currentWork) : undefined;
  say(
    'bot',
    work
      ? `Hi — ask me anything about ${work.title}: price, delivery, how it would look on your wall, or something similar made to commission.`
      : 'Hi — I can help you find a piece, explain how commissions work, or show you something on your own wall. What are you looking for?',
  );
  const suggestions = kb.faq.filter((f) => f.chip);
  for (const f of suggestions) {
    const b = el('button', 'chip', f.q);
    b.type = 'button';
    b.addEventListener('click', () => ask(f.q));
    chips.append(b);
  }
  input.focus();
}

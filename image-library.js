/* image-library.js — SHARED IMAGE LIBRARY + editor-only picker panel.
 *
 * The library is a pool of WebP files in images/library/ that belong to no
 * single slot. Its index lives in library.state.json at the project root
 * (writable from the browser, since the host bridge allowlists root-level
 * *.state.json only):
 *
 *   { "v":1, "items":[ { f, t, y, mat, tags[], alt, w, h, kb, added } ] }
 *
 * f = filename inside images/library/. Everything else is metadata (title,
 * year, materials, tags, alt/SEO text) — deliberately separate from the
 * pixels so it can later be edited from a phone without touching layout.
 *
 * Freshly converted images that are not on disk yet live as data-URLs in
 * library-inbox.state.json and are resolved transparently, so a photo is
 * usable the moment it is converted. `/library` bakes the inbox into
 * images/library/*.webp and empties it — same pattern as /save.
 *
 * PUBLISHED SITE IS UNAFFECTED: all chrome is created only when
 * window.omelette.writeFile exists (i.e. inside the editor). Live, this file
 * loads, exposes window.ImageLibrary read-only, and draws nothing.
 *
 * TO ENABLE ON A PAGE: <script src="./image-library.js"></script> in its
 * helmet. No config.
 */
(() => {
  if (window.__imageLibrary) return;
  window.__imageLibrary = true;

  const LIB = 'library.state.json';
  const INBOX = 'library-inbox.state.json';
  const DIR = 'images/library/';
  const WRITE_CEIL = 1900000; // host write ceiling, with headroom

  const ACCENT = '#A34A24', INK = '#1B1917', PAPER = '#EDEAE3',
        LIGHT = '#F5F3EE', LINE = '#D6CFC2', MUTED = '#5C564C';
  const MONO = "'IBM Plex Mono',monospace";

  const editable = () => !!(window.omelette && window.omelette.writeFile);

  let items = [], inbox = {}, loaded = false, loadP = null;
  let armed = null, dragItem = null, panel = null, targetSlot = null;
  const subs = new Set();
  const notify = () => { subs.forEach((f) => { try { f(); } catch (e) {} }); };

  const jget = (f) => fetch(f, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  function load() {
    if (loadP) return loadP;
    loadP = Promise.all([jget(LIB), jget(INBOX)]).then(([l, i]) => {
      items = l && Array.isArray(l.items) ? l.items : [];
      inbox = i && typeof i === 'object' && !Array.isArray(i) ? i : {};
      loaded = true;
      notify();
      return items;
    });
    return loadP;
  }

  const urlOf = (it) => {
    const f = typeof it === 'string' ? it : (it && it.f);
    if (!f) return '';
    return inbox[f] || DIR + f;
  };
  const isBaked = (it) => !inbox[(it && it.f) || it];

  function saveIndex() {
    if (!editable()) return Promise.resolve(false);
    const payload = JSON.stringify({ v: 1, items: items });
    return Promise.resolve(window.omelette.writeFile(LIB, payload)).then(() => true, () => false);
  }

  function saveInbox() {
    if (!editable()) return Promise.resolve({ ok: false, reason: 'read-only' });
    const payload = JSON.stringify(inbox);
    if (payload.length > WRITE_CEIL) {
      return Promise.resolve({ ok: false, reason: 'over-ceiling', bytes: payload.length });
    }
    return Promise.resolve(window.omelette.writeFile(INBOX, payload))
      .then(() => ({ ok: true, bytes: payload.length }), (e) => ({ ok: false, reason: 'write-failed' }));
  }

  const slug = (s) => String(s || 'image').toLowerCase()
    .replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 48) || 'image';

  function uniqueName(base) {
    let n = base + '.webp', i = 2;
    const taken = new Set(items.map((x) => x.f));
    while (taken.has(n)) { n = base + '-' + i + '.webp'; i++; }
    return n;
  }

  /* add([{name, dataURL, w, h, kb, meta}]) → appended items */
  function add(list) {
    const added = (list || []).map((r) => {
      const f = uniqueName(slug(r.name));
      const it = Object.assign({
        f: f, t: r.title || titleFrom(r.name), y: '', mat: '', tags: [], alt: '',
        w: r.w || 0, h: r.h || 0, kb: r.kb || 0, added: new Date().toISOString().slice(0, 10),
      }, r.meta || {});
      if (r.dataURL) inbox[f] = r.dataURL;
      items.unshift(it);
      return it;
    });
    notify();
    return saveIndex().then(saveInbox).then((res) => ({ added: added, inbox: res }));
  }

  const titleFrom = (name) => String(name || '').replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  function update(f, patch) {
    const it = items.find((x) => x.f === f);
    if (!it) return Promise.resolve(false);
    Object.assign(it, patch || {});
    notify();
    return saveIndex();
  }

  function remove(f) {
    items = items.filter((x) => x.f !== f);
    if (inbox[f]) { delete inbox[f]; }
    notify();
    return saveIndex().then(saveInbox);
  }

  /* Slots on THIS page currently showing a given library file. */
  function usedBy(f) {
    const store = window.ImageSlots;
    if (!store) return [];
    const want = DIR + f, all = store.all();
    return Object.keys(all).filter((id) => {
      const u = all[id] && all[id].u;
      return u === want || u === './' + want || (inbox[f] && u === inbox[f]);
    });
  }

  /* Assign a library image into a slot exactly like an OS file drop:
     baked files go in as a path reference (no duplicate bytes), inbox
     images go in as their data-URL and get baked by /save. */
  function assign(slotId, it) {
    const store = window.ImageSlots;
    if (!store || !slotId || !it) return false;
    const u = urlOf(it);
    if (!u) return false;
    store.set(slotId, { u: u, s: 1, x: 0.5, y: 0.5 });
    notify();
    return true;
  }

  window.ImageLibrary = {
    ready: load,
    items: () => items.map((x) => Object.assign({}, x)),
    get: (f) => { const it = items.find((x) => x.f === f); return it ? Object.assign({}, it) : null; },
    url: urlOf,
    isBaked: isBaked,
    dir: DIR,
    add: add,
    update: update,
    remove: remove,
    usedBy: usedBy,
    assign: assign,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    /* Unbaked items (bytes only in the inbox) — what /library will write out. */
    pending: () => Object.keys(inbox).map((f) => ({ f: f, kb: Math.round((inbox[f].length * 0.75) / 1024) })),
    inboxBytes: () => JSON.stringify(inbox).length,
    stats: () => ({
      count: items.length,
      pending: Object.keys(inbox).length,
      inboxKB: Math.round(JSON.stringify(inbox).length / 1024),
      ceilingKB: Math.round(WRITE_CEIL / 1024),
    }),
    open: () => { openPanel(); },
    close: () => { closePanel(); },
    arm: (f) => { setArmed(items.find((x) => x.f === f) || null); },
    armed: () => (armed ? Object.assign({}, armed) : null),
    editable: editable,
  };

  /* ─────────────────────────── editor-only UI ─────────────────────────── */

  const slotsOnPage = () => Array.from(document.querySelectorAll('image-slot[id]'));

  function setArmed(it) {
    armed = it || null;
    document.documentElement.style.cursor = armed ? 'copy' : '';
    slotsOnPage().forEach((el) => el.toggleAttribute('data-lib-target', !!armed));
    renderPanel();
    renderArmBar();
  }

  let armBar = null;
  function renderArmBar() {
    if (!armed) { if (armBar) { armBar.remove(); armBar = null; } return; }
    if (!armBar) {
      armBar = document.createElement('div');
      armBar.setAttribute('data-dc-edit-transparent', '');
      armBar.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483000;' +
        'display:flex;align-items:center;gap:12px;padding:9px 12px 9px 9px;background:' + INK + ';color:' + LIGHT + ';' +
        'border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.32);font:500 11px/1.2 ' + MONO + ';letter-spacing:.06em;';
      document.body.appendChild(armBar);
    }
    armBar.innerHTML = '';
    const th = document.createElement('img');
    th.src = urlOf(armed);
    th.style.cssText = 'width:34px;height:34px;object-fit:cover;border-radius:4px;display:block';
    const txt = document.createElement('span');
    txt.textContent = 'CLICK AN IMAGE ON THE PAGE TO PLACE';
    const esc = document.createElement('button');
    esc.textContent = 'CANCEL';
    esc.style.cssText = 'appearance:none;border:0;background:rgba(255,255,255,.14);color:' + LIGHT +
      ';font:500 10px ' + MONO + ';letter-spacing:.08em;padding:6px 9px;border-radius:5px;cursor:pointer';
    esc.addEventListener('click', () => setArmed(null));
    armBar.append(th, txt, esc);
  }

  function place(slotEl) {
    const it = armed || dragItem;
    if (!it || !slotEl || !slotEl.id) return false;
    const ok = assign(slotEl.id, it);
    if (ok) {
      flash(slotEl);
      setArmed(null);
    }
    return ok;
  }

  function flash(el) {
    const r = el.getBoundingClientRect();
    const f = document.createElement('div');
    f.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483001;border:2px solid ' + ACCENT +
      ';left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height +
      'px;transition:opacity .5s ease;opacity:1';
    document.body.appendChild(f);
    requestAnimationFrame(() => { f.style.opacity = '0'; });
    setTimeout(() => f.remove(), 560);
  }

  const slotFromEvent = (e) => {
    const path = e.composedPath ? e.composedPath() : [];
    for (const n of path) if (n && n.tagName === 'IMAGE-SLOT') return n;
    let el = e.target;
    while (el) { if (el.tagName === 'IMAGE-SLOT') return el; el = el.parentElement; }
    return null;
  };

  /* ── panel ── */
  let q = '', tagFilter = '';

  function openPanel(forSlot) {
    targetSlot = forSlot || null;
    load().then(() => { buildPanel(); renderPanel(); });
  }
  function closePanel() {
    if (panel) { panel.remove(); panel = null; }
    targetSlot = null;
  }

  function buildPanel() {
    if (panel) return;
    panel = document.createElement('aside');
    panel.setAttribute('data-dc-edit-transparent', '');
    panel.style.cssText = 'position:fixed;right:0;top:0;bottom:0;width:392px;max-width:92vw;z-index:2147482900;' +
      'background:' + PAPER + ';border-left:1px solid ' + LINE + ';box-shadow:-18px 0 44px rgba(27,25,23,.16);' +
      'display:flex;flex-direction:column;font-family:Archivo,system-ui,sans-serif;color:' + INK + ';';
    panel.innerHTML =
      '<header style="padding:18px 18px 12px;border-bottom:1px solid ' + LINE + ';display:flex;align-items:baseline;gap:10px">' +
        '<span style="font:500 10px ' + MONO + ';letter-spacing:.16em;color:' + MUTED + '">LIBRARY</span>' +
        '<span data-el="count" style="font:500 10px ' + MONO + ';letter-spacing:.1em;color:' + MUTED + ';opacity:.7"></span>' +
        '<button data-el="x" style="margin-left:auto;appearance:none;border:0;background:none;cursor:pointer;' +
          'font:500 11px ' + MONO + ';letter-spacing:.08em;color:' + MUTED + '">CLOSE</button>' +
      '</header>' +
      '<div style="padding:12px 18px 10px;display:flex;flex-direction:column;gap:9px;border-bottom:1px solid ' + LINE + '">' +
        '<input data-el="q" placeholder="Search title, tag, material" style="appearance:none;width:100%;box-sizing:border-box;' +
          'background:' + LIGHT + ';border:1px solid ' + LINE + ';border-radius:5px;padding:8px 10px;' +
          'font:400 13px Archivo,sans-serif;color:' + INK + '">' +
        '<div data-el="tags" style="display:flex;flex-wrap:wrap;gap:6px"></div>' +
      '</div>' +
      '<div data-el="grid" style="flex:1;overflow:auto;padding:14px 18px 22px;display:grid;' +
        'grid-template-columns:repeat(3,1fr);gap:10px;align-content:start"></div>' +
      '<footer style="padding:11px 18px;border-top:1px solid ' + LINE + ';font:400 11px/1.5 ' + MONO + ';color:' + MUTED + '">' +
        '<a data-el="studio" href="' + studioHref() + '" style="color:' + ACCENT + ';text-decoration:none">CONVERT + MANAGE →</a>' +
      '</footer>';
    document.body.appendChild(panel);
    panel.querySelector('[data-el="x"]').addEventListener('click', closePanel);
    const qi = panel.querySelector('[data-el="q"]');
    qi.addEventListener('input', () => { q = qi.value.trim().toLowerCase(); renderGrid(); });
  }

  function allTags() {
    const s = new Set();
    items.forEach((it) => (it.tags || []).forEach((t) => t && s.add(t)));
    return Array.from(s).sort();
  }

  function renderPanel() {
    if (!panel) return;
    panel.querySelector('[data-el="count"]').textContent = items.length + ' IMAGES' +
      (targetSlot ? ' → ' + targetSlot.id.toUpperCase() : '');
    const tagBox = panel.querySelector('[data-el="tags"]');
    tagBox.innerHTML = '';
    ['ALL'].concat(allTags()).forEach((t) => {
      const on = (t === 'ALL' && !tagFilter) || t === tagFilter;
      const b = document.createElement('button');
      b.textContent = t.toUpperCase();
      b.style.cssText = 'appearance:none;cursor:pointer;border:1px solid ' + (on ? INK : LINE) + ';' +
        'background:' + (on ? INK : 'transparent') + ';color:' + (on ? LIGHT : MUTED) + ';' +
        'border-radius:999px;padding:4px 9px;font:500 9px ' + MONO + ';letter-spacing:.1em';
      b.addEventListener('click', () => { tagFilter = t === 'ALL' ? '' : t; renderPanel(); });
      tagBox.appendChild(b);
    });
    renderGrid();
  }

  function matches(it) {
    if (tagFilter && (it.tags || []).indexOf(tagFilter) < 0) return false;
    if (!q) return true;
    return [it.t, it.mat, it.y, it.alt, it.f].concat(it.tags || [])
      .join(' ').toLowerCase().indexOf(q) >= 0;
  }

  function renderGrid() {
    if (!panel) return;
    const grid = panel.querySelector('[data-el="grid"]');
    grid.innerHTML = '';
    const list = items.filter(matches);
    if (!list.length) {
      const e = document.createElement('p');
      e.style.cssText = 'grid-column:1/-1;font:400 12px/1.6 ' + MONO + ';color:' + MUTED;
      e.textContent = items.length
        ? 'No matches.'
        : 'Library is empty. Convert images on the Studio page, then add them here.';
      grid.appendChild(e);
      return;
    }
    list.forEach((it) => {
      const cell = document.createElement('figure');
      cell.style.cssText = 'margin:0;cursor:pointer;position:relative';
      cell.draggable = true;
      const img = document.createElement('img');
      img.src = urlOf(it);
      img.loading = 'lazy';
      img.alt = it.alt || it.t || it.f;
      img.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;display:block;background:' + LIGHT +
        ';border:1px solid ' + LINE + ';border-radius:3px';
      const cap = document.createElement('figcaption');
      cap.textContent = it.t || it.f;
      cap.style.cssText = 'margin-top:5px;font:400 10px/1.35 ' + MONO + ';color:' + MUTED +
        ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      cell.append(img, cap);
      if (!isBaked(it)) {
        const dot = document.createElement('span');
        dot.title = 'Not on disk yet — run /library';
        dot.style.cssText = 'position:absolute;top:5px;right:5px;width:7px;height:7px;border-radius:50%;background:' + ACCENT;
        cell.appendChild(dot);
      }
      cell.addEventListener('click', () => {
        if (targetSlot) { place(targetSlot); targetSlot = null; renderPanel(); return; }
        setArmed(it);
      });
      cell.addEventListener('dragstart', (e) => {
        dragItem = it;
        try { e.dataTransfer.setData('text/plain', 'library:' + it.f); e.dataTransfer.effectAllowed = 'copy'; } catch (err) {}
      });
      cell.addEventListener('dragend', () => { dragItem = null; });
      grid.appendChild(cell);
    });
  }

  /* ── launcher + slot wiring ── */
  const studioHref = () => (/\.dc\.html$/i.test(location.pathname) ? './Studio.dc.html' : './studio.html');

  function bootUI() {
    if (!editable()) return;
    // The Studio page hosts its own library UI — no floating pill there.
    if (document.documentElement.hasAttribute('data-library-host')) { load(); return; }

    const pill = document.createElement('button');
    pill.setAttribute('data-dc-edit-transparent', '');
    pill.textContent = 'LIBRARY';
    pill.title = 'Shared image library — pick an image, then click a slot';
    pill.style.cssText = 'position:fixed;left:14px;bottom:76px;z-index:2147482800;appearance:none;cursor:pointer;' +
      'background:' + INK + ';color:' + LIGHT + ';border:0;border-radius:7px;padding:8px 12px;' +
      'font:500 10px ' + MONO + ';letter-spacing:.14em;box-shadow:0 6px 18px rgba(27,25,23,.24)';
    pill.addEventListener('click', () => { panel ? closePanel() : openPanel(); });
    document.body.appendChild(pill);

    // Slot-first flow: a Library button inside each slot's control strip.
    const inject = () => {
      document.querySelectorAll('image-slot').forEach((el) => {
        const ctl = el.shadowRoot && el.shadowRoot.querySelector('.ctl');
        if (!ctl || ctl.querySelector('[data-act="lib"]')) return;
        const b = document.createElement('button');
        b.setAttribute('data-act', 'lib');
        b.textContent = 'Library';
        b.title = 'Pick from the shared library';
        b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); openPanel(el); });
        ctl.insertBefore(b, ctl.firstChild);
      });
    };
    document.addEventListener('pointerover', (e) => { if (slotFromEvent(e)) inject(); }, true);
    setTimeout(inject, 400);
    new MutationObserver(inject).observe(document.body, { childList: true, subtree: true });

    // Click-to-place.
    document.addEventListener('click', (e) => {
      if (!armed) return;
      const slot = slotFromEvent(e);
      if (!slot || !slot.id) return;
      e.preventDefault(); e.stopPropagation();
      place(slot);
    }, true);

    // Drag-to-place.
    document.addEventListener('dragover', (e) => { if (dragItem) e.preventDefault(); }, true);
    document.addEventListener('drop', (e) => {
      if (!dragItem) return;
      const slot = slotFromEvent(e);
      if (!slot || !slot.id) return;
      e.preventDefault(); e.stopPropagation();
      const it = dragItem;
      dragItem = null;
      if (assign(slot.id, it)) flash(slot);
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (armed) setArmed(null); else if (panel) closePanel(); }
    });

    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootUI);
  else bootUI();
})();

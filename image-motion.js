/* image-motion.js — Ken Burns motion for <image-slot> images.

   Model: TWO KEYFRAMES. Every move is an interpolation between a start
   framing (A) and an end framing (B) — a zoom is A and B at different
   scales, a pan is A and B at the same scale but different positions.
   Presets compute B from A; "Set start / Set end" capture A and B from the
   slot's own Reframe UI, so the existing crop tool doubles as the keyframe
   editor.

   The move is a transform on the slot's LAYER (the [data-hero-item] wrapper
   in the hero, otherwise the <image-slot> host). Nothing inside the shadow
   DOM is touched, so crop/adjust/reframe are unaffected — motion is simply
   cancelled while a slot is being edited.

   State file (root level, mirrored into dist/) — image-motion.state.json:
     { "hero-macro": { "p":"push-in", "k":6 },                  // preset
       "hero-macro-2": { "a":{"s":1,"x":0,"y":0},               // manual
                         "b":{"s":1.35,"x":-9,"y":4} } }
   Both forms may carry "d" (seconds). In the hero the duration is ignored:
   the move is stretched to exactly the time the image is on screen, so it
   finishes as the crossfade to the next image begins. Standalone slots
   ping-pong over "d" (default 18s) while in view.

   Editor UI self-gates on the write bridge, so the published site only ever
   runs the playback engine. */
(function () {
  'use strict';
  if (window.__imageMotionInstalled) return;
  window.__imageMotionInstalled = true;

  var FILE = 'image-motion.state.json';
  var MONO = "'IBM Plex Mono',ui-monospace,monospace";
  var INK = '#1B1917', PAPER = '#EDEAE3', LIGHT = '#F5F3EE', LINE = '#D6CFC2', MUTED = '#5C564C';
  var ACCENT = 'var(--accent,#A34A24)';
  var DEFAULT_K = 6, DEFAULT_D = 18;

  var editing = !!(window.omelette && typeof window.omelette.writeFile === 'function');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var cfg = {}, anims = {}, io = null, ready = false;

  /* ---------- state ---------- */

  function load() {
    return fetch(FILE, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (j) { cfg = (j && typeof j === 'object') ? j : {}; ready = true; return cfg; });
  }

  function save() {
    if (!editing) return Promise.resolve(false);
    try {
      return Promise.resolve(window.omelette.writeFile(FILE, JSON.stringify(cfg, null, 2)))
        .then(function () { return true; })
        .catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  /* ---------- transforms ----------
     scale() first, then translate() in the element's own %, so the travel is
     always expressed against the scaled frame. At scale z the image overflows
     the frame by (z-1)/2 per side, which is (z-1)/(2z) of the element's own
     width — the hard limit on a pan before an edge shows. 0.9 of that keeps a
     margin for sub-pixel rounding. */

  function slack(z) { return (z - 1) / (2 * z) * 100 * 0.9; }
  function tf(z, tx, ty) {
    return 'scale(' + z.toFixed(4) + ') translate(' + tx.toFixed(3) + '%,' + ty.toFixed(3) + '%)';
  }

  var PRESETS = {
    'push-in':   function (k) { var z = 1 + k; return [tf(1, 0, 0), tf(z, 0, 0)]; },
    'pull-back': function (k) { var z = 1 + k; return [tf(z, 0, 0), tf(1, 0, 0)]; },
    'drift-lr':  function (k) { var z = 1 + k, d = slack(z); return [tf(z, d, 0), tf(z, -d, 0)]; },
    'drift-rl':  function (k) { var z = 1 + k, d = slack(z); return [tf(z, -d, 0), tf(z, d, 0)]; },
    'drift-up':  function (k) { var z = 1 + k, d = slack(z); return [tf(z, 0, d), tf(z, 0, -d)]; },
    'drift-down':function (k) { var z = 1 + k, d = slack(z); return [tf(z, 0, -d), tf(z, 0, d)]; },
    'diagonal':  function (k) { var z = 1 + k, d = slack(z); return [tf(1, 0, 0), tf(z, -d, -d * 0.6)]; }
  };

  var LABELS = [
    ['push-in', 'Push in'], ['pull-back', 'Pull back'],
    ['drift-lr', 'L → R'], ['drift-rl', 'R → L'],
    ['drift-up', 'Up'], ['drift-down', 'Down'],
    ['diagonal', 'Push + drift']
  ];

  /* Manual keyframes: the slot renders at framing A, so the transform only has
     to carry A → B. Scale is the ratio of the two zooms; the translation puts
     A's centre where B's centre should land, measured after that scale. */
  function manualFrames(c) {
    var a = c.a, b = c.b;
    if (!a || !b || !a.s || !b.s) return null;
    var z = b.s / a.s;
    var tx = (b.x || 0) / z - (a.x || 0);
    var ty = (b.y || 0) / z - (a.y || 0);
    return [tf(1, 0, 0), tf(z, tx, ty)];
  }

  function framesFor(id) {
    var c = cfg[id];
    if (!c) return null;
    if (c.a && c.b) return manualFrames(c);
    if (c.p && PRESETS[c.p]) return PRESETS[c.p]((c.k == null ? DEFAULT_K : c.k) / 100);
    return null;
  }

  /* ---------- frame-accurate scrub (timeline editor) ----------
     Same math as PRESETS / manualFrames but evaluated at an arbitrary
     fraction instead of just the two endpoints, so the timeline's playhead
     can show the exact mid-move framing while scrubbing or playing back. */

  function lerp(a, b, t) { return a + (b - a) * t; }

  function presetAt(name, k, frac) {
    var z = 1 + k, d;
    switch (name) {
      case 'push-in': return { z: lerp(1, z, frac), tx: 0, ty: 0 };
      case 'pull-back': return { z: lerp(z, 1, frac), tx: 0, ty: 0 };
      case 'drift-lr': d = slack(z); return { z: z, tx: lerp(d, -d, frac), ty: 0 };
      case 'drift-rl': d = slack(z); return { z: z, tx: lerp(-d, d, frac), ty: 0 };
      case 'drift-up': d = slack(z); return { z: z, tx: 0, ty: lerp(d, -d, frac) };
      case 'drift-down': d = slack(z); return { z: z, tx: 0, ty: lerp(-d, d, frac) };
      case 'diagonal': d = slack(z); return { z: lerp(1, z, frac), tx: lerp(0, -d, frac), ty: lerp(0, -d * 0.6, frac) };
      default: return null;
    }
  }
  function manualAt(c, frac) {
    var a = c.a, b = c.b;
    if (!a || !b || !a.s || !b.s) return null;
    var z = b.s / a.s;
    var tx = (b.x || 0) / z - (a.x || 0);
    var ty = (b.y || 0) / z - (a.y || 0);
    return { z: lerp(1, z, frac), tx: lerp(0, tx, frac), ty: lerp(0, ty, frac) };
  }
  function frameAt(id, frac) {
    var c = cfg[id];
    if (!c) return null;
    frac = Math.max(0, Math.min(1, frac));
    var p = (c.a && c.b) ? manualAt(c, frac) : (c.p ? presetAt(c.p, (c.k == null ? DEFAULT_K : c.k) / 100, frac) : null);
    return p ? tf(p.z, p.tx, p.ty) : null;
  }
  // Directly sets the layer's transform to the interpolated framing —
  // no Web Animation involved, so it can be driven by an external playhead.
  function applyFrame(id, frac) {
    var el = slotOf(id);
    if (!el || busy(el)) return;
    var s = frameAt(id, frac);
    if (s == null) return;
    if (anims[id]) { try { anims[id].cancel(); } catch (e) {} delete anims[id]; }
    target(el).style.transform = s;
  }

  /* ---------- playback ---------- */

  function slotOf(id) {
    var el = document.getElementById(id);
    return el && el.tagName === 'IMAGE-SLOT' ? el : null;
  }

  function target(el) {
    var layer = el.closest ? el.closest('[data-hero-item],[data-ref-item]') : null;
    return layer || el;
  }

  function busy(el) {
    return el.hasAttribute('data-reframe') || el.hasAttribute('data-adjust') ||
      el.hasAttribute('data-panning');
  }

  function stop(id) {
    var a = anims[id];
    if (a) { try { a.cancel(); } catch (e) {} delete anims[id]; }
    var el = slotOf(id);
    if (el) target(el).style.transform = '';
  }

  function stopAll() { Object.keys(anims).forEach(stop); }

  /* Freeze / unfreeze in place — used by the hero's visitor pause button, which
     must hold the framing exactly where it is (stop() would snap it back). */
  function pauseAll() {
    Object.keys(anims).forEach(function (k) { try { anims[k].pause(); } catch (e) {} });
  }

  function resumeAll() {
    Object.keys(anims).forEach(function (k) { try { anims[k].play(); } catch (e) {} });
  }

  function play(id, durationMs, loop) {
    var el = slotOf(id);
    if (!el || busy(el)) return;
    var frames = framesFor(id);
    if (!frames) { stop(id); return; }
    var t = target(el);
    stop(id);
    if (reduced) { t.style.transform = frames[0]; return; }
    var c = cfg[id] || {};
    var dur = durationMs || (c.d || DEFAULT_D) * 1000;
    t.style.willChange = 'transform';
    try {
      anims[id] = t.animate(
        [{ transform: frames[0] }, { transform: frames[1] }],
        { duration: Math.max(1200, dur), easing: 'linear', fill: 'both',
          iterations: loop ? Infinity : 1, direction: loop ? 'alternate' : 'normal' }
      );
    } catch (e) { t.style.transform = frames[1]; }
  }

  /* Standalone slots (anything not inside a hero set) ping-pong while in view. */
  function autoWatch() {
    if (!('IntersectionObserver' in window)) return;
    if (io) io.disconnect();
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var id = e.target.id;
        if (e.isIntersecting) play(id, null, true); else stop(id);
      });
    }, { threshold: 0.15 });
    Object.keys(cfg).forEach(function (id) {
      var el = slotOf(id);
      if (el && !el.closest('[data-hero-item],[data-ref-item]')) io.observe(el);
    });
  }

  /* Editing a slot must never fight a running move. */
  function watchEditing() {
    new MutationObserver(function (recs) {
      recs.forEach(function (r) {
        var el = r.target;
        if (el.tagName !== 'IMAGE-SLOT' || !el.id) return;
        if (busy(el)) stop(el.id);
      });
    }).observe(document.body, {
      subtree: true, attributes: true,
      attributeFilter: ['data-reframe', 'data-adjust', 'data-panning']
    });
    if (editing) {
      document.addEventListener('pointerenter', function (e) {
        var el = e.target && e.target.closest ? e.target.closest('image-slot') : null;
        if (el && el.id && anims[el.id]) anims[el.id].pause();
      }, true);
      document.addEventListener('pointerleave', function (e) {
        var el = e.target && e.target.closest ? e.target.closest('image-slot') : null;
        if (el && el.id && anims[el.id] && !busy(el)) anims[el.id].play();
      }, true);
    }
  }

  /* ---------- editor: Motion button + panel ---------- */

  var panel = null, panelSlot = null;

  function mono(size, color) {
    return 'font:500 ' + size + 'px ' + MONO + ';letter-spacing:.1em;text-transform:uppercase;color:' + color;
  }

  function pbtn(label, on, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = mono(9, on ? LIGHT : INK) + ';padding:7px 11px;cursor:pointer;background:' +
      (on ? INK : 'transparent') + ';border:1px solid ' + (on ? INK : LINE) + ';white-space:nowrap';
    b.onclick = fn;
    return b;
  }

  function framing(el) {
    var v = window.ImageSlots && window.ImageSlots.get ? window.ImageSlots.get(el.id) : null;
    if (!v) return { s: 1, x: 0, y: 0 };
    return { s: v.s == null ? 1 : v.s, x: v.x || 0, y: v.y || 0 };
  }

  function closePanel() { if (panel) { panel.remove(); panel = null; panelSlot = null; } }

  function openPanel(el) {
    closePanel();
    panelSlot = el;
    var id = el.id;
    var c = cfg[id] || null;

    panel = document.createElement('div');
    panel.setAttribute('data-editor-only', '');
    panel.setAttribute('data-dc-edit-transparent', '');
    panel.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147482900;' +
      'background:' + PAPER + ';border:1px solid ' + LINE + ';box-shadow:0 14px 40px rgba(27,25,23,.22);' +
      'padding:16px 18px;max-width:min(720px,calc(100vw - 32px));box-sizing:border-box;' +
      'display:flex;flex-direction:column;gap:12px';

    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:baseline;gap:12px';
    var h = document.createElement('span');
    h.textContent = 'Motion — ' + id;
    h.style.cssText = mono(10, MUTED);
    var sp = document.createElement('span'); sp.style.cssText = 'flex:1';
    var x = document.createElement('button');
    x.type = 'button'; x.textContent = 'Close';
    x.style.cssText = mono(9, MUTED) + ';background:none;border:0;cursor:pointer';
    x.onclick = closePanel;
    head.appendChild(h); head.appendChild(sp); head.appendChild(x);

    var rowP = document.createElement('div');
    rowP.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center';
    var manual = !!(c && c.a && c.b);
    rowP.appendChild(pbtn('Off', !c, function () { delete cfg[id]; stop(id); commit(el); }));
    LABELS.forEach(function (p) {
      rowP.appendChild(pbtn(p[1], !!(c && !manual && c.p === p[0]), function () {
        cfg[id] = { p: p[0], k: (c && c.k != null) ? c.k : DEFAULT_K, d: (c && c.d) || DEFAULT_D };
        commit(el, true);
      }));
    });

    var rowK = document.createElement('div');
    rowK.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
    var kl = document.createElement('span');
    kl.textContent = 'Amount';
    kl.style.cssText = mono(9, MUTED) + ';margin-right:4px';
    rowK.appendChild(kl);
    [[3, 'Barely'], [6, 'Subtle'], [12, 'Noticeable']].forEach(function (o) {
      rowK.appendChild(pbtn(o[1] + ' · ' + o[0] + '%', !!(c && !manual && (c.k == null ? DEFAULT_K : c.k) === o[0]), function () {
        if (!cfg[id]) cfg[id] = { p: 'push-in', d: DEFAULT_D };
        cfg[id].k = o[0]; delete cfg[id].a; delete cfg[id].b;
        commit(el, true);
      }));
    });

    var rowM = document.createElement('div');
    rowM.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;border-top:1px solid ' + LINE + ';padding-top:12px';
    var ml = document.createElement('span');
    ml.textContent = 'Keyframes';
    ml.style.cssText = mono(9, MUTED) + ';margin-right:4px';
    rowM.appendChild(ml);
    rowM.appendChild(pbtn(manual ? 'Set start ✓' : 'Set start', false, function () {
      var cur = cfg[id] || {};
      cfg[id] = { a: framing(el), b: cur.b, d: cur.d || DEFAULT_D };
      if (!cfg[id].b) delete cfg[id].b;
      commit(el, !!cfg[id].b);
    }));
    rowM.appendChild(pbtn(manual ? 'Set end ✓' : 'Set end', false, function () {
      var cur = cfg[id] || {};
      var a = cur.a || framing(el);
      cfg[id] = { a: a, b: framing(el), d: cur.d || DEFAULT_D };
      // Snap the slot back to the start framing so the page shows keyframe A.
      if (window.ImageSlots && window.ImageSlots.set) {
        var prev = window.ImageSlots.get(id) || {};
        window.ImageSlots.set(id, Object.assign({}, prev, { s: a.s, x: a.x, y: a.y }));
      }
      commit(el, true);
    }));
    var hint = document.createElement('span');
    hint.textContent = 'reframe the image, click Set start · reframe again, click Set end';
    hint.style.cssText = 'font:400 10px ' + MONO + ';color:' + MUTED + ';text-transform:none;letter-spacing:.02em';
    rowM.appendChild(hint);

    var rowA = document.createElement('div');
    rowA.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;border-top:1px solid ' + LINE + ';padding-top:12px';
    rowA.appendChild(pbtn('▸ Preview', false, function () { play(id, 4200, false); }));
    var saved = document.createElement('span');
    saved.style.cssText = mono(9, MUTED);
    rowA.appendChild(saved);
    panel._saved = saved;

    var note = document.createElement('span');
    note.textContent = 'in the hero the move is stretched to the time the image is on screen';
    note.style.cssText = 'font:400 10px ' + MONO + ';color:' + MUTED + ';text-transform:none;letter-spacing:.02em;flex:1;text-align:right';
    rowA.appendChild(note);

    panel.appendChild(head);
    panel.appendChild(rowP);
    panel.appendChild(rowK);
    panel.appendChild(rowM);
    panel.appendChild(rowA);
    document.body.appendChild(panel);
  }

  function commit(el, preview) {
    save().then(function (ok) {
      if (panel && panel._saved) panel._saved.textContent = ok ? 'saved' : 'save failed';
    });
    autoWatch();
    var keep = panelSlot;
    openPanel(el);
    if (preview) play(el.id, 4200, false);
    panelSlot = keep;
  }

  function injectButtons() {
    document.querySelectorAll('image-slot').forEach(function (el) {
      var ctl = el.shadowRoot && el.shadowRoot.querySelector('.ctl');
      if (!ctl || ctl.querySelector('[data-act="motion"]')) return;
      var b = document.createElement('button');
      b.setAttribute('data-act', 'motion');
      b.textContent = 'Motion';
      b.title = 'Add a zoom or pan to this image';
      b.addEventListener('click', function (e) {
        e.stopPropagation(); e.preventDefault();
        if (panel && panelSlot === el) closePanel(); else openPanel(el);
      });
      ctl.appendChild(b);
    });
  }

  /* ---------- boot ---------- */

  function boot() {
    load().then(function () {
      autoWatch();
      watchEditing();
      if (editing) {
        setTimeout(injectButtons, 500);
        document.addEventListener('pointerover', function (e) {
          if (e.target && e.target.closest && e.target.closest('image-slot')) injectButtons();
        }, true);
        new MutationObserver(injectButtons).observe(document.body, { childList: true, subtree: true });
      }
    });
  }

  window.ImageMotion = {
    play: play,
    stop: stop,
    applyFrame: applyFrame,
    pauseAll: pauseAll,
    resumeAll: resumeAll,
    stopAll: stopAll,
    seek: function (id, ms) { var a = anims[id]; if (a) { try { a.currentTime = Math.max(0, ms); } catch (e) {} } },
    has: function (id) { return !!framesFor(id); },
    get: function (id) { return cfg[id] || null; },
    all: function () { return JSON.parse(JSON.stringify(cfg)); },
    ready: function () { return ready ? Promise.resolve(cfg) : load(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* ref-carousel.js — cross-dissolve rotation for the "More Reference Images" strip,
   plus Ken Burns motion per image (via window.ImageMotion, if present).

   Fix for the old mobile bug: every slide's <image-slot> stays display:block at
   all times (only opacity/pointer-events toggle) — nothing is ever removed from
   layout, so Safari's native image loading/decoding behaves the same as it does
   for any other on-page image, no manual "promote just before its turn" timing
   hack needed. loading="lazy" on all but the first slide lets the browser fetch
   them together once the carousel nears the viewport (there's no separate low-res
   copy — full-res -hi files are used directly, per design).

   Runtime: crossfades in fixed order through whichever slots are filled. Touch/
   trackpad swipe steps manually and pauses autoplay briefly. Click (not swipe)
   opens the page's own lightbox (window.RefCarousel.getItems()/getIndex()).
   Editor: a strip below with per-slot thumbnails — drag a file onto a thumb (or
   click an empty one to browse) to fill it, drag to reorder, ✕ to clear. Self-
   gates — does nothing on the published site.

   State file (root, mirrored into dist/): ref-carousel.state.json
     { "items": [ {"id":"ref-1"}, {"id":"ref-2"}, ... ], "hold": 3600, "fade": 900 }
*/
(function () {
  'use strict';
  if (window.__refCarouselInstalled) return;
  window.__refCarouselInstalled = true;

  var STATE_FILE = 'ref-carousel.state.json';
  var HOLD_DEFAULT = 3700, FADE_DEFAULT = 900;
  function num(v, min) { return (typeof v === 'number' && isFinite(v) && v >= min) ? v : null; }
  function HOLDMS() { return num(state && state.hold, 600) || num(window.REF_CAROUSEL_HOLD, 600) || HOLD_DEFAULT; }
  function FADEMS() {
    return num(state && state.fade, 0) !== null ? state.fade :
      (num(window.REF_CAROUSEL_FADE, 0) !== null ? window.REF_CAROUSEL_FADE : FADE_DEFAULT);
  }

  var stack, frameEl, state = null, layers = {}, order = [], cur = -1, timer = null, visible = true, pinned = false;
  var dotsEl, dotsRow = null, segs = [], rafId = null, counterEl, pauseBtn;
  var paused = false, holdMs = 0, holdBegan = 0, holdLeft = 0;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var editing = !!(window.omelette && typeof window.omelette.writeFile === 'function');
  var dirty = false;

  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  // Wait for the stack AND at least one layer. The template mounts in stages,
  // so #refcar-stack can exist for a beat with no [data-ref-item] children —
  // initialising in that window built an EMPTY item list (defaultState reads
  // the DOM), which left the carousel dead on frame 1 with no playback bar
  // until a reload happened to land the other way round.
  function waitFor(cb, tries) {
    tries = tries || 0;
    var el = document.getElementById('refcar-stack');
    if (el && el.querySelector('[data-ref-item]')) return cb(el);
    if (tries > 200) return;
    setTimeout(function () { waitFor(cb, tries + 1); }, 100);
  }

  function defaultState() {
    var items = [];
    document.querySelectorAll('#refcar-stack [data-ref-item]').forEach(function (l) {
      items.push({ id: l.getAttribute('data-ref-item') });
    });
    return { items: items };
  }

  function loadState() {
    var fetched = fetch(STATE_FILE, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    var timedOut = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 1800); });
    return Promise.race([fetched, timedOut]).then(function (j) {
      var base = defaultState();
      if (!j || !Array.isArray(j.items) || !j.items.length) return base;
      var known = {}; base.items.forEach(function (it) { known[it.id] = true; });
      var out = [];
      j.items.forEach(function (it) {
        if (!it || !it.id || !known[it.id]) return;
        out.push({ id: it.id }); delete known[it.id];
      });
      base.items.forEach(function (it) { if (known[it.id]) out.push(it); });
      var st = { items: out.length ? out : base.items };
      if (typeof j.hold === 'number') st.hold = j.hold;
      if (typeof j.fade === 'number') st.fade = j.fade;
      return st;
    });
  }

  function save() {
    if (!editing) return Promise.resolve(false);
    try {
      return Promise.resolve(window.omelette.writeFile(STATE_FILE, JSON.stringify(state, null, 2)))
        .then(function () { dirty = false; return true; }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  function slotOf(id) { return document.getElementById(id); }
  function imageURL(id) {
    var st = window.ImageSlots && window.ImageSlots.get ? window.ImageSlots.get(id) : null;
    if (st && st.cleared) return '';
    var el = slotOf(id);
    if (el) {
      if (el.shadowRoot) { var im = el.shadowRoot.querySelector('img'); var s = im && im.getAttribute('src'); if (s) return s; }
      var a = el.getAttribute('src'); if (a) return a;
    }
    var v = window.ImageSlots && window.ImageSlots.get ? window.ImageSlots.get(id) : null;
    return (v && (v.u || v.src)) || '';
  }
  function filled(it) { return !!imageURL(it.id); }
  // Never trust a cached node: a re-render can swap the layer divs out, and
  // styling a detached node is invisible (another route to "stuck on image 1").
  function layerFor(it) {
    var l = layers[it.id];
    if (l && l.isConnected) return l;
    l = document.querySelector('#refcar-stack [data-ref-item="' + it.id + '"]');
    if (l) layers[it.id] = l;
    return l;
  }

  function rebuildOrder() { order = state.items.filter(filled); }
  // Pick up layers that mounted after init.
  function syncItemsFromDOM() {
    if (!state) return false;
    var seen = {}, added = false;
    state.items.forEach(function (it) { seen[it.id] = true; });
    document.querySelectorAll('#refcar-stack [data-ref-item]').forEach(function (l) {
      var id = l.getAttribute('data-ref-item');
      if (id && !seen[id]) { seen[id] = true; state.items.push({ id: id }); added = true; }
    });
    return added;
  }
  function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
  function stopRaf() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  function schedule(ms, elapsed) {
    clearTimer();
    elapsed = Math.max(0, elapsed || 0);
    holdMs = ms + elapsed; holdBegan = Date.now() - elapsed; holdLeft = 0;
    stopRaf();
    timer = setTimeout(advance, ms);
    if (!paused && !pinned && visible) rafId = requestAnimationFrame(tick);
    paintProgress();
  }
  // Permanent, cheap self-heal: re-arm if rotation should be running but isn't,
  // and force the step if a hold is badly overdue (throttled/dropped timeout
  // after a background tab or a stalled main thread).
  function heartbeat() {
    if (paused || pinned || reduced || order.length < 2 || document.hidden) return;
    if (!timer) { show(cur < 0 ? 0 : cur); return; }
    if (holdMs && holdBegan && Date.now() - holdBegan > holdMs + 2500) show(cur + 1);
  }
  // Never dead-end. Advancing is gated on document.hidden (reliable) — NOT on
  // the IntersectionObserver, whose off-screen report can be wrong or late
  // (scroll restoration on refresh) and used to stall rotation for good while
  // the visitor was looking straight at it.
  function advance() {
    timer = null;
    if (document.hidden) { timer = setTimeout(advance, 700); return; }
    show(cur + 1);
  }
  function tick() {
    rafId = null;
    paintProgress();
    if (!paused && !pinned && visible && holdMs) rafId = requestAnimationFrame(tick);
  }

  // Layers stay display:block always — only opacity/pointer-events toggle — so
  // every <image-slot> is a normal, always-laid-out image the whole time. This
  // is the actual fix for the old iPhone bug (display:none ancestors could stop
  // an image from ever loading); it also means no eager/lazy juggling is needed.
  function show(i, quiet) {
    if (!order.length) return;
    i = ((i % order.length) + order.length) % order.length;
    var it = order[i];
    var prevIt = (cur >= 0 && order[cur]) ? order[cur] : null;
    cur = i;
    var toL = layerFor(it);
    var fromL = (prevIt && prevIt.id !== it.id) ? layerFor(prevIt) : null;
    if (!toL) return;
    Object.keys(layers).forEach(function (k) {
      var l = layers[k];
      if (l === toL || l === fromL) return;
      l.style.transition = 'none'; l.style.opacity = '0'; l.style.pointerEvents = 'none';
    });
    var FADE = FADEMS();
    if (!fromL || fromL === toL || !FADE) {
      toL.style.transition = 'none'; toL.style.opacity = '1'; toL.style.pointerEvents = 'auto';
      if (fromL && fromL !== toL) { fromL.style.transition = 'none'; fromL.style.opacity = '0'; fromL.style.pointerEvents = 'none'; }
    } else {
      toL.style.transition = 'none'; toL.style.opacity = '0';
      void toL.offsetHeight;
      toL.style.transition = 'opacity ' + FADE + 'ms ease'; toL.style.opacity = '1'; toL.style.pointerEvents = 'auto';
      fromL.style.transition = 'opacity ' + FADE + 'ms ease'; fromL.style.opacity = '0';
      setTimeout(function () { if (fromL.style.opacity === '0') fromL.style.pointerEvents = 'none'; }, FADE + 90);
    }
    paintDots();
    var IM = window.ImageMotion;
    if (IM) {
      if (prevIt && prevIt.id !== it.id) {
        var deadId = prevIt.id;
        setTimeout(function () { if (order[cur] && order[cur].id === deadId) return; IM.stop(deadId); }, FADE + 120);
      }
      if (IM.has(it.id)) IM.play(it.id, HOLDMS() + FADE, false);
    }
    if (quiet || reduced || pinned || paused || order.length < 2) return;
    schedule(HOLDMS());
  }

  function installSwipe(el) {
    if (!el || el.__swipeInstalled) return;
    el.__swipeInstalled = true;
    var sx = 0, sy = 0, tracking = false, horiz = false;
    el.style.touchAction = 'pan-y';
    el.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      tracking = true; horiz = false;
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (!tracking) return;
      var dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (!horiz && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) horiz = true;
      if (horiz) e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (horiz && Math.abs(dx) > 32 && Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault();
        step(dx < 0 ? 1 : -1);
      }
    }, { passive: false });
  }

  function pin() { pinned = true; clearTimer(); stopRaf(); }
  function manualSelect(i) { pinned = false; paused = false; show(i); }
  function step(dir) { if (order.length >= 2) manualSelect((cur + dir + order.length) % order.length); }

  function togglePause() {
    if (!order.length) return;
    if (paused) {
      paused = false;
      if (window.ImageMotion) window.ImageMotion.resumeAll();
      schedule(Math.max(600, holdLeft || HOLDMS()));
      paintPause();
    } else {
      paused = true;
      holdLeft = Math.max(600, holdMs - (Date.now() - holdBegan));
      clearTimer(); stopRaf();
      if (window.ImageMotion) window.ImageMotion.pauseAll();
      paintProgress(); paintPause();
    }
  }

  function roundBtn(label, title) {
    var b = document.createElement('button');
    b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.textContent = label;
    b.style.cssText = 'width:26px;height:26px;flex:0 0 auto;padding:0;display:flex;align-items:center;justify-content:center;' +
      'border:1px solid var(--line,#D6CFC2);border-radius:50%;background:none;color:var(--ink,#1B1917);' +
      "font:400 11px/1 'IBM Plex Mono',monospace;cursor:pointer;transition:border-color .2s ease,background .2s ease";
    b.onmouseenter = function () { b.style.borderColor = 'var(--muted,#5C564C)'; b.style.background = 'rgba(127,127,127,.14)'; };
    b.onmouseleave = function () { b.style.borderColor = 'var(--line,#D6CFC2)'; b.style.background = 'none'; };
    return b;
  }

  function paintPause() {
    if (!pauseBtn) return;
    var on = order.length > 1;
    pauseBtn.style.opacity = on ? (paused ? '1' : '.7') : '0';
    pauseBtn.style.pointerEvents = on ? 'auto' : 'none';
    pauseBtn.textContent = paused ? '\u25B8' : '\u275A\u275A';
    pauseBtn.setAttribute('aria-label', paused ? 'Play reference rotation' : 'Pause reference rotation');
  }

  function paintProgress() {
    if (!segs.length) return;
    var f = 0;
    if (holdMs) {
      var el = paused ? (holdMs - (holdLeft || 0)) : (Date.now() - holdBegan);
      f = Math.max(0, Math.min(1, el / holdMs));
    }
    segs.forEach(function (s, i) {
      s.fill.style.width = (i < cur ? 100 : i > cur ? 0 : f * 100).toFixed(2) + '%';
      s.bar.style.background = i === cur ? 'var(--muted,#D6CFC2)' : 'var(--line,#E3DED2)';
    });
    if (counterEl) counterEl.textContent = String(cur + 1).padStart(2, '0') + ' / ' + String(order.length).padStart(2, '0');
  }

  function paintDots() {
    if (!dotsEl || !dotsEl.isConnected) dotsEl = document.getElementById('refcar-dots');
    if (!dotsEl) return;
    if (order.length < 2) { dotsEl.style.display = 'none'; stopRaf(); return; }
    dotsEl.style.display = 'flex';
    dotsEl.style.alignItems = 'center';
    dotsEl.style.gap = '11px';
    if (!dotsRow || !dotsRow.isConnected) {
      dotsEl.textContent = '';
      pauseBtn = roundBtn('\u275A\u275A', 'Pause reference rotation');
      pauseBtn.onclick = togglePause;
      dotsEl.appendChild(pauseBtn);

      var prevBtn = roundBtn('\u2039', 'Previous image');
      prevBtn.onclick = function () { step(-1); };
      dotsEl.appendChild(prevBtn);

      dotsRow = document.createElement('div');
      dotsRow.style.cssText = 'display:flex;align-items:center;gap:6px;width:min(230px,40vw)';
      dotsEl.appendChild(dotsRow);

      var nextBtn = roundBtn('\u203A', 'Next image');
      nextBtn.onclick = function () { step(1); };
      dotsEl.appendChild(nextBtn);

      counterEl = document.createElement('span');
      counterEl.style.cssText = "flex:0 0 auto;font:400 9px/1 'IBM Plex Mono',monospace;letter-spacing:.12em;color:var(--muted,#5C564C)";
      dotsEl.appendChild(counterEl);
    }
    if (dotsRow.childElementCount !== order.length) {
      dotsRow.textContent = '';
      segs = [];
      order.forEach(function (it, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', 'Reference image ' + (i + 1));
        b.style.cssText = 'flex:1 1 0;height:20px;padding:0;border:none;background:none;display:flex;align-items:center;cursor:pointer';
        var bar = document.createElement('span');
        bar.style.cssText = 'display:block;width:100%;height:5px;background:var(--line,#E3DED2);overflow:hidden';
        var fill = document.createElement('span');
        fill.style.cssText = 'display:block;width:0;height:100%;background:var(--accent,#A34A24)';
        bar.appendChild(fill);
        b.appendChild(bar);
        b.onclick = function () { manualSelect(i); };
        dotsRow.appendChild(b);
        segs.push({ bar: bar, fill: fill });
      });
    }
    paintProgress();
    paintPause();
  }

  function previewItem(it) {
    pin();
    paintDots();
    var l = layerFor(it);
    if (!l) return;
    cur = order.indexOf(it);
    Object.keys(layers).forEach(function (k) {
      var lay = layers[k];
      lay.style.transition = 'none';
      lay.style.opacity = k === it.id ? '1' : '0';
      lay.style.pointerEvents = k === it.id ? 'auto' : 'none';
    });
    paintThumbs();
  }

  /* ---------- editor strip ---------- */
  var strip, thumbsEl, saveBtn, dragFrom = null;
  function mono(size, color) { return 'font:500 ' + size + "px 'IBM Plex Mono',monospace;letter-spacing:.1em;text-transform:uppercase;color:" + color; }
  function btn(label, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    b.style.cssText = mono(10, '#1B1917') + ';background:#F5F3EE;border:1px solid #D6CFC2;padding:8px 14px;cursor:pointer;transition:border-color .2s';
    b.onmouseenter = function () { b.style.borderColor = '#5C564C'; };
    b.onmouseleave = function () { b.style.borderColor = '#D6CFC2'; };
    b.onclick = fn;
    return b;
  }
  function markDirty() {
    dirty = true;
    if (saveBtn) { saveBtn.textContent = 'Save set •'; saveBtn.style.borderColor = 'var(--accent,#A34A24)'; saveBtn.style.color = 'var(--accent,#A34A24)'; }
  }

  var dropGuard = false;
  function installDropGuard() {
    if (dropGuard) return; dropGuard = true;
    var stop = function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-ref-cell]') : null;
      if (!t || !e.dataTransfer) return;
      var types = e.dataTransfer.types;
      var hasFile = types && Array.prototype.indexOf.call(types, 'Files') >= 0;
      if (!hasFile) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type !== 'drop') return;
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      var el = f && slotOf(t.getAttribute('data-ref-cell'));
      if (el && el._ingest) {
        el._ingest(f);
        setTimeout(function () { rebuildOrder(); paintThumbs(); if (!pinned) show(cur < 0 ? 0 : cur, true); }, 500);
      }
    };
    ['dragenter', 'dragover', 'drop'].forEach(function (t) {
      document.addEventListener(t, stop, true);
      window.addEventListener(t, stop, true);
    });
  }

  function buildStrip() {
    frameEl = document.getElementById('refcar-frame');
    if (!frameEl) return;
    var existing = document.querySelector('[data-refcar-strip]'); if (existing) existing.remove();
    strip = document.createElement('div');
    strip.setAttribute('data-editor-only', '');
    strip.setAttribute('data-refcar-strip', '');
    strip.style.cssText = 'max-width:1240px;margin:10px auto 0;padding:14px 0 0;box-sizing:border-box';

    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px';
    var lbl = document.createElement('span'); lbl.textContent = 'Reference carousel — editor only'; lbl.style.cssText = mono(10, '#5C564C');
    var hint = document.createElement('span');
    hint.textContent = 'drag a file onto a thumb (or click an empty one to browse) to fill that slot · drag to reorder · click a filled thumb to preview it';
    hint.style.cssText = "font:400 11px 'IBM Plex Mono',monospace;color:#5C564C;text-transform:none;letter-spacing:.02em";
    var spacer = document.createElement('span'); spacer.style.cssText = 'flex:1';
    saveBtn = btn('Save set', function () {
      save().then(function (ok) {
        saveBtn.textContent = ok ? 'Saved' : 'Save failed';
        saveBtn.style.borderColor = '#D6CFC2';
        saveBtn.style.color = ok ? '#5C564C' : 'var(--accent,#A34A24)';
        setTimeout(function () { if (!dirty) saveBtn.textContent = 'Save set'; }, 2200);
      });
    });
    function slider(label, min, max, step, get, set, fmt) {
      var wrap = document.createElement('label');
      wrap.style.cssText = 'display:flex;align-items:center;gap:7px;' + mono(9, '#5C564C');
      var t = document.createElement('span'); t.textContent = label;
      var r = document.createElement('input');
      r.type = 'range'; r.min = String(min); r.max = String(max); r.step = String(step);
      r.value = String(get());
      r.style.cssText = 'width:118px;accent-color:#A34A24;cursor:pointer';
      var out = document.createElement('span');
      out.style.cssText = mono(9, 'var(--ink,#1B1917)') + ';min-width:40px;text-align:right';
      var paint = function () { out.textContent = fmt(Number(r.value)); };
      paint();
      r.oninput = function () { set(Number(r.value)); paint(); markDirty(); };
      wrap.appendChild(t); wrap.appendChild(r); wrap.appendChild(out);
      return wrap;
    }
    var secs = function (v) { return String(+(v / 1000).toFixed(2)) + 's'; };
    var holdSlider = slider('hold', 1000, 14000, 100, HOLDMS, function (v) {
      state.hold = v;
      if (!pinned && !paused && order.length > 1) schedule(v);
    }, secs);
    var fadeSlider = slider('dissolve', 0, 3000, 50, FADEMS, function (v) { state.fade = v; }, secs);
    head.appendChild(lbl); head.appendChild(hint); head.appendChild(spacer);
    head.appendChild(holdSlider); head.appendChild(fadeSlider); head.appendChild(saveBtn);

    thumbsEl = document.createElement('div');
    thumbsEl.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start';
    strip.appendChild(head);
    strip.appendChild(thumbsEl);
    frameEl.parentNode.insertBefore(strip, frameEl.nextSibling);
    paintThumbs();
  }

  function paintThumbs() {
    if (!thumbsEl) return;
    installDropGuard();
    thumbsEl.textContent = '';
    state.items.forEach(function (it, idx) {
      var cell = document.createElement('div');
      cell.draggable = true;
      cell.setAttribute('data-ref-cell', it.id);
      cell.style.cssText = 'width:84px;display:flex;flex-direction:column;gap:5px;cursor:grab';
      cell.ondragstart = function (e) { dragFrom = idx; e.dataTransfer.effectAllowed = 'move'; cell.style.opacity = '.4'; };
      cell.ondragend = function () { cell.style.opacity = '1'; dragFrom = null; };
      cell.ondragover = function (e) { e.preventDefault(); cell.style.outline = '1px solid var(--accent,#A34A24)'; };
      cell.ondragleave = function () { cell.style.outline = 'none'; };
      cell.ondrop = function (e) {
        cell.style.outline = 'none';
        if (e.dataTransfer && e.dataTransfer.types && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) return;
        e.preventDefault();
        if (dragFrom === null || dragFrom === idx) return;
        var moved = state.items.splice(dragFrom, 1)[0];
        state.items.splice(idx, 0, moved);
        markDirty(); rebuildOrder(); paintThumbs();
      };

      var frame = document.createElement('div');
      var pinnedNow = pinned && cur >= 0 && order[cur] && order[cur].id === it.id;
      frame.style.cssText = 'position:relative;height:56px;border:1px solid ' + (pinnedNow ? '#1B1917' : '#D6CFC2') +
        ';background:#F5F3EE;overflow:hidden;background-size:cover;background-position:center';
      var url = imageURL(it.id);
      if (url) frame.style.backgroundImage = 'url("' + url + '")';
      else {
        var et = document.createElement('span'); et.textContent = 'drop here';
        et.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' + mono(8, '#5C564C');
        frame.appendChild(et);
      }
      frame.onclick = function () {
        if (!imageURL(it.id)) {
          var el = slotOf(it.id);
          if (el && el._input) {
            el._input.click();
            setTimeout(function () { rebuildOrder(); paintThumbs(); if (!pinned) show(cur < 0 ? 0 : cur, true); }, 1200);
            return;
          }
        }
        previewItem(it);
      };

      var numEl = document.createElement('span');
      numEl.textContent = String(idx + 1).padStart(2, '0');
      numEl.style.cssText = 'position:absolute;top:3px;left:4px;' + (url ? mono(8, '#F5F3EE') + ';text-shadow:0 1px 3px rgba(27,25,23,.7)' : mono(8, '#5C564C'));
      frame.appendChild(numEl);

      if (url) {
        var xi = document.createElement('button');
        xi.type = 'button'; xi.textContent = '✕';
        xi.title = 'Remove this image (click twice)';
        xi.style.cssText = 'position:absolute;top:3px;right:3px;width:16px;height:16px;line-height:1;padding:0;border:none;background:rgba(27,25,23,.7);color:#F5F3EE;font-size:9px;cursor:pointer';
        xi.onclick = function (e) {
          e.stopPropagation();
          if (xi.getAttribute('data-armed') === null) {
            xi.setAttribute('data-armed', ''); xi.textContent = '?';
            xi.style.background = 'var(--accent,#A34A24)';
            setTimeout(function () { xi.removeAttribute('data-armed'); xi.textContent = '✕'; xi.style.background = 'rgba(27,25,23,.7)'; }, 2500);
            return;
          }
          var el = slotOf(it.id);
          if (el && el.removeImage) el.removeImage();
          else if (window.ImageSlots && window.ImageSlots.set) window.ImageSlots.set(it.id, null);
          setTimeout(function () { pinned = false; rebuildOrder(); paintThumbs(); show(0); }, 120);
        };
        frame.appendChild(xi);
      }

      cell.appendChild(frame);
      thumbsEl.appendChild(cell);
    });

    var resume = document.createElement('button');
    resume.type = 'button';
    resume.textContent = pinned ? '▸ play rotation' : '❚❚ pause rotation';
    resume.style.cssText = mono(8, '#5C564C') + ';align-self:center;background:none;border:1px dashed #D6CFC2;padding:9px;cursor:pointer;height:56px;box-sizing:border-box';
    resume.onclick = function () {
      if (pinned) { pinned = false; rebuildOrder(); show(cur < 0 ? 0 : cur); paintThumbs(); }
      else { pin(); paintThumbs(); }
    };
    thumbsEl.appendChild(resume);
  }

  window.RefCarousel = {
    getItems: function () { return order.map(function (it) { return { id: it.id, src: imageURL(it.id) }; }); },
    getIndex: function () { return Math.max(0, cur); },
    debug: function () {
      return { items: state ? state.items.length : null, order: order.length, cur: cur, timer: !!timer,
        raf: !!rafId, visible: visible, paused: paused, pinned: pinned, reduced: reduced,
        holdMs: holdMs, sinceHold: holdBegan ? Date.now() - holdBegan : null, hold: HOLDMS(), fade: FADEMS() };
    }
  };

  ready(function () {
    waitFor(function (el) {
      stack = el;
      stack.querySelectorAll('[data-ref-item]').forEach(function (l) { layers[l.getAttribute('data-ref-item')] = l; });
      dotsEl = document.getElementById('refcar-dots');
      var start = function () {
        rebuildOrder();
        show(0);
        if (editing && !strip) buildStrip();
        if (window.ImageMotion && window.ImageMotion.ready) {
          Promise.resolve(window.ImageMotion.ready()).then(function () {
            if (!pinned && !paused) show(cur < 0 ? 0 : cur, true);
          });
        }
        // Self-heal: a slot's image can still be mid-render at first paint
        // (cold cache, first-ever load), which silently drops it from
        // `order` and — if that was the only other slide — leaves the
        // carousel stuck on one frame with no dots. Recheck for a few
        // seconds and pick up anything that finished loading late.
        var checks = 0, stable = 0;
        var watchdog = setInterval(function () {
          checks++;
          var before = order.length;
          var grew = syncItemsFromDOM();
          rebuildOrder();
          if (grew || order.length !== before) paintDots();
          // Rotation genuinely stalled (never scheduled, or scheduled while
          // only one image had finished loading): restart it. Same index, so
          // no jump. Full-res references on a cold connection can take well
          // over the old 10s window, so keep watching for a minute and only
          // stand down once the set has settled AND rotation is armed.
          if (!pinned && !paused && !reduced && order.length > 1 && !timer) show(cur < 0 ? 0 : cur);
          if (order.length === before && !grew && timer) stable++; else stable = 0;
          if (checks > 150 || stable > 10) clearInterval(watchdog);
        }, 400);
        setInterval(heartbeat, 1500);
      };
      var go = function () { loadState().then(function (s) { state = s; start(); }); };
      var slotsReady = (window.ImageSlots && window.ImageSlots.ready)
        ? Promise.race([Promise.resolve(window.ImageSlots.ready()), new Promise(function (resolve) { setTimeout(resolve, 1200); })])
        : new Promise(function (resolve) { setTimeout(resolve, 300); });
      slotsReady.then(go, go);

      frameEl = document.getElementById('refcar-frame');
      installSwipe(frameEl);
      if ('IntersectionObserver' in window && frameEl) {
        new IntersectionObserver(function (es) {
          visible = es[0].isIntersecting;
          // Off-screen only stops the progress animation; the rotation timer
          // stays armed so nothing can permanently stall it.
          if (!visible) { stopRaf(); } else if (!pinned && !paused && state) show(cur < 0 ? 0 : cur);
        }, { threshold: 0.05 }).observe(frameEl);
      }
      if (editing) setInterval(function () { if (state) { rebuildOrder(); paintThumbs(); } }, 4000);
    });
  });
})();

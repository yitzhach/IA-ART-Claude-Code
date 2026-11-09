/* hero-set.js — hero rotation set for the homepage hero.
   Runtime: crossfades through the items marked `live` in hero-set.state.json.
   Editor:  adds a strip under the hero (thumbnails, LIVE toggle, ✕, + Image,
            + Video, drag-to-reorder, Save set). The strip only appears when the
            Claude editor write bridge is present, so the published site is
            unaffected — same self-gating pattern as arrange-images.js.

   State file (root level, mirrored into dist/):
     { "interval": 6000,
       "manualHold": 5000,
       "items": [ {"id":"hero-macro","type":"image","live":true,"hold":9},
                  {"id":"hero-video-1","type":"video","src":"...","live":false} ] }
   Array order = rotation order. `interval` is the default hold; an item's own
   `hold` (seconds) overrides it. `manualHold` is how long the hero rests on an
   image a visitor picked from the dots before rotation continues forward. Items that are not live, or have no image /
   no src, are skipped and never loaded (their layer stays display:none, so the
   lazy <img> inside never hits the network). */
(function () {
  'use strict';
  if (window.__heroSetInstalled) return;
  window.__heroSetInstalled = true;

  var STATE_FILE = 'hero-set.state.json';
  var FADE = 900;
  var stack, hero, dotsEl, state = null, layers = {}, order = [], cur = -1;
  var timer = null, preTimer = null, pinned = false, pinTimer = null, visible = true;
  var holdOverride = null, holdMs = 0, holdBegan = 0, holdLeft = 0;
  var paused = false, controlsShown = false, hideCtlTimer = null, pauseBtn = null;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var editing = !!(window.omelette && typeof window.omelette.writeFile === 'function');
  var dirty = false;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function waitForHero(cb, tries) {
    tries = tries || 0;
    var el = document.getElementById('hero-stack');
    if (el) return cb(el);
    if (tries > 120) return;
    setTimeout(function () { waitForHero(cb, tries + 1); }, 100);
  }

  /* ---------- state ---------- */

  function defaultState() {
    var items = [];
    document.querySelectorAll('#hero-stack [data-hero-item]').forEach(function (l, i) {
      items.push({ id: l.getAttribute('data-hero-item'), type: 'image', live: i === 0 });
    });
    return { interval: 6000, manualHold: 5000, items: items };
  }

  function holdFor(it) {
    var h = it && parseFloat(it.hold);
    if (isFinite(h) && h >= 1) return Math.round(h * 1000);
    return state.interval || 6000;
  }

  // Per-transition dissolve length + easing (timeline editor). Falls back to
  // the global FADE / a plain ease when an item has no override.
  function fadeMsFor(it) {
    var f = it && parseFloat(it.fade);
    if (isFinite(f) && f >= 0.1) return Math.round(f * 1000);
    return FADE;
  }
  function curveCss(it) {
    var c = it && it.curve;
    if (c === 'linear') return 'linear';
    if (c === 'slow-in') return 'cubic-bezier(.66,0,1,1)';
    return 'ease';
  }

  /* ---------- transition effects ----------
     The effect is stored on the OUTGOING item (same as fade / curve), so each
     transition in the sequence can differ. Everything is CSS on the two hero
     layers; nothing new is loaded. */
  var FX_LABELS = {
    dissolve: 'Cross dissolve', 'dip-black': 'Dip to black', 'dip-paper': 'Dip to paper',
    blur: 'Blur dissolve', push: 'Slow push', wipe: 'Wipe', zoom: 'Zoom-through', cut: 'Cut'
  };
  function fxFor(it) { var f = it && it.fx; return FX_LABELS[f] ? f : 'dissolve'; }
  function wipeDirFor(it) {
    var d = it && it.wipeDir;
    return (d === 'left' || d === 'up' || d === 'down') ? d : 'right';
  }
  function wipeSoftFor(it) { return !(it && it.wipeSoft === false); }

  var dipEl = null;
  function dipLayer() {
    if (dipEl && dipEl.isConnected) return dipEl;
    dipEl = document.createElement('div');
    dipEl.setAttribute('data-hero-dip', '');
    dipEl.style.cssText = 'position:absolute;inset:0;opacity:0;pointer-events:none;z-index:9';
    stack.appendChild(dipEl);
    return dipEl;
  }

  function resetFx(l) {
    if (!l) return;
    l.style.transform = '';
    l.style.filter = '';
    l.style.zIndex = '';
    l.style.maskImage = ''; l.style.webkitMaskImage = '';
    l.style.maskSize = ''; l.style.webkitMaskSize = '';
    l.style.maskPosition = ''; l.style.webkitMaskPosition = '';
  }

  function wipeSpec(it) {
    var dir = wipeDirFor(it), soft = wipeSoftFor(it);
    var axis = (dir === 'left' || dir === 'right') ? 'x' : 'y';
    var to = { right: 'to right', left: 'to left', down: 'to bottom', up: 'to top' }[dir];
    var stops = soft ? '#000 0 42%, rgba(0,0,0,0) 58%' : '#000 0 50%, rgba(0,0,0,0) 50%';
    var fwd = (dir === 'right' || dir === 'down'); // travels 100% -> 0%
    return {
      image: 'linear-gradient(' + to + ',' + stops + ')',
      size: axis === 'x' ? '240% 100%' : '100% 240%',
      pos: function (t) {
        var p = fwd ? (1 - t) * 100 : t * 100;
        return axis === 'x' ? p.toFixed(2) + '% 0%' : '0% ' + p.toFixed(2) + '%';
      }
    };
  }
  function setMask(l, spec, t) {
    l.style.maskImage = spec.image; l.style.webkitMaskImage = spec.image;
    l.style.maskSize = spec.size; l.style.webkitMaskSize = spec.size;
    l.style.maskRepeat = 'no-repeat'; l.style.webkitMaskRepeat = 'no-repeat';
    l.style.maskPosition = spec.pos(t); l.style.webkitMaskPosition = spec.pos(t);
  }

  function hideLater(l, delay) {
    setTimeout(function () {
      if (l.style.opacity === '0' && !l.hasAttribute('data-hero-pin')) l.style.display = 'none';
      if (l.style.opacity === '0') resetFx(l);
    }, delay);
  }

  // Animated transition from fromL to toL. `it` is the outgoing item (carries fx).
  function runFx(fromL, toL, it, ms, curve) {
    if (!toL) return;
    var fx = fxFor(it);
    resetFx(toL);
    toL.style.display = 'block';
    toL.style.pointerEvents = 'auto';
    if (!fromL || fromL === toL || fx === 'cut' || !ms) {
      toL.style.transition = 'none'; toL.style.opacity = '1';
      if (fromL && fromL !== toL) {
        fromL.style.transition = 'none'; fromL.style.opacity = '0'; fromL.style.pointerEvents = 'none';
        hideLater(fromL, 40);
      }
      return;
    }
    fromL.style.pointerEvents = 'none';
    resetFx(fromL);
    var op = 'opacity ' + ms + 'ms ' + curve;

    if (fx === 'dip-black' || fx === 'dip-paper') {
      var half = Math.max(80, Math.round(ms / 2));
      var d = dipLayer();
      d.style.background = fx === 'dip-paper' ? '#EDEAE3' : '#0B0A09';
      d.style.transition = 'opacity ' + half + 'ms ' + curve;
      d.style.opacity = '1';
      toL.style.transition = 'none'; toL.style.opacity = '0';
      setTimeout(function () {
        fromL.style.transition = 'none'; fromL.style.opacity = '0';
        toL.style.transition = 'none'; toL.style.opacity = '1';
        d.style.transition = 'opacity ' + half + 'ms ' + curve;
        d.style.opacity = '0';
        hideLater(fromL, half + 80);
      }, half + 20);
      return;
    }

    if (fx === 'wipe') {
      var spec = wipeSpec(it);
      toL.style.zIndex = '3'; fromL.style.zIndex = '2';
      toL.style.transition = 'none'; toL.style.opacity = '1';
      setMask(toL, spec, 0);
      void toL.offsetWidth;
      toL.style.transition = 'mask-position ' + ms + 'ms ' + curve + ',-webkit-mask-position ' + ms + 'ms ' + curve;
      toL.style.maskPosition = spec.pos(1); toL.style.webkitMaskPosition = spec.pos(1);
      fromL.style.transition = 'none'; fromL.style.opacity = '1';
      setTimeout(function () {
        fromL.style.opacity = '0';
        resetFx(toL);
        toL.style.transition = 'none';
        hideLater(fromL, 60);
      }, ms + 30);
      return;
    }

    if (fx === 'blur') {
      toL.style.transition = 'none'; toL.style.opacity = '0'; toL.style.filter = 'blur(16px)';
      void toL.offsetWidth;
      toL.style.transition = op + ',filter ' + ms + 'ms ' + curve;
      toL.style.opacity = '1'; toL.style.filter = 'blur(0px)';
      fromL.style.transition = op + ',filter ' + ms + 'ms ' + curve;
      fromL.style.opacity = '0'; fromL.style.filter = 'blur(16px)';
      hideLater(fromL, ms + 90);
      return;
    }

    if (fx === 'push') {
      toL.style.zIndex = '3'; fromL.style.zIndex = '2';
      toL.style.transition = 'none'; toL.style.opacity = '0'; toL.style.transform = 'translate3d(7%,0,0)';
      void toL.offsetWidth;
      toL.style.transition = op + ',transform ' + ms + 'ms ' + curve;
      toL.style.opacity = '1'; toL.style.transform = 'translate3d(0,0,0)';
      fromL.style.transition = op + ',transform ' + ms + 'ms ' + curve;
      fromL.style.opacity = '0'; fromL.style.transform = 'translate3d(-7%,0,0)';
      hideLater(fromL, ms + 90);
      return;
    }

    if (fx === 'zoom') {
      toL.style.transition = 'none'; toL.style.opacity = '0';
      void toL.offsetWidth;
      toL.style.transition = op; toL.style.opacity = '1';
      fromL.style.transition = op + ',transform ' + ms + 'ms ' + curve;
      fromL.style.opacity = '0'; fromL.style.transform = 'scale(1.09)';
      hideLater(fromL, ms + 90);
      return;
    }

    // dissolve
    toL.style.transition = op; toL.style.opacity = '1';
    fromL.style.transition = op; fromL.style.opacity = '0';
    hideLater(fromL, ms + 90);
  }

  // Static blend at fraction t through the transition — used by the timeline
  // playhead so scrubbing shows the same picture a visitor would see.
  function blendAt(fromIt, toIt, t) {
    var fromL = fromIt ? layerFor(fromIt) : null;
    var toL = toIt ? layerFor(toIt) : null;
    var fx = fxFor(fromIt);
    var d = dipEl;
    if (d) { d.style.transition = 'none'; d.style.opacity = '0'; }
    Object.keys(layers).forEach(function (k) {
      var l = layers[k];
      l.style.transition = 'none';
      if (l !== fromL && l !== toL) { l.style.opacity = '0'; l.style.pointerEvents = 'none'; resetFx(l); }
    });
    if (fromL) { resetFx(fromL); fromL.style.display = 'block'; fromL.style.transition = 'none'; }
    if (toL && toL !== fromL) { resetFx(toL); toL.style.display = 'block'; toL.style.transition = 'none'; }
    if (!toL || toL === fromL || !t) {
      if (fromL) { fromL.style.opacity = '1'; fromL.style.pointerEvents = 'auto'; }
      if (toL && toL !== fromL) toL.style.opacity = '0';
      return;
    }
    if (!fromL) { toL.style.opacity = '1'; return; }
    if (fx === 'cut') { fromL.style.opacity = t < 1 ? '1' : '0'; toL.style.opacity = t < 1 ? '0' : '1'; return; }
    if (fx === 'dip-black' || fx === 'dip-paper') {
      var dd = dipLayer();
      dd.style.background = fx === 'dip-paper' ? '#EDEAE3' : '#0B0A09';
      dd.style.transition = 'none';
      dd.style.opacity = String(1 - Math.abs(t - 0.5) * 2);
      fromL.style.opacity = t < 0.5 ? '1' : '0';
      toL.style.opacity = t < 0.5 ? '0' : '1';
      return;
    }
    if (fx === 'wipe') {
      var spec = wipeSpec(fromIt);
      toL.style.zIndex = '3'; fromL.style.zIndex = '2';
      fromL.style.opacity = '1'; toL.style.opacity = '1';
      setMask(toL, spec, t);
      return;
    }
    fromL.style.opacity = String(1 - t);
    toL.style.opacity = String(t);
    if (fx === 'blur') { fromL.style.filter = 'blur(' + (16 * t).toFixed(1) + 'px)'; toL.style.filter = 'blur(' + (16 * (1 - t)).toFixed(1) + 'px)'; }
    if (fx === 'push') {
      toL.style.zIndex = '3'; fromL.style.zIndex = '2';
      fromL.style.transform = 'translate3d(' + (-7 * t).toFixed(2) + '%,0,0)';
      toL.style.transform = 'translate3d(' + (7 * (1 - t)).toFixed(2) + '%,0,0)';
    }
    if (fx === 'zoom') fromL.style.transform = 'scale(' + (1 + 0.09 * t).toFixed(3) + ')';
  }

  function loadState() {
    return fetch(STATE_FILE, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) {
        var base = defaultState();
        if (!j || !Array.isArray(j.items) || !j.items.length) return base;
        var known = {};
        base.items.forEach(function (it) { known[it.id] = true; });
        var out = [];
        j.items.forEach(function (it) {
          if (!it || !it.id) return;
          var h = isFinite(parseFloat(it.hold)) ? parseFloat(it.hold) : null;
          var f = isFinite(parseFloat(it.fade)) ? parseFloat(it.fade) : null;
          var c = it.curve || null;
          var fx = it.fx || null, wd = it.wipeDir || null, ws = it.wipeSoft === false ? false : null;
          if (it.type === 'video') { out.push({ id: it.id, type: 'video', src: it.src || '', live: !!it.live, hold: h, fade: f, curve: c, fx: fx, wipeDir: wd, wipeSoft: ws }); return; }
          if (known[it.id]) { out.push({ id: it.id, type: 'image', live: !!it.live, hold: h, fade: f, curve: c, fx: fx, wipeDir: wd, wipeSoft: ws }); delete known[it.id]; }
        });
        base.items.forEach(function (it) { if (known[it.id]) out.push({ id: it.id, type: 'image', live: false, hold: null }); });
        return { interval: j.interval || 6000, manualHold: j.manualHold || 5000, items: out };
      });
  }

  function save() {
    if (!editing) return Promise.resolve(false);
    try {
      return Promise.resolve(window.omelette.writeFile(STATE_FILE, JSON.stringify(state, null, 2)))
        .then(function () { dirty = false; return true; })
        .catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  /* ---------- layers ---------- */

  function slotOf(id) { return document.getElementById(id); }

  function imageURL(id) {
    var st = window.ImageSlots && window.ImageSlots.get ? window.ImageSlots.get(id) : null;
    if (st && st.cleared) return '';
    var el = slotOf(id);
    if (el) {
      if (el.shadowRoot) {
        var im = el.shadowRoot.querySelector('img');
        var s = im && im.getAttribute('src');
        if (s) return s;
      }
      var a = el.getAttribute('src');
      if (a) return a;
    }
    var v = window.ImageSlots && window.ImageSlots.get ? window.ImageSlots.get(id) : null;
    return (v && (v.u || v.src)) || '';
  }

  function filled(it) {
    return it.type === 'video' ? !!it.src : !!imageURL(it.id);
  }

  function layerFor(it) {
    if (layers[it.id]) return layers[it.id];
    var l = stack.querySelector('[data-hero-item="' + it.id + '"]');
    if (!l && it.type === 'video') {
      l = document.createElement('div');
      l.setAttribute('data-hero-item', it.id);
      l.style.cssText = 'position:absolute;inset:0;display:none;opacity:0;transition:opacity ' + FADE + 'ms ease';
      var v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.setAttribute('playsinline', '');
      v.preload = 'none';
      v.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      l.appendChild(v);
      stack.appendChild(l);
    }
    if (l) layers[it.id] = l;
    return l;
  }

  function prepare(it) {
    var l = layerFor(it);
    if (!l) return;
    if (it.type === 'video') {
      var v = l.querySelector('video');
      if (v && v.getAttribute('src') !== it.src) { v.setAttribute('src', it.src); v.load(); }
    }
    if (l.style.display === 'none') l.style.display = 'block';
  }

  function rebuildOrder() {
    order = state.items.filter(function (it) { return it.live && filled(it); });
    if (!order.length) {
      var f = state.items.filter(filled)[0];
      if (f) order = [f];
    }
  }

  /* ---------- rotation ---------- */

  function clearTimers() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (preTimer) { clearTimeout(preTimer); preTimer = null; }
  }

  function show(i, quiet) {
    if (!order.length) return;
    i = ((i % order.length) + order.length) % order.length;
    var it = order[i];
    var prevIt = (cur >= 0 && order[cur]) ? order[cur] : null;
    var outgoing = prevIt ? prevIt.id : null;
    var fadeMs = prevIt ? fadeMsFor(prevIt) : FADE;
    var curve = prevIt ? curveCss(prevIt) : 'ease';
    prepare(it);
    cur = i;
    var toL = layers[it.id];
    var fromL = outgoing && outgoing !== it.id ? layers[outgoing] : null;
    Object.keys(layers).forEach(function (k) {
      var l = layers[k];
      if (l === toL || l === fromL) return;
      l.style.transition = 'none';
      l.style.opacity = '0';
      l.style.pointerEvents = 'none';
      resetFx(l);
      var v = l.querySelector('video'); if (v) { try { v.pause(); } catch (e) {} }
      if (!l.hasAttribute('data-hero-pin')) l.style.display = 'none';
    });
    if (fromL) { var fv = fromL.querySelector('video'); if (fv) { try { fv.pause(); } catch (e) {} } }
    runFx(fromL, toL, prevIt, fadeMs, curve);
    paintDots();
    clearTimers();
    // The outgoing image keeps moving all the way through the crossfade —
    // cancelling it here is what made it snap back to its start framing.
    if (window.ImageMotion) {
      Object.keys(layers).forEach(function (k) {
        if (k !== it.id && k !== outgoing) window.ImageMotion.stop(k);
      });
      if (outgoing && outgoing !== it.id) {
        setTimeout(function () { window.ImageMotion.stop(outgoing); }, fadeMs + 120);
      }
    }
    if (quiet || reduced || pinned || paused) { holdOverride = null; return; }
    // One live image: no crossfade to hand the move off to, so it ping-pongs.
    if (order.length < 2) {
      if (window.ImageMotion && it.type !== 'video') window.ImageMotion.play(it.id, null, true);
      return;
    }

    var hold = holdOverride || holdFor(it);
    holdOverride = null;
    if (it.type === 'video') {
      var v = layers[it.id].querySelector('video');
      if (v) {
        v.loop = order.length < 2;
        v.currentTime = 0;
        var p = v.play(); if (p && p.catch) p.catch(function () {});
        v.onended = function () { if (!pinned && visible) show(cur + 1); };
        hold = Math.max(3000, (isFinite(v.duration) && v.duration ? v.duration * 1000 : 8000) + 400);
      }
    }
    // The move spans the whole time this image is up, so it lands on its end
    // framing exactly as the crossfade to the next image takes over.
    if (window.ImageMotion && it.type !== 'video') window.ImageMotion.play(it.id, hold + FADE);
    schedule(hold);
  }

  function schedule(ms) {
    clearTimers();
    holdMs = ms; holdBegan = Date.now(); holdLeft = 0;
    paintDots();
    preTimer = setTimeout(function () { prepare(order[(cur + 1) % order.length]); }, Math.max(400, ms - 1400));
    timer = setTimeout(function () { if (visible) show(cur + 1); }, ms);
  }

  function pin(ms) {
    pinned = true;
    clearTimers();
    if (pinTimer) clearTimeout(pinTimer);
    if (ms) pinTimer = setTimeout(function () { pinned = false; show(cur + 1); }, ms);
  }

  /* ---------- visitor controls ---------- */

  // A dot click: cross-dissolve to that image, rest on it for manualHold, then
  // carry on forward from there.
  function manualSelect(i) {
    if (pinTimer) { clearTimeout(pinTimer); pinTimer = null; }
    pinned = false; paused = false;
    holdOverride = state.manualHold || 5000;
    revealControls();
    show(i);
  }

  function togglePause() {
    if (paused) {
      paused = false;
      if (window.ImageMotion) window.ImageMotion.resumeAll();
      schedule(Math.max(600, holdLeft || holdFor(order[cur])));
      paintPause();
      fadeControlsLater();
    } else {
      paused = true;
      holdLeft = Math.max(600, holdMs - (Date.now() - holdBegan));
      clearTimers();
      if (window.ImageMotion) window.ImageMotion.pauseAll();
      if (hideCtlTimer) { clearTimeout(hideCtlTimer); hideCtlTimer = null; }
      stopRaf();
      paintProgress();
      paintPause();
    }
  }

  function revealControls() {
    controlsShown = true;
    paintPause();
  }

  // The playhead stays visible, so there is nothing to fade back out.
  function fadeControlsLater() {}

  function paintPause() {
    if (!pauseBtn) return;
    var on = order.length > 1;
    pauseBtn.style.opacity = on ? (paused ? '1' : '.7') : '0';
    pauseBtn.style.pointerEvents = on ? 'auto' : 'none';
    pauseBtn.textContent = paused ? '\u25B8' : '\u275A\u275A';
    pauseBtn.setAttribute('aria-label', paused ? 'Play hero rotation' : 'Pause hero rotation');
  }

  /* ---------- playhead ----------
     Play/pause + one track segment per live frame, each segment as wide as its
     hold, the current one filling as that hold elapses. Click a segment to jump. */

  var dotsRow = null, segs = [], rafId = null, counterEl = null;

  function stopRaf() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  function tick() {
    rafId = null;
    paintProgress();
    if (!paused && !pinned && visible && holdMs) rafId = requestAnimationFrame(tick);
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
      s.bar.style.background = i === cur ? '#D6CFC2' : '#E3DED2';
    });
    if (counterEl) counterEl.textContent = String(cur + 1).padStart(2, '0') + ' / ' + String(order.length).padStart(2, '0');
    if (window.HeroTimeline && window.HeroTimeline.syncLive) {
      window.HeroTimeline.syncLive({ idx: cur, elapsedMs: holdMs ? f * holdMs : 0, paused: paused, pinned: pinned });
    }
  }

  function step(dir) {
    if (order.length < 2) return;
    manualSelect((cur + dir + order.length) % order.length);
  }

  function roundBtn(label, title) {
    var b = document.createElement('button');
    b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.textContent = label;
    b.style.cssText = 'width:26px;height:26px;flex:0 0 auto;padding:0;display:flex;align-items:center;justify-content:center;' +
      'border:1px solid #D6CFC2;border-radius:50%;background:none;color:#1B1917;' +
      "font:400 11px/1 'IBM Plex Mono',monospace;cursor:pointer;transition:border-color .2s ease,background .2s ease";
    b.onmouseenter = function () { b.style.borderColor = '#5C564C'; b.style.background = 'rgba(27,25,23,.05)'; };
    b.onmouseleave = function () { b.style.borderColor = '#D6CFC2'; b.style.background = 'none'; };
    return b;
  }

  function paintDots() {
    if (!dotsEl) return;
    if (order.length < 2) { dotsEl.style.display = 'none'; stopRaf(); return; }
    dotsEl.style.display = 'flex';
    dotsEl.style.alignItems = 'center';
    dotsEl.style.gap = '11px';
    if (!dotsRow || !dotsRow.isConnected) {
      dotsEl.textContent = '';
      pauseBtn = roundBtn('\u275A\u275A', 'Pause hero rotation');
      pauseBtn.onmouseleave = function () { pauseBtn.style.borderColor = '#D6CFC2'; pauseBtn.style.background = 'none'; paintPause(); };
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
      counterEl.style.cssText = "flex:0 0 auto;font:400 9px/1 'IBM Plex Mono',monospace;letter-spacing:.12em;color:#5C564C";
      dotsEl.appendChild(counterEl);
    }
    if (dotsRow.childElementCount !== order.length) {
      dotsRow.textContent = '';
      segs = [];
      order.forEach(function (it, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', 'Hero image ' + (i + 1));
        b.style.cssText = 'flex:' + (holdFor(it) / 1000).toFixed(2) + ' 1 0;height:20px;padding:0;border:none;background:none;' +
          'display:flex;align-items:center;cursor:pointer';
        var bar = document.createElement('span');
        bar.style.cssText = 'display:block;width:100%;height:5px;background:#E3DED2;overflow:hidden';
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
    stopRaf();
    if (!paused && !pinned && visible && holdMs) rafId = requestAnimationFrame(tick);
    paintPause();
  }

  /* ---------- editor strip ---------- */

  var strip, thumbsEl, saveBtn, dragFrom = null;

  function mono(size, color) {
    return 'font:500 ' + size + "px 'IBM Plex Mono',monospace;letter-spacing:.1em;text-transform:uppercase;color:" + color;
  }

  function btn(label, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
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

  function buildStrip() {
    var existing = document.querySelector('[data-hero-strip]');
    if (existing) { existing.remove(); }
    strip = document.createElement('div');
    strip.setAttribute('data-editor-only', '');
    strip.setAttribute('data-hero-strip', '');
    strip.style.cssText = 'max-width:1240px;margin:0 auto;padding:18px 48px 22px;box-sizing:border-box;border-bottom:1px solid #D6CFC2;background:#EDEAE3';

    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px';
    var lbl = document.createElement('span');
    lbl.textContent = 'Hero set — editor only';
    lbl.style.cssText = mono(10, '#5C564C');
    var hint = document.createElement('span');
    hint.textContent = 'click a frame to preview it in the hero, then hover the hero for Adjust / Reframe · seconds field = that frame\u2019s hold (blank = default) · drag to reorder · LIVE = shows on the published site';
    hint.style.cssText = "font:400 11px 'IBM Plex Mono',monospace;color:#5C564C;text-transform:none;letter-spacing:.02em";
    var durWrap = document.createElement('label');
    durWrap.style.cssText = 'display:flex;align-items:center;gap:8px';
    var durLbl = document.createElement('span');
    durLbl.textContent = 'Default hold';
    durLbl.style.cssText = mono(9, '#5C564C');
    var durRange = document.createElement('input');
    durRange.type = 'range';
    durRange.min = '2'; durRange.max = '20'; durRange.step = '0.5';
    durRange.value = String((state.interval || 6000) / 1000);
    durRange.style.cssText = 'width:130px;accent-color:var(--accent,#A34A24);cursor:pointer';
    var durNum = document.createElement('input');
    durNum.type = 'number';
    durNum.min = '2'; durNum.max = '60'; durNum.step = '0.5';
    durNum.value = durRange.value;
    durNum.style.cssText = "width:58px;font:500 11px 'IBM Plex Mono',monospace;color:#1B1917;background:#F5F3EE;border:1px solid #D6CFC2;padding:5px 6px;text-align:right";
    var durUnit = document.createElement('span');
    durUnit.textContent = 'sec';
    durUnit.style.cssText = mono(9, '#5C564C');
    function setHold(v, from) {
      v = Math.min(60, Math.max(2, parseFloat(v) || 6));
      state.interval = Math.round(v * 1000);
      if (from !== 'range') durRange.value = String(Math.min(20, v));
      if (from !== 'num') durNum.value = String(v);
      markDirty();
      if (!pinned && visible) { clearTimers(); show(cur); }
    }
    durRange.oninput = function () { setHold(durRange.value, 'range'); };
    durNum.onchange = function () { setHold(durNum.value, 'num'); };
    durWrap.appendChild(durLbl); durWrap.appendChild(durRange);
    durWrap.appendChild(durNum); durWrap.appendChild(durUnit);

    // How long the hero rests on an image a visitor picks from the dots.
    var manWrap = document.createElement('label');
    manWrap.style.cssText = 'display:flex;align-items:center;gap:8px';
    var manLbl = document.createElement('span');
    manLbl.textContent = 'After dot click';
    manLbl.style.cssText = mono(9, '#5C564C');
    var manNum = document.createElement('input');
    manNum.type = 'number';
    manNum.min = '1'; manNum.max = '60'; manNum.step = '0.5';
    manNum.value = String((state.manualHold || 5000) / 1000);
    manNum.title = 'Seconds the hero holds on an image a visitor selects, before rotation continues';
    manNum.style.cssText = "width:52px;font:500 11px 'IBM Plex Mono',monospace;color:#1B1917;background:#F5F3EE;border:1px solid #D6CFC2;padding:5px 6px;text-align:right";
    manNum.onchange = function () {
      var v = Math.min(60, Math.max(1, parseFloat(manNum.value) || 5));
      manNum.value = String(v);
      state.manualHold = Math.round(v * 1000);
      markDirty();
    };
    var manUnit = document.createElement('span');
    manUnit.textContent = 'sec';
    manUnit.style.cssText = mono(9, '#5C564C');
    manWrap.appendChild(manLbl); manWrap.appendChild(manNum); manWrap.appendChild(manUnit);

    var spacer = document.createElement('span');
    spacer.style.cssText = 'flex:1';
    var actions = document.createElement('span');
    actions.style.cssText = 'display:flex;gap:8px';
    actions.appendChild(btn('+ Video', addVideo));
    actions.appendChild(btn('Timeline', function () {
      if (window.HeroTimeline) window.HeroTimeline.toggle();
    }));
    saveBtn = btn('Save set', function () {
      save().then(function (ok) {
        saveBtn.textContent = ok ? 'Saved' : 'Save failed';
        saveBtn.style.borderColor = '#D6CFC2';
        saveBtn.style.color = ok ? '#5C564C' : 'var(--accent,#A34A24)';
        setTimeout(function () { if (!dirty) saveBtn.textContent = 'Save set'; }, 2200);
      });
    });
    actions.appendChild(saveBtn);

    var collapsed = false;
    try { collapsed = localStorage.getItem('heroSetCollapsed') === '1'; } catch (e) {}
    var toggle = btn('', function () { collapsed = !collapsed; try { localStorage.setItem('heroSetCollapsed', collapsed ? '1' : '0'); } catch (e) {} applyCollapse(); });
    function applyCollapse() {
      var n = state.items.filter(function (it) { return it.live; }).length;
      toggle.textContent = collapsed ? 'Hero set (' + n + ' live)' : 'Hide';
      thumbsEl.style.display = collapsed ? 'none' : 'flex';
      hint.style.display = collapsed ? 'none' : 'inline';
      durWrap.style.display = collapsed ? 'none' : 'flex';
      manWrap.style.display = collapsed ? 'none' : 'flex';
      lbl.style.display = collapsed ? 'none' : 'inline';
      saveBtn.style.display = collapsed ? 'none' : 'inline-block';
      actions.children[0].style.display = collapsed ? 'none' : 'inline-block';
      head.style.marginBottom = collapsed ? '0' : '14px';
      strip.style.padding = collapsed ? '8px 48px' : '18px 48px 22px';
    }
    strip._applyCollapse = applyCollapse;
    actions.appendChild(toggle);
    head.appendChild(lbl); head.appendChild(hint); head.appendChild(spacer);
    head.appendChild(durWrap); head.appendChild(manWrap); head.appendChild(actions);

    thumbsEl = document.createElement('div');
    thumbsEl.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start';

    strip.appendChild(head);
    strip.appendChild(thumbsEl);
    hero.parentNode.insertBefore(strip, dotsEl && dotsEl.nextSibling ? dotsEl.nextSibling : hero.nextSibling);
    paintThumbs();
    applyCollapse();
  }

  function previewItem(it) {
    if (window.ImageMotion) window.ImageMotion.stopAll();
    Object.keys(layers).forEach(function (k) { layers[k].removeAttribute('data-hero-pin'); });
    pin(0);
    var l = layerFor(it);
    if (!l) return;
    l.setAttribute('data-hero-pin', '');
    prepare(it);
    Object.keys(layers).forEach(function (k) {
      resetFx(layers[k]);
      layers[k].style.opacity = k === it.id ? '1' : '0';
      layers[k].style.pointerEvents = k === it.id ? 'auto' : 'none';
    });
    paintThumbs();
  }

  // Files dropped on a thumb are caught here, ahead of the host editor's own
  // document-level drop handling (which would drop the image into the page).
  var dropGuard = false;
  function installDropGuard() {
    if (dropGuard) return; dropGuard = true;
    var stop = function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-hero-cell]') : null;
      if (!t || !e.dataTransfer) return;
      var types = e.dataTransfer.types;
      var hasFile = types && Array.prototype.indexOf.call(types, 'Files') >= 0;
      if (!hasFile) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type !== 'drop') return;
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      var el = f && slotOf(t.getAttribute('data-hero-cell'));
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

  function paintThumbs() {
    if (!thumbsEl) return;
    installDropGuard();
    if (strip && strip._applyCollapse) strip._applyCollapse();
    thumbsEl.textContent = '';
    state.items.forEach(function (it, idx) {
      var cell = document.createElement('div');
      cell.draggable = true;
      cell.setAttribute('data-hero-cell', it.id);
      cell.style.cssText = 'width:104px;display:flex;flex-direction:column;gap:6px;cursor:grab';
      cell.ondragstart = function (e) { dragFrom = idx; e.dataTransfer.effectAllowed = 'move'; cell.style.opacity = '.4'; };
      cell.ondragend = function () { cell.style.opacity = '1'; dragFrom = null; };
      cell.ondragover = function (e) { e.preventDefault(); cell.style.outline = '1px solid var(--accent,#A34A24)'; };
      cell.ondragleave = function () { cell.style.outline = 'none'; };
      cell.ondrop = function (e) {
        e.preventDefault(); cell.style.outline = 'none';
        if (dragFrom === null || dragFrom === idx) return;
        var moved = state.items.splice(dragFrom, 1)[0];
        state.items.splice(idx, 0, moved);
        markDirty(); rebuildOrder(); paintThumbs();
      };

      var frame = document.createElement('div');
      var pinnedNow = layers[it.id] && layers[it.id].hasAttribute('data-hero-pin');
      frame.style.cssText = 'position:relative;height:70px;border:1px solid ' + (pinnedNow ? '#1B1917' : '#D6CFC2') +
        ';background:#F5F3EE;overflow:hidden;background-size:cover;background-position:center';
      var url = it.type === 'video' ? '' : imageURL(it.id);
      if (url) frame.style.backgroundImage = 'url("' + url + '")';
      if (it.type === 'video') {
        var vt = document.createElement('span');
        vt.textContent = it.src ? 'VIDEO' : 'VIDEO — no file';
        vt.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;' + mono(9, '#5C564C');
        frame.appendChild(vt);
      } else if (!url) {
        var et = document.createElement('span');
        et.textContent = 'drop here';
        et.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' + mono(9, '#5C564C');
        frame.appendChild(et);
      }
      frame.onclick = function () {
        // Empty thumb: open the file picker for that slot instead of previewing.
        if (it.type !== 'video' && !imageURL(it.id)) {
          var el = slotOf(it.id);
          if (el && el._input) {
            el._input.click();
            setTimeout(function () { rebuildOrder(); paintThumbs(); }, 1200);
            return;
          }
        }
        previewItem(it);
      };

      var num = document.createElement('span');
      num.textContent = String(idx + 1).padStart(2, '0');
      num.style.cssText = 'position:absolute;top:4px;left:5px;' + (url
        ? mono(9, '#F5F3EE') + ';text-shadow:0 1px 3px rgba(27,25,23,.7)'
        : mono(9, '#5C564C'));
      frame.appendChild(num);

      if (it.type === 'image' && url) {
        var xi = document.createElement('button');
        xi.type = 'button'; xi.textContent = '✕';
        xi.title = 'Remove this image (click twice)';
        xi.style.cssText = 'position:absolute;top:3px;right:3px;width:18px;height:18px;line-height:1;padding:0;border:none;background:rgba(27,25,23,.7);color:#F5F3EE;font-size:10px;cursor:pointer';
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
          setTimeout(function () { rebuildOrder(); paintThumbs(); if (!pinned) show(0); }, 120);
        };
        frame.appendChild(xi);
      }

      if (it.type === 'video') {
        var x = document.createElement('button');
        x.type = 'button'; x.textContent = '✕';
        x.title = 'Remove this video from the set';
        x.style.cssText = 'position:absolute;top:3px;right:3px;width:18px;height:18px;line-height:1;padding:0;border:none;background:rgba(27,25,23,.7);color:#F5F3EE;font-size:10px;cursor:pointer';
        x.onclick = function (e) {
          e.stopPropagation();
          var l = layers[it.id]; if (l) { l.remove(); delete layers[it.id]; }
          state.items.splice(idx, 1);
          markDirty(); rebuildOrder(); paintThumbs(); pinned = false; show(0);
        };
        frame.appendChild(x);
      }

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px';
      var live = document.createElement('button');
      live.type = 'button';
      live.textContent = it.live ? 'LIVE' : 'SPARE';
      live.title = 'Toggle whether this shows on the published site';
      live.style.cssText = mono(9, it.live ? '#F5F3EE' : '#5C564C') + ';flex:1;padding:5px 0;cursor:pointer;border:1px solid ' +
        (it.live ? 'var(--accent,#A34A24)' : '#D6CFC2') + ';background:' + (it.live ? 'var(--accent,#A34A24)' : 'transparent');
      live.onclick = function () {
        it.live = !it.live;
        markDirty(); rebuildOrder(); paintThumbs();
        if (!pinned) show(0);
      };
      row.appendChild(live);

      // Per-frame hold override. Blank = use the default hold in the header.
      var sec = document.createElement('input');
      sec.type = 'number';
      sec.min = '1'; sec.max = '60'; sec.step = '0.5';
      sec.value = (it.hold === null || it.hold === undefined || it.hold === '') ? '' : String(it.hold);
      sec.placeholder = String((state.interval || 6000) / 1000);
      sec.title = 'Seconds this frame holds. Blank = default hold.';
      sec.style.cssText = "width:38px;flex:0 0 auto;font:500 10px 'IBM Plex Mono',monospace;color:" +
        (sec.value ? '#1B1917' : '#5C564C') + ';background:#F5F3EE;border:1px solid ' +
        (sec.value ? '#5C564C' : '#D6CFC2') + ';padding:5px 4px;text-align:right;box-sizing:border-box';
      sec.onclick = function (e) { e.stopPropagation(); };
      sec.onchange = function () {
        var raw = sec.value.trim();
        if (!raw) { it.hold = null; }
        else {
          var v = Math.min(60, Math.max(1, parseFloat(raw) || 6));
          it.hold = v; sec.value = String(v);
        }
        sec.style.color = it.hold ? '#1B1917' : '#5C564C';
        sec.style.borderColor = it.hold ? '#5C564C' : '#D6CFC2';
        markDirty();
        if (!pinned && !paused && visible && order[cur] && order[cur].id === it.id) show(cur);
      };
      row.appendChild(sec);

      cell.appendChild(frame);
      cell.appendChild(row);
      thumbsEl.appendChild(cell);
    });

    var resume = document.createElement('button');
    resume.type = 'button';
    resume.textContent = pinned ? '▸ play rotation' : '❚❚ pause rotation';
    resume.style.cssText = mono(9, '#5C564C') + ';align-self:center;background:none;border:1px dashed #D6CFC2;padding:10px;cursor:pointer';
    resume.onclick = function () {
      if (pinned) {
        // Resume from whichever image is currently pinned/previewed, not the first.
        var pinnedId = null;
        Object.keys(layers).forEach(function (k) {
          if (layers[k].hasAttribute('data-hero-pin')) pinnedId = k;
          layers[k].removeAttribute('data-hero-pin');
        });
        pinned = false; rebuildOrder();
        var at = 0;
        if (pinnedId) {
          for (var qi = 0; qi < order.length; qi++) if (order[qi].id === pinnedId) { at = qi; break; }
        }
        show(at); paintThumbs();
      } else {
        var it = order[cur] || order[0];
        if (it) previewItem(it);
        else { pin(0); paintThumbs(); }
      }
    };
    thumbsEl.appendChild(resume);
  }

  function addVideo() {
    var src = window.prompt('Video file path or URL (mp4 / webm)\n\ne.g. images/hero-clip.mp4  or  https://…/clip.mp4');
    if (!src) return;
    var n = 1;
    state.items.forEach(function (it) { if (it.type === 'video') n++; });
    state.items.push({ id: 'hero-video-' + n, type: 'video', src: src.trim(), live: true });
    markDirty(); rebuildOrder(); paintThumbs();
  }

  /* ---------- boot ---------- */

  if (editing) {
    window.HeroSet = {
      getState: function () { return state; },
      getOrder: function () { return order; },
      getLayers: function () { return layers; },
      rebuildOrder: rebuildOrder,
      markDirty: markDirty,
      save: save,
      imageURL: imageURL,
      holdFor: holdFor,
      fadeMsFor: fadeMsFor,
      fxFor: fxFor,
      fxLabels: FX_LABELS,
      blendAt: blendAt,
      prepare: prepare,
      show: show,
      previewItem: function (it) { previewItem(it); },
      pinNow: function () { pin(0); },
      paintThumbs: function () { paintThumbs(); },
      isPinned: function () { return pinned; }
    };
  }

  ready(function () {
    waitForHero(function (el) {
      stack = el;
      hero = document.getElementById('hero-parallax');
      dotsEl = document.getElementById('hero-dots');
      stack.querySelectorAll('[data-hero-item]').forEach(function (l) {
        layers[l.getAttribute('data-hero-item')] = l;
      });
      var start = function () {
        rebuildOrder();
        show(0);
        if (editing && !strip) buildStrip();
        if (editing) document.dispatchEvent(new CustomEvent('herosetready'));
      };
      var go = function () { loadState().then(function (s) { state = s; start(); }); };
      if (window.ImageSlots && window.ImageSlots.ready) {
        Promise.resolve(window.ImageSlots.ready()).then(go, go);
      } else { setTimeout(go, 300); }

      if ('IntersectionObserver' in window && hero) {
        new IntersectionObserver(function (es) {
          visible = es[0].isIntersecting;
          if (!visible) clearTimers();
          else if (!pinned && !paused && state) show(cur < 0 ? 0 : cur);
        }, { threshold: 0.05 }).observe(hero);
      }
      // Re-check for newly dropped images so a fresh drop can go live without reload.
      if (editing) setInterval(function () { if (state) { rebuildOrder(); paintThumbs(); } }, 4000);
    });
  });
})();

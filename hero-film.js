/* hero-film.js — 16mm mode for the hero.

   A bundle of small effects under one toggle and one master intensity:
     gate weave  · sub-pixel jitter + a hair of rotation on the image layers
     flicker     · small exposure wobble on the same layers
     vignette    · static corner falloff
     halation    · warm bleed off the brightest areas
     artifacts   · dust, the odd hair, a rare scratch and splice flash,
                   drawn on a small canvas at ~15fps and scaled by CSS

   Weave and flicker are applied to a wrapper this script inserts INSIDE
   #hero-stack around the [data-hero-item] layers — the stack itself carries
   the scroll parallax and the layers carry crossfade / Ken Burns transforms,
   so this is the one free slot in the chain. Turning the mode off unwraps it.

   State (root level, mirrored into dist/): hero-film.state.json
     { "on": false, "intensity": 55, "weave": 35, "flicker": 28,
       "vignette": 42, "halation": 30, "artifacts": 32 }
   All 0-100. intensity scales every effect. Reduced motion keeps the static
   grade (vignette + halation) and drops weave, flicker and artifacts.

   Editor UI lives in the timeline dock (hero-timeline.js) via window.HeroFilm.
*/
(function () {
  'use strict';
  if (window.__heroFilmInstalled) return;
  window.__heroFilmInstalled = true;

  var FILE = 'hero-film.state.json';
  var DEF = { on: false, intensity: 55, weave: 35, flicker: 28, vignette: 42, halation: 30, artifacts: 32 };
  var editing = !!(window.omelette && typeof window.omelette.writeFile === 'function');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = null, grade = null, halo = null, cv = null, ctx = null;
  var weaveT = null, artT = null, autoT = null;
  var CW = 420, CH = 236;

  function amt(k) {
    var master = Math.max(0, Math.min(100, parseFloat(state.intensity)));
    var v = Math.max(0, Math.min(100, parseFloat(state[k])));
    if (!isFinite(master)) master = DEF.intensity;
    if (!isFinite(v)) v = 0;
    return (v / 100) * (master / 100);
  }

  /* ---------- gate weave host ---------- */

  function isLayer(n) { return n.nodeType === 1 && n.hasAttribute('data-hero-item'); }

  function weaveHost(make) {
    var stack = document.getElementById('hero-stack');
    if (!stack) return null;
    var w = null;
    [].forEach.call(stack.children, function (c) {
      if (c.nodeType === 1 && c.hasAttribute('data-hero-weave')) w = c;
    });
    if (w || !make) return w;
    var kids = [].filter.call(stack.children, isLayer);
    if (!kids.length) return null;
    w = document.createElement('div');
    w.setAttribute('data-hero-weave', '');
    w.style.cssText = 'position:absolute;inset:0;transform-origin:50% 50%;backface-visibility:hidden';
    stack.insertBefore(w, kids[0]);
    kids.forEach(function (k) { w.appendChild(k); });
    return w;
  }

  function unwrap() {
    var w = weaveHost(false);
    if (!w) return;
    var stack = w.parentNode;
    w.style.transform = ''; w.style.filter = '';
    while (w.firstChild) stack.insertBefore(w.firstChild, w);
    w.parentNode.removeChild(w);
  }

  /* ---------- static grade layers ---------- */

  function mountGrade(hero) {
    if (grade) return;
    grade = document.createElement('div');
    grade.setAttribute('data-hero-film-grade', '');
    grade.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;opacity:0;transition:opacity .5s ease';
    hero.appendChild(grade);

    halo = document.createElement('div');
    halo.setAttribute('data-hero-film-halation', '');
    var canBlur = window.CSS && CSS.supports && CSS.supports('backdrop-filter', 'blur(4px)');
    halo.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;mix-blend-mode:screen;' +
      'opacity:0;transition:opacity .5s ease;' +
      (canBlur ? '-webkit-backdrop-filter:blur(9px) brightness(1.35) saturate(.75);backdrop-filter:blur(9px) brightness(1.35) saturate(.75);'
               : 'background:radial-gradient(ellipse 120% 90% at 50% 40%,rgba(232,178,124,.55),rgba(163,74,36,0) 70%);');
    hero.appendChild(halo);
  }

  function mountCanvas(hero) {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.width = CW; cv.height = CH;
    cv.setAttribute('data-hero-film-artifacts', '');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:7;' +
      'mix-blend-mode:screen;opacity:0;transition:opacity .5s ease';
    ctx = cv.getContext('2d');
    hero.appendChild(cv);
  }

  function mount() {
    var hero = document.getElementById('hero-parallax');
    if (!hero || !state) return;
    mountGrade(hero);
    mountCanvas(hero);
    apply();
  }

  /* ---------- artifacts ---------- */

  function drawArtifacts(a) {
    if (!ctx) return;
    ctx.clearRect(0, 0, CW, CH);
    var n = Math.round(3 + a * 22);
    ctx.fillStyle = 'rgba(255,250,242,.55)';
    for (var i = 0; i < n; i++) {
      var x = Math.random() * CW, y = Math.random() * CH;
      var r = Math.random() < 0.85 ? 0.6 + Math.random() * 0.9 : 1.4 + Math.random() * 1.2;
      ctx.globalAlpha = 0.25 + Math.random() * 0.55;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    // the occasional hair
    if (Math.random() < 0.05 + a * 0.10) {
      ctx.globalAlpha = 0.30 + a * 0.25;
      ctx.strokeStyle = 'rgba(250,244,234,.7)';
      ctx.lineWidth = 0.8;
      var hx = Math.random() * CW, hy = Math.random() * CH;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.bezierCurveTo(hx + 12, hy - 9, hx + 26, hy + 11, hx + 38, hy - 4);
      ctx.stroke();
    }
    // rare vertical scratch
    if (Math.random() < 0.018 + a * 0.05) {
      ctx.globalAlpha = 0.10 + a * 0.20;
      ctx.fillStyle = 'rgba(255,252,246,.8)';
      var sx = Math.round(Math.random() * CW);
      ctx.fillRect(sx, 0, Math.random() < 0.7 ? 1 : 2, CH);
      ctx.fillStyle = 'rgba(255,250,242,.55)';
    }
    // rare splice flash
    if (Math.random() < 0.006 + a * 0.02) {
      ctx.globalAlpha = 0.05 + a * 0.10;
      ctx.fillStyle = 'rgba(255,246,232,1)';
      ctx.fillRect(0, 0, CW, CH);
      ctx.fillStyle = 'rgba(255,250,242,.55)';
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- apply ---------- */

  function apply() {
    if (!state) return;
    var on = !!state.on;
    var w = amt('weave'), f = amt('flicker'), v = amt('vignette'), h = amt('halation'), ar = amt('artifacts');

    if (weaveT) { clearInterval(weaveT); weaveT = null; }
    if (artT) { clearInterval(artT); artT = null; }

    if (!on) {
      unwrap();
      if (grade) grade.style.opacity = '0';
      if (halo) halo.style.opacity = '0';
      if (cv) { cv.style.opacity = '0'; if (ctx) ctx.clearRect(0, 0, CW, CH); }
      return;
    }

    if (grade) {
      grade.style.opacity = v > 0 ? '1' : '0';
      var vi = 0.55 * v;
      grade.style.background =
        'radial-gradient(ellipse 78% 74% at 50% 48%,rgba(11,10,9,0) 52%,rgba(11,10,9,' + (vi * 0.55).toFixed(3) + ') 84%,rgba(11,10,9,' + vi.toFixed(3) + ') 100%)';
    }
    if (halo) halo.style.opacity = h > 0 ? (0.5 * h).toFixed(3) : '0';

    if (!reduce && (w > 0 || f > 0)) {
      var host = weaveHost(true);
      if (host) {
        host.style.transition = 'none';
        var tick = function () {
          var hh = weaveHost(false);
          if (!hh) return;
          var px = 3.0 * w;
          var dx = (Math.random() - 0.5) * 2 * px;
          var dy = (Math.random() - 0.5) * 2 * px;
          var rot = (Math.random() - 0.5) * 0.14 * w;
          hh.style.transform = 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0) rotate(' + rot.toFixed(3) + 'deg) scale(' + (1 + 0.004 + px / 900).toFixed(4) + ')';
          if (f > 0) {
            var b = 1 + (Math.random() - 0.5) * 0.11 * f;
            hh.style.filter = 'brightness(' + b.toFixed(3) + ')';
          } else if (hh.style.filter) { hh.style.filter = ''; }
        };
        tick();
        weaveT = setInterval(tick, 1000 / 6);
      }
    } else if (reduce || (w <= 0 && f <= 0)) {
      unwrap();
    }

    if (cv) {
      var run = !reduce && ar > 0;
      cv.style.opacity = run ? String(Math.min(0.9, 0.35 + ar * 0.5).toFixed(3)) : '0';
      if (run) {
        drawArtifacts(ar);
        artT = setInterval(function () { drawArtifacts(ar); }, 1000 / 15);
      } else if (ctx) { ctx.clearRect(0, 0, CW, CH); }
    }
  }

  function num(j, k) { return j && isFinite(j[k]) ? j[k] : DEF[k]; }

  function load() {
    return fetch(FILE + '?t=' + Date.now()).then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () { return null; }).then(function (j) {
      state = {
        on: j && typeof j.on === 'boolean' ? j.on : DEF.on,
        intensity: num(j, 'intensity'),
        weave: num(j, 'weave'),
        flicker: num(j, 'flicker'),
        vignette: num(j, 'vignette'),
        halation: num(j, 'halation'),
        artifacts: num(j, 'artifacts')
      };
      mount();
    });
  }

  function save() {
    if (!editing) return Promise.resolve(false);
    try {
      return Promise.resolve(window.omelette.writeFile(FILE, JSON.stringify(state, null, 2)))
        .then(function () { return true; }, function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  window.HeroFilm = {
    get: function () { return state || Object.assign({}, DEF); },
    set: function (patch) {
      if (!state) state = Object.assign({}, DEF);
      Object.keys(patch).forEach(function (k) { state[k] = patch[k]; });
      apply();
      if (editing) { clearTimeout(autoT); autoT = setTimeout(save, 600); }
    },
    save: save,
    defaults: function () { return Object.assign({}, DEF); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else { load(); }
  document.addEventListener('herosetready', function () { mount(); });
})();

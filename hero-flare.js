/* hero-flare.js — warm lens flare over the hero.

   CSS only, no canvas. One screen-blend div carrying layered radial
   gradients: a hot core, three ghost orbs spaced along the axis running
   through the frame centre, and a wide soft anamorphic streak. Warmed
   toward the site accent so it reads as a bloom in the corner of a
   photograph rather than a sci-fi streak.

   State (root level, mirrored into dist/): hero-flare.state.json
     { "on": true, "intensity": 12, "x": 78, "y": 22, "drift": 0 }
   intensity 0-40 = overall opacity percent · x/y = flare position in
   percent of the frame · drift = seconds per drift cycle (0 = static).
   Reduced motion forces static.

   Editor UI lives in the timeline dock (hero-timeline.js) via window.HeroFlare.
*/
(function () {
  'use strict';
  if (window.__heroFlareInstalled) return;
  window.__heroFlareInstalled = true;

  var FILE = 'hero-flare.state.json';
  var DEF = { on: true, intensity: 12, x: 78, y: 22, drift: 0 };
  var editing = !!(window.omelette && typeof window.omelette.writeFile === 'function');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var state = null, el = null, autoT = null, styled = false;

  function injectKeyframes() {
    if (styled) return;
    styled = true;
    var s = document.createElement('style');
    s.setAttribute('data-hero-flare-css', '');
    s.textContent = '@keyframes heroFlareDrift{' +
      '0%{transform:translate(calc(var(--fdx) * -1),calc(var(--fdy) * -1))}' +
      '50%{transform:translate(var(--fdx),var(--fdy))}' +
      '100%{transform:translate(calc(var(--fdx) * -1),calc(var(--fdy) * -1))}}';
    document.head.appendChild(s);
  }

  /* Gradient stack. Positions are laid out along the line from the flare
     point through the centre, so moving x/y swings the whole rig. */
  function gradients(x, y) {
    var ox = 100 - x, oy = 100 - y;             // opposite point
    function at(t) { return [x + (ox - x) * t, y + (oy - y) * t]; }
    var g1 = at(0.34), g2 = at(0.66), g3 = at(1.02);
    var parts = [
      // hot core
      'radial-gradient(ellipse 24% 34% at ' + x + '% ' + y + '%,rgba(255,236,206,.85),rgba(232,168,110,.34) 38%,rgba(163,74,36,0) 72%)',
      // tight inner bloom
      'radial-gradient(ellipse 7% 11% at ' + x + '% ' + y + '%,rgba(255,248,236,.95),rgba(255,222,180,0) 70%)',
      // ghosts
      'radial-gradient(ellipse 6% 9% at ' + g1[0] + '% ' + g1[1] + '%,rgba(214,140,86,.42),rgba(163,74,36,0) 70%)',
      'radial-gradient(ellipse 9% 14% at ' + g2[0] + '% ' + g2[1] + '%,rgba(163,74,36,.30),rgba(163,74,36,0) 72%)',
      'radial-gradient(ellipse 4% 6% at ' + g3[0] + '% ' + g3[1] + '%,rgba(240,196,150,.34),rgba(163,74,36,0) 70%)',
      // anamorphic streak through the core
      'radial-gradient(ellipse 62% 3% at ' + x + '% ' + y + '%,rgba(238,186,136,.30),rgba(163,74,36,0) 78%)'
    ];
    return parts.join(',');
  }

  function mount() {
    var hero = document.getElementById('hero-parallax');
    if (!hero || el) return;
    injectKeyframes();
    el = document.createElement('div');
    el.setAttribute('data-hero-flare', '');
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:8;' +
      'mix-blend-mode:screen;opacity:0;transition:opacity .5s ease;will-change:opacity';
    hero.appendChild(el);
    apply();
  }

  function apply() {
    if (!el || !state) return;
    var on = !!state.on && state.intensity > 0;
    var x = Math.max(0, Math.min(100, parseFloat(state.x)));
    var y = Math.max(0, Math.min(100, parseFloat(state.y)));
    if (!isFinite(x)) x = DEF.x;
    if (!isFinite(y)) y = DEF.y;
    el.style.backgroundImage = gradients(x, y);
    el.style.opacity = on ? String(Math.min(40, Math.max(0, state.intensity)) / 100) : '0';

    var d = parseFloat(state.drift) || 0;
    var ax = (100 - x) - x, ay = (100 - y) - y;
    var len = Math.sqrt(ax * ax + ay * ay) || 1;
    el.style.setProperty('--fdx', (ax / len * 2.2).toFixed(2) + '%');
    el.style.setProperty('--fdy', (ay / len * 2.2).toFixed(2) + '%');
    if (on && d > 0 && !reduce) {
      el.style.animation = 'heroFlareDrift ' + Math.max(4, Math.min(120, d)) + 's ease-in-out infinite';
    } else {
      el.style.animation = 'none';
      el.style.transform = '';
    }
  }

  function load() {
    return fetch(FILE + '?t=' + Date.now()).then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () { return null; }).then(function (j) {
      state = {
        on: j && typeof j.on === 'boolean' ? j.on : DEF.on,
        intensity: j && isFinite(j.intensity) ? j.intensity : DEF.intensity,
        x: j && isFinite(j.x) ? j.x : DEF.x,
        y: j && isFinite(j.y) ? j.y : DEF.y,
        drift: j && isFinite(j.drift) ? j.drift : DEF.drift
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

  window.HeroFlare = {
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

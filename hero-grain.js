/* hero-grain.js — film grain overlay for the hero.

   A tiled monochrome noise texture sits over #hero-parallax with
   mix-blend-mode:overlay, so it darkens and lightens the photo the way
   emulsion grain does instead of veiling it with flat noise.

   State (root level, mirrored into dist/): hero-grain.state.json
     { "on": true, "amount": 12, "size": 1, "speed": 12 }
   amount 0-40 = opacity percent · size = tile scale · speed = tile
   reshuffles per second (0 = static). Reduced motion forces static.

   Editor UI lives in the timeline dock (hero-timeline.js) via window.HeroGrain.
*/
(function () {
  'use strict';
  if (window.__heroGrainInstalled) return;
  window.__heroGrainInstalled = true;

  var FILE = 'hero-grain.state.json';
  var DEF = { on: true, amount: 12, size: 1, speed: 12 };
  var editing = !!(window.omelette && typeof window.omelette.writeFile === 'function');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var state = null, el = null, tiles = [], timer = null, TILE = 128, autoT = null;

  function makeTile() {
    var c = document.createElement('canvas');
    c.width = c.height = TILE;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(TILE, TILE);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = 128 + (Math.random() - 0.5) * 255;
      d[i] = d[i + 1] = d[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }

  function mount() {
    var hero = document.getElementById('hero-parallax');
    if (!hero || el) return;
    if (!tiles.length) { tiles = [makeTile(), makeTile(), makeTile()]; }
    el = document.createElement('div');
    el.setAttribute('data-hero-grain', '');
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;' +
      'mix-blend-mode:overlay;background-repeat:repeat;opacity:0;transition:opacity .4s ease';
    hero.appendChild(el);
    apply();
  }

  function apply() {
    if (!el || !state) return;
    var on = !!state.on && state.amount > 0;
    var px = Math.round(TILE * (parseFloat(state.size) || 1));
    el.style.backgroundSize = px + 'px ' + px + 'px';
    el.style.opacity = on ? String(Math.min(40, Math.max(0, state.amount)) / 100) : '0';
    if (!el.style.backgroundImage) el.style.backgroundImage = 'url("' + tiles[0] + '")';
    if (timer) { clearInterval(timer); timer = null; }
    var fps = reduce ? 0 : (parseFloat(state.speed) || 0);
    if (on && fps > 0) {
      var n = 0;
      timer = setInterval(function () {
        n++;
        el.style.backgroundImage = 'url("' + tiles[n % tiles.length] + '")';
        el.style.backgroundPosition = Math.round(Math.random() * TILE) + 'px ' + Math.round(Math.random() * TILE) + 'px';
      }, 1000 / Math.min(24, fps));
    }
  }

  function load() {
    return fetch(FILE + '?t=' + Date.now()).then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () { return null; }).then(function (j) {
      state = {
        on: j && typeof j.on === 'boolean' ? j.on : DEF.on,
        amount: j && isFinite(j.amount) ? j.amount : DEF.amount,
        size: j && isFinite(j.size) ? j.size : DEF.size,
        speed: j && isFinite(j.speed) ? j.speed : DEF.speed
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

  window.HeroGrain = {
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

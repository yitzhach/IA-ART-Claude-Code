/* hero-timeline.js — timeline editor for the hero rotation set.
   Editor-only (self-gates on the Claude write bridge, same pattern as
   hero-set.js). Reads/writes the SAME state object via window.HeroSet
   (exposed by hero-set.js) — no separate persistence.

   Opened from the "Timeline" button in the hero-set strip below the hero
   (window.HeroTimeline.toggle()); it docks at the bottom of the window,
   already expanded.

   Track = the live rotation sequence only. Each clip's width is proportional
   to its hold and carries a typeable seconds field; the diamond between two
   clips is that transition — typeable seconds too, and a click opens its
   effect + curve. "Loop" in the header retimes the whole set proportionally.
   "Default" resets the selected clip to 5s with a 1.5s cross dissolve.
   Undo / Redo share one history with image drops and reframes (⌘Z).
   Dragging the playhead scrubs the live hero through the real effect.
*/
(function () {
  'use strict';
  if (window.__heroTimelineInstalled) return;
  window.__heroTimelineInstalled = true;
  var editing = !!(window.omelette && typeof window.omelette.writeFile === 'function');
  if (!editing) return;

  var PPS = 36, MIN_W = 72, KF_W = 44;
  var FX_SHORT = {
    dissolve: 'DISS', 'dip-black': 'DIP·B', 'dip-paper': 'DIP·P', blur: 'BLUR',
    push: 'PUSH', wipe: 'WIPE', zoom: 'ZOOM', cut: 'CUT'
  };
  var DEF_HOLD = 5, DEF_FADE = 1.5;
  var dock, panel, track, reel, playheadEl, rulerEl, phLabel, playBtn, shelf, timeLabel, loopInput, defBtn, uBtn, rBtn, histLbl;
  var open = false, dragging = null, layout = [], popover = null, selectedId = null, histTimer = null;
  var playing = false, rafId = null, playT0 = 0, playFrom = 0, curMs = 0, totalMs = 0;

  function mono(size, color) {
    return "font:500 " + size + "px 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:" + color;
  }
  function fmtSec(ms) {
    var s = ms / 1000;
    return (Math.round(s * 100) / 100).toString();
  }
  function numInput(value, min, max, step, w) {
    var i = document.createElement('input');
    i.type = 'number'; i.min = String(min); i.max = String(max); i.step = String(step);
    i.value = String(value);
    i.style.cssText = 'width:' + w + "px;font:500 11px 'IBM Plex Mono',monospace;color:#1B1917;" +
      'background:#F5F3EE;border:1px solid #D6CFC2;padding:4px 5px;text-align:right';
    i.onpointerdown = function (e) { e.stopPropagation(); };
    i.onclick = function (e) { e.stopPropagation(); };
    return i;
  }
  function btn(label, title, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = label; if (title) b.title = title;
    b.style.cssText = mono(9, '#1B1917') + ';background:#F5F3EE;border:1px solid #D6CFC2;padding:6px 12px;cursor:pointer;transition:border-color .2s,color .2s';
    b.onmouseenter = function () { if (!b.disabled) b.style.borderColor = '#5C564C'; };
    b.onmouseleave = function () { if (!b.disabled) b.style.borderColor = '#D6CFC2'; };
    b.onclick = fn;
    return b;
  }

  /* ---------- history (shared with image drops / reframes) ---------- */

  function snap() {
    var s = window.HeroSet.getState();
    return JSON.stringify({ interval: s.interval, manualHold: s.manualHold, items: s.items });
  }
  function restore(json) {
    var o = JSON.parse(json), s = window.HeroSet.getState();
    s.interval = o.interval; s.manualHold = o.manualHold;
    s.items.length = 0;
    o.items.forEach(function (it) { s.items.push(JSON.parse(JSON.stringify(it))); });
    window.HeroSet.markDirty();
    window.HeroSet.rebuildOrder();
    window.HeroSet.paintThumbs();
    if (!window.HeroSet.isPinned()) window.HeroSet.show(0);
    render();
  }
  // Wrap a mutation so it lands in the shared undo stack as one step.
  function edit(label, fn) {
    var before = snap();
    fn();
    var after = snap();
    if (before === after) return;
    window.HeroSet.markDirty();
    if (window.ImageSlots && window.ImageSlots.pushCustom) {
      window.ImageSlots.pushCustom({
        label: label,
        undo: function () { restore(before); },
        redo: function () { restore(after); }
      });
    }
  }
  function paintHist() {
    if (!uBtn || !window.ImageSlots) return;
    var cu = !!window.ImageSlots.canUndo && window.ImageSlots.canUndo();
    var cr = !!window.ImageSlots.canRedo && window.ImageSlots.canRedo();
    [[uBtn, cu], [rBtn, cr]].forEach(function (p) {
      p[0].disabled = !p[1];
      p[0].style.opacity = p[1] ? '1' : '.35';
      p[0].style.cursor = p[1] ? 'pointer' : 'default';
    });
    histLbl.textContent = (cu || cr) ? '' : 'nothing to undo';
  }

  /* ---------- build ---------- */

  function build() {
    dock = document.createElement('div');
    dock.setAttribute('data-editor-only', '');
    dock.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:100000;background:#EDEAE3;border-top:1px solid #1B1917;box-shadow:0 -2px 16px rgba(27,25,23,.16);font-family:Archivo,sans-serif;display:none';

    panel = document.createElement('div');
    panel.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:12px 16px 16px';

    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap';
    var ttl = document.createElement('span');
    ttl.textContent = 'Timeline'; ttl.style.cssText = mono(10, '#1B1917');
    timeLabel = document.createElement('span'); timeLabel.style.cssText = mono(9, '#5C564C');

    var loopWrap = document.createElement('label');
    loopWrap.style.cssText = 'display:flex;align-items:center;gap:6px';
    var loopLbl = document.createElement('span'); loopLbl.textContent = 'Loop'; loopLbl.style.cssText = mono(9, '#5C564C');
    loopInput = numInput(0, 2, 600, 0.5, 62);
    loopInput.title = 'Total length of the loop — retimes every clip proportionally';
    loopInput.onchange = function () { setLoop(parseFloat(loopInput.value)); };
    var loopUnit = document.createElement('span'); loopUnit.textContent = 'sec'; loopUnit.style.cssText = mono(9, '#5C564C');
    loopWrap.appendChild(loopLbl); loopWrap.appendChild(loopInput); loopWrap.appendChild(loopUnit);

    defBtn = btn('Default', 'Reset the selected clip to ' + DEF_HOLD + 's with a ' + DEF_FADE + 's cross dissolve', applyDefault);

    playBtn = btn('\u25B6 Play', 'Play / pause the playhead (Space) \u00b7 starts wherever the playhead sits', togglePlay);
    playBtn.style.minWidth = '76px';

    var grainWrap = buildGrain();

    uBtn = btn('\u21B6 Undo', 'Undo (\u2318Z) — shared with image drops and reframes', function () {
      if (window.ImageSlots && window.ImageSlots.undo) { window.ImageSlots.undo(); paintHist(); }
    });
    rBtn = btn('\u21B7 Redo', 'Redo (\u21E7\u2318Z)', function () {
      if (window.ImageSlots && window.ImageSlots.redo) { window.ImageSlots.redo(); paintHist(); }
    });
    histLbl = document.createElement('span'); histLbl.style.cssText = "font:400 9px 'IBM Plex Mono',monospace;color:#5C564C";

    var sp = document.createElement('span'); sp.style.cssText = 'flex:1';
    var saveBtn = btn('Save set', 'Write the timeline to disk', function () {
      window.HeroSet.paintThumbs();
      if (window.HeroGrain) window.HeroGrain.save();
      if (window.HeroFlare) window.HeroFlare.save();
      if (window.HeroFilm) window.HeroFilm.save();
      window.HeroSet.save().then(function (ok) {
        saveBtn.textContent = ok ? 'Saved' : 'Save failed';
        setTimeout(function () { saveBtn.textContent = 'Save set'; }, 1800);
      });
    });
    var closeBtn = btn('\u2715', 'Close the timeline', close);

    head.appendChild(ttl); head.appendChild(timeLabel);
    head.appendChild(loopWrap); head.appendChild(playBtn); head.appendChild(defBtn);
    head.appendChild(uBtn); head.appendChild(rBtn); head.appendChild(histLbl);
    head.appendChild(sp); head.appendChild(grainWrap); head.appendChild(saveBtn); head.appendChild(closeBtn);

    var hint = document.createElement('span');
    hint.textContent = 'Space plays / pauses \u00b7 click or drag the ruler to scrub \u00b7 \u2190 \u2192 nudge 0.1s (\u21E7 1s), Home rewinds \u00b7 type a clip\u2019s seconds to set its hold \u00b7 type or click a diamond for the dissolve and its effect \u00b7 click a clip to select it, then Default \u00b7 \u25C9 hides an image from rotation without removing it';
    hint.style.cssText = "font:400 10px 'IBM Plex Mono',monospace;color:#5C564C;letter-spacing:.01em";

    track = document.createElement('div');
    track.style.cssText = 'position:relative;height:104px;overflow-x:auto;overflow-y:hidden;background:#F5F3EE;border:1px solid #D6CFC2';
    reel = document.createElement('div');
    reel.style.cssText = 'position:relative;height:100%;display:flex;align-items:stretch;width:max-content';
    track.appendChild(reel);

    playheadEl = document.createElement('div');
    playheadEl.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;background:var(--accent,#A34A24);cursor:ew-resize;z-index:5;left:0';
    var ph = document.createElement('div');
    ph.style.cssText = 'position:absolute;top:-1px;left:-5px;width:12px;height:12px;border-radius:50%;background:var(--accent,#A34A24)';
    phLabel = document.createElement('span');
    phLabel.style.cssText = 'position:absolute;top:-1px;left:9px;padding:1px 3px;background:var(--accent,#A34A24);white-space:nowrap;' + mono(8, '#F5F3EE');
    playheadEl.appendChild(ph); playheadEl.appendChild(phLabel);
    playheadEl.onpointerdown = function (e) { e.preventDefault(); pause(); dragging = { type: 'playhead' }; };

    rulerEl = document.createElement('div');
    rulerEl.style.cssText = 'position:absolute;top:0;left:0;height:18px;background:rgba(245,243,238,.94);border-bottom:1px solid #D6CFC2;cursor:ew-resize;z-index:4;overflow:hidden';
    rulerEl.title = 'Click or drag to move the playhead \u00b7 Space plays from here';
    rulerEl.onpointerdown = function (e) {
      e.preventDefault(); e.stopPropagation();
      pause();
      dragging = { type: 'playhead' };
      var rect = track.getBoundingClientRect();
      scrubTo(msFromPx(e.clientX - rect.left + track.scrollLeft));
    };

    shelf = document.createElement('div');
    shelf.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-height:14px';

    var fxRow = buildFx();

    panel.appendChild(head); panel.appendChild(fxRow); panel.appendChild(hint); panel.appendChild(track); panel.appendChild(shelf);
    dock.appendChild(panel);
    document.body.appendChild(dock);

    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
  }

  function openDock() {
    if (!dock) build();
    open = true;
    dock.style.display = 'block';
    render();
    paintHist();
    if (!histTimer) histTimer = setInterval(function () { if (open) { paintHist(); } }, 600);
  }
  function close() {
    open = false;
    pause();
    if (dock) dock.style.display = 'none';
    closePopover();
    if (histTimer) { clearInterval(histTimer); histTimer = null; }
  }
  function toggle() { if (open) close(); else openDock(); }

  /* ---------- edits ---------- */

  function setLoop(sec) {
    var order = window.HeroSet.getOrder();
    if (!order.length) return;
    var cur = 0;
    order.forEach(function (it) { cur += window.HeroSet.holdFor(it); });
    var want = Math.max(2000, Math.min(600000, (parseFloat(sec) || 0) * 1000));
    if (!cur) return;
    var k = want / cur;
    edit('timeline loop', function () {
      order.forEach(function (it) {
        it.hold = Math.max(1, Math.round(window.HeroSet.holdFor(it) * k / 100) / 10);
      });
    });
    render();
  }

  function applyDefault() {
    var order = window.HeroSet.getOrder();
    var it = null;
    order.forEach(function (o) { if (o.id === selectedId) it = o; });
    if (!it) return;
    edit('clip default', function () {
      it.hold = DEF_HOLD; it.fade = DEF_FADE; it.curve = 'ease';
      it.fx = 'dissolve'; it.wipeDir = null; it.wipeSoft = null;
    });
    render();
  }

  /* ---------- geometry / scrub ---------- */

  function cumulativeStart(idx) {
    var order = window.HeroSet.getOrder(), s = 0;
    for (var i = 0; i < idx; i++) s += window.HeroSet.holdFor(order[i]);
    return s;
  }
  function pxFromMs(ms) {
    if (!layout.length) return 0;
    for (var i = 0; i < layout.length; i++) {
      var seg = layout[i];
      if (ms <= seg.msStart + seg.msLen || i === layout.length - 1) {
        var frac = seg.msLen ? Math.max(0, Math.min(1, (ms - seg.msStart) / seg.msLen)) : 0;
        return seg.xStart + frac * seg.w;
      }
    }
    return 0;
  }
  function msFromPx(px) {
    if (!layout.length) return 0;
    var seg = layout[layout.length - 1];
    for (var i = 0; i < layout.length; i++) {
      if (px <= layout[i].xStart + layout[i].w || i === layout.length - 1) { seg = layout[i]; break; }
    }
    var frac = seg.w ? Math.max(0, Math.min(1, (px - seg.xStart) / seg.w)) : 0;
    return seg.msStart + frac * seg.msLen;
  }

  function scrubTo(ms) {
    if (!layout.length) return;
    var total = layout[layout.length - 1].msStart + layout[layout.length - 1].msLen;
    ms = Math.max(0, Math.min(total, ms));
    var seg = layout[layout.length - 1], idx = layout.length - 1;
    for (var i = 0; i < layout.length; i++) {
      if (ms < layout[i].msStart + layout[i].msLen || i === layout.length - 1) { seg = layout[i]; idx = i; break; }
    }
    var into = ms - seg.msStart;
    var next = layout[idx + 1];
    var fadeMs = window.HeroSet.fadeMsFor(seg.it);
    window.HeroSet.pinNow();
    if (window.ImageMotion) window.ImageMotion.stopAll();
    window.HeroSet.prepare(seg.it);
    var t = 0;
    if (next && into > seg.msLen - fadeMs) {
      window.HeroSet.prepare(next.it);
      t = Math.max(0, Math.min(1, (into - (seg.msLen - fadeMs)) / fadeMs));
    }
    window.HeroSet.blendAt(seg.it, next ? next.it : null, t);
    if (window.ImageMotion) {
      if (seg.it.type !== 'video') window.ImageMotion.applyFrame(seg.it.id, seg.msLen ? into / seg.msLen : 0);
      if (next && t > 0 && next.it.type !== 'video') {
        window.ImageMotion.applyFrame(next.it.id, (t * fadeMs) / (next.msLen + fadeMs));
      }
    }
    curMs = ms;
    paintPlayhead();
  }

  /* ---------- playback ---------- */

  function paintPlayhead(follow) {
    if (!playheadEl) return;
    var x = pxFromMs(curMs);
    playheadEl.style.left = x + 'px';
    if (phLabel) phLabel.textContent = fmtSec(curMs) + 's';
    if (follow && track) {
      var vw = track.clientWidth;
      if (x < track.scrollLeft + 48) track.scrollLeft = Math.max(0, x - 48);
      else if (x > track.scrollLeft + vw - 48) track.scrollLeft = x - vw + 48;
    }
  }

  function tick() {
    if (!playing) return;
    var ms = playFrom + (performance.now() - playT0);
    if (totalMs > 0 && ms >= totalMs) { ms = ms % totalMs; playFrom = ms; playT0 = performance.now(); }
    scrubTo(ms);
    paintPlayhead(true);
    rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (playing || !layout.length) return;
    playing = true;
    if (totalMs > 0 && curMs >= totalMs - 1) curMs = 0;
    playFrom = curMs; playT0 = performance.now();
    if (playBtn) playBtn.textContent = '\u275A\u275A Pause';
    rafId = requestAnimationFrame(tick);
  }
  function pause() {
    if (!playing) return;
    playing = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (playBtn) playBtn.textContent = '\u25B6 Play';
  }
  function togglePlay() { if (playing) pause(); else play(); }

  /* ---------- transition popover ---------- */

  function closePopover() {
    if (popover) { popover.remove(); popover = null; document.removeEventListener('pointerdown', onOutside); }
  }
  function onOutside(e) { if (popover && !popover.contains(e.target)) closePopover(); }

  function row(labelText) {
    var r = document.createElement('label');
    r.style.cssText = 'display:flex;align-items:center;gap:8px;justify-content:space-between';
    var l = document.createElement('span'); l.textContent = labelText; l.style.cssText = mono(9, '#5C564C');
    r.appendChild(l);
    return r;
  }
  function select(options, value, onChange) {
    var s = document.createElement('select');
    s.style.cssText = "font:500 10px 'IBM Plex Mono',monospace;color:#1B1917;background:#F5F3EE;border:1px solid #D6CFC2;padding:5px 6px";
    options.forEach(function (o) {
      var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1];
      if (o[0] === value) op.selected = true;
      s.appendChild(op);
    });
    s.onchange = function () { onChange(s.value); };
    return s;
  }

  function openFxPopover(anchor, it) {
    closePopover();
    popover = document.createElement('div');
    popover.style.cssText = 'position:fixed;z-index:100001;background:#EDEAE3;border:1px solid #1B1917;padding:12px;display:flex;flex-direction:column;gap:9px;min-width:210px;box-shadow:0 4px 14px rgba(27,25,23,.18)';
    var r = anchor.getBoundingClientRect();
    popover.style.left = Math.max(4, Math.min(window.innerWidth - 226, Math.round(r.left - 80))) + 'px';
    popover.style.bottom = (window.innerHeight - r.top + 8) + 'px';

    var fxRow = row('Effect');
    var labels = window.HeroSet.fxLabels;
    var opts = ['dissolve', 'dip-black', 'dip-paper', 'blur', 'push', 'wipe', 'zoom', 'cut']
      .map(function (k) { return [k, labels[k]]; });
    var wipeRow, softRow;
    var fxSel = select(opts, window.HeroSet.fxFor(it), function (v) {
      edit('transition effect', function () { it.fx = v; });
      wipeRow.style.display = v === 'wipe' ? 'flex' : 'none';
      softRow.style.display = v === 'wipe' ? 'flex' : 'none';
      render0();
    });
    fxRow.appendChild(fxSel);

    var durRow = row('Dissolve');
    var inp = numInput(fmtSec(window.HeroSet.fadeMsFor(it)), 0, 6, 0.05, 58);
    inp.onchange = function () {
      var v = Math.min(6, Math.max(0, parseFloat(inp.value) || DEF_FADE));
      inp.value = String(v);
      edit('dissolve length', function () { it.fade = v; });
      render0();
    };
    var u1 = document.createElement('span'); u1.textContent = 'sec'; u1.style.cssText = mono(9, '#5C564C');
    var dwrap = document.createElement('span'); dwrap.style.cssText = 'display:flex;align-items:center;gap:6px';
    dwrap.appendChild(inp); dwrap.appendChild(u1);
    durRow.appendChild(dwrap);

    var curveRow = row('Curve');
    curveRow.appendChild(select([['linear', 'Linear'], ['ease', 'Ease'], ['slow-in', 'Slow-in']], it.curve || 'ease', function (v) {
      edit('transition curve', function () { it.curve = v; });
    }));

    wipeRow = row('Direction');
    wipeRow.appendChild(select([['right', 'Right'], ['left', 'Left'], ['down', 'Down'], ['up', 'Up']], it.wipeDir || 'right', function (v) {
      edit('wipe direction', function () { it.wipeDir = v; });
    }));
    softRow = row('Edge');
    softRow.appendChild(select([['soft', 'Soft'], ['hard', 'Hard']], it.wipeSoft === false ? 'hard' : 'soft', function (v) {
      edit('wipe edge', function () { it.wipeSoft = v === 'hard' ? false : null; });
    }));
    var isWipe = window.HeroSet.fxFor(it) === 'wipe';
    wipeRow.style.display = isWipe ? 'flex' : 'none';
    softRow.style.display = isWipe ? 'flex' : 'none';

    var prev = btn('Preview', 'Play this transition in the hero', function () {
      var order = window.HeroSet.getOrder();
      var i = order.indexOf(it);
      if (i < 0) return;
      window.HeroSet.blendAt(it, order[(i + 1) % order.length], 0);
      setTimeout(function () { window.HeroSet.show(i); setTimeout(function () { window.HeroSet.show(i + 1, true); }, 120); }, 60);
    });
    prev.style.marginTop = '2px';

    popover.appendChild(fxRow); popover.appendChild(durRow); popover.appendChild(curveRow);
    popover.appendChild(wipeRow); popover.appendChild(softRow); popover.appendChild(prev);
    document.body.appendChild(popover);
    setTimeout(function () { document.addEventListener('pointerdown', onOutside); }, 0);
  }

  // Re-render the track without closing an open popover.
  function render0() { render(true); }

  /* ---------- drag ---------- */

  function onDragMove(e) {
    if (!dragging) return;
    if (dragging.type === 'hold') {
      var dx = e.clientX - dragging.startX;
      var v = Math.min(60000, Math.max(1000, dragging.startMs + dx / PPS * 1000));
      dragging.it.hold = Math.round(v / 100) / 10;
      render(true);
    } else if (dragging.type === 'playhead') {
      var rect = track.getBoundingClientRect();
      scrubTo(msFromPx(e.clientX - rect.left + track.scrollLeft));
    }
  }
  function onDragEnd() {
    if (!dragging) return;
    var d = dragging;
    dragging = null;
    if (d.type === 'hold') {
      var final = d.it.hold, it = d.it;
      it.hold = d.origHold;
      edit('clip hold', function () { it.hold = final; });
      window.HeroSet.paintThumbs();
      render();
    }
  }

  /* ---------- render ---------- */

  function render(keepPopover) {
    if (!window.HeroSet || !dock || !open) return;
    if (!keepPopover) closePopover();
    var state = window.HeroSet.getState();
    var order = window.HeroSet.getOrder();
    reel.textContent = '';
    layout = [];
    var runX = 0, runMs = 0;

    order.forEach(function (it, idx) {
      var isVideo = it.type === 'video';
      var holdMs = window.HeroSet.holdFor(it);
      var w = Math.max(MIN_W, Math.round(holdMs / 1000 * PPS));
      layout.push({ it: it, xStart: runX, w: w, msStart: runMs, msLen: holdMs });

      var selected = it.id === selectedId;
      var clip = document.createElement('div');
      clip.style.cssText = 'position:relative;flex:0 0 ' + w + 'px;width:' + w + 'px;height:100%;border-right:1px solid #D6CFC2;background-size:cover;background-position:center;cursor:pointer;box-sizing:border-box;' +
        (selected ? 'outline:2px solid var(--accent,#A34A24);outline-offset:-2px;' : '');
      var url = isVideo ? '' : window.HeroSet.imageURL(it.id);
      if (url) clip.style.backgroundImage = 'url("' + url + '")'; else clip.style.background = '#E3DED2';
      var shade = document.createElement('div');
      shade.style.cssText = 'position:absolute;inset:0;background:linear-gradient(to top,rgba(27,25,23,.62),transparent 58%)';
      clip.appendChild(shade);
      var num = document.createElement('span'); num.textContent = String(idx + 1).padStart(2, '0');
      num.style.cssText = 'position:absolute;top:22px;left:6px;' + mono(9, '#F5F3EE');
      clip.appendChild(num);

      var hold = numInput(fmtSec(holdMs), 1, 600, 0.5, Math.min(52, Math.max(44, w - 24)));
      hold.title = 'Seconds this image is on screen';
      hold.style.cssText += ';position:absolute;bottom:5px;left:6px;background:rgba(245,243,238,.92);border-color:rgba(27,25,23,.25)';
      hold.onchange = function () {
        var v = Math.max(1, Math.min(600, parseFloat(hold.value) || DEF_HOLD));
        edit('clip hold', function () { it.hold = v; });
        window.HeroSet.paintThumbs();
        render();
      };
      clip.appendChild(hold);

      var eye = document.createElement('button');
      eye.type = 'button'; eye.textContent = '\u25C9';
      eye.title = 'Hide from timeline (keeps the image, pulls it out of rotation)';
      eye.style.cssText = 'position:absolute;top:3px;right:3px;width:18px;height:18px;padding:0;border:none;border-radius:50%;background:rgba(27,25,23,.55);color:#F5F3EE;font-size:10px;line-height:18px;cursor:pointer';
      eye.onclick = function (e) {
        e.stopPropagation();
        edit('hide from rotation', function () { it.live = false; });
        window.HeroSet.rebuildOrder(); window.HeroSet.paintThumbs();
        if (!window.HeroSet.isPinned()) window.HeroSet.show(0);
        render();
      };
      clip.appendChild(eye);

      clip.onclick = function () {
        selectedId = it.id;
        scrubTo(cumulativeStart(idx));
        render();
      };
      var handle = document.createElement('div');
      handle.style.cssText = 'position:absolute;top:0;bottom:0;right:-3px;width:6px;cursor:ew-resize;z-index:3';
      handle.onpointerdown = function (e) {
        e.preventDefault(); e.stopPropagation();
        dragging = { type: 'hold', it: it, startX: e.clientX, startMs: holdMs, origHold: it.hold };
      };
      clip.appendChild(handle);
      reel.appendChild(clip);

      runX += w; runMs += holdMs;

      if (idx < order.length - 1) {
        var fadeMs = window.HeroSet.fadeMsFor(it);
        var fx = window.HeroSet.fxFor(it);
        var dia = document.createElement('div');
        dia.style.cssText = 'position:relative;flex:0 0 ' + KF_W + 'px;width:' + KF_W + 'px;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;z-index:4';
        var diamond = document.createElement('div');
        diamond.style.cssText = 'width:11px;height:11px;background:var(--accent,#A34A24);transform:rotate(45deg);border:1px solid #1B1917';
        diamond.onclick = function (e) { e.stopPropagation(); openFxPopover(dia, it); };
        dia.appendChild(diamond);

        var fi = numInput(fmtSec(fadeMs), 0, 6, 0.05, 38);
        fi.title = 'Dissolve length in seconds';
        fi.onchange = function () {
          var v = Math.max(0, Math.min(6, parseFloat(fi.value) || DEF_FADE));
          edit('dissolve length', function () { it.fade = v; });
          render();
        };
        dia.appendChild(fi);

        var fl = document.createElement('span');
        fl.textContent = FX_SHORT[fx] || 'DISS';
        fl.title = window.HeroSet.fxLabels[fx];
        fl.style.cssText = 'max-width:100%;padding:2px 4px;background:#F5F3EE;border:1px solid #D6CFC2;cursor:pointer;' + mono(7, fx === 'dissolve' ? '#5C564C' : 'var(--accent,#A34A24)');
        fl.onclick = function (e) { e.stopPropagation(); openFxPopover(dia, it); };
        dia.appendChild(fl);
        reel.appendChild(dia);
        runX += KF_W;
      }
    });

    totalMs = runMs;
    buildRuler(runX);
    reel.appendChild(rulerEl);
    reel.appendChild(playheadEl);

    shelf.textContent = '';
    var hidden = state.items.filter(function (it) { return !it.live; });
    if (hidden.length) {
      var slbl = document.createElement('span'); slbl.textContent = 'Off timeline:'; slbl.style.cssText = mono(9, '#5C564C');
      shelf.appendChild(slbl);
      hidden.forEach(function (it) {
        var chip = document.createElement('div');
        chip.style.cssText = 'position:relative;width:44px;height:32px;border:1px solid #D6CFC2;background-size:cover;background-position:center;opacity:.55;cursor:pointer';
        var url = it.type === 'video' ? '' : window.HeroSet.imageURL(it.id);
        if (url) chip.style.backgroundImage = 'url("' + url + '")'; else chip.style.background = '#E3DED2';
        var eb = document.createElement('button');
        eb.type = 'button'; eb.textContent = '\u25CE';
        eb.title = 'Bring back into rotation';
        eb.style.cssText = 'position:absolute;inset:0;border:none;background:rgba(27,25,23,.35);color:#F5F3EE;font-size:11px;cursor:pointer';
        eb.onclick = function () {
          edit('back into rotation', function () { it.live = true; });
          window.HeroSet.rebuildOrder(); window.HeroSet.paintThumbs();
          if (!window.HeroSet.isPinned()) window.HeroSet.show(0);
          render();
        };
        chip.appendChild(eb);
        shelf.appendChild(chip);
      });
    }

    var total = runMs;
    timeLabel.textContent = order.length + (order.length === 1 ? ' clip' : ' clips');
    if (document.activeElement !== loopInput) loopInput.value = fmtSec(total);
    defBtn.disabled = !selectedId;
    defBtn.style.opacity = selectedId ? '1' : '.4';
    defBtn.style.cursor = selectedId ? 'pointer' : 'default';
    if (curMs > totalMs) curMs = 0;
    paintPlayhead();
  }

  function buildRuler(widthPx) {
    rulerEl.textContent = '';
    rulerEl.style.width = Math.max(widthPx, 1) + 'px';
    var secs = Math.ceil(totalMs / 1000);
    for (var s = 0; s <= secs; s++) {
      var x = pxFromMs(s * 1000);
      var major = s % 5 === 0;
      var tk = document.createElement('div');
      tk.style.cssText = 'position:absolute;bottom:0;left:' + x + 'px;width:1px;height:' + (major ? 8 : 4) + 'px;background:' + (major ? '#5C564C' : '#D6CFC2');
      rulerEl.appendChild(tk);
      if (major && s > 0) {
        var lb = document.createElement('span');
        lb.textContent = s + 's';
        lb.style.cssText = 'position:absolute;top:1px;left:' + (x + 3) + 'px;' + mono(8, '#5C564C');
        rulerEl.appendChild(lb);
      }
    }
  }

  /* ---------- grain ---------- */

  function buildGrain() {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;padding:0 10px 0 0;border-right:1px solid #D6CFC2;margin-right:4px';
    if (!window.HeroGrain) { wrap.style.display = 'none'; return wrap; }
    var g = window.HeroGrain.get();

    var lbl = document.createElement('label');
    lbl.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer';
    var cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!g.on;
    cb.style.cssText = 'accent-color:var(--accent,#A34A24);cursor:pointer';
    var t = document.createElement('span'); t.textContent = 'Grain'; t.style.cssText = mono(9, '#1B1917');
    lbl.title = 'Film grain over the hero image';
    lbl.appendChild(cb); lbl.appendChild(t);

    var amt = numInput(g.amount, 0, 40, 1, 44);
    amt.title = 'Grain strength (0\u201340)';
    var size = numInput(g.size, 0.5, 3, 0.25, 44);
    size.title = 'Grain size \u2014 1 is fine 35mm, 3 is coarse';
    var spd = numInput(g.speed, 0, 24, 1, 44);
    spd.title = 'Reshuffles per second \u2014 0 holds the grain still';

    function push() {
      window.HeroGrain.set({
        on: cb.checked,
        amount: Math.max(0, Math.min(40, parseFloat(amt.value) || 0)),
        size: Math.max(0.5, Math.min(3, parseFloat(size.value) || 1)),
        speed: Math.max(0, Math.min(24, parseFloat(spd.value) || 0))
      });
    }
    cb.onchange = push; amt.oninput = push; size.oninput = push; spd.oninput = push;

    function tag(text) {
      var s = document.createElement('span'); s.textContent = text; s.style.cssText = mono(8, '#5C564C'); return s;
    }
    wrap.appendChild(lbl);
    wrap.appendChild(tag('amt')); wrap.appendChild(amt);
    wrap.appendChild(tag('size')); wrap.appendChild(size);
    wrap.appendChild(tag('fps')); wrap.appendChild(spd);
    return wrap;
  }

  /* ---------- flare / 16mm row ---------- */

  function fxTag(text) {
    var s = document.createElement('span'); s.textContent = text; s.style.cssText = mono(8, '#5C564C'); return s;
  }
  function fxGroup(name, title) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;padding:0 12px 0 0;border-right:1px solid #D6CFC2;margin-right:6px;flex-wrap:wrap';
    var lbl = document.createElement('label');
    lbl.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer';
    lbl.title = title;
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.style.cssText = 'accent-color:var(--accent,#A34A24);cursor:pointer';
    var t = document.createElement('span'); t.textContent = name; t.style.cssText = mono(9, '#1B1917');
    lbl.appendChild(cb); lbl.appendChild(t);
    wrap.appendChild(lbl);
    wrap.__cb = cb;
    return wrap;
  }

  function buildFx() {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    if (!window.HeroFlare && !window.HeroFilm) { row.style.display = 'none'; return row; }

    if (window.HeroFlare) {
      var f = window.HeroFlare.get();
      var fw = fxGroup('Flare', 'Warm lens flare over the hero image');
      var fi = numInput(f.intensity, 0, 40, 1, 44); fi.title = 'Flare strength (0\u201340) \u2014 low is the point';
      var fx = numInput(f.x, 0, 100, 1, 44); fx.title = 'Flare position across the frame (%)';
      var fy = numInput(f.y, 0, 100, 1, 44); fy.title = 'Flare position down the frame (%)';
      var fd = numInput(f.drift, 0, 120, 1, 48); fd.title = 'Seconds per drift cycle \u2014 0 holds the flare still';
      function pushFlare() {
        window.HeroFlare.set({
          on: fw.__cb.checked,
          intensity: Math.max(0, Math.min(40, parseFloat(fi.value) || 0)),
          x: Math.max(0, Math.min(100, parseFloat(fx.value) || 0)),
          y: Math.max(0, Math.min(100, parseFloat(fy.value) || 0)),
          drift: Math.max(0, Math.min(120, parseFloat(fd.value) || 0))
        });
      }
      fw.__cb.checked = !!f.on;
      fw.__cb.onchange = pushFlare;
      [fi, fx, fy, fd].forEach(function (i) { i.oninput = pushFlare; });
      fw.appendChild(fxTag('amt')); fw.appendChild(fi);
      fw.appendChild(fxTag('x')); fw.appendChild(fx);
      fw.appendChild(fxTag('y')); fw.appendChild(fy);
      fw.appendChild(fxTag('drift')); fw.appendChild(fd);
      row.appendChild(fw);
    }

    if (window.HeroFilm) {
      var m = window.HeroFilm.get();
      var mw = fxGroup('16mm', 'Gate weave, flicker, vignette, halation and dust \u2014 one master intensity, individual amounts');
      mw.style.borderRight = 'none';
      var mi = numInput(m.intensity, 0, 100, 5, 46); mi.title = 'Master intensity \u2014 scales every 16mm effect';
      var mwv = numInput(m.weave, 0, 100, 5, 44); mwv.title = 'Gate weave \u2014 sub-pixel jitter of the image layers';
      var mfl = numInput(m.flicker, 0, 100, 5, 44); mfl.title = 'Flicker \u2014 exposure wobble';
      var mvg = numInput(m.vignette, 0, 100, 5, 44); mvg.title = 'Vignette \u2014 corner falloff';
      var mha = numInput(m.halation, 0, 100, 5, 44); mha.title = 'Halation \u2014 warm bleed off the highlights';
      var mar = numInput(m.artifacts, 0, 100, 5, 44); mar.title = 'Artifacts \u2014 dust, hairs, the odd scratch and splice flash';
      function pushFilm() {
        window.HeroFilm.set({
          on: mw.__cb.checked,
          intensity: Math.max(0, Math.min(100, parseFloat(mi.value) || 0)),
          weave: Math.max(0, Math.min(100, parseFloat(mwv.value) || 0)),
          flicker: Math.max(0, Math.min(100, parseFloat(mfl.value) || 0)),
          vignette: Math.max(0, Math.min(100, parseFloat(mvg.value) || 0)),
          halation: Math.max(0, Math.min(100, parseFloat(mha.value) || 0)),
          artifacts: Math.max(0, Math.min(100, parseFloat(mar.value) || 0))
        });
      }
      mw.__cb.checked = !!m.on;
      mw.__cb.onchange = pushFilm;
      [mi, mwv, mfl, mvg, mha, mar].forEach(function (i) { i.oninput = pushFilm; });
      mw.appendChild(fxTag('master')); mw.appendChild(mi);
      mw.appendChild(fxTag('weave')); mw.appendChild(mwv);
      mw.appendChild(fxTag('flicker')); mw.appendChild(mfl);
      mw.appendChild(fxTag('vign')); mw.appendChild(mvg);
      mw.appendChild(fxTag('halo')); mw.appendChild(mha);
      mw.appendChild(fxTag('dust')); mw.appendChild(mar);
      row.appendChild(mw);
    }
    return row;
  }

  document.addEventListener('keydown', function (e) {
    if (!open) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'Home') { e.preventDefault(); pause(); scrubTo(0); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); pause(); scrubTo(curMs - (e.shiftKey ? 1000 : 100)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); pause(); scrubTo(curMs + (e.shiftKey ? 1000 : 100)); }
  });

  window.HeroTimeline = {
    open: openDock,
    close: close,
    toggle: toggle,
    play: play,
    pause: pause,
    isOpen: function () { return open; },
    // One-way sync from the live hero rotation (the upper playback bar) so the
    // dock's playhead tracks real playback when it isn't itself scrubbing/playing.
    syncLive: function (info) {
      if (!open || playing || dragging || info.pinned) return;
      var order = window.HeroSet.getOrder();
      if (!order.length || info.idx < 0 || info.idx >= order.length || !layout.length) return;
      curMs = cumulativeStart(info.idx) + info.elapsedMs;
      paintPlayhead(true);
    }
  };

  function ready(fn) {
    document.addEventListener('herosetready', fn);
    if (window.HeroSet && window.HeroSet.getState()) fn();
  }
  ready(function () { if (!dock) build(); });
})();

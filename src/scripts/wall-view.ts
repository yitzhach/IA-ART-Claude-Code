/**
 * "View on your wall" — draws a work at true scale in a sample room or on the visitor's own
 * photo. Everything happens in the browser; the photo never leaves the device.
 */
interface Opts {
  src: string;
  title: string;
  widthIn: number;
  heightIn: number;
}

const SOFA_IN = { w: 84, h: 34 }; // a typical three-seat sofa
const SAMPLE = { w: 1500, h: 1300, floor: 120, wallWidthIn: 150 }; // canvas px; wall shows 150 in (12.5 ft)

export function init(root: HTMLDialogElement, opts: Opts) {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-wall-canvas]')!;
  const ctx = canvas.getContext('2d')!;
  const modeBtns = root.querySelectorAll<HTMLButtonElement>('[data-wall-mode]');
  const photoCtl = root.querySelector<HTMLElement>('[data-wall-photo-controls]')!;
  const fileInput = root.querySelector<HTMLInputElement>('[data-wall-file]')!;
  const widthInput = root.querySelector<HTMLInputElement>('[data-wall-width]')!;
  const widthOut = root.querySelector<HTMLOutputElement>('[data-wall-width-out]')!;
  const hint = root.querySelector<HTMLElement>('[data-wall-hint]')!;
  const saveBtn = root.querySelector<HTMLButtonElement>('[data-wall-save]')!;

  const art = new Image();
  art.src = opts.src;

  let mode: 'sample' | 'photo' = 'sample';
  let photo: ImageBitmap | HTMLImageElement | null = null;
  /** Artwork centre in canvas pixels. */
  let pos = { x: 0, y: 0 };

  const pxPerIn = () =>
    mode === 'sample' ? SAMPLE.w / SAMPLE.wallWidthIn : canvas.width / (Number(widthInput.value) * 12);

  function resetPosition() {
    const s = pxPerIn();
    if (mode === 'sample') {
      // Hang it centred over the sofa, bottom edge 10 in above the sofa back.
      const bottom = SAMPLE.h - SAMPLE.floor - (SOFA_IN.h + 10) * s;
      pos = { x: SAMPLE.w / 2, y: Math.max((opts.heightIn * s) / 2 + 12, bottom - (opts.heightIn * s) / 2) };
    } else {
      pos = { x: canvas.width / 2, y: canvas.height * 0.42 };
    }
  }

  function drawRoom() {
    const { w, h, floor } = SAMPLE;
    const wallH = h - floor;
    const wall = ctx.createLinearGradient(0, 0, 0, wallH);
    wall.addColorStop(0, '#efebe4');
    wall.addColorStop(1, '#e2dbcf');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, wallH);
    // Soft light falloff from the left.
    const light = ctx.createLinearGradient(0, 0, w, 0);
    light.addColorStop(0, 'rgba(255,255,255,0.35)');
    light.addColorStop(0.6, 'rgba(255,255,255,0)');
    light.addColorStop(1, 'rgba(60,50,40,0.08)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, w, wallH);
    // Skirting and oak floor.
    ctx.fillStyle = '#d9d1c3';
    ctx.fillRect(0, wallH - 10, w, 10);
    const oak = ctx.createLinearGradient(0, wallH, 0, h);
    oak.addColorStop(0, '#b08d68');
    oak.addColorStop(1, '#8c6a4a');
    ctx.fillStyle = oak;
    ctx.fillRect(0, wallH, w, floor);

    // Sofa at true scale.
    const s = pxPerIn();
    const sw = SOFA_IN.w * s;
    const sh = SOFA_IN.h * s;
    const sx = (w - sw) / 2;
    const sy = wallH - sh;
    ctx.save();
    ctx.shadowColor = 'rgba(40,30,20,0.25)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#cdc4b4';
    roundRect(sx, sy + sh * 0.18, sw, sh * 0.62, 18); // back
    ctx.restore();
    ctx.fillStyle = '#d8d0c1';
    roundRect(sx + sw * 0.06, sy + sh * 0.5, sw * 0.88, sh * 0.32, 12); // seat
    ctx.fillStyle = '#c4baa8';
    roundRect(sx - 6, sy + sh * 0.32, sw * 0.09, sh * 0.6, 14); // arms
    roundRect(sx + sw * 0.91 + 6, sy + sh * 0.32, sw * 0.09, sh * 0.6, 14);
    ctx.fillStyle = '#6f5a44';
    ctx.fillRect(sx + sw * 0.05, sy + sh * 0.92, 10, sh * 0.08); // legs
    ctx.fillRect(sx + sw * 0.95 - 10, sy + sh * 0.92, 10, sh * 0.08);

    ctx.fillStyle = 'rgba(27,25,23,0.45)';
    ctx.font = '500 22px "IBM Plex Mono", monospace';
    ctx.fillText('Sofa shown 84 in wide for scale', 28, h - 34);
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (mode === 'sample') drawRoom();
    else if (photo) ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
    else {
      ctx.fillStyle = '#e8e3da';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (!art.complete || !art.naturalWidth || (mode === 'photo' && !photo)) return;
    const s = pxPerIn();
    const w = opts.widthIn * s;
    const h = opts.heightIn * s;
    const x = pos.x - w / 2;
    const y = pos.y - h / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(20,15,10,0.42)';
    ctx.shadowBlur = Math.max(12, 1.6 * s);
    ctx.shadowOffsetX = 0.3 * s;
    ctx.shadowOffsetY = 0.9 * s;
    ctx.drawImage(art, x, y, w, h);
    ctx.restore();
  }

  function setMode(next: typeof mode) {
    mode = next;
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wallMode === mode)));
    photoCtl.hidden = mode !== 'photo';
    if (mode === 'sample') {
      canvas.width = SAMPLE.w;
      canvas.height = SAMPLE.h;
      hint.textContent = `${opts.title} at true size: ${opts.widthIn} × ${opts.heightIn} in. Drag to move it.`;
    } else if (photo) {
      fitToPhoto(photo);
      hint.textContent = 'Set how wide the wall in your photo is, then drag the piece into place.';
    } else {
      canvas.width = SAMPLE.w;
      canvas.height = SAMPLE.h;
      hint.textContent = 'Take or choose a photo of your wall, standing straight on.';
    }
    resetPosition();
    draw();
  }

  // ---- photo ----
  function fitToPhoto(p: ImageBitmap | HTMLImageElement) {
    canvas.width = Math.min(2000, p.width);
    canvas.height = Math.round(canvas.width / (p.width / p.height));
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      photo = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await img.decode();
      photo = img;
    }
    fitToPhoto(photo);
    hint.textContent = 'Set how wide the wall in your photo is, then drag the piece into place.';
    resetPosition();
    draw();
  });
  widthInput.addEventListener('input', () => {
    widthOut.value = `${widthInput.value} ft`;
    draw();
  });

  // ---- drag ----
  let drag: { dx: number; dy: number } | null = null;
  const toCanvas = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
  };
  canvas.addEventListener('pointerdown', (e) => {
    const p = toCanvas(e);
    drag = { dx: p.x - pos.x, dy: p.y - pos.y };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toCanvas(e);
    pos = { x: p.x - drag.dx, y: p.y - drag.dy };
    draw();
  });
  const end = () => (drag = null);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    pos = { x: pos.x + m[0], y: pos.y + m[1] };
    draw();
  });

  // ---- save / share ----
  saveBtn.addEventListener('click', () => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const name = `${opts.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-on-the-wall.jpg`;
        const file = new File([blob], name, { type: 'image/jpeg' });
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: `${opts.title} — Isaac Anderson` });
            return;
          } catch {
            /* cancelled — fall back to download */
          }
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      },
      'image/jpeg',
      0.9,
    );
  });

  modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.wallMode as typeof mode)));
  art.addEventListener('load', draw);
  setMode('sample');
}

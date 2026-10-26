/* ---------------------------------------------------------------------------
   Passport Photo (6 copies)
   Upload ONE picture. The tool turns it into a passport photo (default 3.5 x 4.5 cm = 413 x 531 px),
   can change the background (white / blue / dark blue / green / red / grey / any colour) and fills a
   4 x 6 inch (4R) sheet - or 5R / A4 - with 6 copies (you can pick 1-20). Print it or download the sheet as JPG.

   Background change has two methods:
     - "Plain background"  : works offline. Finds the colour around the edges of the picture and removes it.
                             Best for photos taken in front of a plain wall / curtain.
     - "AI cut-out"        : needs internet (first use downloads about 40 MB, then the browser keeps it).
                             Works with any background. Uses the free @imgly/background-removal library.

   Same pattern as report-cnic.js:  window.REPORTS.photo = { addImage(file), init() }
--------------------------------------------------------------------------- */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const DPI = 300, MMPX = DPI / 25.4;                       // 300 dpi -> 35 x 45 mm = 413 x 531 px
  const pxOf = mm => Math.round(mm * MMPX);
  const AI_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm';

  const SIZES = {
    '35x45': { label: '3.5 x 4.5 cm  (passport, 413 x 531 px)', w: 35, h: 45 },
    '51x51': { label: '2 x 2 inch  (51 x 51 mm)', w: 50.8, h: 50.8 },
    '30x40': { label: '3 x 4 cm', w: 30, h: 40 },
    '25x35': { label: '2.5 x 3.5 cm', w: 25, h: 35 },
    '40x60': { label: '4 x 6 cm', w: 40, h: 60 },
    custom:  { label: 'Custom size (mm)', w: 35, h: 45 }
  };
  const PAPERS = {                                           // m = unprintable edge margin kept free (mm)
    r4: { label: '4 x 6 inch (4R)', w: 101.6, h: 152.4, m: 3 },
    r5: { label: '5 x 7 inch (5R)', w: 127, h: 177.8, m: 3 },
    a4: { label: 'A4', w: 210, h: 297, m: 6 }
  };
  const COLORS = { white: ['White', '#ffffff'], blue: ['Blue', '#438edb'], navy: ['Dark blue', '#1f4f9c'], green: ['Green', '#2e9e5b'], red: ['Red', '#d62828'], grey: ['Grey', '#c9ccd1'] };

  const S = { img: null, url: '', file: null, fname: '', rot: 0, zoom: 1, ox: 0, oy: 0, bg: 'original', custom: '#438edb', method: 'key', tol: 45, cut: null, aiCut: null, busy: false, token: 0 };
  const O = { size: '35x45', cw: 35, ch: 45, paper: 'r4', orient: 'auto', copies: 6, gap: 2, guides: true, name: '' };
  let PC = null;                                             // the one photo canvas (also what the user sees and drags)

  /* ---------- where every photo sits on the sheet (mm). Pure function, shared by preview / print / download ---------- */
  function layout(o) {
    const P = PAPERS[o.paper], m = P.m, pw = o.cw, ph = o.ch, gap = o.gap;
    const fit = (W, H, land) => {
      const cols = Math.max(0, Math.floor((W - 2 * m + gap) / (pw + gap))), rows = Math.max(0, Math.floor((H - 2 * m + gap) / (ph + gap)));
      return { W, H, cols, rows, cap: cols * rows, orient: land ? 'landscape' : 'portrait' };
    };
    const A = fit(P.w, P.h, false), B = fit(P.h, P.w, true);
    const pick = o.orient === 'portrait' ? A : o.orient === 'landscape' ? B
      : (A.cap >= o.copies ? A : B.cap >= o.copies ? B : (A.cap >= B.cap ? A : B));
    const n = Math.min(o.copies, pick.cap);
    if (!n) return { W: pick.W, H: pick.H, n: 0, cols: 0, rows: 0, cap: pick.cap, x0: 0, y0: 0, orient: pick.orient, pw, ph, gap };
    const rows = Math.ceil(n / pick.cols), cols = Math.ceil(n / rows);          // fewest empty cells, e.g. 6 on A4 = 3 x 2
    const bw = cols * pw + (cols - 1) * gap, bh = rows * ph + (rows - 1) * gap;
    return { W: pick.W, H: pick.H, n, cols, rows, cap: pick.cap, x0: (pick.W - bw) / 2, y0: (pick.H - bh) / 2, orient: pick.orient, pw, ph, gap };
  }

  /* ---------- simple background removal: flood-fill from the picture edges with the edge colour ---------- */
  function minF(a, w, h) {                                   // 3x3 minimum = shrinks the person by 1 px, removes the light halo
    const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 255; for (let d = -1; d <= 1; d++) { const xx = x + d; if (xx >= 0 && xx < w) { const q = a[y * w + xx]; if (q < v) v = q; } } t[y * w + x] = v; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 255; for (let d = -1; d <= 1; d++) { const yy = y + d; if (yy >= 0 && yy < h) { const q = t[yy * w + x]; if (q < v) v = q; } } o[y * w + x] = v; }
    return o;
  }
  function blurF(a, w, h) {                                  // 3x3 average = soft edge
    const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let d = -1; d <= 1; d++) { const xx = x + d; if (xx >= 0 && xx < w) { s += a[y * w + xx]; c++; } } t[y * w + x] = s / c; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let d = -1; d <= 1; d++) { const yy = y + d; if (yy >= 0 && yy < h) { s += t[yy * w + x]; c++; } } o[y * w + x] = s / c; }
    return o;
  }
  function keyData(id, tol) {                                // id = ImageData-like {width,height,data}; writes the alpha channel
    const w = id.width, h = id.height, p = id.data, N = w * h;
    const rs = [], gs = [], bs = [];
    const take = (x, y) => { const i = (y * w + x) * 4; rs.push(p[i]); gs.push(p[i + 1]); bs.push(p[i + 2]); };
    for (let x = 0; x < w; x += 3) { take(x, 0); take(x, h - 1); }
    for (let y = 0; y < h; y += 3) { take(0, y); take(w - 1, y); }
    const med = a => { a.sort((u, v) => u - v); return a[a.length >> 1]; };
    const br = med(rs), bg = med(gs), bb = med(bs);
    const hi = tol, lo = tol * 0.55;
    const dist = i => { const dr = p[i] - br, dg = p[i + 1] - bg, db = p[i + 2] - bb; return Math.sqrt(dr * dr + dg * dg + db * db); };
    const vis = new Uint8Array(N), q = new Int32Array(N); let qh = 0, qt = 0;
    const push = n => { if (vis[n] || dist(n * 4) >= hi) return; vis[n] = 1; q[qt++] = n; };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (qh < qt) {
      const n = q[qh++], x = n % w, y = (n / w) | 0;
      if (x > 0) push(n - 1); if (x < w - 1) push(n + 1); if (y > 0) push(n - w); if (y < h - 1) push(n + w);
    }
    let a = new Uint8Array(N).fill(255);
    for (let n = 0; n < N; n++) {
      if (!vis[n]) continue;
      const i = n * 4, t = clamp((dist(i) - lo) / (hi - lo), 0, 1);
      a[n] = Math.round(t * 255);
      if (t > 0 && t < 1) {                                  // take the old background colour out of the semi-transparent edge
        p[i] = clamp((p[i] - br * (1 - t)) / t, 0, 255); p[i + 1] = clamp((p[i + 1] - bg * (1 - t)) / t, 0, 255); p[i + 2] = clamp((p[i + 2] - bb * (1 - t)) / t, 0, 255);
      }
    }
    a = blurF(minF(a, w, h), w, h);
    for (let n = 0; n < N; n++) p[n * 4 + 3] = a[n];
    return id;
  }
  function keyCutout(img, tol) {
    const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height, k = Math.min(1, 1400 / Math.max(nw, nh));
    const w = Math.round(nw * k), h = Math.round(nh * k), c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
    x.putImageData(keyData(x.getImageData(0, 0, w, h), tol), 0, 0);
    return c;
  }

  /* ---------- drawing ---------- */
  const bgColor = () => S.bg === 'custom' ? S.custom : (COLORS[S.bg] ? COLORS[S.bg][1] : '#ffffff');
  function drawPhoto(ctx, W, H) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = S.bg === 'original' ? '#ffffff' : bgColor(); ctx.fillRect(0, 0, W, H);
    if (!S.img) {
      ctx.fillStyle = '#eef0f7'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#8a90ad';
      ctx.font = Math.round(W / 14) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Upload a photo', W / 2, H / 2); return;
    }
    const im = (S.bg !== 'original' && S.cut) ? S.cut : S.img;
    const nw = S.img.naturalWidth, nh = S.img.naturalHeight, odd = S.rot % 180 !== 0;
    const rw = odd ? nh : nw, rh = odd ? nw : nh, s = Math.max(W / rw, H / rh) * S.zoom;   // "cover" fit, then zoom
    ctx.save(); ctx.translate(W / 2 + S.ox * W, H / 2 + S.oy * H); ctx.rotate(S.rot * Math.PI / 180); ctx.scale(s, s);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(im, -nw / 2, -nh / 2, nw, nh); ctx.restore();
  }
  function renderSheet(cv, dpi) {
    const L = layout(O), k = dpi / 25.4;
    cv.width = Math.round(L.W * k); cv.height = Math.round(L.H * k);
    const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    const w = Math.round(L.pw * k), h = Math.round(L.ph * k), lw = Math.max(1, Math.round(k * 0.2));
    for (let i = 0; i < L.n; i++) {
      const px = Math.round((L.x0 + (i % L.cols) * (L.pw + L.gap)) * k), py = Math.round((L.y0 + Math.floor(i / L.cols) * (L.ph + L.gap)) * k);
      x.drawImage(PC, px, py, w, h);
      if (O.guides) { x.strokeStyle = '#9aa0b4'; x.lineWidth = lw; x.strokeRect(px - lw / 2, py - lw / 2, w + lw, h + lw); }   // thin cutting line just outside the photo
    }
    return L;
  }
  function setJpegDpi(u8, dpi) {                             // tell the JPEG it is 300 dpi so "print actual size" is exact
    if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF && u8[3] === 0xE0 && u8[6] === 0x4A && u8[7] === 0x46) { u8[13] = 1; u8[14] = dpi >> 8; u8[15] = dpi & 255; u8[16] = dpi >> 8; u8[17] = dpi & 255; }
    return u8;
  }
  async function sheetJpeg() {
    const cv = document.createElement('canvas'); renderSheet(cv, DPI);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.95));
    return new Blob([setJpegDpi(new Uint8Array(await blob.arrayBuffer()), DPI)], { type: 'image/jpeg' });
  }
  const fileTag = () => { const nm = (O.name || '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_'); return nm ? '_' + nm : ''; };
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

  async function printSheet() {
    const L = layout(O), url = URL.createObjectURL(await sheetJpeg());
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Passport photos</title><style>
      @page{size:${L.W}mm ${L.H}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .pg{position:relative;width:${L.W}mm;height:${(L.H - 0.4).toFixed(1)}mm;overflow:hidden}img{display:block;width:${L.W}mm;height:${L.H}mm}</style></head><body><div class="pg"><img src="${url}"></div></body></html>`;
    document.querySelectorAll('iframe.photoPrint').forEach(f => f.remove());
    const fr = document.createElement('iframe'); fr.className = 'photoPrint';
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(fr);
    await new Promise(res => { fr.onload = res; fr.srcdoc = html; });
    await Promise.all([...fr.contentDocument.images].map(i => i.decode ? i.decode().catch(() => { }) : 0));
    fr.contentWindow.focus(); fr.contentWindow.print();
  }

  /* ---------- background ---------- */
  function setStatus(t, bad) { const e = $('phStatus'); if (!e) return; e.textContent = t || ''; e.style.display = t ? '' : 'none'; e.style.color = bad ? 'var(--bad)' : ''; }
  function swatches() {
    document.querySelectorAll('#panel_photo [data-bg]').forEach(b => b.classList.toggle('on', b.dataset.bg === S.bg));
    const t = $('phTolWrap'); if (t) t.style.display = S.method === 'key' && S.bg !== 'original' ? '' : 'none';
    const m = $('phMethodWrap'); if (m) m.style.display = S.bg !== 'original' ? '' : 'none';
  }
  function buildKey() {
    if (!S.img) return;
    try { S.cut = keyCutout(S.img, S.tol); setStatus('Background replaced by colour match. If part of the person disappears or some old background stays, move the Sensitivity slider (or switch to AI cut-out).'); }
    catch (e) { console.error(e); S.cut = null; setStatus('Could not change the background: ' + e.message, true); }
    redraw();
  }
  async function runAI() {
    if (!S.img) return;
    if (S.aiCut) { S.cut = S.aiCut; setStatus('AI cut-out ready.'); redraw(); return; }
    if (S.busy) return;
    S.busy = true; const tk = S.token;
    setStatus('Loading the AI model (first time only, about 40 MB). Please wait...');
    try {
      const mod = await import(AI_URL), fn = mod.removeBackground || mod.default;
      const blob = await fn(S.file, { output: { format: 'image/png' }, progress: (key, cur, tot) => { if (tk === S.token && tot) setStatus('Working... ' + Math.round(cur / tot * 100) + '%  (' + String(key).replace(/^fetch:/, 'downloading ') + ')'); } });
      if (tk !== S.token) return;
      const im = new Image(); im.src = URL.createObjectURL(blob); await im.decode();
      S.aiCut = im; S.cut = im; setStatus('AI cut-out ready. You can now try other colours instantly.'); redraw();
    } catch (e) {
      console.error(e);
      if (tk === S.token) { S.method = 'key'; const sel = $('phMethod'); if (sel) sel.value = 'key'; swatches(); buildKey(); setStatus('AI cut-out could not load (' + (e && e.message || e) + '). It needs an internet connection. Colour match is used instead.', true); }
    } finally { S.busy = false; }
  }
  function applyBg() {
    swatches();
    if (!S.img || S.bg === 'original') { setStatus(''); redraw(); return; }
    if (S.method === 'ai') runAI(); else buildKey();
  }

  /* ---------- screen ---------- */
  let raf = 0;
  function redraw() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
  function paint() {
    if (!PC) return;
    const pw = pxOf(O.cw), ph = pxOf(O.ch);
    if (PC.width !== pw || PC.height !== ph) { PC.width = pw; PC.height = ph; }
    drawPhoto(PC.getContext('2d'), pw, ph);
    const sh = $('phSheet'); if (!sh) return;
    const L = renderSheet(sh, 100), P = PAPERS[O.paper];
    let t = `${L.n} photo${L.n === 1 ? '' : 's'} on ${P.label}, ${L.orient}. Each photo ${pw} x ${ph} px.`;
    if (L.n < O.copies) t += ` Only ${L.n} of ${O.copies} fit on one page - use a bigger paper or a smaller gap.`;
    $('phInfo').textContent = t;
    const ok = !!S.img && L.n > 0;
    ['phDl', 'phPrint', 'phOne'].forEach(id => { const b = $(id); if (b) b.disabled = !ok; });
  }
  function fillSelect(id, obj, cur) { $(id).innerHTML = Object.keys(obj).map(k => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(obj[k].label)}</option>`).join(''); }

  (window.REPORTS = window.REPORTS || {}).photo = {
    label: 'Passport Photo', sub: 'Upload 1 photo → 6 copies', input: 'image', own: true, alwaysOn: true,
    async addImage(file) {                                   // called with the picture the user dropped / chose
      const msg = $('phMsg'); if (msg) msg.textContent = '';
      try {
        const url = URL.createObjectURL(file), im = new Image(); im.src = url; await im.decode();
        if (S.url) URL.revokeObjectURL(S.url);
        S.token++; S.url = url; S.img = im; S.file = file; S.fname = file.name; S.rot = 0; S.zoom = 1; S.ox = 0; S.oy = 0; S.cut = null; S.aiCut = null;
        const z = $('phZoom'); if (z) z.value = 1;
        const f = $('phFile'); if (f) f.textContent = file.name + '  (' + im.naturalWidth + ' x ' + im.naturalHeight + ' px)';
        applyBg(); redraw();
      } catch (e) { console.error(e); if (msg) msg.textContent = 'Could not open this picture: ' + e.message; }
    },
    init() {
      const host = $('result'); if (!host) return;
      const pn = document.createElement('div'); pn.id = 'panel_photo'; pn.className = 'ownpanel'; pn.hidden = true;
      pn.innerHTML = `<div class="bar"><b>Passport Photo</b> <span class="mu">Upload one picture. You get a sheet with the same photo repeated, ready to print. Drag the photo to move it, use the slider (or mouse wheel) to zoom.</span></div>
      <div class="phgrid">
        <div class="card">
          <h4>1. Photo</h4>
          <div id="phSlot" class="ph-slot"></div>
          <div class="bar"><button data-ph="rotl">⟲ Rotate left</button><button data-ph="rotr">Rotate right ⟳</button><button data-ph="reset">Reset</button></div>
          <label class="ph-rng">Zoom <input type="range" id="phZoom" min="0.5" max="3" step="0.01" value="1"></label>
          <div class="mu" id="phFile" style="font-size:12px;word-break:break-all"></div>
        </div>
        <div class="card">
          <h4>2. Background</h4>
          <div class="ph-sw">
            <button data-bg="original" class="on"><i class="dot orig"></i>Original</button>
            ${Object.keys(COLORS).map(k => `<button data-bg="${k}"><i class="dot" style="background:${COLORS[k][1]}"></i>${COLORS[k][0]}</button>`).join('')}
            <button data-bg="custom"><i class="dot" id="phDot" style="background:${S.custom}"></i>Custom</button>
          </div>
          <label class="ph-row">Custom colour <input type="color" id="phCustom" value="${S.custom}"></label>
          <label class="ph-row" id="phMethodWrap" style="display:none">Cut-out method
            <select id="phMethod"><option value="key">Plain background (offline)</option><option value="ai">AI cut-out (internet, any background)</option></select></label>
          <label class="ph-row" id="phTolWrap" style="display:none">Sensitivity <input type="range" id="phTol" min="10" max="120" step="1" value="${S.tol}"></label>
          <div id="phStatus" class="note" style="display:none"></div>
        </div>
        <div class="card">
          <h4>3. Sheet</h4>
          <div class="ph-form">
            <label>Photo size <select id="phSize"></select></label>
            <span id="phCustomSize" style="display:none"><label>Width mm <input type="number" id="phW" value="35" min="15" max="120" step="0.5"></label> <label>Height mm <input type="number" id="phH" value="45" min="15" max="150" step="0.5"></label></span>
            <label>Paper <select id="phPaper"></select></label>
            <label>Direction <select id="phOrient"><option value="auto">Auto</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
            <label>Copies <select id="phCopies">${[1, 2, 3, 4, 6, 8, 9, 10, 12, 16, 20].map(n => `<option${n === O.copies ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
            <label>Gap (mm) <input type="number" id="phGap" value="${O.gap}" min="0" max="20" step="0.5"></label>
            <label class="ph-chk"><input type="checkbox" id="phGuides" checked> Thin cutting lines</label>
          </div>
          <canvas id="phSheet" class="ph-sheet"></canvas>
          <div class="mu" id="phInfo" style="font-size:12px"></div>
          <div class="bar"><button class="p" id="phDl" disabled>Download sheet (JPG)</button><button class="p" id="phPrint" disabled>Print</button><button id="phOne" disabled>Single photo (PNG)</button></div>
          <label class="ph-row">File name (optional) <input type="search" id="phName" placeholder="Person name"></label>
        </div>
      </div>
      <div id="phMsg" style="color:var(--bad);font-weight:600"></div>`;
      host.appendChild(pn);
      fillSelect('phSize', SIZES, O.size); fillSelect('phPaper', PAPERS, O.paper);
      PC = document.createElement('canvas'); PC.className = 'ph-photo'; $('phSlot').appendChild(PC);

      /* drag to move, wheel to zoom */
      let drag = null; PC.style.touchAction = 'none';
      PC.addEventListener('pointerdown', e => { if (!S.img) return; drag = { x: e.clientX, y: e.clientY }; PC.setPointerCapture(e.pointerId); PC.classList.add('drag'); });
      PC.addEventListener('pointermove', e => { if (!drag) return; const r = PC.getBoundingClientRect(); S.ox += (e.clientX - drag.x) / r.width; S.oy += (e.clientY - drag.y) / r.height; drag.x = e.clientX; drag.y = e.clientY; redraw(); });
      ['pointerup', 'pointercancel'].forEach(t => PC.addEventListener(t, () => { drag = null; PC.classList.remove('drag'); }));
      PC.addEventListener('wheel', e => { if (!S.img) return; e.preventDefault(); S.zoom = clamp(S.zoom * (e.deltaY < 0 ? 1.05 : 0.95), 0.5, 3); $('phZoom').value = S.zoom; redraw(); }, { passive: false });

      pn.addEventListener('click', async e => {
        const ph = e.target.closest('[data-ph]'), bg = e.target.closest('[data-bg]');
        if (ph) { const a = ph.dataset.ph; if (a === 'rotl') S.rot = (S.rot + 270) % 360; else if (a === 'rotr') S.rot = (S.rot + 90) % 360; else { S.rot = 0; S.zoom = 1; S.ox = 0; S.oy = 0; $('phZoom').value = 1; } redraw(); }
        else if (bg) { S.bg = bg.dataset.bg; applyBg(); }
        else if (e.target.id === 'phDl') { try { $('phMsg').textContent = ''; save(await sheetJpeg(), 'Passport_Photos_' + layout(O).n + 'x_' + O.paper.toUpperCase() + fileTag() + '.jpg'); } catch (err) { console.error(err); $('phMsg').textContent = 'Could not make the sheet: ' + err.message; } }
        else if (e.target.id === 'phPrint') { try { $('phMsg').textContent = ''; await printSheet(); } catch (err) { console.error(err); $('phMsg').textContent = 'Could not print: ' + err.message; } }
        else if (e.target.id === 'phOne') { PC.toBlob(b => save(b, 'Passport_Photo_' + pxOf(O.cw) + 'x' + pxOf(O.ch) + fileTag() + '.png'), 'image/png'); }
      });
      $('phZoom').oninput = e => { S.zoom = +e.target.value; redraw(); };
      $('phCustom').oninput = e => { S.custom = e.target.value; $('phDot').style.background = S.custom; S.bg = 'custom'; swatches(); redraw(); if (S.img && !S.cut) applyBg(); };
      $('phMethod').onchange = e => { S.method = e.target.value; applyBg(); };
      let tt = 0; $('phTol').oninput = e => { S.tol = +e.target.value; clearTimeout(tt); tt = setTimeout(buildKey, 120); };
      $('phSize').onchange = e => { O.size = e.target.value; const z = SIZES[O.size]; if (O.size !== 'custom') { O.cw = z.w; O.ch = z.h; } $('phCustomSize').style.display = O.size === 'custom' ? '' : 'none'; redraw(); };
      const num = (id, k, lo, hi) => $(id).oninput = e => { const v = parseFloat(e.target.value); if (isFinite(v)) { O[k] = clamp(v, lo, hi); redraw(); } };
      num('phW', 'cw', 15, 120); num('phH', 'ch', 15, 150); num('phGap', 'gap', 0, 20);
      $('phPaper').onchange = e => { O.paper = e.target.value; redraw(); };
      $('phOrient').onchange = e => { O.orient = e.target.value; redraw(); };
      $('phCopies').onchange = e => { O.copies = +e.target.value; redraw(); };
      $('phGuides').onchange = e => { O.guides = e.target.checked; redraw(); };
      $('phName').oninput = e => { O.name = e.target.value; };
      swatches(); paint();
    },
    render() { redraw(); },
    _test: { layout, keyData, setJpegDpi, pxOf, S, O, PAPERS, SIZES }
  };
})();

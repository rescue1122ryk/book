/* ---------------------------------------------------------------------------
   Passport size 6X4
   Upload ONE picture. You get a 6 x 4 inch (4R, 1800 x 1200 px at 300 dpi) sheet with the photo repeated
   (35 x 45 mm = 413 x 531 px, 4 x 2 = 8 copies, same as the sample). Background can be changed (white / blue / any colour).
   Download JPG / PNG / PDF or print. Nothing leaves your computer.
--------------------------------------------------------------------------- */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PW = 1800, PH = 1200;                         // 6 x 4 inch at 300 dpi
  const SIZES = { p35: ['35 x 45 mm (413 x 531 px)  Passport', 413, 531], sq2: ['2 x 2 inch (600 x 600 px)  US visa', 600, 600], p40: ['40 x 60 mm (472 x 709 px)', 472, 709], cust: ['Custom size (px)', 413, 531] };
  const BGS = [['orig', 'Original', null], ['none', 'Remove background', null], ['#ffffff', 'White', '#ffffff'], ['#8fbfe8', 'Blue', '#8fbfe8'], ['#2a5db0', 'Dark blue', '#2a5db0'], ['#d9d9d9', 'Grey', '#d9d9d9'], ['#c8102e', 'Red', '#c8102e']];
  const st = { img: null, file: '', url: '', bg: '#ffffff', custom: '#ffffff', tol: 45, edge: 2, fixes: [], wand: 40, size: 'p35', cw: 413, ch: 531, copies: 8, zoom: 1, ox: 0, oy: 0, cut: true, pname: '' };
  let cut = null, cutTol = null, timer = 0;           // cached cut-out of the person (transparent background)

  /* ---------- background cut-out ---------- */
  /* colour distance: the brightness counts less than the colour, so shadows and soft light on the old background do not matter */
  const cd = (p, i, r, g, b, wy) => { const y1 = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2], y0 = 0.299 * r + 0.587 * g + 0.114 * b, dy = (y1 - y0) * wy, du = (p[i + 2] - y1) - (b - y0), dv = (p[i] - y1) - (r - y0); return Math.sqrt(dy * dy + du * du + dv * dv); };
  let srcData = null;
  function getSrc(img) {
    if (srcData && srcData.img === img) return srcData;
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
    return srcData = { img, w, h, p: x.getImageData(0, 0, w, h).data };
  }
  function makeCutout(img, tol, edge, fixes, wand) {
    const { w, h, p } = getSrc(img), N = w * h;
    // 1) colour of the old background = median of the top band and the upper left / right edges
    const R = [], G = [], B = [], band = Math.max(3, Math.round(h * 0.03)), side = Math.max(3, Math.round(w * 0.03));
    const take = (xx, yy) => { const i = (yy * w + xx) * 4; R.push(p[i]); G.push(p[i + 1]); B.push(p[i + 2]); };
    for (let yy = 0; yy < band; yy += 2) for (let xx = 0; xx < w; xx += 3) take(xx, yy);
    for (let yy = 0; yy < h * 0.5; yy += 3) for (let xx = 0; xx < side; xx += 2) { take(xx, yy); take(w - 1 - xx, yy); }
    const med = a => { a.sort((m, n) => m - n); return a[a.length >> 1]; };
    const r0 = med(R), g0 = med(G), b0 = med(B), WY = 0.8;
    // 2) grow the background from the picture border. A pixel is background if it is close to the background colour,
    //    or if it is almost the same as its background neighbour (follows soft shadows and gradients)
    const bg = new Uint8Array(N), stack = new Int32Array(N); let sp = 0;
    const near = i => cd(p, i, r0, g0, b0, WY);
    const seed = (xx, yy) => { const n = yy * w + xx; if (!bg[n] && near(n * 4) <= tol) { bg[n] = 1; stack[sp++] = n; } };
    for (let xx = 0; xx < w; xx++) { seed(xx, 0); seed(xx, h - 1); }
    for (let yy = 0; yy < h; yy++) { seed(0, yy); seed(w - 1, yy); }
    const step = (n, m) => { if (bg[m]) return; const i = m * 4, d = near(i); if (d <= tol || (d <= tol * 1.2 && cd(p, i, p[n * 4], p[n * 4 + 1], p[n * 4 + 2], WY) <= tol * 0.08)) { bg[m] = 1; stack[sp++] = m; } };
    while (sp) {
      const n = stack[--sp], xx = n % w, yy = (n / w) | 0;
      if (xx > 0) step(n, n - 1); if (xx < w - 1) step(n, n + 1); if (yy > 0) step(n, n - w); if (yy < h - 1) step(n, n + w);
    }
    // 3) keep only the biggest piece (the person): small leftover bits of background are dropped
    const lab = new Int32Array(N); let best = 0, bestN = 0, id = 0;
    for (let s = 0; s < N; s++) {
      if (bg[s] || lab[s]) continue; id++; let cnt = 0; sp = 0; stack[sp++] = s; lab[s] = id;
      while (sp) {
        const n = stack[--sp]; cnt++; const xx = n % w, yy = (n / w) | 0;
        if (xx > 0 && !bg[n - 1] && !lab[n - 1]) { lab[n - 1] = id; stack[sp++] = n - 1; }
        if (xx < w - 1 && !bg[n + 1] && !lab[n + 1]) { lab[n + 1] = id; stack[sp++] = n + 1; }
        if (yy > 0 && !bg[n - w] && !lab[n - w]) { lab[n - w] = id; stack[sp++] = n - w; }
        if (yy < h - 1 && !bg[n + w] && !lab[n + w]) { lab[n + w] = id; stack[sp++] = n + w; }
      }
      if (cnt > bestN) { bestN = cnt; best = id; }
    }
    let a = new Uint8Array(N); for (let n = 0; n < N; n++) a[n] = lab[n] === best ? 255 : 0;
    // 4) edge cleanup: shave `edge` pixels (removes the old coloured fringe)
    for (let r = 0; r < edge; r++) {
      const t = new Uint8Array(a);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const n = yy * w + xx; if (!a[n]) continue; if ((xx > 0 && !a[n - 1]) || (xx < w - 1 && !a[n + 1]) || (yy > 0 && !a[n - w]) || (yy < h - 1 && !a[n + w])) t[n] = 0; }
      a = t;
    }
    // 5) pieces the user clicked on are removed too
    for (const [fx, fy, ft] of fixes) {
      const s = fy * w + fx, i0 = s * 4, rr = p[i0], gg = p[i0 + 1], bb = p[i0 + 2], seen = new Uint8Array(N); sp = 0; stack[sp++] = s; seen[s] = 1;
      while (sp) {
        const n = stack[--sp], xx = n % w, yy = (n / w) | 0; a[n] = 0;
        for (const m of [xx > 0 ? n - 1 : -1, xx < w - 1 ? n + 1 : -1, yy > 0 ? n - w : -1, yy < h - 1 ? n + w : -1]) if (m >= 0 && !seen[m] && cd(p, m * 4, rr, gg, bb, 0.7) <= ft) { seen[m] = 1; stack[sp++] = m; }
      }
      const t = new Uint8Array(a);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const n = yy * w + xx; if (a[n] && ((xx > 0 && seen[n - 1]) || (xx < w - 1 && seen[n + 1]) || (yy > 0 && seen[n - w]) || (yy < h - 1 && seen[n + w]))) t[n] = 0; }
      a = t;
    }
    // 6) soft edge
    const out = new Uint8ClampedArray(p);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      let s = 0, m = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const X = xx + i, Y = yy + j; if (X >= 0 && X < w && Y >= 0 && Y < h) { s += a[Y * w + X]; m++; } }
      out[(yy * w + xx) * 4 + 3] = s / m;
    }
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
    return c;
  }
  function getCut() {
    if (!st.img) return null;
    const key = [st.tol, st.edge, st.fixes.map(f => f.join(',')).join(';')].join('|');
    if (!cut || cutTol !== key) { cut = makeCutout(st.img, st.tol, st.edge, st.fixes); cutTol = key; }
    return cut;
  }

  /* ---------- one passport photo ---------- */
  function drawPhoto(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    const iw = st.img.naturalWidth, ih = st.img.naturalHeight, s = Math.max(w / iw, h / ih) * st.zoom, dw = iw * s, dh = ih * s;
    const dx = (w - dw) / 2 + st.ox / 100 * Math.max(0, (dw - w) / 2), dy = (h - dh) / 2 + st.oy / 100 * Math.max(0, (dh - h) / 2);
    if (st.bg === 'orig') x.drawImage(st.img, dx, dy, dw, dh);
    else if (st.bg === 'none') x.drawImage(getCut(), dx, dy, dw, dh);
    else { x.fillStyle = st.bg; x.fillRect(0, 0, w, h); x.drawImage(getCut(), dx, dy, dw, dh); }
    return c;
  }

  /* ---------- the 6 x 4 sheet ---------- */
  function grid() {
    const w = st.cw, h = st.ch, G = 12;
    const cols = Math.max(0, Math.floor((PW - G) / (w + G))), rows = Math.max(0, Math.floor((PH - G) / (h + G)));
    return { cols, rows, max: cols * rows, w, h, gx: cols ? (PW - cols * w) / (cols + 1) : 0, gy: rows ? (PH - rows * h) / (rows + 1) : 0 };
  }
  function drawSheet(transparent) {
    const g = grid(), c = document.createElement('canvas'); c.width = PW; c.height = PH;
    const x = c.getContext('2d'); if (!transparent) { x.fillStyle = '#fff'; x.fillRect(0, 0, PW, PH); }
    if (!st.img || !g.max) return c;
    const ph = drawPhoto(g.w, g.h), n = Math.min(st.copies, g.max);
    for (let i = 0; i < n; i++) {
      const col = i % g.cols, row = (i / g.cols) | 0, px = Math.round(g.gx + col * (g.w + g.gx)), py = Math.round(g.gy + row * (g.h + g.gy));
      x.drawImage(ph, px, py);
      if (st.cut) { x.strokeStyle = '#b5b5b5'; x.lineWidth = 1; x.strokeRect(px + 0.5, py + 0.5, g.w - 1, g.h - 1); }
    }
    return c;
  }

  /* ---------- files: JPG / PNG with 300 dpi, simple PDF ---------- */
  const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));
  const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  async function jpgBytes(c) {
    const u = new Uint8Array(await (await toBlob(c, 'image/jpeg', 0.95)).arrayBuffer());
    if (u[2] === 0xFF && u[3] === 0xE0 && u[6] === 0x4A) { u[13] = 1; u[14] = 300 >> 8; u[15] = 300 & 255; u[16] = 300 >> 8; u[17] = 300 & 255; }   // 300 dpi
    return u;
  }
  async function pngBytes(c) {
    const u = new Uint8Array(await (await toBlob(c, 'image/png')).arrayBuffer()), ppm = 11811;
    const chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1; dv.setUint32(17, crc(chunk.subarray(4, 17)));
    const out = new Uint8Array(u.length + 21); out.set(u.subarray(0, 33)); out.set(chunk, 33); out.set(u.subarray(33), 54); return out;
  }
  function pdfBytes(jpg) {
    const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
    const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
    push('%PDF-1.4\n');
    offs[1] = len; push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    offs[2] = len; push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    offs[3] = len; push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 432 288] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
    offs[4] = len; push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${PW} /Height ${PH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream\nendobj\n');
    const cs = 'q 432 0 0 288 0 0 cm /Im0 Do Q';
    offs[5] = len; push(`5 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}\nendstream\nendobj\n`);
    const xr = len; push('xref\n0 6\n0000000000 65535 f \n'); for (let i = 1; i <= 5; i++) push(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`);
    return new Blob(parts, { type: 'application/pdf' });
  }
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const fname = ext => 'Passport_6x4' + (st.pname.trim() ? '_' + st.pname.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_') : '') + '.' + ext;
  async function printSheet() {
    const url = URL.createObjectURL(new Blob([await jpgBytes(drawSheet())], { type: 'image/jpeg' }));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Passport 6x4</title><style>@page{size:6in 4in;margin:0}html,body{margin:0;padding:0;background:#fff}img{width:6in;height:4in;display:block}</style></head><body><img src="${url}"></body></html>`;
    document.querySelectorAll('iframe.ppPrint').forEach(f => f.remove());
    const fr = document.createElement('iframe'); fr.className = 'ppPrint'; fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(fr); await new Promise(res => { fr.onload = res; fr.srcdoc = html; });
    await Promise.all([...fr.contentDocument.images].map(i => i.decode ? i.decode().catch(() => { }) : 0));
    fr.contentWindow.focus(); fr.contentWindow.print();
  }

  /* ---------- screen ---------- */
  const inp = 'padding:7px;border:1px solid var(--bd);border-radius:9px;background:var(--card);color:var(--tx);font:inherit';
  function paint() {
    const pv = $('ppSheet'); if (!pv) return;
    const has = !!st.img, g = grid();
    $('ppEmpty').hidden = has; $('ppWork').hidden = !has;
    $('ppTol').disabled = $('ppEdge').disabled = st.bg === 'orig'; $('ppFixCard').hidden = st.bg === 'orig' || !st.img; $('ppUndo').disabled = !st.fixes.length; $('ppFixReset').disabled = !st.fixes.length;
    document.querySelectorAll('#panel_passport [data-bg]').forEach(b => b.classList.toggle('on', b.dataset.bg === st.bg || (b.dataset.bg === 'custom' && !BGS.some(x => x[0] === st.bg || x[2] === st.bg))));
    $('ppCust').hidden = st.size !== 'cust';
    const cs = $('ppCopies'); cs.innerHTML = Array.from({ length: Math.max(1, g.max) }, (_, i) => `<option${i + 1 === Math.min(st.copies, g.max) ? ' selected' : ''}>${i + 1}</option>`).join('');
    $('ppInfo').textContent = g.max ? `Sheet 6 x 4 inch (1800 x 1200 px, 300 dpi). ${g.cols} x ${g.rows} photos fit; printing ${Math.min(st.copies, g.max)}.` : 'This photo size does not fit on a 6 x 4 inch sheet.';
    if (!has) return;
    try {
      if (st.bg !== 'orig') { const fc = getCut(), fv = $('ppFix'); fv.width = fc.width; fv.height = fc.height; fv.getContext('2d').drawImage(fc, 0, 0); }
      const c = drawSheet(st.bg === 'none'); pv.style.background = st.bg === 'none' ? 'repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/20px 20px' : '#fff'; pv.width = PW; pv.height = PH; pv.getContext('2d').drawImage(c, 0, 0); $('ppMsg').textContent = '';
    } catch (e) { console.error(e); $('ppMsg').textContent = 'Could not build the sheet: ' + e.message; }
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(paint, 60); };

  async function setImage(file) {
    const url = URL.createObjectURL(file), img = new Image(); img.src = url; await img.decode();
    if (st.url) URL.revokeObjectURL(st.url);
    Object.assign(st, { img, file: file.name, url, zoom: 1, ox: 0, oy: 0, fixes: [] }); cut = null; cutTol = null;
    if (!st.pname) st.pname = file.name.replace(/\.[^.]+$/, '').replace(/WhatsApp.*/i, '');
    if ($('ppName')) $('ppName').value = st.pname;
    ['ppZoom', 'ppX', 'ppY'].forEach((id, i) => { if ($(id)) $(id).value = i ? 0 : 100; });
    paint();
  }

  (window.REPORTS = window.REPORTS || {}).passport = {
    label: 'Passport size 6X4', sub: 'Upload 1 picture → 6 x 4 sheet', input: 'image', own: true, alwaysOn: true,
    addImage(file) { return setImage(file).catch(e => { const m = $('ppMsg'); if (m) m.textContent = 'Could not open this picture: ' + e.message; }); },
    init() {
      const host = $('result'); if (!host) return;
      const pn = document.createElement('div'); pn.id = 'panel_passport'; pn.className = 'ownpanel'; pn.hidden = true;
      const sw = BGS.map(([v, l, col]) => `<button data-bg="${v}" style="display:inline-flex;align-items:center;gap:6px">${col ? `<i style="width:16px;height:16px;border-radius:50%;background:${col};border:1px solid #888;display:inline-block"></i>` : ''}${l}</button>`).join('');
      pn.innerHTML = `<style>#panel_passport [data-bg].on{background:var(--ac);border-color:var(--ac);color:#fff}#panel_passport label{display:inline-flex;gap:6px;align-items:center}#panel_passport input[type=range]{width:150px}</style>
        <div class="bar"><b>Passport size 6X4</b><span class="mu">Upload one picture. You get a 6 x 4 inch sheet with the photo repeated, ready to download or print.</span></div>
        <div class="bar"><button class="p" id="ppPick">Choose photo</button><input type="file" id="ppFile" accept=".jpg,.jpeg,.png,image/jpeg,image/png" hidden><span class="mu" id="ppFn"></span><span style="flex:1"></span><button id="ppClear">Clear</button></div>
        <div id="ppMsg" style="color:var(--bad);font-weight:600"></div>
        <div id="ppEmpty" class="card"><p class="mu" style="margin:0">No photo yet. Drop a picture in the box at the top of the page (while this tab is open) or press Choose photo.</p></div>
        <div id="ppWork" hidden>
          <div class="card" style="margin:10px 0">
            <div class="bar"><b>Background</b>${sw}<button data-bg="custom" style="display:inline-flex;align-items:center;gap:6px">Other colour <input type="color" id="ppColor" value="#ffffff" style="width:28px;height:22px;padding:0;border:0;background:none"></button></div>
            <div class="bar"><label>Background sensitivity <input type="range" id="ppTol" min="15" max="120" value="45"></label><span class="mu">(Also used by Remove background.) If the old background is still visible, move right. If the face, hair or clothes get cut, move left.</span></div>
            <div class="bar"><label>Edge cleanup <input type="range" id="ppEdge" min="0" max="5" value="2"></label><span class="mu">Move right if a thin coloured line of the old background stays around the head or shoulders.</span></div>
            <div class="bar"><label>Photo size <select id="ppSize">${Object.entries(SIZES).map(([k, v]) => `<option value="${k}"${k === 'p35' ? ' selected' : ''}>${v[0]}</option>`).join('')}</select></label>
              <span id="ppCust" hidden><label>Width <input type="number" id="ppW" value="413" min="100" max="1700" style="width:80px;${inp}"></label> <label>Height <input type="number" id="ppH" value="531" min="100" max="1100" style="width:80px;${inp}"></label></span>
              <label>Copies <select id="ppCopies"></select></label><label><input type="checkbox" id="ppCut" checked> Thin grey cutting line</label></div>
            <div class="bar"><label>Zoom <input type="range" id="ppZoom" min="100" max="220" value="100"></label><label>Left / Right <input type="range" id="ppX" min="-100" max="100" value="0"></label><label>Up / Down <input type="range" id="ppY" min="-100" max="100" value="0"></label><button id="ppReset">Reset position</button></div>
            <div class="bar"><label>Person name (for the file name, optional) <input type="search" id="ppName" style="min-width:220px"></label></div>
            <div class="bar"><button class="p" id="ppJpg">Download JPG</button><button class="p" id="ppPdf">Download PDF</button><button id="ppPng">Download PNG</button><button id="ppCutPng" title="Only the person, transparent background">Cut-out PNG (transparent)</button><button class="p" id="ppPrint">Print</button><span class="mu" id="ppInfo"></span></div>
          </div>
          <div class="card" id="ppFixCard" style="margin:10px 0"><div class="bar" style="margin-top:0"><b>Fix leftovers</b><span class="mu">Is anything of the old background still showing? Click on it and it is removed.</span><label>Click strength <input type="range" id="ppWand" min="15" max="90" value="40"></label><button id="ppUndo">Undo last click</button><button id="ppFixReset">Reset clicks</button></div><canvas id="ppFix" style="width:100%;max-width:460px;display:block;margin:auto;cursor:crosshair;border:1px solid var(--bd);background:repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/16px 16px"></canvas></div>
          <div class="card"><canvas id="ppSheet" width="${PW}" height="${PH}" style="width:100%;max-width:900px;display:block;margin:auto;border:1px solid var(--bd);background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.15)"></canvas></div>
        </div>`;
      host.appendChild(pn);
      $('ppPick').onclick = () => $('ppFile').click();
      $('ppFile').onchange = e => { [...e.target.files].slice(0, 1).forEach(f => setImage(f).catch(err => $('ppMsg').textContent = err.message)); e.target.value = ''; };
      $('ppClear').onclick = () => { if (st.url) URL.revokeObjectURL(st.url); Object.assign(st, { img: null, url: '', file: '', pname: '', fixes: [] }); cut = null; $('ppName').value = ''; paint(); };
      pn.addEventListener('click', e => {
        const b = e.target.closest('[data-bg]'); if (!b || e.target.id === 'ppColor') return;
        st.bg = b.dataset.bg === 'custom' ? st.custom : b.dataset.bg; paint();
      });
      $('ppColor').oninput = e => { st.custom = e.target.value; st.bg = st.custom; later(); };
      $('ppEdge').oninput = e => { st.edge = +e.target.value; later(); };
      $('ppWand').oninput = e => st.wand = +e.target.value;
      $('ppUndo').onclick = () => { st.fixes.pop(); paint(); };
      $('ppFixReset').onclick = () => { st.fixes = []; paint(); };
      $('ppFix').onclick = e => { const c = getCut(), r = e.target.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * c.width), y = Math.floor((e.clientY - r.top) / r.height * c.height); if (x >= 0 && y >= 0 && x < c.width && y < c.height) { st.fixes.push([x, y, st.wand]); paint(); } };
      $('ppTol').oninput = e => { st.tol = +e.target.value; later(); };
      $('ppSize').onchange = e => { st.size = e.target.value; if (st.size !== 'cust') { st.cw = SIZES[st.size][1]; st.ch = SIZES[st.size][2]; } st.copies = 99; paint(); };
      const dim = (id, k) => $(id).oninput = e => { const v = parseInt(e.target.value, 10); if (v > 50) { st[k] = v; st.copies = 99; later(); } };
      dim('ppW', 'cw'); dim('ppH', 'ch');
      $('ppCopies').onchange = e => { st.copies = +e.target.value; later(); };
      $('ppCut').onchange = e => { st.cut = e.target.checked; later(); };
      $('ppZoom').oninput = e => { st.zoom = +e.target.value / 100; later(); };
      $('ppX').oninput = e => { st.ox = +e.target.value; later(); };
      $('ppY').oninput = e => { st.oy = +e.target.value; later(); };
      $('ppReset').onclick = () => { st.zoom = 1; st.ox = 0; st.oy = 0; $('ppZoom').value = 100; $('ppX').value = 0; $('ppY').value = 0; paint(); };
      $('ppName').oninput = e => st.pname = e.target.value;
      const run = fn => async () => { try { $('ppMsg').textContent = ''; await fn(); } catch (err) { console.error(err); $('ppMsg').textContent = err.message; } };
      $('ppJpg').onclick = run(async () => save(new Blob([await jpgBytes(drawSheet())], { type: 'image/jpeg' }), fname('jpg')));
      $('ppPng').onclick = run(async () => save(new Blob([await pngBytes(drawSheet(st.bg === 'none'))], { type: 'image/png' }), fname('png')));
      $('ppPdf').onclick = run(async () => save(pdfBytes(await jpgBytes(drawSheet())), fname('pdf')));
      $('ppCutPng').onclick = run(async () => save(new Blob([await pngBytes(getCut())], { type: 'image/png' }), fname('png').replace('Passport_6x4', 'Cutout')));
      $('ppPrint').onclick = run(printSheet);
      paint();
    },
    render() { paint(); },
    _test: { st, drawSheet, grid, jpgBytes, pngBytes, pdfBytes }
  };
})();

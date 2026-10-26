/* ---------------------------------------------------------------------------
   Login-page tools: opens the "free tools" screen (CNIC Print A4 + Passport Photo) without a login.
   Needs: report-cnic.js, report-photo.js, jszip.min.js. Opens from the buttons on the login box,
   or directly with  book.html#cnic  /  book.html#photo
--------------------------------------------------------------------------- */
(function () {
  const $ = id => document.getElementById(id);
  const scr = $('toolsScreen'); if (!scr) return;
  const R = window.REPORTS = window.REPORTS || {};
  const TOOLS = ['cnic', 'photo'];
  const TEXT = {
    cnic: ['Drop the FRONT and BACK pictures of the CNIC here', 'or click to choose. You can add more than one CNIC (2 pictures each). File names with "front" / "back" are detected automatically.', true],
    photo: ['Drop ONE photo here', 'or click to choose (a camera photo works too). It becomes a sheet of passport photos. Choosing another photo replaces the current one.', false]
  };
  let active = 'cnic', ready = false;

  function init() {
    if (ready) return; ready = true;
    TOOLS.forEach(k => { try { R[k] && R[k].init && R[k].init(); } catch (e) { console.error('tool init failed: ' + k, e); } });
  }
  function show(name) {
    if (TOOLS.indexOf(name) < 0) name = 'cnic';
    active = name; init();
    TOOLS.forEach(k => { const p = $('panel_' + k); if (p) p.hidden = k !== name; });
    scr.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === name));
    const t = TEXT[name]; $('dropTitle').textContent = t[0]; $('dropHint').textContent = t[1]; $('toolFile').multiple = t[2];
  }
  function open(name) {
    scr.hidden = false; document.body.style.overflow = 'hidden'; show(name); scr.scrollTop = 0;
    if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
  }
  function close() {
    scr.hidden = true; document.body.style.overflow = '';
    if (TOOLS.indexOf(location.hash.slice(1)) >= 0) history.replaceState(null, '', location.pathname + location.search);
  }
  async function feed(files) {
    const list = [].slice.call(files).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name));
    const tool = R[active]; if (!tool || !list.length) return;
    if (active === 'photo') { await tool.addImage(list[0]); return; }            // one photo only
    for (const f of list) await tool.addImage(f);                                // CNIC: every picture, in order
  }

  document.querySelectorAll('[data-open-tool]').forEach(b => b.addEventListener('click', () => open(b.dataset.openTool)));
  scr.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => open(b.dataset.tool)));
  $('toolsBack').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !scr.hidden) close(); });

  const drop = $('toolDrop'), inp = $('toolFile');
  inp.addEventListener('change', async () => { await feed(inp.files); inp.value = ''; });
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => feed(e.dataTransfer.files));
  document.addEventListener('paste', e => { if (!scr.hidden && e.clipboardData && e.clipboardData.files.length) feed(e.clipboardData.files); });   // Ctrl+V a screenshot

  const fromHash = () => { const h = location.hash.slice(1); if (TOOLS.indexOf(h) >= 0) open(h); };
  window.addEventListener('hashchange', fromHash); fromHash();
  window.POS_TOOLS = { open, close };
})();

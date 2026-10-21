/* POS UI: products, cart, customers, sale */
(function () {
  const $ = id => document.getElementById(id);
  const FMT = n => (window.POS_CONFIG.CURRENCY || 'Rs.') + ' ' + Number(n || 0).toFixed(2);
  let products = [], customers = [], settings = [], cart = [];
  let lastSale = null;

  const LANGS = {
    en: { title:'POS', newSale:'New Sale', dashboard:'Dashboard', products:'Products', sales:'Sales', purchases:'Purchases', customers:'Customers', suppliers:'Suppliers', returns:'Returns', expenses:'Expenses', register:'Cash Register', reports:'Reports', users:'Users', login:'Login', logout:'Logout', searchProduct:'Search product or scan barcode...', addToCart:'Add', cart:'Cart', empty:'Cart is empty', item:'Item', qty:'Qty', price:'Price', total:'Total', remove:'Remove', subtotal:'Subtotal', discount:'Discount', tax:'Tax', grandTotal:'Total', paid:'Paid', due:'Due', method:'Method', customer:'Customer', walkIn:'Walk-in', completeSale:'Complete Sale', clearCart:'Clear Cart', save:'Save', cancel:'Cancel', name:'Name', phone:'Phone', address:'Address', category:'Category', unit:'Unit', purchasePrice:'Purchase Price', sellingPrice:'Selling Price', stock:'Stock', minStock:'Min Stock', actions:'Actions', edit:'Edit', del:'Delete', confirm:'Confirm', yes:'Yes', no:'No', scanning:'Scanning...', loading:'Loading...', paymentMethod:'Payment Method', cash:'Cash', bank:'Bank Transfer', card:'Card', credit:'Credit' },
    ur: { title:'پی او ایس', newSale:'نئی فروخت', dashboard:'ڈیش بورڈ', products:'مصنوعات', sales:'فروخت', purchases:'خریداری', customers:'گاہک', suppliers:'سپلائر', returns:'واپسی', expenses:'اخراجات', register:'کیش رجسٹر', reports:'رپورٹس', users:'صارفین', login:'لاگ ان', logout:'لاگ آؤٹ', searchProduct:'مصنوعات تلاش کریں یا بارکوڈ اسکین کریں...', addToCart:'شامل کریں', cart:'ٹوکری', empty:'ٹوکری خالی ہے', item:'آئٹم', qty:'مقدار', price:'قیمت', total:'کل', remove:'ہٹائیں', subtotal:'ذیلی رقم', discount:'رعایت', tax:'ٹیکس', grandTotal:'کل رقم', paid:'ادا شدہ', due:'باقی', method:'طریقہ', customer:'گاہک', walkIn:'واک اِن', completeSale:'فروخت مکمل کریں', clearCart:'ٹوکری خالی کریں', save:'محفوظ', cancel:'منسوخ', name:'نام', phone:'فون', address:'پتہ', category:'قسم', unit:'یونٹ', purchasePrice:'خرید قیمت', sellingPrice:'فروخت قیمت', stock:'اسٹاک', minStock:'کم از کم اسٹاک', actions:'اعمال', edit:'ترمیم', del:'حذف', confirm:'تصدیق', yes:'ہاں', no:'نہیں', scanning:'اسکین ہو رہا ہے...', loading:'لوڈ ہو رہا ہے...', paymentMethod:'ادائیگی کا طریقہ', cash:'نقد', bank:'بینک', card:'کارڈ', credit:'ادھار' }
  };
  let LANG = localStorage.getItem('pos_lang') || (window.POS_CONFIG.LANG_DEFAULT || 'en');
  const T = k => LANGS[LANG][k] || k;

  function setLang(l) { LANG = l; localStorage.setItem('pos_lang', l); document.body.classList.toggle('rtl', l === 'ur'); rerenderAll(); }

  function applySettings() {
    const map = {};
    settings.forEach(s => map[s.key] = s.value);
    window.POS_SETTINGS = map;
    if (map.ShopName) $('shopName').textContent = map.ShopName;
    const user = window.POS_API.user;
    if (user) {
      $('userInfo').textContent = user.Username + ' (' + user.Role + ')';
      $('logoutBtn').classList.remove('hidden');
    }
  }

  async function loadAll() {
    show('loading');
    try {
      [products, customers, settings] = await Promise.all([
        window.POS_API.listProducts(),
        window.POS_API.listCustomers().catch(() => []),
        window.POS_API.getSettings()
      ]);
      applySettings();
      renderProductList();
      renderCustomersSelect();
      hide('loading');
    } catch (e) { hide('loading'); toast('Load failed: ' + e.message, 'err'); }
  }

  function show(id) { const el = $(id); if (el) el.classList.remove('hidden'); }
  function hide(id) { const el = $(id); if (el) el.classList.add('hidden'); }
  function toast(msg, type) {
    const m = $('topMsg'); if (!m) return;
    m.textContent = msg; m.className = 'msg ' + (type || ''); m.classList.remove('hidden');
    clearTimeout(window._tt); window._tt = setTimeout(() => { m.textContent = ''; m.classList.add('hidden'); }, 4000);
  }

  function renderProductList() {
    const el = $('productList'); if (!el) return;
    el.innerHTML = products.map(p => `
      <div class="card" style="padding:10px" data-pid="${p.ProductID}">
        <div style="display:flex;justify-content:space-between;gap:8px">
          <div><b>${esc(p.Name)}</b><div style="font-size:12px;color:var(--mu)">${esc(p.Category||'')} • ${esc(p.Unit||'pc')} • Stock: ${p.Stock}</div></div>
          <div style="text-align:right"><b>${FMT(p.SellingPrice)}</b><div style="font-size:11px;color:var(--mu)">${esc(p.Barcode||'')}</div></div>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px">
          <button class="p" data-add="${p.ProductID}" style="flex:1">${T('addToCart')}</button>
          <button data-edit="${p.ProductID}">✎</button>
          ${window.POS_API.user && window.POS_API.user.Role === 'owner' ? `<button data-del="${p.ProductID}" style="color:var(--bad)">✕</button>` : ''}
        </div>
      </div>`).join('');
  }

  function renderCustomersSelect() {
    const el = $('customerSelect'); if (!el) return;
    el.innerHTML = '<option value="">' + T('walkIn') + '</option>' + customers.map(c => `<option value="${c.CustomerID}">${esc(c.Name)}${c.Phone ? ' — ' + esc(c.Phone) : ''}${Number(c.Balance) > 0 ? ' (Due: ' + FMT(c.Balance) + ')' : ''}</option>`).join('');
  }

  function addToCart(productID, qty) {
    const p = products.find(x => x.ProductID === productID);
    if (!p) return;
    const exist = cart.find(x => x.ProductID === productID);
    if (exist) exist.Qty += qty || 1;
    else cart.push({ ProductID: p.ProductID, ProductName: p.Name, Qty: qty || 1, UnitPrice: Number(p.SellingPrice), PurchasePrice: Number(p.PurchasePrice||0) });
    renderCart();
  }

  function renderCart() {
    const el = $('cartBody'); if (!el) return;
    if (!cart.length) { el.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--mu);padding:20px">' + T('empty') + '</td></tr>'; updateTotals(); return; }
    el.innerHTML = cart.map((c, i) => `
      <tr>
        <td>${esc(c.ProductName)}</td>
        <td><input type="number" min="1" value="${c.Qty}" data-qty="${i}" style="width:60px"></td>
        <td>${FMT(c.UnitPrice)}</td>
        <td><b>${FMT(c.Qty * c.UnitPrice)}</b></td>
        <td><button data-rm="${i}" style="color:var(--bad)">✕</button></td>
      </tr>`).join('');
    updateTotals();
  }

  function updateTotals() {
    const sub = cart.reduce((a, c) => a + c.Qty * c.UnitPrice, 0);
    const disc = Number($('discountInput') && $('discountInput').value || 0);
    const taxPct = Number((window.POS_SETTINGS || {}).TaxPercent || 0);
    const tax = (sub - disc) * taxPct / 100;
    const total = sub - disc + tax;
    $('subtotalLbl').textContent = FMT(sub);
    $('taxLbl').textContent = FMT(tax);
    $('totalLbl').textContent = FMT(total);
    $('grandTotal').textContent = FMT(total);
    window._saleTotals = { sub, disc, tax, total };
  }

  async function completeSale() {
    if (!cart.length) return toast(T('empty'), 'err');
    const custID = $('customerSelect').value;
    const custName = custID ? (customers.find(c => c.CustomerID === custID) || {}).Name : 'Walk-in';
    const method = $('methodSelect').value;
    const disc = Number($('discountInput').value || 0);
    const paidStr = $('paidInput').value;
    const paid = paidStr === '' ? window._saleTotals.total : Number(paidStr);
    const total = window._saleTotals.total;
    if (paid < 0 || paid > total + 0.01) return toast('Paid amount invalid', 'err');
    const idempotencyKey = 'SALE-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    $('completeBtn').disabled = true;
    $('completeBtn').innerHTML = '<span class="spin"></span> ' + T('saving') || 'Saving...';
    try {
      const res = await window.POS_API.createSale({
        idempotencyKey, customerID: custID, customerName: custName,
        items: cart.map(c => ({ ProductID: c.ProductID, Qty: c.Qty, UnitPrice: c.UnitPrice })),
        discount: disc, paid, paymentMethod: method, deviceID: 'web'
      });
      const full = await window.POS_API.getSale(res.SaleID);
      lastSale = full;
      const printMode = (window.POS_CONFIG.PRINT_RECEIPT || 'both');
      if (printMode === 'both') await window.POS_RECEIPT.printBoth(full.sale, full.items, window.POS_SETTINGS);
      else if (printMode === 'a4') await window.POS_RECEIPT.printA4(full.sale, full.items, window.POS_SETTINGS);
      else await window.POS_RECEIPT.printThermal(full.sale, full.items, window.POS_SETTINGS);
      toast('Sale saved: ' + res.InvoiceNo, 'ok');
      cart = []; renderCart();
      $('paidInput').value = ''; $('discountInput').value = '';
      loadAll();
    } catch (e) { toast('Sale failed: ' + e.message, 'err'); }
    finally { $('completeBtn').disabled = false; $('completeBtn').textContent = T('completeSale'); }
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

  function rerenderAll() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = T(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = T(el.dataset.i18nPh); });
    renderProductList();
    renderCart();
  }

  function bindEvents() {
    document.addEventListener('click', async e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.add) { addToCart(t.dataset.add, 1); }
      if (t.dataset.rm != null) { cart.splice(+t.dataset.rm, 1); renderCart(); }
      if (t.dataset.del) {
        if (!confirm(T('confirm') + ' ' + T('del') + '?')) return;
        try { await window.POS_API.deleteProduct(t.dataset.del); toast('Deleted', 'ok'); loadAll(); } catch (err) { toast(err.message, 'err'); }
      }
      if (t.id === 'completeBtn') completeSale();
      if (t.id === 'clearCartBtn') { if (confirm(T('clearCart') + '?')) { cart = []; renderCart(); } }
      if (t.id === 'logoutBtn') { await window.POS_API.logout(); location.reload(); }
      if (t.id === 'langToggle') setLang(LANG === 'en' ? 'ur' : 'en');
    });
    document.addEventListener('input', e => {
      if (e.target.dataset.qty != null) { cart[+e.target.dataset.qty].Qty = Math.max(1, +e.target.value); updateTotals(); }
      if (e.target.id === 'discountInput' || e.target.id === 'paidInput') updateTotals();
      if (e.target.id === 'productSearch') {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('#productList [data-pid]').forEach(card => {
          const p = products.find(x => x.ProductID === card.dataset.pid);
          const hit = !q || (p.Name + ' ' + (p.Barcode||'') + ' ' + (p.Category||'')).toLowerCase().includes(q);
          card.style.display = hit ? '' : 'none';
        });
      }
      if (e.target.id === 'barcodeInput') {
        const code = e.target.value.trim();
        if (code) {
          const p = products.find(x => x.Barcode === code);
          if (p) { addToCart(p.ProductID, 1); e.target.value = ''; }
        }
      }
    });
  }

  window.POS_UI = {
    init() {
      bindEvents();
      document.body.classList.toggle('rtl', LANG === 'ur');
      loadAll();
    },
    reload: loadAll,
    LANG: () => LANG,
    T,
    FMT
  };
})();
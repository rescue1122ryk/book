/* POS API wrapper with retry + idempotency */
(function () {
  const CFG = window.POS_CONFIG || {};
  let TOKEN = localStorage.getItem('pos_token') || '';
  let USER = JSON.parse(localStorage.getItem('pos_user') || 'null');

  async function call(action, body, opts) {
    opts = opts || {};
    const payload = Object.assign({ action, token: TOKEN }, body || {});
    let lastErr;
    for (let attempt = 0; attempt < (opts.retries || 2) + 1; attempt++) {
      try {
        const res = await fetch(CFG.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || 'Request failed');
        // FIX: login/logout etc. reply without a "data" wrapper; return the whole response then
        return json.data !== undefined ? json.data : json;
      } catch (e) {
        lastErr = e;
        if (!opts.retrySafe) break;
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  window.POS_API = {
    get token() { return TOKEN; },
    get user() { return USER; },
    async login(username, password) {
      const d = await call('login', { username, password });
      if (!d || !d.token) throw new Error('Server did not return a token');
      TOKEN = d.token; USER = d.user;
      localStorage.setItem('pos_token', TOKEN);
      localStorage.setItem('pos_user', JSON.stringify(USER));
      return d;
    },
    async logout() {
      try { await call('logout'); } catch(e) {}
      TOKEN = ''; USER = null;
      localStorage.removeItem('pos_token');
      localStorage.removeItem('pos_user');
    },
    isLoggedIn() { return !!TOKEN; },
    getSettings: () => call('getSettings'),
    listProducts: () => call('listProducts'),
    saveProduct: (product) => call('saveProduct', { product }),
    deleteProduct: (productID) => call('deleteProduct', { productID }),
    createSale: (sale) => call('createSale', sale, { retrySafe: true, retries: 2 }),
    getSale: (saleID) => call('getSale', { saleID }),
    listSales: (from, to) => call('listSales', { from, to }),
    createPurchase: (purchase) => call('createPurchase', purchase, { retrySafe: true }),
    saveCustomer: (customer) => call('saveCustomer', { customer }),
    listCustomers: () => call('listCustomers'),
    getCustomerLedger: (customerID) => call('getCustomerLedger', { customerID }),
    addCustomerPayment: (p) => call('addCustomerPayment', p),
    saveSupplier: (supplier) => call('saveSupplier', { supplier }),
    listSuppliers: () => call('listSuppliers'),
    addSupplierPayment: (p) => call('addSupplierPayment', p),
    createReturn: (r) => call('createReturn', r, { retrySafe: true }),
    addExpense: (e) => call('addExpense', e),
    listExpenses: (from, to) => call('listExpenses', { from, to }),
    openRegister: (openingCash) => call('openRegister', { openingCash }),
    closeRegister: (actual) => call('closeRegister', { actual }),
    dashboard: () => call('dashboard'),
    salesReport: (from, to) => call('salesReport', { from, to }),
    productWiseReport: (from, to) => call('productWiseReport', { from, to }),
    exportCSV: (sheetName) => call('exportCSV', { sheetName }),
    call
  };
})();

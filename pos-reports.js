/* Reports & dashboard rendering */
(function () {
  const $ = id => document.getElementById(id);
  const FMT = n => (window.POS_CONFIG.CURRENCY || 'Rs.') + ' ' + Number(n || 0).toFixed(2);

  async function loadDashboard() {
    try {
      const d = await window.POS_API.dashboard();
      $('dashStats').innerHTML = [
        ['Today Sales', FMT(d.totalSales)],
        ['Orders', d.totalOrders],
        ['Cash Received', FMT(d.cashReceived)],
        ['Gross Profit', FMT(d.grossProfit)],
        ['Expenses', FMT(d.expenses)],
        ['Net Profit', FMT(d.netProfit)],
        ['Total Receivable', FMT(d.totalReceivable)],
        ['Low Stock', d.lowStockCount]
      ].map(([k,v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
      $('dashLowStock').innerHTML = d.lowStock.length ? '<table><thead><tr><th>Product</th><th>Stock</th></tr></thead><tbody>' +
        d.lowStock.map(p => `<tr><td>${p.Name}</td><td>${p.Stock}</td></tr>`).join('') + '</tbody></table>' : '<p>All good.</p>';
    } catch (e) { $('dashStats').innerHTML = '<div class="msg err">' + e.message + '</div>'; }
  }

  async function loadSalesHistory() {
    const from = $('salesFrom').value || '2000-01-01';
    const to = $('salesTo').value || '2099-12-31';
    try {
      const rows = await window.POS_API.listSales(from, to);
      document.querySelector('#salesTable tbody').innerHTML = rows.map(s =>
        `<tr><td>${s.InvoiceNo}</td><td>${s.CreatedAt}</td><td>${s.CustomerName||'Walk-in'}</td><td>${FMT(s.Total)}</td><td>${FMT(s.Paid)}</td><td>${FMT(s.Due)}</td>
        <td><button data-print="${s.SaleID}">Print</button></td></tr>`).join('') || '<tr><td colspan="7">No sales.</td></tr>';
    } catch (e) { alert(e.message); }
  }

  async function loadProductsTable() {
    try {
      const prods = await window.POS_API.listProducts();
      document.querySelector('#productTable tbody').innerHTML = prods.map(p =>
        `<tr><td>${p.Name}</td><td>${p.Barcode||''}</td><td>${p.Category||''}</td><td>${FMT(p.PurchasePrice)}</td><td>${FMT(p.SellingPrice)}</td><td>${p.Stock}</td>
        <td><button data-edit-p="${p.ProductID}">Edit</button></td></tr>`).join('');
    } catch (e) {}
  }

  async function loadCustomersTable() {
    try {
      const cs = await window.POS_API.listCustomers();
      document.querySelector('#customerTable tbody').innerHTML = cs.map(c =>
        `<tr><td>${c.Name}</td><td>${c.Phone||''}</td><td>${FMT(c.Balance)}</td><td><button data-pay-c="${c.CustomerID}">Pay</button></td></tr>`).join('');
    } catch (e) {}
  }

  async function loadSuppliersTable() {
    try {
      const ss = await window.POS_API.listSuppliers();
      document.querySelector('#supplierTable tbody').innerHTML = ss.map(s =>
        `<tr><td>${s.Name}</td><td>${s.Phone||''}</td><td>${FMT(s.Balance)}</td></tr>`).join('');
      $('purchaseSupplier').innerHTML = '<option value="">Select</option>' + ss.map(s => `<option value="${s.SupplierID}">${s.Name}</option>`).join('');
    } catch (e) {}
  }

  async function loadExpensesTable() {
    try {
      const es = await window.POS_API.listExpenses();
      document.querySelector('#expenseTable tbody').innerHTML = es.map(e =>
        `<tr><td>${e.CreatedAt}</td><td>${e.Category}</td><td>${FMT(e.Amount)}</td><td>${e.Notes||''}</td></tr>`).join('');
    } catch (e) {}
  }

  async function runSalesReport() {
    try {
      const from = $('rptFrom').value || '2000-01-01', to = $('rptTo').value || '2099-12-31';
      const r = await window.POS_API.salesReport(from, to);
      $('rptResult').innerHTML = `<h3>Sales ${r.from} → ${r.to}</h3>
        <table><tr><td>Orders</td><td>${r.orders}</td></tr>
        <tr><td>Revenue</td><td>${FMT(r.revenue)}</td></tr>
        <tr><td>COGS</td><td>${FMT(r.cogs)}</td></tr>
        <tr><td>Gross Profit</td><td>${FMT(r.grossProfit)}</td></tr>
        <tr><td>Expenses</td><td>${FMT(r.expenses)}</td></tr>
        <tr><td><b>Net Profit</b></td><td><b>${FMT(r.netProfit)}</b></td></tr></table>`;
    } catch (e) { alert(e.message); }
  }

  async function runProductReport() {
    try {
      const from = $('rptFrom').value || '2000-01-01', to = $('rptTo').value || '2099-12-31';
      const rows = await window.POS_API.productWiseReport(from, to);
      $('rptResult').innerHTML = '<h3>Product-wise</h3><table><thead><tr><th>Product</th><th>Qty</th><th>Revenue</th><th>Profit</th></tr></thead><tbody>' +
        rows.map(r => `<tr><td>${r.Name}</td><td>${r.Qty}</td><td>${FMT(r.Revenue)}</td><td>${FMT(r.Profit)}</td></tr>`).join('') + '</tbody></table>';
    } catch (e) { alert(e.message); }
  }

  async function exportCSV(sheetName) {
    try {
      const csv = await window.POS_API.exportCSV(sheetName);
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = sheetName + '_' + Date.now() + '.csv'; a.click();
    } catch (e) { alert(e.message); }
  }

  function bindEvents() {
    if ($('salesLoadBtn')) $('salesLoadBtn').onclick = loadSalesHistory;
    if ($('rptSalesBtn')) $('rptSalesBtn').onclick = runSalesReport;
    if ($('rptProductBtn')) $('rptProductBtn').onclick = runProductReport;
    if ($('rptCsvSalesBtn')) $('rptCsvSalesBtn').onclick = () => exportCSV('Sales');
    if ($('rptCsvProductsBtn')) $('rptCsvProductsBtn').onclick = () => exportCSV('Products');
    document.addEventListener('click', async e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.print) {
        try { const s = await window.POS_API.getSale(t.dataset.print);
          window.POS_RECEIPT.printBoth(s.sale, s.items, window.POS_SETTINGS); }
        catch (err) { alert(err.message); }
      }
      if (t.dataset.payC) {
        const amt = prompt('Amount to pay?');
        if (amt) try { await window.POS_API.addCustomerPayment({ customerID: t.dataset.payC, amount: Number(amt), method: 'Cash' }); loadCustomersTable(); alert('Paid'); } catch (err) { alert(err.message); }
      }
    });
  }

  window.POS_REPORTS = {
    onTab(tab) {
      if (tab === 'dashboard') loadDashboard();
      if (tab === 'products') loadProductsTable();
      if (tab === 'sales') loadSalesHistory();
      if (tab === 'customers') loadCustomersTable();
      if (tab === 'suppliers') loadSuppliersTable();
      if (tab === 'expenses') loadExpensesTable();
    },
    reloadExpenses: loadExpensesTable
  };
  bindEvents();
})();
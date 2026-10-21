/* Receipt generation: A4 and 80mm thermal, both with Rs. symbol */
(function () {
  const FMT = n => (window.POS_CONFIG.CURRENCY || 'Rs.') + ' ' + Number(n || 0).toFixed(2);

  function receiptData(sale, items, settings) {
    const s = settings || {};
    return {
      shopName: s.ShopName || 'JINNAH STATIONARY',
      shopAddress: s.ShopAddress || '',
      shopPhone: s.ShopPhone || '',
      footer: s.ReceiptFooter || '',
      invoiceNo: sale.InvoiceNo,
      date: sale.CreatedAt,
      customer: sale.CustomerName || 'Walk-in',
      cashier: sale.CashierID || '',
      items: items.map(i => ({
        name: i.ProductName, qty: i.Qty, price: Number(i.UnitPrice),
        total: Number(i.LineTotal)
      })),
      subtotal: Number(sale.Subtotal), discount: Number(sale.Discount),
      tax: Number(sale.Tax), total: Number(sale.Total),
      paid: Number(sale.Paid), due: Number(sale.Due),
      method: sale.PaymentMethod
    };
  }

  function renderThermalHTML(d) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${d.invoiceNo}</title>
<style>
@page{size:80mm auto;margin:2mm}
body{font-family:'Courier New',monospace;font-size:11px;width:76mm;margin:0;color:#000}
.center{text-align:center}
h2{margin:0;font-size:14px}
.meta{margin:4px 0;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:4px 0}
table{width:100%;border-collapse:collapse}
th,td{padding:1px 0;font-size:10px}
th{text-align:left;border-bottom:1px solid #000}
td.r,th.r{text-align:right}
.totals{margin-top:4px;border-top:1px dashed #000;padding-top:4px}
.totals div{display:flex;justify-content:space-between;padding:1px 0}
.totals .grand{font-weight:bold;font-size:13px;border-top:1px solid #000;padding-top:4px;margin-top:4px}
.footer{margin-top:8px;text-align:center;font-size:9px;border-top:1px dashed #000;padding-top:4px}
</style></head><body>
<div class="center"><h2>${d.shopName}</h2>
<div>${d.shopAddress}</div><div>${d.shopPhone}</div></div>
<div class="meta"><div>Invoice: ${d.invoiceNo}</div><div>Date: ${d.date}</div>
<div>Customer: ${d.customer}</div><div>Cashier: ${d.cashier}</div></div>
<table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amt</th></tr></thead><tbody>
${d.items.map(i => `<tr><td>${esc(i.name)}</td><td class="r">${i.qty}</td><td class="r">${i.price.toFixed(2)}</td><td class="r">${i.total.toFixed(2)}</td></tr>`).join('')}
</tbody></table>
<div class="totals">
<div><span>Subtotal</span><span>${FMT(d.subtotal)}</span></div>
${d.discount ? `<div><span>Discount</span><span>- ${FMT(d.discount)}</span></div>` : ''}
${d.tax ? `<div><span>Tax</span><span>${FMT(d.tax)}</span></div>` : ''}
<div class="grand"><span>TOTAL</span><span>${FMT(d.total)}</span></div>
<div><span>Paid (${d.method})</span><span>${FMT(d.paid)}</span></div>
${d.due ? `<div><span>Due</span><span>${FMT(d.due)}</span></div>` : ''}
</div>
<div class="footer">${d.footer}<br>Thank you!</div>
</body></html>`;
  }

  function renderA4HTML(d) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${d.invoiceNo}</title>
<style>
@page{size:A4;margin:15mm}
body{font-family:system-ui,Arial,sans-serif;font-size:12px;color:#000}
.header{display:flex;justify-content:space-between;border-bottom:3px solid #8c1d2c;padding-bottom:10px}
.header h1{margin:0;color:#8c1d2c;font-size:22px;font-family:Georgia,serif}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}
.meta div{padding:8px;background:#f7f7f7;border-radius:6px}
table{width:100%;border-collapse:collapse;margin:12px 0}
th{background:#8c1d2c;color:#fff;padding:8px;text-align:left}
td{padding:8px;border-bottom:1px solid #ddd}
.r{text-align:right}
.totals{margin-left:auto;width:300px;margin-top:12px}
.totals div{display:flex;justify-content:space-between;padding:6px 8px;border-bottom:1px solid #eee}
.totals .grand{font-weight:bold;font-size:16px;background:#fff3cf;border:2px solid #8c1d2c;padding:10px 8px}
.footer{margin-top:30px;padding-top:12px;border-top:1px solid #ddd;text-align:center;color:#666;font-size:11px}
</style></head><body>
<div class="header"><div><h1>${d.shopName}</h1><div>${d.shopAddress}</div><div>${d.shopPhone}</div></div>
<div style="text-align:right"><h2 style="margin:0;color:#8c1d2c">INVOICE</h2><div>${d.invoiceNo}</div><div>${d.date}</div></div></div>
<div class="meta"><div><b>Customer:</b> ${d.customer}</div><div><b>Cashier:</b> ${d.cashier}</div>
<div><b>Payment:</b> ${d.method}</div><div><b>Status:</b> ${d.due > 0 ? 'Partial' : 'Paid'}</div></div>
<table><thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>
${d.items.map((i,idx) => `<tr><td>${idx+1}</td><td>${esc(i.name)}</td><td class="r">${i.qty}</td><td class="r">${FMT(i.price)}</td><td class="r">${FMT(i.total)}</td></tr>`).join('')}
</tbody></table>
<div class="totals">
<div><span>Subtotal</span><span>${FMT(d.subtotal)}</span></div>
${d.discount ? `<div><span>Discount</span><span>- ${FMT(d.discount)}</span></div>` : ''}
${d.tax ? `<div><span>Tax</span><span>${FMT(d.tax)}</span></div>` : ''}
<div class="grand"><span>TOTAL</span><span>${FMT(d.total)}</span></div>
<div><span>Paid</span><span>${FMT(d.paid)}</span></div>
${d.due ? `<div><span>Due</span><span>${FMT(d.due)}</span></div>` : ''}
</div>
<div class="footer">${d.footer}</div>
</body></html>`;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

  async function printHTML(html) {
    document.querySelectorAll('iframe.posPrint').forEach(f => f.remove());
    const fr = document.createElement('iframe');
    fr.className = 'posPrint';
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(fr);
    await new Promise(r => { fr.onload = r; fr.srcdoc = html; });
    await new Promise(r => setTimeout(r, 300));
    fr.contentWindow.focus();
    fr.contentWindow.print();
  }

  window.POS_RECEIPT = {
    receiptData,
    printThermal: (sale, items, settings) => printHTML(renderThermalHTML(receiptData(sale, items, settings))),
    printA4: (sale, items, settings) => printHTML(renderA4HTML(receiptData(sale, items, settings))),
    printBoth: async (sale, items, settings) => {
      await printHTML(renderA4HTML(receiptData(sale, items, settings)));
      await new Promise(r => setTimeout(r, 1500));
      await printHTML(renderThermalHTML(receiptData(sale, items, settings)));
    },
    FMT
  };
})();
/********************************************************************
 * POS Backend — Google Apps Script (COMPLETE)
 * Timezone: Asia/Karachi | Currency: PKR
 * Deploy: Execute as Me, Access: Anyone (with token auth)
 ********************************************************************/

const SPREADSHEET_ID = 'PASTE_YOUR_SHEET_ID_HERE';
const TZ = 'Asia/Karachi';

const SCHEMAS = {
  Settings:        ['key','value','notes'],
  Products:        ['ProductID','Barcode','Name','Category','Unit','PurchasePrice','SellingPrice','Stock','MinStock','SupplierID','Active','CreatedAt','UpdatedAt','UpdatedBy'],
  Categories:      ['CategoryID','Name','Active'],
  Sales:           ['SaleID','InvoiceNo','CustomerID','CustomerName','Subtotal','Discount','Tax','Total','Paid','Due','PaymentMethod','Status','CashierID','DeviceID','IdempotencyKey','CreatedAt','Notes'],
  SaleItems:       ['ItemID','SaleID','ProductID','ProductName','Qty','UnitPrice','PurchasePrice','LineTotal'],
  Purchases:       ['PurchaseID','SupplierID','SupplierInvoiceNo','Subtotal','Paid','Due','UserID','CreatedAt','Notes'],
  PurchaseItems:   ['ItemID','PurchaseID','ProductID','Qty','UnitCost','LineTotal'],
  Customers:       ['CustomerID','Name','Phone','Address','Notes','Balance','CreatedAt'],
  Suppliers:       ['SupplierID','Name','Phone','Address','Notes','Balance','CreatedAt'],
  CustomerPayments:['PaymentID','CustomerID','SaleID','Amount','Method','UserID','CreatedAt','Notes'],
  SupplierPayments:['PaymentID','SupplierID','PurchaseID','Amount','Method','UserID','CreatedAt','Notes'],
  SalesReturns:    ['ReturnID','SaleID','Reason','Total','RefundMethod','UserID','CreatedAt'],
  ReturnItems:     ['ItemID','ReturnID','ProductID','Qty','UnitPrice','LineTotal'],
  Expenses:        ['ExpenseID','Category','Amount','UserID','CreatedAt','Notes'],
  CashRegister:    ['RegID','Date','OpeningCash','CashSales','CashPaid','CashExpenses','Expected','Actual','Diff','UserID','ClosedAt'],
  Users:           ['UserID','Username','PasswordHash','Salt','Role','Active','CreatedAt'],
  AuditLog:        ['LogID','UserID','Action','Entity','EntityID','Details','CreatedAt'],
  Sessions:        ['Token','UserID','ExpiresAt','CreatedAt'],
  Idempotency:     ['Key','ResponseJSON','CreatedAt']
};

const DEFAULT_SETTINGS = {
  ShopName: 'JINNAH STATIONARY & FRIENDS BOOK SHOP',
  ShopAddress: 'Jinnah Park, Rahim Yar Khan',
  ShopPhone: '03017631541',
  ReceiptFooter: 'All rights reserved — Shahid Jamil, Rescue 1122 RYK',
  Currency: 'PKR',
  CurrencySymbol: 'Rs.',
  TaxPercent: '0',
  AllowNegativeStock: 'false',
  SessionMinutes: '480',
  DiscountLimitPercent: '10'
};

// ============ SETUP ============
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.entries(SCHEMAS).forEach(([name, headers]) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(headers);
    sh.setFrozenRows(1);
  });
  const setSh = ss.getSheetByName('Settings');
  const existing = new Set(setSh.getRange(2,1,Math.max(1,setSh.getLastRow()-1),1).getValues().flat());
  Object.entries(DEFAULT_SETTINGS).forEach(([k,v]) => { if (!existing.has(k)) setSh.appendRow([k, v, '']); });
  const userSh = ss.getSheetByName('Users');
  if (userSh.getLastRow() < 2) {
    const salt = Utilities.getUuid();
    userSh.appendRow(['U' + Date.now(), 'admin', hashPass_('admin123', salt), salt, 'owner', true, now_()]);
  }
  const catSh = ss.getSheetByName('Categories');
  if (catSh.getLastRow() < 2) catSh.appendRow(['C1', 'General', true]);
  ss.setSpreadsheetTimeZone(TZ);
  installTriggers();
  return { ok: true, message: 'Setup complete. Login: admin / admin123' };
}

// ============ HELPERS ============
function ss_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function sh_(name) { const s = ss_().getSheetByName(name); if (!s) throw new Error('Missing sheet: ' + name); return s; }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function dateOnly_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function uuid_(p) { return (p||'') + Utilities.getUuid().replace(/-/g,'').slice(0,16); }
function hashPass_(pass, salt) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pass + salt)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function round2_(n) { return Math.round(Number(n) * 100) / 100; }

function readSheet_(name) {
  const s = sh_(name); const v = s.getDataRange().getValues();
  if (v.length < 2) return [];
  const h = v[0];
  return v.slice(1).map(row => { const o = {}; h.forEach((k,i) => o[k] = row[i]); return o; });
}
function appendRow_(name, obj) {
  const s = sh_(name); const h = s.getRange(1,1,1,s.getLastColumn()).getValues()[0];
  s.appendRow(h.map(k => obj[k] === undefined ? '' : obj[k]));
}
function findRow_(name, idCol, idVal) {
  const s = sh_(name); const last = s.getLastRow(); if (last < 2) return -1;
  const h = s.getRange(1,1,1,s.getLastColumn()).getValues()[0];
  const col = h.indexOf(idCol) + 1; if (!col) return -1;
  const ids = s.getRange(2, col, last - 1, 1).getValues().flat();
  const i = ids.findIndex(x => String(x) === String(idVal));
  return i === -1 ? -1 : i + 2;
}
function updateRow_(name, idCol, idVal, patch) {
  const r = findRow_(name, idCol, idVal); if (r < 0) throw new Error('Record not found: ' + idVal);
  const s = sh_(name); const h = s.getRange(1,1,1,s.getLastColumn()).getValues()[0];
  Object.entries(patch).forEach(([k,v]) => { const c = h.indexOf(k) + 1; if (c > 0) s.getRange(r, c).setValue(v); });
}
function audit_(userID, action, entity, entityID, details) {
  try {
    appendRow_('AuditLog', { LogID: uuid_('L'), UserID: userID || '', Action: action,
      Entity: entity || '', EntityID: entityID || '',
      Details: typeof details === 'string' ? details : JSON.stringify(details || {}),
      CreatedAt: now_() });
  } catch(e) {}
}
function getSetting_(key) {
  const r = readSheet_('Settings').find(x => x.key === key);
  return r ? r.value : null;
}

// ============ AUTH ============
function login_(username, password) {
  const users = readSheet_('Users').filter(u => String(u.Username).toLowerCase() === String(username).toLowerCase() && u.Active === true);
  if (!users.length) return { ok: false, error: 'Invalid credentials' };
  const u = users[0];
  if (hashPass_(password, u.Salt) !== String(u.PasswordHash)) return { ok: false, error: 'Invalid credentials' };
  const token = Utilities.getUuid();
  const minutes = Number(getSetting_('SessionMinutes') || 480);
  const exp = new Date(Date.now() + minutes * 60000);
  appendRow_('Sessions', { Token: token, UserID: u.UserID, ExpiresAt: Utilities.formatDate(exp, TZ, 'yyyy-MM-dd HH:mm:ss'), CreatedAt: now_() });
  audit_(u.UserID, 'LOGIN', 'User', u.UserID, {});
  return { ok: true, token: token, user: { UserID: u.UserID, Username: u.Username, Role: u.Role } };
}
function logout_(token) {
  const s = sh_('Sessions'); const r = findRow_('Sessions', 'Token', token);
  if (r > 0) s.deleteRow(r);
  return { ok: true };
}
function verifyToken_(token) {
  if (!token) return null;
  const rows = readSheet_('Sessions');
  const s = rows.find(r => r.Token === token);
  if (!s) return null;
  if (new Date(String(s.ExpiresAt).replace(' ', 'T')) < new Date()) return null;
  const u = readSheet_('Users').find(x => x.UserID === s.UserID && x.Active === true);
  return u ? { UserID: u.UserID, Username: u.Username, Role: u.Role } : null;
}
function requireRole_(user, roles) {
  if (!user) throw new Error('Not authenticated');
  if (roles && !roles.includes(user.Role)) throw new Error('Not authorized');
}

// ============ PRODUCTS ============
function listProducts_(user) {
  requireRole_(user, null);
  return readSheet_('Products').filter(p => p.Active !== false);
}
function saveProduct_(user, p) {
  requireRole_(user, ['owner','admin']);
  if (!p.Name) throw new Error('Name required');
  if (p.SellingPrice == null || p.SellingPrice < 0) throw new Error('SellingPrice invalid');
  if (!p.ProductID) {
    p.ProductID = uuid_('P'); p.CreatedAt = now_(); p.Active = true; p.Stock = Number(p.Stock || 0);
    appendRow_('Products', p);
    audit_(user.UserID, 'PRODUCT_CREATE', 'Product', p.ProductID, { Name: p.Name });
  } else {
    const existing = readSheet_('Products').find(x => x.ProductID === p.ProductID);
    if (!existing) throw new Error('Product not found');
    if (p.PurchasePrice != null && Number(p.PurchasePrice) !== Number(existing.PurchasePrice) && user.Role !== 'owner') {
      throw new Error('Only owner can change purchase price');
    }
    p.UpdatedAt = now_(); p.UpdatedBy = user.UserID;
    delete p.CreatedAt;
    updateRow_('Products', 'ProductID', p.ProductID, p);
    audit_(user.UserID, 'PRODUCT_UPDATE', 'Product', p.ProductID, { Name: p.Name });
  }
  return p;
}
function deleteProduct_(user, productID) {
  requireRole_(user, ['owner']);
  updateRow_('Products', 'ProductID', productID, { Active: false, UpdatedAt: now_(), UpdatedBy: user.UserID });
  audit_(user.UserID, 'PRODUCT_DELETE', 'Product', productID, {});
  return { ok: true };
}

// ============ SALES ============
function createSale_(payload) {
  const user = verifyToken_(payload.token);
  if (!user) return { ok: false, error: 'Not authenticated' };
  if (!payload.idempotencyKey) return { ok: false, error: 'idempotencyKey required' };
  if (!payload.items || !payload.items.length) return { ok: false, error: 'No items' };
  const existing = readSheet_('Idempotency').find(r => r.Key === payload.idempotencyKey);
  if (existing) return JSON.parse(existing.ResponseJSON);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return { ok: false, error: 'Server busy, retry' };
  try {
    const dup = readSheet_('Idempotency').find(r => r.Key === payload.idempotencyKey);
    if (dup) return JSON.parse(dup.ResponseJSON);

    const products = readSheet_('Products');
    const byID = new Map(products.map(p => [p.ProductID, p]));
    let subtotal = 0; const lineItems = [];
    for (const it of payload.items) {
      const p = byID.get(it.ProductID);
      if (!p) throw new Error('Unknown product: ' + it.ProductID);
      if (p.Active === false) throw new Error('Inactive product: ' + p.Name);
      const qty = Number(it.Qty);
      if (!(qty > 0)) throw new Error('Qty must be > 0 for ' + p.Name);
      const price = Number(it.UnitPrice != null ? it.UnitPrice : p.SellingPrice);
      if (!(price >= 0)) throw new Error('Invalid price for ' + p.Name);
      const allowNeg = String(getSetting_('AllowNegativeStock')).toLowerCase() === 'true';
      if (!allowNeg && Number(p.Stock) < qty) throw new Error('Insufficient stock for ' + p.Name + ' (have ' + p.Stock + ')');
      const lineTotal = round2_(price * qty);
      subtotal += lineTotal;
      lineItems.push({ ProductID: p.ProductID, ProductName: p.Name, Qty: qty, UnitPrice: price, PurchasePrice: Number(p.PurchasePrice || 0), LineTotal: lineTotal });
    }
    subtotal = round2_(subtotal);
    const discount = round2_(Number(payload.discount || 0));
    const taxPct = Number(getSetting_('TaxPercent') || 0);
    const tax = round2_((subtotal - discount) * taxPct / 100);
    const total = round2_(subtotal - discount + tax);
    const limit = Number(getSetting_('DiscountLimitPercent') || 10);
    const discPct = subtotal ? (discount / subtotal) * 100 : 0;
    if (discPct > limit) requireRole_(user, ['owner','admin']);
    const paid = round2_(Number(payload.paid || 0));
    if (paid < 0) throw new Error('Paid must be >= 0');
    if (paid > total + 0.01) throw new Error('Paid exceeds total');
    const due = round2_(total - paid);

    const saleID = uuid_('S'); const invoiceNo = nextInvoiceNo_();
    appendRow_('Sales', {
      SaleID: saleID, InvoiceNo: invoiceNo,
      CustomerID: payload.customerID || '', CustomerName: payload.customerName || 'Walk-in',
      Subtotal: subtotal, Discount: discount, Tax: tax, Total: total,
      Paid: paid, Due: due, PaymentMethod: payload.paymentMethod || 'Cash',
      Status: 'COMPLETED', CashierID: user.UserID, DeviceID: payload.deviceID || '',
      IdempotencyKey: payload.idempotencyKey, CreatedAt: now_(), Notes: payload.notes || ''
    });
    lineItems.forEach(li => {
      appendRow_('SaleItems', { ItemID: uuid_('SI'), SaleID: saleID, ProductID: li.ProductID,
        ProductName: li.ProductName, Qty: li.Qty, UnitPrice: li.UnitPrice,
        PurchasePrice: li.PurchasePrice, LineTotal: li.LineTotal });
      const p = readSheet_('Products').find(x => x.ProductID === li.ProductID);
      updateRow_('Products', 'ProductID', li.ProductID, { Stock: Number(p.Stock) - li.Qty, UpdatedAt: now_(), UpdatedBy: user.UserID });
    });
    if (payload.customerID && due > 0) {
      const cust = readSheet_('Customers').find(c => c.CustomerID === payload.customerID);
      if (cust) updateRow_('Customers', 'CustomerID', payload.customerID, { Balance: round2_(Number(cust.Balance||0) + due) });
    }
    const result = { ok: true, data: { SaleID: saleID, InvoiceNo: invoiceNo, Total: total, Paid: paid, Due: due, Items: lineItems } };
    appendRow_('Idempotency', { Key: payload.idempotencyKey, ResponseJSON: JSON.stringify(result), CreatedAt: now_() });
    audit_(user.UserID, 'SALE_CREATE', 'Sale', saleID, { InvoiceNo: invoiceNo, Total: total });
    return result;
  } catch (e) { return { ok: false, error: e.message }; }
  finally { lock.releaseLock(); }
}
function nextInvoiceNo_() {
  const s = sh_('Sales'); const last = s.getLastRow();
  const prefix = 'INV-' + Utilities.formatDate(new Date(), TZ, 'yyyyMM');
  if (last < 2) return prefix + '-0001';
  const h = s.getRange(1,1,1,s.getLastColumn()).getValues()[0];
  const c = h.indexOf('InvoiceNo') + 1;
  const invs = s.getRange(2, c, last - 1, 1).getValues().flat().filter(x => String(x).startsWith(prefix));
  const n = invs.length ? Math.max(...invs.map(x => parseInt(String(x).split('-')[2], 10) || 0)) : 0;
  return prefix + '-' + String(n + 1).padStart(4, '0');
}
function getSale_(user, saleID) {
  requireRole_(user, null);
  const sale = readSheet_('Sales').find(s => s.SaleID === saleID);
  if (!sale) throw new Error('Sale not found');
  const items = readSheet_('SaleItems').filter(i => i.SaleID === saleID);
  return { sale, items };
}
function listSales_(user, fromDate, toDate) {
  requireRole_(user, null);
  let sales = readSheet_('Sales');
  if (fromDate) sales = sales.filter(s => String(s.CreatedAt).slice(0,10) >= fromDate);
  if (toDate) sales = sales.filter(s => String(s.CreatedAt).slice(0,10) <= toDate);
  return sales.sort((a,b) => String(b.CreatedAt).localeCompare(String(a.CreatedAt)));
}

// ============ PURCHASES ============
function createPurchase_(payload) {
  const user = verifyToken_(payload.token);
  requireRole_(user, ['owner','admin']);
  if (!payload.items || !payload.items.length) throw new Error('No items');
  const lock = LockService.getScriptLock(); lock.tryLock(20000);
  try {
    const products = readSheet_('Products');
    const byID = new Map(products.map(p => [p.ProductID, p]));
    let subtotal = 0; const lines = [];
    for (const it of payload.items) {
      const p = byID.get(it.ProductID);
      if (!p) throw new Error('Unknown product: ' + it.ProductID);
      const qty = Number(it.Qty); if (!(qty > 0)) throw new Error('Qty invalid');
      const cost = Number(it.UnitCost); if (!(cost >= 0)) throw new Error('Cost invalid');
      subtotal += round2_(qty * cost);
      lines.push({ ProductID: p.ProductID, Qty: qty, UnitCost: cost, LineTotal: round2_(qty*cost) });
    }
    const paid = round2_(Number(payload.paid || 0));
    const due = round2_(subtotal - paid);
    const purchaseID = uuid_('PU');
    appendRow_('Purchases', { PurchaseID: purchaseID, SupplierID: payload.supplierID || '',
      SupplierInvoiceNo: payload.supplierInvoiceNo || '', Subtotal: subtotal, Paid: paid, Due: due,
      UserID: user.UserID, CreatedAt: now_(), Notes: payload.notes || '' });
    lines.forEach(l => {
      appendRow_('PurchaseItems', { ItemID: uuid_('PI'), PurchaseID: purchaseID, ProductID: l.ProductID, Qty: l.Qty, UnitCost: l.UnitCost, LineTotal: l.LineTotal });
      const p = readSheet_('Products').find(x => x.ProductID === l.ProductID);
      updateRow_('Products', 'ProductID', l.ProductID, { Stock: Number(p.Stock) + l.Qty, PurchasePrice: l.UnitCost, UpdatedAt: now_(), UpdatedBy: user.UserID });
    });
    if (payload.supplierID && due > 0) {
      const sup = readSheet_('Suppliers').find(s => s.SupplierID === payload.supplierID);
      if (sup) updateRow_('Suppliers', 'SupplierID', payload.supplierID, { Balance: round2_(Number(sup.Balance||0) + due) });
    }
    audit_(user.UserID, 'PURCHASE_CREATE', 'Purchase', purchaseID, { Total: subtotal });
    return { ok: true, data: { PurchaseID: purchaseID, Subtotal: subtotal, Paid: paid, Due: due } };
  } finally { lock.releaseLock(); }
}

// ============ CUSTOMERS ============
function saveCustomer_(user, c) {
  requireRole_(user, null);
  if (!c.Name) throw new Error('Name required');
  if (!c.CustomerID) {
    c.CustomerID = uuid_('C'); c.CreatedAt = now_(); c.Balance = Number(c.Balance || 0);
    appendRow_('Customers', c);
    audit_(user.UserID, 'CUSTOMER_CREATE', 'Customer', c.CustomerID, { Name: c.Name });
  } else {
    updateRow_('Customers', 'CustomerID', c.CustomerID, c);
    audit_(user.UserID, 'CUSTOMER_UPDATE', 'Customer', c.CustomerID, { Name: c.Name });
  }
  return c;
}
function listCustomers_(user) { requireRole_(user, null); return readSheet_('Customers'); }
function getCustomerLedger_(user, customerID) {
  requireRole_(user, null);
  const sales = readSheet_('Sales').filter(s => s.CustomerID === customerID).map(s => ({
    Date: s.CreatedAt, Type: 'Sale', Ref: s.InvoiceNo, Debit: s.Total, Credit: s.Paid
  }));
  const pays = readSheet_('CustomerPayments').filter(p => p.CustomerID === customerID).map(p => ({
    Date: p.CreatedAt, Type: 'Payment', Ref: p.PaymentID, Debit: 0, Credit: p.Amount
  }));
  const all = [...sales, ...pays].sort((a,b) => String(a.Date).localeCompare(String(b.Date)));
  let bal = 0;
  all.forEach(r => { bal += Number(r.Debit||0) - Number(r.Credit||0); r.Balance = round2_(bal); });
  return all;
}
function addCustomerPayment_(payload) {
  const user = verifyToken_(payload.token); requireRole_(user, null);
  if (!payload.customerID) throw new Error('customerID required');
  const amount = round2_(Number(payload.amount));
  if (!(amount > 0)) throw new Error('Amount invalid');
  const cust = readSheet_('Customers').find(c => c.CustomerID === payload.customerID);
  if (!cust) throw new Error('Customer not found');
  if (amount > Number(cust.Balance||0) + 0.01) throw new Error('Payment exceeds balance');
  const paymentID = uuid_('CP');
  appendRow_('CustomerPayments', { PaymentID: paymentID, CustomerID: payload.customerID,
    SaleID: payload.saleID || '', Amount: amount, Method: payload.method || 'Cash',
    UserID: user.UserID, CreatedAt: now_(), Notes: payload.notes || '' });
  updateRow_('Customers', 'CustomerID', payload.customerID, { Balance: round2_(Number(cust.Balance) - amount) });
  audit_(user.UserID, 'CUSTOMER_PAYMENT', 'Customer', payload.customerID, { Amount: amount });
  return { ok: true, data: { PaymentID: paymentID } };
}

// ============ SUPPLIERS ============
function saveSupplier_(user, s) {
  requireRole_(user, ['owner','admin']);
  if (!s.Name) throw new Error('Name required');
  if (!s.SupplierID) { s.SupplierID = uuid_('SU'); s.CreatedAt = now_(); s.Balance = Number(s.Balance||0); appendRow_('Suppliers', s); }
  else updateRow_('Suppliers', 'SupplierID', s.SupplierID, s);
  return s;
}
function listSuppliers_(user) { requireRole_(user, null); return readSheet_('Suppliers'); }
function addSupplierPayment_(payload) {
  const user = verifyToken_(payload.token); requireRole_(user, ['owner','admin']);
  const amount = round2_(Number(payload.amount));
  if (!(amount > 0)) throw new Error('Amount invalid');
  const sup = readSheet_('Suppliers').find(s => s.SupplierID === payload.supplierID);
  if (!sup) throw new Error('Supplier not found');
  const paymentID = uuid_('SP');
  appendRow_('SupplierPayments', { PaymentID: paymentID, SupplierID: payload.supplierID,
    PurchaseID: payload.purchaseID || '', Amount: amount, Method: payload.method || 'Cash',
    UserID: user.UserID, CreatedAt: now_(), Notes: payload.notes || '' });
  updateRow_('Suppliers', 'SupplierID', payload.supplierID, { Balance: round2_(Number(sup.Balance||0) - amount) });
  audit_(user.UserID, 'SUPPLIER_PAYMENT', 'Supplier', payload.supplierID, { Amount: amount });
  return { ok: true, data: { PaymentID: paymentID } };
}

// ============ RETURNS ============
function createReturn_(payload) {
  const user = verifyToken_(payload.token); requireRole_(user, ['owner','admin']);
  if (!payload.saleID) throw new Error('saleID required');
  if (!payload.items || !payload.items.length) throw new Error('No items');
  const lock = LockService.getScriptLock(); lock.tryLock(20000);
  try {
    const sale = readSheet_('Sales').find(s => s.SaleID === payload.saleID);
    if (!sale) throw new Error('Sale not found');
    const saleItems = readSheet_('SaleItems').filter(i => i.SaleID === payload.saleID);
    const prevReturns = readSheet_('ReturnItems');
    const returned = {};
    prevReturns.forEach(ri => {
      const original = saleItems.find(si => si.ProductID === ri.ProductID);
      if (original) returned[ri.ProductID] = (returned[ri.ProductID]||0) + Number(ri.Qty);
    });
    let total = 0; const lines = [];
    for (const it of payload.items) {
      const si = saleItems.find(x => x.ProductID === it.ProductID);
      if (!si) throw new Error('Product not in original sale: ' + it.ProductID);
      const alreadyReturned = returned[it.ProductID] || 0;
      const maxReturn = Number(si.Qty) - alreadyReturned;
      const qty = Number(it.Qty);
      if (!(qty > 0) || qty > maxReturn) throw new Error('Invalid return qty for ' + si.ProductName + ' (max ' + maxReturn + ')');
      const lineTotal = round2_(qty * Number(si.UnitPrice));
      total += lineTotal;
      lines.push({ ProductID: it.ProductID, Qty: qty, UnitPrice: Number(si.UnitPrice), LineTotal: lineTotal });
    }
    const returnID = uuid_('R');
    appendRow_('SalesReturns', { ReturnID: returnID, SaleID: payload.saleID, Reason: payload.reason || '',
      Total: round2_(total), RefundMethod: payload.refundMethod || 'Cash', UserID: user.UserID, CreatedAt: now_() });
    lines.forEach(l => {
      appendRow_('ReturnItems', { ItemID: uuid_('RI'), ReturnID: returnID, ProductID: l.ProductID,
        Qty: l.Qty, UnitPrice: l.UnitPrice, LineTotal: l.LineTotal });
      const p = readSheet_('Products').find(x => x.ProductID === l.ProductID);
      if (p) updateRow_('Products', 'ProductID', l.ProductID, { Stock: Number(p.Stock) + l.Qty, UpdatedAt: now_(), UpdatedBy: user.UserID });
    });
    if (payload.refundMethod === 'Credit' && sale.CustomerID) {
      const cust = readSheet_('Customers').find(c => c.CustomerID === sale.CustomerID);
      if (cust) updateRow_('Customers', 'CustomerID', sale.CustomerID, { Balance: round2_(Number(cust.Balance||0) - total) });
    }
    audit_(user.UserID, 'RETURN_CREATE', 'SaleReturn', returnID, { SaleID: payload.saleID, Total: total });
    return { ok: true, data: { ReturnID: returnID, Total: round2_(total) } };
  } finally { lock.releaseLock(); }
}

// ============ EXPENSES ============
function addExpense_(payload) {
  const user = verifyToken_(payload.token); requireRole_(user, null);
  const amount = round2_(Number(payload.amount));
  if (!(amount > 0)) throw new Error('Amount invalid');
  const expenseID = uuid_('E');
  appendRow_('Expenses', { ExpenseID: expenseID, Category: payload.category || 'General',
    Amount: amount, UserID: user.UserID, CreatedAt: now_(), Notes: payload.notes || '' });
  audit_(user.UserID, 'EXPENSE_ADD', 'Expense', expenseID, { Amount: amount, Category: payload.category });
  return { ok: true, data: { ExpenseID: expenseID } };
}
function listExpenses_(user, fromDate, toDate) {
  requireRole_(user, null);
  let rows = readSheet_('Expenses');
  if (fromDate) rows = rows.filter(r => String(r.CreatedAt).slice(0,10) >= fromDate);
  if (toDate) rows = rows.filter(r => String(r.CreatedAt).slice(0,10) <= toDate);
  return rows;
}

// ============ CASH REGISTER ============
function openRegister_(payload) {
  const user = verifyToken_(payload.token); requireRole_(user, null);
  const today = dateOnly_();
  const existing = readSheet_('CashRegister').find(r => r.Date === today && !r.ClosedAt);
  if (existing) throw new Error('Register already open for today');
  const regID = uuid_('RG');
  appendRow_('CashRegister', { RegID: regID, Date: today, OpeningCash: round2_(Number(payload.openingCash||0)),
    CashSales: 0, CashPaid: 0, CashExpenses: 0, Expected: 0, Actual: 0, Diff: 0,
    UserID: user.UserID, ClosedAt: '' });
  return { ok: true, data: { RegID: regID } };
}
function closeRegister_(payload) {
  const user = verifyToken_(payload.token); requireRole_(user, null);
  const today = dateOnly_();
  const reg = readSheet_('CashRegister').find(r => r.Date === today && !r.ClosedAt);
  if (!reg) throw new Error('No open register');
  const sales = readSheet_('Sales').filter(s => String(s.CreatedAt).slice(0,10) === today && s.PaymentMethod === 'Cash');
  const cashSales = sales.reduce((a, s) => a + Number(s.Paid||0), 0);
  const expenses = readSheet_('Expenses').filter(e => String(e.CreatedAt).slice(0,10) === today);
  const cashExpenses = expenses.reduce((a, e) => a + Number(e.Amount||0), 0);
  const expected = round2_(Number(reg.OpeningCash) + cashSales - cashExpenses);
  const actual = round2_(Number(payload.actual));
  updateRow_('CashRegister', 'RegID', reg.RegID, { CashSales: round2_(cashSales), CashExpenses: round2_(cashExpenses),
    Expected: expected, Actual: actual, Diff: round2_(actual - expected), ClosedAt: now_() });
  return { ok: true, data: { Expected: expected, Actual: actual, Diff: round2_(actual - expected) } };
}

// ============ REPORTS ============
function dashboard_(user) {
  requireRole_(user, null);
  const today = dateOnly_();
  const sales = readSheet_('Sales');
  const todaySales = sales.filter(s => String(s.CreatedAt).slice(0,10) === today);
  const totalSales = todaySales.reduce((a,s) => a + Number(s.Total||0), 0);
  const cashReceived = todaySales.reduce((a,s) => a + Number(s.Paid||0), 0);
  const dueToday = todaySales.reduce((a,s) => a + Number(s.Due||0), 0);
  const items = readSheet_('SaleItems').filter(i => todaySales.find(s => s.SaleID === i.SaleID));
  const cogs = items.reduce((a,i) => a + Number(i.PurchasePrice||0) * Number(i.Qty||0), 0);
  const expenses = readSheet_('Expenses').filter(e => String(e.CreatedAt).slice(0,10) === today);
  const totalExpenses = expenses.reduce((a,e) => a + Number(e.Amount||0), 0);
  const products = readSheet_('Products').filter(p => p.Active !== false);
  const lowStock = products.filter(p => Number(p.Stock) <= Number(p.MinStock||0));
  const allCustomers = readSheet_('Customers');
  const totalReceivable = allCustomers.reduce((a,c) => a + Number(c.Balance||0), 0);
  return { totalSales: round2_(totalSales), totalOrders: todaySales.length, cashReceived: round2_(cashReceived),
    dueToday: round2_(dueToday), grossProfit: round2_(totalSales - cogs), expenses: round2_(totalExpenses),
    netProfit: round2_(totalSales - cogs - totalExpenses), totalReceivable: round2_(totalReceivable),
    lowStockCount: lowStock.length, lowStock: lowStock.slice(0, 10) };
}
function salesReport_(user, from, to) {
  requireRole_(user, null);
  const sales = readSheet_('Sales').filter(s => String(s.CreatedAt).slice(0,10) >= from && String(s.CreatedAt).slice(0,10) <= to);
  const items = readSheet_('SaleItems').filter(i => sales.find(s => s.SaleID === i.SaleID));
  const cogs = items.reduce((a,i) => a + Number(i.PurchasePrice||0) * Number(i.Qty||0), 0);
  const revenue = sales.reduce((a,s) => a + Number(s.Total||0), 0);
  const expenses = readSheet_('Expenses').filter(e => String(e.CreatedAt).slice(0,10) >= from && String(e.CreatedAt).slice(0,10) <= to);
  const totalExpenses = expenses.reduce((a,e) => a + Number(e.Amount||0), 0);
  return { from, to, revenue: round2_(revenue), cogs: round2_(cogs), grossProfit: round2_(revenue - cogs),
    expenses: round2_(totalExpenses), netProfit: round2_(revenue - cogs - totalExpenses), orders: sales.length };
}
function productWiseReport_(user, from, to) {
  requireRole_(user, null);
  const sales = readSheet_('Sales').filter(s => String(s.CreatedAt).slice(0,10) >= from && String(s.CreatedAt).slice(0,10) <= to);
  const ids = new Set(sales.map(s => s.SaleID));
  const items = readSheet_('SaleItems').filter(i => ids.has(i.SaleID));
  const agg = {};
  items.forEach(i => {
    if (!agg[i.ProductID]) agg[i.ProductID] = { ProductID: i.ProductID, Name: i.ProductName, Qty: 0, Revenue: 0, Cost: 0 };
    agg[i.ProductID].Qty += Number(i.Qty);
    agg[i.ProductID].Revenue += Number(i.LineTotal);
    agg[i.ProductID].Cost += Number(i.PurchasePrice||0) * Number(i.Qty);
  });
  return Object.values(agg).map(r => ({ ...r, Qty: round2_(r.Qty), Revenue: round2_(r.Revenue), Cost: round2_(r.Cost), Profit: round2_(r.Revenue - r.Cost) }))
    .sort((a,b) => b.Revenue - a.Revenue);
}

// ============ CSV EXPORT ============
function exportCSV_(user, sheetName) {
  requireRole_(user, ['owner','admin']);
  const rows = readSheet_(sheetName);
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => {
    const v = r[h] == null ? '' : String(r[h]);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v;
  }).join(','))).join('\n');
  return csv;
}

// ============ PUBLIC ============
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const user = body.token ? verifyToken_(body.token) : null;
    switch (action) {
      case 'login': return json_(login_(body.username, body.password));
      case 'logout': return json_(logout_(body.token));
      case 'me': return json_(user ? { ok: true, data: user } : { ok: false, error: 'Not authenticated' });
      case 'getSettings': return json_({ ok: true, data: readSheet_('Settings') });
      case 'listProducts': return json_({ ok: true, data: listProducts_(user) });
      case 'saveProduct': return json_({ ok: true, data: saveProduct_(user, body.product) });
      case 'deleteProduct': return json_(deleteProduct_(user, body.productID));
      case 'createSale': return json_(createSale_(body));
      case 'getSale': return json_({ ok: true, data: getSale_(user, body.saleID) });
      case 'listSales': return json_({ ok: true, data: listSales_(user, body.from, body.to) });
      case 'createPurchase': return json_(createPurchase_(body));
      case 'saveCustomer': return json_({ ok: true, data: saveCustomer_(user, body.customer) });
      case 'listCustomers': return json_({ ok: true, data: listCustomers_(user) });
      case 'getCustomerLedger': return json_({ ok: true, data: getCustomerLedger_(user, body.customerID) });
      case 'addCustomerPayment': return json_(addCustomerPayment_(body));
      case 'saveSupplier': return json_({ ok: true, data: saveSupplier_(user, body.supplier) });
      case 'listSuppliers': return json_({ ok: true, data: listSuppliers_(user) });
      case 'addSupplierPayment': return json_(addSupplierPayment_(body));
      case 'createReturn': return json_(createReturn_(body));
      case 'addExpense': return json_(addExpense_(body));
      case 'listExpenses': return json_({ ok: true, data: listExpenses_(user, body.from, body.to) });
      case 'openRegister': return json_(openRegister_(body));
      case 'closeRegister': return json_(closeRegister_(body));
      case 'dashboard': return json_({ ok: true, data: dashboard_(user) });
      case 'salesReport': return json_({ ok: true, data: salesReport_(user, body.from, body.to) });
      case 'productWiseReport': return json_({ ok: true, data: productWiseReport_(user, body.from, body.to) });
      case 'exportCSV': return json_({ ok: true, data: exportCSV_(user, body.sheetName) });
      default: return json_({ ok: false, error: 'Unknown action: ' + action });
    }
  } catch (e) { return json_({ ok: false, error: e.message, stack: e.stack }); }
}
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'ping';
  if (action === 'setup') return json_(setup());
  return json_({ ok: true, data: { pong: true, time: now_() } });
}
function purgeIdempotency() {
  const s = sh_('Idempotency'), last = s.getLastRow(); if (last < 2) return;
  const rows = s.getRange(2, 1, last - 1, 3).getValues();
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (new Date(String(rows[i][2]).replace(' ','T')) < cutoff) s.deleteRow(i + 2);
  }
}
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('purgeIdempotency').timeBased().everyDays(1).atHour(3).create();
}
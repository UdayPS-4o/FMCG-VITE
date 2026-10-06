// Business KPI dashboard - web port of the VFP DASHBOARD.PRG
// Mounted at /api/dashboard/kpis
//
// Each KPI is its own endpoint so the frontend only loads the cards that are enabled.
// The DBF JSON exports are large (BILLDTL ~200MB), so every source file is parsed once,
// projected to the few fields we need, and cached until its mtime changes.

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- Date helpers (all dates handled as IST 'YYYY-MM-DD' strings) ----------
const toIstDate = (value) => {
  if (!value) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
};
const todayIst = () => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const fyStartYear = (ymd) => {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  return m < 4 ? y - 1 : y;
};
const fyLabel = (startYear) => `${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`;

// The third range tab covers the last N days (default 15, adjustable from the UI)
const DEFAULT_RANGE_DAYS = 15;
const MAX_RANGE_DAYS = 366;
const parseDays = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_RANGE_DAYS) : DEFAULT_RANGE_DAYS;
};

const getRefDates = (days = DEFAULT_RANGE_DAYS) => {
  const today = todayIst();
  const curMonStart = `${today.slice(0, 7)}-01`;
  const lastMonEnd = addDays(curMonStart, -1);
  const lastMonStart = `${lastMonEnd.slice(0, 7)}-01`;
  const fy = fyStartYear(today);
  return {
    today,
    yest: addDays(today, -1),
    days,
    rangeStart: addDays(today, -days),
    curMonStart,
    lastMonStart,
    lastMonEnd,
    fyStart: `${fy}-04-01`,
    fyEnd: `${fy + 1}-03-31`,
    fy,
  };
};

// ---------- Cached JSON loading ----------
const dataDir = (folder = process.env.DBF_FOLDER_PATH) => path.join(folder, 'data', 'json');

// Prior financial-year folders sit next to the current one: D01-2425, D01-2526, D01-2627 ...
const prevYearFolder = (yearsBack) => {
  const current = process.env.DBF_FOLDER_PATH || '';
  const m = path.basename(current).match(/^(.*?)(\d{2})(\d{2})$/);
  if (!m) return null;
  const start = Number(m[2]) - yearsBack;
  const name = `${m[1]}${String(start).padStart(2, '0')}${String(start + 1).padStart(2, '0')}`;
  return path.join(path.dirname(current), name);
};

// Same rule as the /dashboard page: needs "Dashboard" route access (Admins always allowed).
// req.user is set by the login middleware that runs before this router.
router.use((req, res, next) => {
  const access = req.user?.routeAccess || [];
  if (access.includes('Admin') || access.includes('Dashboard')) return next();
  return res.status(403).json({ message: 'Dashboard access required' });
});

const cache = new Map(); // key -> { mtimeMs, promise }

// Load `fileName` from `folder`, run `project(rows)` on it, and cache the result by mtime.
// The promise is cached so concurrent requests share a single parse of the file.
async function loadProjected(key, folder, fileName, project) {
  const filePath = path.join(dataDir(folder), fileName);
  let stat;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return project([]);
  }
  const cacheKey = `${key}:${filePath}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.promise;

  const promise = fs.promises.readFile(filePath, 'utf-8').then((text) => {
    const rows = JSON.parse(text);
    return project(Array.isArray(rows) ? rows.filter((r) => r && !r._deleted) : []);
  });
  cache.set(cacheKey, { mtimeMs: stat.mtimeMs, promise });
  promise.catch(() => {
    if (cache.get(cacheKey)?.promise === promise) cache.delete(cacheKey);
  });
  return promise;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v) => (v == null ? '' : String(v).trim());

const getBills = (folder) =>
  loadProjected('bill', folder, 'BILL.json', (rows) =>
    rows.map((r) => ({
      date: toIstDate(r.DATE),
      series: str(r.SERIES),
      bill: r.BILL,
      party: str(r.C_NAME),
      amount: num(r.N_B_AMT),
      cash: str(r.CASH) === 'Y',
      dueDays: num(r.DUE_DAYS),
      recd: str(r.RECD),
    }))
  );

const getCash = () =>
  loadProjected('cash', undefined, 'CASH.json', (rows) =>
    rows.map((r) => ({
      date: toIstDate(r.DATE),
      vr: str(r.VR).toUpperCase(),
      party: str(r.AC_NAME),
      remark: str(r.REMARK),
      cr: num(r.CR),
      dr: num(r.DR),
      group: str(r.M_GROUP1),
    }))
  );

const projectDetail = (rows) =>
  rows.map((r) => ({
    date: toIstDate(r.DATE),
    series: str(r.SERIES),
    bill: r.BILL,
    code: str(r.CODE),
    product: str(r.PRODUCT),
    unit: str(r.UNIT).toUpperCase(),
    multF: num(r.MULT_F),
    qty: num(r.QTY),
    net: num(r.NET10),
  }));

const getBillDtl = (folder) => loadProjected('billdtl', folder, 'BILLDTL.json', projectDetail);
const getPurDtl = () => loadProjected('purdtl', undefined, 'PURDTL.json', projectDetail);

const getPurchases = () =>
  loadProjected('pur', undefined, 'PUR.json', (rows) =>
    rows.map((r) => ({ date: toIstDate(r.DATE), series: str(r.SERIES), bill: r.BILL, party: str(r.C_NAME) }))
  );

const getCompanies = () =>
  loadProjected('company', undefined, 'COMPANY.json', (rows) => {
    const map = {};
    rows.forEach((r) => {
      if (r.C_CODE) map[str(r.C_CODE).toUpperCase()] = str(r.C_NAME);
    });
    return map;
  });

const getProducts = () =>
  loadProjected('pmpl', undefined, 'PMPL.json', (rows) =>
    rows.map((r) => ({ code: str(r.CODE), product: str(r.PRODUCT), stock: num(r.STK) }))
  );

// Monthly sales totals per FY for a year folder ({ 'YYYY-MM': amount })
const getMonthlyBillTotals = (folder) =>
  loadProjected('bill-monthly', folder, 'BILL.json', (rows) => {
    const out = {};
    rows.forEach((r) => {
      const d = toIstDate(r.DATE);
      if (!d) return;
      const k = d.slice(0, 7);
      out[k] = (out[k] || 0) + num(r.N_B_AMT);
    });
    return out;
  });

// Monthly company-wise totals for a year folder ({ 'YYYY-MM': { CC: amount } })
const getMonthlyCompanyTotals = (folder) =>
  loadProjected('billdtl-monthly', folder, 'BILLDTL.json', (rows) => {
    const out = {};
    rows.forEach((r) => {
      const net = num(r.NET10);
      if (net <= 0) return;
      const d = toIstDate(r.DATE);
      if (!d) return;
      const k = d.slice(0, 7);
      const cc = str(r.CODE).slice(0, 2).toUpperCase();
      out[k] = out[k] || {};
      out[k][cc] = (out[k][cc] || 0) + net;
    });
    return out;
  });

// ---------- Shared helpers ----------
const RANGES = ['today', 'yest', 'lastN'];
const inRange = (d, range, ref) => {
  if (!d) return false;
  if (range === 'today') return d === ref.today;
  if (range === 'yest') return d === ref.yest;
  return d >= ref.rangeStart && d <= ref.today;
};
const sum = (rows, key = 'amount') => rows.reduce((s, r) => s + num(r[key]), 0);
const round2 = (n) => Math.round(n * 100) / 100;
const companyLabel = (cc, companies) => `(${cc}) ${companies[cc] || ''}`.trim();

const byRange = (rows, ref, dateKey = 'date') => {
  const out = {};
  RANGES.forEach((range) => {
    const list = rows.filter((r) => inRange(r[dateKey], range, ref));
    out[range] = { rows: list, total: round2(sum(list)), count: list.length };
  });
  return out;
};

const companyBreakdown = (details, companies, ref) => {
  const out = {};
  RANGES.forEach((range) => {
    const totals = {};
    details.forEach((d) => {
      if (d.net <= 0 || !inRange(d.date, range, ref)) return;
      const cc = d.code.slice(0, 2).toUpperCase();
      totals[cc] = (totals[cc] || 0) + d.net;
    });
    const rows = Object.entries(totals)
      .map(([code, amount]) => ({ code, company: companyLabel(code, companies), amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount);
    out[range] = { rows, total: round2(sum(rows)), count: rows.length };
  });
  return out;
};

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
// 'YYYY-MM' -> { fy, idx } where idx is 0 for April .. 11 for March
const fyMonthIndex = (ym) => {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return { fy: m < 4 ? y - 1 : y, idx: m >= 4 ? m - 4 : m + 8 };
};

// ---------- KPI handlers ----------
const handlers = {
  // 1. SALES: bills for today / yesterday / last 15 days (cash vs credit)
  async sales(days) {
    const ref = getRefDates(days);
    const bills = await getBills();
    const rows = bills
      .filter((b) => b.date && b.date >= ref.rangeStart && b.date <= ref.today)
      .map((b) => ({ date: b.date, billNo: `${b.series}-${b.bill}`, party: b.party, amount: round2(b.amount), cash: b.cash }))
      .sort((a, b) => (a.date === b.date ? b.amount - a.amount : b.date.localeCompare(a.date)));
    return byRange(rows, ref);
  },

  // 2. CASH RECEIPTS (vouchers CR-*)
  async cash(days) {
    return receipts('CR', days);
  },

  // 3. CHEQUE / BANK RECEIPTS (vouchers BR-*)
  async cheque(days) {
    return receipts('BR', days);
  },

  // 4. DUE: unpaid bills whose (bill date + due days) falls in the range
  async due(days) {
    const ref = getRefDates(days);
    const bills = await getBills();
    const rows = bills
      .filter((b) => b.recd === 'N' && b.date)
      .map((b) => ({
        date: addDays(b.date, b.dueDays),
        billDate: b.date,
        billNo: `${b.series}-${b.bill}`,
        party: b.party,
        amount: round2(b.amount),
      }))
      .filter((r) => r.date >= ref.rangeStart && r.date <= ref.today)
      .sort((a, b) => (a.date === b.date ? b.amount - a.amount : b.date.localeCompare(a.date)));
    return byRange(rows, ref);
  },

  // 5. COMPANY-WISE SALES
  async 'company-sales'(days) {
    const [details, companies] = await Promise.all([getBillDtl(), getCompanies()]);
    return companyBreakdown(details, companies, getRefDates(days));
  },

  // 6. COMPANY-WISE PURCHASE
  async 'company-purchase'(days) {
    const [details, companies] = await Promise.all([getPurDtl(), getCompanies()]);
    return companyBreakdown(details, companies, getRefDates(days));
  },

  // 7. SALES TREND: monthly (current FY) and yearly comparison (last 3 FYs)
  async trend() {
    const ref = getRefDates();
    const companies = await getCompanies();
    const folders = [prevYearFolder(2), prevYearFolder(1), process.env.DBF_FOLDER_PATH].filter(Boolean);
    const fyYears = [ref.fy - 2, ref.fy - 1, ref.fy];

    const yearly = {}; // fy -> [12]
    const yearlyCo = {}; // fy -> [12] of { CC: amt }
    fyYears.forEach((fy) => {
      yearly[fy] = Array(12).fill(0);
      yearlyCo[fy] = Array.from({ length: 12 }, () => ({}));
    });

    for (const folder of folders) {
      const [monthTotals, coTotals] = await Promise.all([
        getMonthlyBillTotals(folder),
        getMonthlyCompanyTotals(folder),
      ]);
      Object.entries(monthTotals).forEach(([ym, amt]) => {
        const { fy, idx } = fyMonthIndex(ym);
        if (yearly[fy]) yearly[fy][idx] += amt;
      });
      Object.entries(coTotals).forEach(([ym, byCo]) => {
        const { fy, idx } = fyMonthIndex(ym);
        if (!yearlyCo[fy]) return;
        Object.entries(byCo).forEach(([cc, amt]) => {
          yearlyCo[fy][idx][cc] = (yearlyCo[fy][idx][cc] || 0) + amt;
        });
      });
    }

    const topCompanies = (obj, limit) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([cc, amount]) => ({ company: companyLabel(cc, companies), amount: Math.round(amount) }));

    const curValues = yearly[ref.fy].map(round2);
    const curTotalCo = {};
    yearlyCo[ref.fy].forEach((m) =>
      Object.entries(m).forEach(([cc, amt]) => {
        curTotalCo[cc] = (curTotalCo[cc] || 0) + amt;
      })
    );

    return {
      months: MONTHS,
      monthly: {
        fy: fyLabel(ref.fy),
        values: curValues,
        total: round2(sum(curValues.map((amount) => ({ amount })))),
        companies: yearlyCo[ref.fy].map((m) => topCompanies(m, 12)),
        totalCompanies: topCompanies(curTotalCo, 12),
      },
      yearly: fyYears.map((fy) => ({
        fy: fyLabel(fy),
        values: yearly[fy].map(round2),
        total: round2(yearly[fy].reduce((s, v) => s + v, 0)),
        companies: yearlyCo[fy].map((m) => topCompanies(m, 10)),
      })),
    };
  },

  // 8. SALES RECOVERY %: DT-group parties, sales (DR) vs recovery (CR)
  async 'sales-recovery'() {
    const ref = getRefDates();
    const cash = await getCash();
    const parties = new Map();
    cash.forEach((c) => {
      if (c.group !== 'DT' || !c.date || c.date < ref.fyStart || c.date > ref.today) return;
      const key = c.party || '(blank)';
      if (!parties.has(key)) {
        parties.set(key, { party: key, lastSales: 0, lastRec: 0, curSales: 0, curRec: 0, fySales: 0, fyRec: 0 });
      }
      const p = parties.get(key);
      if (c.date >= ref.lastMonStart && c.date <= ref.lastMonEnd) {
        p.lastSales += c.dr;
        p.lastRec += c.cr;
      }
      if (c.date >= ref.curMonStart) {
        p.curSales += c.dr;
        p.curRec += c.cr;
      }
      p.fySales += c.dr;
      p.fyRec += c.cr;
    });

    const rows = [...parties.values()]
      .filter((p) => p.lastSales || p.lastRec || p.curSales || p.curRec || p.fySales || p.fyRec)
      .map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'number' ? round2(v) : v])))
      .sort((a, b) => a.party.localeCompare(b.party));

    const totals = rows.reduce(
      (t, r) => {
        ['lastSales', 'lastRec', 'curSales', 'curRec', 'fySales', 'fyRec'].forEach((k) => (t[k] += r[k]));
        return t;
      },
      { lastSales: 0, lastRec: 0, curSales: 0, curRec: 0, fySales: 0, fyRec: 0 }
    );

    return {
      periods: {
        last: { from: ref.lastMonStart, to: ref.lastMonEnd },
        cur: { from: ref.curMonStart, to: ref.today },
        fy: { from: ref.fyStart, to: ref.today },
      },
      rows,
      totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])),
    };
  },

  // 9. STOCK ANALYSIS: fast / slow / non-moving based on last 90 days of sales (in PCS)
  async stock() {
    const LOOKBACK_DAYS = 90;
    const today = todayIst();
    const from = addDays(today, -LOOKBACK_DAYS);
    const [details, products] = await Promise.all([getBillDtl(), getProducts()]);

    const moved = new Map();
    details.forEach((d) => {
      if (!d.date || d.date < from) return;
      const pcs = d.unit === 'PCS' ? d.qty : d.qty * Math.max(d.multF, 1);
      moved.set(d.code, (moved.get(d.code) || 0) + pcs);
    });

    const productMap = new Map(products.map((p) => [p.code, p]));
    const fast = [];
    const slow = [];
    moved.forEach((totalQty, code) => {
      const p = productMap.get(code);
      if (!p) return;
      const avgQty = Math.round((totalQty / LOOKBACK_DAYS) * 100) / 100;
      const row = {
        code,
        product: p.product,
        avgQty,
        stock: p.stock,
        daysLeft: avgQty > 0 && p.stock > 0 ? Math.round(p.stock / avgQty) : null,
      };
      if (avgQty >= 2) fast.push(row);
      else if (avgQty > 0) slow.push(row);
    });
    fast.sort((a, b) => b.avgQty - a.avgQty);
    slow.sort((a, b) => b.avgQty - a.avgQty);

    const nonMoving = products
      .filter((p) => p.stock > 0 && !moved.has(p.code))
      .map((p) => ({ code: p.code, product: p.product, avgQty: 0, stock: p.stock, daysLeft: null }))
      .sort((a, b) => a.product.localeCompare(b.product));

    return { lookbackDays: LOOKBACK_DAYS, fast, slow, nonMoving };
  },
};

async function receipts(prefix, days) {
  const ref = getRefDates(days);
  const cash = await getCash();
  const rows = cash
    .filter((c) => c.cr > 0 && c.vr.startsWith(prefix) && c.date && c.date >= ref.rangeStart && c.date <= ref.today)
    .map((c) => ({ date: c.date, voucher: c.vr, party: c.party, remark: c.remark, amount: round2(c.cr) }))
    .sort((a, b) => (a.date === b.date ? b.amount - a.amount : b.date.localeCompare(a.date)));
  return byRange(rows, ref);
}

// Company drill-down (pie legend click): item-wise detail and summary
// GET /api/dashboard/kpis/company-detail?type=sales|purchase&code=MK&range=today|yest|lastN&days=15
router.get('/company-detail', async (req, res) => {
  try {
    const type = req.query.type === 'purchase' ? 'purchase' : 'sales';
    const code = str(req.query.code).toUpperCase().slice(0, 2);
    const range = RANGES.includes(req.query.range) ? req.query.range : 'today';
    if (!code) return res.status(400).json({ message: 'code is required' });

    const ref = getRefDates(parseDays(req.query.days));
    const [details, headers] =
      type === 'sales' ? await Promise.all([getBillDtl(), getBills()]) : await Promise.all([getPurDtl(), getPurchases()]);

    const partyByBill = new Map(headers.map((h) => [`${h.series}|${h.bill}|${h.date}`, h.party]));
    const unitLabel = (d) => (d.multF === 1 ? 'PCS' : 'BOX');

    const lines = details
      .filter((d) => d.net > 0 && d.code.slice(0, 2).toUpperCase() === code && inRange(d.date, range, ref))
      .map((d) => ({
        code: d.code,
        product: d.product,
        party: partyByBill.get(`${d.series}|${d.bill}|${d.date}`) || '',
        unit: unitLabel(d),
        qty: d.qty,
        amount: round2(d.net),
      }))
      .sort((a, b) => b.amount - a.amount);

    const summaryMap = new Map();
    lines.forEach((l) => {
      const key = `${l.code}|${l.unit}`;
      if (!summaryMap.has(key)) summaryMap.set(key, { code: l.code, product: l.product, unit: l.unit, qty: 0, amount: 0 });
      const s = summaryMap.get(key);
      s.qty += l.qty;
      s.amount = round2(s.amount + l.amount);
    });
    const summary = [...summaryMap.values()].sort((a, b) => b.amount - a.amount);

    res.json({ type, code, range, detail: lines, summary, total: round2(sum(lines)) });
  } catch (error) {
    console.error('Error building company detail:', error);
    res.status(500).json({ message: 'Error building company detail' });
  }
});

router.get('/:kpi', async (req, res) => {
  const handler = handlers[req.params.kpi];
  if (!handler) return res.status(404).json({ message: `Unknown KPI: ${req.params.kpi}` });
  try {
    const days = parseDays(req.query.days);
    const data = await handler(days);
    res.json({ kpi: req.params.kpi, generatedAt: new Date().toISOString(), ref: getRefDates(days), data });
  } catch (error) {
    console.error(`Error building KPI ${req.params.kpi}:`, error);
    res.status(500).json({ message: `Error building KPI ${req.params.kpi}` });
  }
});

module.exports = router;

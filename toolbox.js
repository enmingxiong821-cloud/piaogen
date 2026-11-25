/* 票根 V10.7 · 办事台
   账单月报 / 多账合并 / 权益账本 / 储值卡 / 续费决策 /
   找谁 / 诉求助手 / 保修日期卡 / 家庭体检单
   所有数据只在本机 localStorage；不上传、不代提交。 */
(function () {
  const A = window.PGApp;
  const D = window.PGToolboxData;
  if (!A || !D || window.PGToolbox) return;
  const { SCENARIOS, FRAUD_ITEMS, CATEGORIES } = D;
  const KEY = "piaogen.v0.toolbox";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = A.escapeHtml;
  const money = A.money;
  const uid = A.uid;

  const DEFAULTS = {
    cards: [], bills: [], imports: [], warranties: [], subs: [], stock: [], prices: [], reminders: [],
    decisions: {}, complaints: [], materials: {}, fraud: {},
    familyChecks: [], complaint: {}, settings: { mergeSame: true }
  };

  function loadDb() {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { data = {}; }
    const out = Object.assign({}, DEFAULTS, data);
    out.settings = Object.assign({}, DEFAULTS.settings, data.settings || {});
    ["cards", "bills", "imports", "warranties", "subs", "stock", "prices", "reminders", "complaints", "familyChecks"].forEach((k) => {
      if (!Array.isArray(out[k])) out[k] = [];
    });
    ["decisions", "materials", "fraud", "complaint"].forEach((k) => {
      if (!out[k] || typeof out[k] !== "object") out[k] = {};
    });
    return out;
  }

  let db = loadDb();
  let view = "list";
  let returnTo = "today";
  let accountTab = "coupon";
  let findQuery = "";
  let findCat = "全部";
  let reportMonth = "";
  let warrantyFilter = "all";
  let deadlineFilter = "all";
  let lastImport = null;
  let noticeText = "";
  let noticeItems = [];
  let buyResult = null;

  function saveDb() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { A.toast("本机存储空间不足，这次没有存下"); }
  }

  function isoToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function parseDate(value) {
    const m = String(value || "").match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function addMonths(date, months) {
    const d = new Date(date.getTime());
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + Number(months || 0));
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return d;
  }
  function addDays(date, days) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + Number(days || 0));
    return d;
  }
  function daysLeft(date) {
    if (!date) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(date.getTime()); target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }
  function fmtDate(d) {
    if (!d) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function monthOf(iso) { return String(iso || "").slice(0, 7); }
  function monthLabel(ym) {
    const [y, m] = String(ym || "").split("-");
    return y && m ? `${y} 年 ${Number(m)} 月` : "本月";
  }
  function normMerchant(value) {
    return String(value || "").toLowerCase()
      .replace(/[\s（）()·,，。.、_-]/g, "")
      .replace(/(有限公司|有限责任公司|旗舰店|专营店|官方店|生活号)$/g, "")
      .slice(0, 40);
  }
  function amountOf(value) {
    const n = Number(String(value || "").replace(/[¥￥,\s]/g, ""));
    return Number.isFinite(n) ? Math.abs(n) : null;
  }

  /* ---------- CSV ---------- */
  function parseTable(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    const s = String(text || "").replace(/^﻿/, "");
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quoted) {
        if (ch === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else quoted = false;
        } else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === "," || ch === "\t") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch !== "\r") field += ch;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim()));
  }

  function headerRow(rows) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const r = rows[i].map((c) => String(c).trim());
      const time = r.findIndex((c) => /交易时间|交易日期|^日期$|^时间$/.test(c));
      const amount = r.findIndex((c) => /金额/.test(c));
      if (time >= 0 && amount >= 0) return i;
    }
    return -1;
  }

  function sourceOf(name, headers) {
    const h = headers.join("|");
    if (/交易分类|商品说明|收\/付款方式/.test(h)) return "支付宝";
    if (/当前状态|支付方式|交易类型/.test(h)) return "微信";
    if (/银行|卡号|借贷标志/.test(h)) return "银行";
    if (/支付宝/i.test(name)) return "支付宝";
    if (/微信|wechat/i.test(name)) return "微信";
    return "其他";
  }

  function categoryOf(raw, merchant, desc) {
    const value = String(raw || "");
    const map = [
      [/充值缴费/, "充值缴费"], [/日用百货|购物|数码|服饰/, "购物"],
      [/餐饮|美食/, "餐饮"], [/交通|出行/, "交通"], [/医疗|健康/, "医疗"],
      [/教育|培训/, "教育"], [/住房|房租|物业/, "住房"], [/娱乐|旅游|酒店/, "娱乐"],
      [/转账|红包/, "转账"], [/金融|保险|理财/, "金融"]
    ];
    for (const [re, label] of map) if (re.test(value)) return label;
    const text = `${merchant} ${desc}`;
    const rules = [
      [/外卖|餐|饭|咖啡|奶茶|食堂|美团|饿了么/, "餐饮"],
      [/滴滴|地铁|公交|打车|加油|停车|高铁|火车|机票|航空/, "交通"],
      [/淘宝|天猫|京东|拼多多|超市|商场|便利店|旗舰店|百货/, "购物"],
      [/会员|续费|包月|订阅|话费|流量|宽带|水费|电费|燃气|物业/, "充值缴费"],
      [/学费|课程|培训|书店|教育/, "教育"],
      [/医院|药房|诊所|体检|口腔/, "医疗"],
      [/房租|租金|押金|家政|维修|装修/, "住房"],
      [/电影|游戏|演出|旅游|酒店|景区/, "娱乐"],
      [/转账|红包/, "转账"],
      [/保险|基金|理财|信用卡|分期/, "金融"]
    ];
    for (const [re, label] of rules) if (re.test(text)) return label;
    return "其他";
  }

  function rowsFromTable(rows, name) {
    const hi = headerRow(rows);
    if (hi < 0) return { rows: [], source: "其他", skipped: rows.length, reason: "找不到包含“交易时间”和“金额”的表头" };
    const headers = rows[hi].map((c) => String(c).trim());
    const col = (re) => headers.findIndex((c) => re.test(c));
    const idx = {
      date: col(/交易时间|交易日期|^日期$|^时间$/),
      merchant: col(/交易对方|商户|对方|商家|收款方|对方户名/),
      desc: col(/商品说明|商品|摘要|备注|用途|说明/),
      dir: col(/收\/支|收支|方向|借贷标志/),
      amount: col(/金额/),
      status: col(/状态/),
      category: col(/交易分类|分类/),
      pay: col(/支付方式|收\/付款方式/)
    };
    const source = sourceOf(name, headers);
    const out = [];
    let skipped = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      if (out.length >= 3000) break;
      const r = rows[i];
      let rawDate = String(r[idx.date] || "").trim();
      if (/^\d{5}(\.\d+)?$/.test(rawDate)) rawDate = excelDate(Number(rawDate));
      const date = parseDate(rawDate);
      const amount = amountOf(r[idx.amount]);
      const status = idx.status >= 0 ? String(r[idx.status] || "") : "";
      if (!date || amount === null || amount === 0) { skipped++; continue; }
      if (/关闭|失败|已撤销|已退款关闭|交易关闭/.test(status)) { skipped++; continue; }
      const merchant = String((idx.merchant >= 0 ? r[idx.merchant] : "") || "").trim()
        || String((idx.desc >= 0 ? r[idx.desc] : "") || "").trim() || "未注明商户";
      const desc = idx.desc >= 0 ? String(r[idx.desc] || "").trim() : "";
      const dirRaw = idx.dir >= 0 ? String(r[idx.dir] || "") : "";
      const direction = /收入|收|贷|入账/.test(dirRaw) && !/支出/.test(dirRaw) ? "income" : "expense";
      const timeMatch = rawDate.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
      out.push({
        date: fmtDate(date),
        time: timeMatch ? timeMatch[1] : "",
        merchant,
        desc,
        amount: Math.round(amount * 100) / 100,
        direction,
        status,
        category: categoryOf(idx.category >= 0 ? r[idx.category] : "", merchant, desc),
        source
      });
    }
    return { rows: out, source, skipped, reason: "" };
  }

  function billHash(row) {
    const base = [row.date, Number(row.amount).toFixed(2), row.direction, normMerchant(row.merchant)];
    if (!db.settings.mergeSame) base.push(row.source, row.time || "", normMerchant(row.desc));
    return base.join("|");
  }

  function ingestRows(rows, meta, person) {
    const existing = new Set(db.bills.map((b) => b.hash || billHash(b)));
    let added = 0;
    let dupes = 0;
    rows.forEach((row) => {
      row = Object.assign({}, row, { source: meta.source || row.source });
      const hash = billHash(row);
      if (existing.has(hash)) { dupes++; return; }
      existing.add(hash);
      db.bills.push(Object.assign({}, row, { id: uid(), hash, person: person || "本人" }));
      added++;
    });
    db.imports.push({
      id: uid(), at: new Date().toISOString(), source: meta.source || "其他",
      person: person || "本人", file: meta.file || "粘贴", total: rows.length, added, dupes
    });
    saveDb();
    return { added, dupes };
  }

  function decodeFile(file) {
    return file.arrayBuffer().then((buf) => {
      if (A.decodeBillBuffer) return A.decodeBillBuffer(buf);
      const utf8 = new TextDecoder("utf-8").decode(buf);
      if ((utf8.match(/�/g) || []).length > 2) {
        try { return new TextDecoder("gbk").decode(buf); } catch (e) {}
      }
      return utf8;
    });
  }

  function excelDate(serial) {
    const ms = Math.round((Number(serial) - 25569) * 86400000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  async function xlsxTable(buf) {
    if (!window.JSZip) return [];
    const zip = await window.JSZip.loadAsync(buf);
    const shared = [];
    const sharedFile = zip.file("xl/sharedStrings.xml");
    if (sharedFile) {
      const doc = new DOMParser().parseFromString(await sharedFile.async("string"), "application/xml");
      Array.from(doc.getElementsByTagName("si")).forEach((si) => {
        shared.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent || "").join(""));
      });
    }
    const sheetName = Object.keys(zip.files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
    if (!sheetName) return [];
    const doc = new DOMParser().parseFromString(await zip.file(sheetName).async("string"), "application/xml");
    const rows = [];
    const colIndex = (letters) => {
      let n = 0;
      for (const ch of String(letters || "").toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
      return Math.max(0, n - 1);
    };
    Array.from(doc.getElementsByTagName("row")).forEach((rowEl) => {
      const row = [];
      Array.from(rowEl.getElementsByTagName("c")).forEach((cell) => {
        const ref = cell.getAttribute("r") || "";
        const col = colIndex(ref.replace(/\d+/g, ""));
        const type = cell.getAttribute("t");
        let value = "";
        if (type === "s") {
          const idx = Number((cell.getElementsByTagName("v")[0] || {}).textContent);
          value = shared[idx] || "";
        } else if (type === "inlineStr") {
          value = Array.from(cell.getElementsByTagName("t")).map((t) => t.textContent || "").join("");
        } else {
          const v = cell.getElementsByTagName("v")[0];
          value = v ? v.textContent || "" : "";
        }
        row[col] = value;
      });
      rows.push(row);
    });
    return rows.filter((r) => r.some((cell) => String(cell || "").trim()));
  }

  async function readFileTable(file) {
    const buf = await file.arrayBuffer();
    if (/\.xlsx$/i.test(file.name) && window.JSZip) return xlsxTable(buf);
    return parseTable(await decodeFile(file));
  }

  /* ---------- 账单分析 ---------- */
  function billsOfMonth(ym) {
    return db.bills.filter((b) => monthOf(b.date) === ym)
      .sort((a, b) => String(b.date + b.time).localeCompare(String(a.date + a.time)));
  }
  function months() {
    return Array.from(new Set(db.bills.map((b) => monthOf(b.date)).filter(Boolean))).sort().reverse();
  }
  function sum(list) { return list.reduce((s, b) => s + (Number(b.amount) || 0), 0); }

  function suspectedSubs() {
    const map = new Map();
    db.bills.filter((b) => b.direction === "expense").forEach((b) => {
      const key = normMerchant(b.merchant);
      if (!key) return;
      if (!map.has(key)) map.set(key, { merchant: b.merchant, rows: [] });
      map.get(key).rows.push(b);
    });
    const out = [];
    map.forEach((item) => {
      const rows = item.rows.slice().sort((a, b) => a.date.localeCompare(b.date));
      if (rows.length < 2) return;
      const ms = Array.from(new Set(rows.map((r) => monthOf(r.date))));
      if (ms.length < 2) return;
      const amounts = rows.map((r) => Number(r.amount));
      const min = Math.min.apply(null, amounts);
      const max = Math.max.apply(null, amounts);
      if (!min || max / min > 1.2) return;
      const gaps = [];
      for (let i = 1; i < rows.length; i++) {
        const a = parseDate(rows[i - 1].date);
        const b = parseDate(rows[i].date);
        if (a && b) gaps.push(Math.round((b - a) / 86400000));
      }
      const monthly = gaps.some((g) => g >= 25 && g <= 40);
      const keyword = /会员|续费|包月|订阅|自动扣款|连续包月|保险|宽带|话费|云|存储|音乐|视频/.test(`${item.merchant} ${rows[0].desc || ""}`);
      if (!monthly && !keyword) return;
      const avg = sum(rows) / rows.length;
      out.push({
        key: normMerchant(item.merchant), merchant: item.merchant, count: rows.length,
        months: ms.length, avg, yearly: avg * 12, lastDate: rows[rows.length - 1].date,
        keyword, monthly
      });
    });
    return out.sort((a, b) => b.yearly - a.yearly);
  }

  function decisions() {
    return db.decisions || {};
  }
  function decisionOf(key) {
    return decisions()[key] || null;
  }
  function savingsOf(key, monthly) {
    const d = decisionOf(key);
    if (!d) return 0;
    if (d.decision === "cancel") return monthly * 12;
    if (d.decision === "down" && Number(d.newAmount) >= 0) return Math.max(0, (monthly - Number(d.newAmount)) * 12);
    return 0;
  }

  /* ---------- 渲染骨架 ---------- */
  function daysInMonth(ym) {
    const [y, m] = String(ym || "").split("-").map(Number);
    return y && m ? new Date(y, m, 0).getDate() : 30;
  }

  function stockDays(item) {
    const qty = Number(item.qty) || 0;
    const daily = Number(item.dailyUse) || 0;
    if (qty > 0 && daily > 0) return Math.floor(qty / daily);
    if (item.expire) return daysLeft(parseDate(item.expire));
    return null;
  }

  function deadlineItems() {
    const out = [];
    (A.state.tickets || []).forEach((t) => {
      (t.windows || []).forEach((w) => {
        if (w.status === "closed" || typeof w.daysLeft !== "number" || w.daysLeft < 0) return;
        out.push({
          kind: "right", title: t.product || t.merchant || "未命名权利",
          meta: w.label || "权利窗口", days: w.daysLeft, date: w.end || "",
          action: "case", id: t.id
        });
      });
    });
    (A.state.coupons || []).forEach((c) => {
      const d = A.couponDays ? A.couponDays(c) : null;
      if (d === null || d < 0) return;
      out.push({ kind: "coupon", title: c.name, meta: c.merchant || "券", days: d, date: c.expiresAt || "", amount: Number(c.amount) || 0, action: "coupon", id: c.id });
    });
    (A.state.points || []).forEach((p) => {
      const d = p.expiresAt ? daysLeft(parseDate(p.expiresAt)) : null;
      if (d === null || d < 0) return;
      out.push({ kind: "point", title: `${p.platform} 积分`, meta: `${Number(p.balance) || 0} 分`, days: d, date: p.expiresAt || "", action: "point", id: p.id });
    });
    allCards().forEach((c) => {
      const d = c.expire ? daysLeft(parseDate(c.expire)) : null;
      if (d === null || d < 0) return;
      out.push({ kind: "card", title: c.name, meta: `${c.merchant || c.type || "储值卡"} · 余额 ${money(Number(c.balance) || 0)}`, days: d, date: c.expire, amount: Number(c.balance) || 0, action: "card", id: c.id });
    });
    allSubs().forEach((s) => {
      const d = s.next ? daysLeft(parseDate(s.next)) : null;
      if (d === null || d < 0) return;
      out.push({ kind: "sub", title: s.merchant, meta: `下次约扣 ${money(s.monthly)}`, days: d, date: s.next, amount: s.monthly, action: "sub", id: s.key });
    });
    db.warranties.forEach((c) => {
      const exp = warrantyExpiry(c);
      const d = daysLeft(exp);
      if (d === null || d < 0) return;
      out.push({ kind: "warranty", title: c.name, meta: "保修到期", days: d, date: fmtDate(exp), action: "warranty", id: c.id });
    });
    (db.reminders || []).forEach((r) => {
      const d = r.date ? daysLeft(parseDate(r.date)) : null;
      if (d === null || d < 0) return;
      out.push({ kind: "reminder", title: r.title, meta: r.note || "我自己加的提醒", days: d, date: r.date, action: "reminder", id: r.id });
    });
    return out.sort((a, b) => a.days - b.days);
  }

  function dailyBrief() {
    const all = deadlineItems();
    const soon = all.filter((item) => item.days <= 7);
    const value = soon.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const lowStock = (db.stock || []).map((s) => ({ ...s, days: stockDays(s) }))
      .filter((s) => s.days !== null && s.days >= 0 && s.days <= 7)
      .sort((a, b) => a.days - b.days);
    return { all, soon, value, lowStock };
  }

  function priceGroups() {
    const map = new Map();
    (db.prices || []).forEach((p) => {
      const key = normMerchant(p.item);
      if (!key) return;
      if (!map.has(key)) map.set(key, { key, item: p.item, rows: [] });
      map.get(key).rows.push(p);
    });
    const out = [];
    map.forEach((g) => {
      const rows = g.rows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const latest = rows[0];
      const prev = rows[1] || null;
      const amounts = rows.map((r) => Number(r.amount) || 0).filter((n) => n > 0);
      out.push({
        key: g.key, item: g.item, rows, latest, prev,
        delta: prev ? (Number(latest.amount) || 0) - (Number(prev.amount) || 0) : null,
        low: amounts.length ? Math.min.apply(null, amounts) : null,
        high: amounts.length ? Math.max.apply(null, amounts) : null
      });
    });
    return out.sort((a, b) => String(b.latest.date).localeCompare(String(a.latest.date)));
  }

  function head(kicker, title, sub, backAction) {
    return `<div class="tb-head">
      <button class="icon-btn" type="button" data-tb="${backAction || "back"}" aria-label="返回">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div><p class="eyebrow">${esc(kicker)}</p><h1>${esc(title)}</h1></div>
    </div>${sub ? `<p class="lede">${esc(sub)}</p>` : ""}`;
  }

  function emptyBlock(text, actionLabel, action) {
    return `<div class="tb-empty"><p>${esc(text)}</p>
      <button class="btn ghost" type="button" data-tb="${action}">${esc(actionLabel)}</button></div>`;
  }

  function render() {
    const host = $("#toolboxBody");
    if (!host) return;
    if (view === "inbox") host.innerHTML = renderInbox();
    else if (view === "bill") host.innerHTML = renderBill();
    else if (view === "deadline") host.innerHTML = renderDeadline();
    else if (view === "prices") host.innerHTML = renderPrices();
    else if (view === "accounts") host.innerHTML = renderAccounts();
    else if (view === "subs") host.innerHTML = renderSubs();
    else if (view === "find") host.innerHTML = renderFind();
    else if (view.startsWith("findDetail")) host.innerHTML = renderFindDetail();
    else if (view === "complaint") host.innerHTML = renderComplaint();
    else if (view === "warranty") host.innerHTML = renderWarranty();
    else if (view === "family") host.innerHTML = renderFamily();
    else host.innerHTML = renderList();
    if (view === "complaint") bindComplaintPreview();
  }

  function open(next, origin) {
    view = next || "list";
    if (origin) returnTo = origin;
    if (window.PGApp && A.show) {
      if (!$('[data-screen="toolbox"]').classList.contains("on")) A.show("toolbox");
      else render();
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }

  function renderList() {
    const bills = db.bills.length;
    const cards = db.cards.length;
    const cardBalance = db.cards.reduce((s, c) => s + (Number(c.balance) || 0), 0);
    const warranties = db.warranties.length;
    const subs = allSubs();
    const pending = subs.filter((s) => !decisionOf(s.key)).length;
    const brief = dailyBrief();
    const briefRows = [
      ...brief.soon.slice(0, 3).map((item) => ({ title: item.title, meta: item.meta, days: item.days, action: "deadline" })),
      ...brief.lowStock.slice(0, 2).map((item) => ({ title: item.name, meta: `囤货 · 还够 ${item.days} 天`, days: item.days, action: "accounts" }))
    ].sort((a, b) => a.days - b.days).slice(0, 3);
    const groups = [
      {
        label: "收件", items: [
          { id: "inbox", k: "收件", title: "收件箱", desc: "把扣款、退款、到期、催缴的短信贴进来，先认出它要你做什么。", meta: noticeItems.length ? `${noticeItems.length} 条已识别` : "粘贴一条通知试试" }
        ]
      },
      {
        label: "管钱", items: [
          { id: "bill", k: "账单", title: "账单月报", desc: "CSV / Excel 合并去重，月度分类、按人归集、可疑续费。", meta: bills ? `${bills} 笔流水` : "还没有导入" },
          { id: "deadline", k: "到期", title: "还能退", desc: "权利、券、积分、卡、续费、保修，按截止日排成一张单。", meta: brief.all.length ? `${brief.all.length} 项有日期` : "还没有到期项" },
          { id: "subs", k: "续费", title: "续费决策", desc: "关、降、留，一项一项定；算清一年到底要付多少。", meta: pending ? `${pending} 项待决定` : subs.length ? `${subs.length} 项已过一遍` : "还没有识别到续费" },
          { id: "accounts", k: "权益", title: "权益账本", desc: "券、积分、囤货、储值卡四本账，一起看到期。", meta: cards ? `${cards} 张卡 · ${money(cardBalance)}` : "券 / 积分 / 囤货 / 储值" },
          { id: "cards", k: "储值", title: "储值卡 / 会员卡", desc: "余额、次数、到期日；关店跑路时一键转资金案卷。", meta: cards ? `${cards} 张 · ${money(cardBalance)}` : "还没有登记" },
          { id: "prices", k: "比价", title: "比价卡", desc: "只记你亲眼看到的价格；涨了、降了、买贵了，一眼看到。", meta: db.prices.length ? `${priceGroups().length} 件商品 · ${db.prices.length} 条价格` : "还没有价格记录" }
        ]
      },
      {
        label: "办事", items: [
          { id: "find", k: "找谁", title: "找谁", desc: `${SCENARIOS.length} 类生活麻烦：先找谁、怎么走、带什么。`, meta: "含官方热线与材料清单" },
          { id: "complaint", k: "诉求", title: "诉求助手", desc: "把经过写成标题、事实、诉求和材料清单，可直接粘贴。", meta: db.complaints.length ? `${db.complaints.length} 份草稿` : "不代提交" },
          { id: "warranty", k: "保修", title: "保修日期卡", desc: "购买日 + 保修月数，算到哪天；缺什么材料一眼看到。", meta: warranties ? `${warranties} 台设备` : "也可以从票据生成" }
        ]
      },
      {
        label: "给家", items: [
          { id: "family", k: "家庭", title: "家庭体检单", desc: "账单、订阅、卡、权利、防诈合成一张给爸妈看的单子。", meta: "可打印 / 可转发" }
        ]
      }
    ];
    return `${head("办事台", "十一件事，办完都留回执。", "账单看明白只是第一步；找谁、带什么、办到哪一步，才是票根要留下的事。", "exit")}
      <div class="tb-stats">
        <div><b>${bills}</b><span>笔流水</span></div>
        <div><b>${money(cardBalance)}</b><span>储值余额</span></div>
        <div><b>${brief.soon.length}</b><span>7 天内到期</span></div>
      </div>
      <div class="tb-brief">
        <div class="tb-brief-head"><b>今天先办</b><span>${briefRows.length ? `${briefRows.length} 件` : "没有急件"}</span></div>
        ${briefRows.length ? briefRows.map((row) => `<button type="button" data-tb="brief-open" data-view="${row.action}">
          <span>${esc(row.title)}</span><small>${esc(row.meta)}</small><em class="${row.days <= 1 ? "warn" : ""}">${row.days === 0 ? "今天" : `${row.days} 天`}</em>
        </button>`).join("") : `<p>今天没有到期项。可以先做一次账单体检，或把家里的卡和券记进来。</p>`}
        <button class="tb-brief-all" type="button" data-tb="go" data-view="deadline">看全部到期项 ›</button>
      </div>
      <section class="tb-group"><h2>全部 11 件</h2><div class="tb-grid">
        ${groups.flatMap((g) => g.items).map((item) => `<button class="tb-card" type="button" data-tb="go" data-view="${item.id}">
          <span class="tb-k">${item.k}</span>
          <b>${esc(item.title)}</b>
          <span class="tb-desc">${esc(item.desc)}</span>
          <em>${esc(item.meta)}</em>
        </button>`).join("")}
      </div></section>
      <p class="note">所有记录只在本机。票根整理路径与材料，不代提交、不代收款，也不承诺处理结果。</p>`;
  }

  /* ---------- 账单月报 ---------- */
  function renderBill() {
    const ms = months();
    if (!ms.length) {
      return `${head("账单月报", "先把手里的账单放进来。", "支持支付宝、微信和银行导出的 CSV；文件只在本机解析。", "back")}
        ${emptyBlock("还没有账单。导入一份 CSV，或直接粘一段流水。", "导入 CSV", "billImport")}
        <div class="tb-actions"><button class="btn ghost" type="button" data-tb="billPaste">粘贴账单</button></div>
        <p class="note">不登录、不抓取；只读你主动选择的文件。</p>`;
    }
    if (!reportMonth || !ms.includes(reportMonth)) reportMonth = ms[0];
    const rows = billsOfMonth(reportMonth);
    const expenses = rows.filter((b) => b.direction === "expense");
    const income = rows.filter((b) => b.direction === "income");
    const expTotal = sum(expenses);
    const incTotal = sum(income);
    const prev = ms.indexOf(reportMonth) + 1 < ms.length ? billsOfMonth(ms[ms.indexOf(reportMonth) + 1]).filter((b) => b.direction === "expense") : [];
    const prevTotal = sum(prev);
    const delta = prevTotal >= 100 ? Math.round((expTotal - prevTotal) / prevTotal * 100) : null;
    const byCat = new Map();
    expenses.forEach((b) => byCat.set(b.category, (byCat.get(b.category) || 0) + b.amount));
    const cats = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]);
    const maxCat = cats.length ? cats[0][1] : 1;
    const byMerchant = new Map();
    expenses.forEach((b) => {
      const key = normMerchant(b.merchant);
      byMerchant.set(key, (byMerchant.get(key) || 0) + b.amount);
    });
    const top = Array.from(byMerchant.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([key, value]) => {
        const sample = expenses.find((b) => normMerchant(b.merchant) === key);
        return { name: sample ? sample.merchant : key, value };
      });
    const byPerson = new Map();
    rows.forEach((b) => byPerson.set(b.person || "本人", (byPerson.get(b.person || "本人") || 0) + (b.direction === "expense" ? b.amount : 0)));
    const subs = suspectedSubs().filter((s) => s.months >= 2);
    const dupes = db.imports.reduce((s, i) => s + (Number(i.dupes) || 0), 0);
    const accounts = db.imports.slice(-4).reverse();
    const dayCount = daysInMonth(reportMonth);
    const daily = expTotal / dayCount;
    const refunds = rows.filter((b) => b.direction !== "expense" && /退款|退回|退货|refund/i.test(`${b.merchant} ${b.desc || ""}`));
    const refundTotal = sum(refunds);
    const biggest = expenses.slice().sort((a, b) => b.amount - a.amount)[0] || null;
    const undecidedSubs = subs.filter((s) => !decisionOf(normMerchant(s.merchant)));
    const subLeak = undecidedSubs.reduce((s, x) => s + (Number(x.avg) || 0), 0);
    const couponLeak = (A.state.coupons || []).reduce((s, c) => {
      const d = A.couponDays ? A.couponDays(c) : null;
      return d !== null && d >= 0 && d <= 30 ? s + (Number(c.amount) || 0) : s;
    }, 0);
    const cardLeak = allCards().reduce((s, c) => {
      const d = c.expire ? daysLeft(parseDate(c.expire)) : null;
      return d !== null && d >= 0 && d <= 30 ? s + (Number(c.balance) || 0) : s;
    }, 0);
    const leakRows = [
      undecidedSubs.length ? { label: "还没决定的续费", value: subLeak, note: `${undecidedSubs.length} 项，按月均算一个月`, action: "go", go: "subs" } : null,
      couponLeak ? { label: "30 天内到期的券", value: couponLeak, note: "券面金额，不用就作废", action: "go", go: "accounts" } : null,
      cardLeak ? { label: "30 天内到期的卡余额", value: cardLeak, note: "储值/次卡余额，过期可能作废", action: "go", go: "accounts" } : null
    ].filter(Boolean);
    const leakTotal = leakRows.reduce((s, r) => s + r.value, 0);
    return `${head("账单月报", monthLabel(reportMonth), "先看总数，再看分类和可疑续费；重复导入会按同日同额同商户合并。", "back")}
      <div class="tb-toolbar">
        <label class="tb-select"><span>月份</span><select id="tbMonth">${ms.map((m) => `<option value="${m}" ${m === reportMonth ? "selected" : ""}>${monthLabel(m)}</option>`).join("")}</select></label>
        <button class="link-btn" type="button" data-tb="billImport">+ 导入</button>
        <button class="link-btn" type="button" data-tb="billPaste">+ 粘贴</button>
      </div>
      <div class="tb-stats">
        <div><b>${money(expTotal)}</b><span>支出</span></div>
        <div><b>${money(incTotal)}</b><span>收入</span></div>
        <div><b>${delta === null ? "—" : (delta >= 0 ? "+" : "") + delta + "%"}</b><span>较上月</span></div>
      </div>
      <div class="tb-chips">${Array.from(byPerson.entries()).map(([p, v]) => `<span>${esc(p)} · ${money(v)}</span>`).join("")}
        <span>日均 ${money(daily)}</span>
        ${refunds.length ? `<span>退款 ${refunds.length} 笔 · ${money(refundTotal)}</span>` : ""}
        ${dupes ? `<span class="tb-chip-warn">已合并重复 ${dupes} 笔</span>` : ""}</div>
      <section class="tb-section"><div class="tb-section-head"><h2>钱花在哪</h2><span>${cats.length} 类 · 占比</span></div>
        ${cats.length ? cats.map(([name, value]) => `<div class="tb-bar-row">
          <span>${esc(name)}</span><i><b style="width:${Math.max(3, Math.round(value / maxCat * 100))}%"></b></i><em>${money(value)} · ${expTotal ? Math.round(value / expTotal * 100) : 0}%</em>
        </div>`).join("") : `<p class="tb-none">这个月没有支出记录。</p>`}
        ${biggest ? `<p class="tb-hint">最大一笔：${esc(biggest.date.slice(5))} ${esc(biggest.merchant)} ${money(biggest.amount)}（${esc(biggest.category)}）。</p>` : ""}
      </section>
      ${leakRows.length ? `<section class="tb-section"><div class="tb-section-head"><h2>可能白花的钱</h2><span>${money(leakTotal)} 未处理</span></div>
        <p class="tb-hint">不计入本月支出。三笔分开算：没决定的续费按月均、券按券面、卡按余额；是线索，不是已损失。</p>
        ${leakRows.map((r) => `<div class="tb-line"><span><b>${esc(r.label)}</b><small>${esc(r.note)}</small></span>
          <span class="tb-line-actions"><b>${money(r.value)}</b><button class="link-btn" type="button" data-tb="${r.action}" data-view="${r.go}">去看</button></span></div>`).join("")}
      </section>` : ""}
      <section class="tb-section"><div class="tb-section-head"><h2>花得最多</h2><span>前 5</span></div>
        ${top.length ? top.map((m) => `<div class="tb-line"><span>${esc(m.name)}</span><b>${money(m.value)}</b></div>`).join("") : `<p class="tb-none">没有可排的商户。</p>`}
      </section>
      <section class="tb-section"><div class="tb-section-head"><h2>可疑续费</h2><span>${subs.length} 项</span></div>
        <p class="tb-hint">同一商户跨月重复、金额接近、间隔约一个月。只是线索，不是结论。</p>
        ${subs.length ? subs.map((s) => `<div class="tb-sub-row">
          <div><b>${esc(s.merchant)}</b><small>${s.months} 个月 · ${s.count} 笔 · 月均 ${money(s.avg)} · 最近 ${esc(s.lastDate)}</small></div>
          <div class="tb-sub-actions">
            <em>${money(s.yearly)}/年</em>
            <button class="text-btn" type="button" data-tb="bill-sub" data-merchant="${esc(s.merchant)}" data-amount="${s.avg}" data-date="${esc(s.lastDate)}">建续费案卷</button>
          </div>
        </div>`).join("") : `<p class="tb-none">还没有跨月重复扣费的迹象。</p>`}
      </section>
      <section class="tb-section"><div class="tb-section-head"><h2>本月流水</h2><span>${rows.length} 笔</span></div>
        <div class="tb-bill-list">${rows.slice(0, 30).map((b) => `<div class="tb-bill-row">
          <span class="tb-date">${esc(b.date.slice(5))}</span>
          <span class="tb-merchant"><b>${esc(b.merchant)}</b><small>${esc(b.category)} · ${esc(b.source)} · ${esc(b.person || "本人")}</small></span>
          <em class="${b.direction === "income" ? "in" : ""}">${b.direction === "income" ? "+" : "−"}${money(b.amount)}</em>
          <button class="link-btn tb-bill-del" type="button" data-tb="bill-del" data-id="${b.id}" aria-label="删除这笔">删</button>
        </div>`).join("")}</div>
        ${rows.length > 30 ? `<p class="tb-hint">只显示最近 30 笔；导出 CSV 可看全部。</p>` : ""}
      </section>
      <section class="tb-section"><div class="tb-section-head"><h2>导入记录</h2><span>${db.imports.length} 次</span></div>
        ${accounts.map((i) => `<div class="tb-line"><span>${esc(i.file)} · ${esc(i.person)} · ${esc(i.source)}</span><b>+${i.added}${i.dupes ? ` / 合并 ${i.dupes}` : ""}</b></div>`).join("")}
      </section>
      <div class="tb-actions">
        <button class="btn ghost" type="button" data-tb="billExport">导出本月 CSV</button>
        <button class="btn ghost" type="button" data-tb="billClear">清空账本</button>
      </div>
      <p class="note">金额只做分类与对比；退款以原渠道到账为准。没有公开依据的天数不倒计时。</p>`;
  }

  function openBillImport() {
    A.openSheet("导入账单", `
      <p class="sheet-hint">支持支付宝、微信、银行导出的 CSV 或 Excel（.xlsx，读第一个工作表）；可一次选多个文件。文件只在本机解析，不上传。</p>
      <label class="tb-file">选择 CSV / Excel<input id="tbFiles" type="file" accept=".csv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple /></label>
      <div class="tb-preview" id="tbPreview">还没有选择文件。</div>
      <label class="field"><span>这笔账是谁的</span>
        <select id="tbPerson"><option>本人</option><option>爸爸</option><option>妈妈</option><option>伴侣</option><option>孩子</option><option>全家</option></select>
      </label>
      <label class="tb-check"><input id="tbMergeSame" type="checkbox" ${db.settings.mergeSame ? "checked" : ""} /><span>把同日同额同商户视为同一笔（跨支付宝/微信去重）</span></label>
      <div class="sheet-actions">
        <button class="btn primary" id="tbImportGo" type="button" disabled>确认导入</button>
        <button class="btn ghost" id="tbImportCancel" type="button">取消</button>
      </div>`, () => {
      let pending = [];
      $("#tbImportCancel").onclick = A.closeSheet;
      $("#tbFiles").onchange = async () => {
        const files = Array.from($("#tbFiles").files || []);
        pending = [];
        $("#tbPreview").textContent = "正在解析…";
        for (const file of files) {
          try {
            const table = await readFileTable(file);
            const parsed = rowsFromTable(table, file.name);
            if (parsed.rows.length) pending.push({ rows: parsed.rows, source: parsed.source, file: file.name });
          } catch (e) { /* 单个文件失败不阻塞其他文件 */ }
        }
        const total = pending.reduce((s, p) => s + p.rows.length, 0);
        if (!total) {
          $("#tbPreview").textContent = "没有读到可用流水。确认文件里有“交易时间”和“金额”两列。";
          $("#tbImportGo").disabled = true;
          return;
        }
        $("#tbPreview").innerHTML = `<p>读到 <b>${total}</b> 笔，来自 ${pending.length} 个文件。</p>
          <div class="tb-preview-list">${pending.flatMap((p) => p.rows.slice(0, 3)).slice(0, 8).map((r) => `<div><span>${esc(r.date)} · ${esc(r.merchant)}</span><b>${money(r.amount)}</b></div>`).join("")}</div>`;
        $("#tbImportGo").disabled = false;
      };
      $("#tbImportGo").onclick = () => {
        const person = $("#tbPerson").value;
        db.settings.mergeSame = $("#tbMergeSame").checked;
        saveDb();
        let added = 0;
        let dupes = 0;
        pending.forEach((p) => {
          const res = ingestRows(p.rows, { source: p.source, file: p.file }, person);
          added += res.added;
          dupes += res.dupes;
        });
        A.closeSheet();
        A.toast(`导入 ${added} 笔${dupes ? `，合并重复 ${dupes} 笔` : ""}`);
        open("bill");
      };
    });
  }

  function openBillPaste() {
    A.openSheet("粘贴账单", `
      <p class="sheet-hint">把支付宝/微信导出的 CSV 文本直接粘进来也行。第一行要包含“交易时间”和“金额”。</p>
      <textarea class="sheet-textarea" id="tbPasteText" rows="8" placeholder="交易时间,交易对方,商品说明,收/支,金额,交易状态&#10;2026-11-01 10:00:00,某视频会员,连续包月,支出,25.00,交易成功"></textarea>
      <label class="field"><span>来源</span><select id="tbPasteSource"><option>支付宝</option><option>微信</option><option>银行</option><option>其他</option></select></label>
      <label class="field"><span>这笔账是谁的</span><select id="tbPastePerson"><option>本人</option><option>爸爸</option><option>妈妈</option><option>伴侣</option><option>孩子</option><option>全家</option></select></label>
      <label class="tb-check"><input id="tbPasteMerge" type="checkbox" ${db.settings.mergeSame ? "checked" : ""} /><span>把同日同额同商户视为同一笔</span></label>
      <div class="sheet-actions">
        <button class="btn primary" id="tbPasteGo" type="button">解析并导入</button>
        <button class="btn ghost" id="tbPasteCancel" type="button">取消</button>
      </div>`, () => {
      $("#tbPasteCancel").onclick = A.closeSheet;
      $("#tbPasteGo").onclick = () => {
        const text = $("#tbPasteText").value.trim();
        if (!text) { A.toast("先粘一段账单"); return; }
        const parsed = rowsFromTable(parseTable(text), $("#tbPasteSource").value);
        if (!parsed.rows.length) { A.toast(parsed.reason || "没有读到可用流水"); return; }
        db.settings.mergeSame = $("#tbPasteMerge").checked;
        saveDb();
        const res = ingestRows(parsed.rows, { source: parsed.source, file: "粘贴" }, $("#tbPastePerson").value);
        A.closeSheet();
        A.toast(`导入 ${res.added} 笔${res.dupes ? `，合并 ${res.dupes} 笔` : ""}`);
        open("bill");
      };
    });
  }

  function exportMonthCsv() {
    const rows = billsOfMonth(reportMonth);
    const head = ["日期", "时间", "商户", "说明", "分类", "收支", "金额", "来源", "成员"];
    const lines = [head.join(",")].concat(rows.map((b) => [
      b.date, b.time || "", b.merchant, b.desc || "", b.category,
      b.direction === "income" ? "收入" : "支出", b.amount.toFixed(2), b.source, b.person || "本人"
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")));
    download(`票根_账单月报_${reportMonth}.csv`, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
    A.toast("已导出本月流水");
  }

  /* ---------- 还能退 / 比价卡 ---------- */
  function deadlineText() {
    const items = deadlineItems();
    const lines = [`票根 · 还能退（${isoToday()}）`];
    if (!items.length) lines.push("没有带日期的到期项。");
    items.forEach((item) => lines.push(`${item.days === 0 ? "今天" : `${item.days} 天后`} · ${item.title} · ${item.meta}${item.date ? ` · ${item.date}` : ""}`));
    lines.push("", "日期来自票据、券面、卡面与账单；没有公开依据的项目不倒计时。");
    return lines.join("\n");
  }

  function exportDeadlineIcs() {
    const items = deadlineItems().filter((item) => item.date);
    if (!items.length) { A.toast("没有带日期的项目"); return; }
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Piaogen//V10.5//CN", "CALSCALE:GREGORIAN"];
    items.forEach((item, index) => {
      const d = String(item.date).replace(/-/g, "");
      lines.push("BEGIN:VEVENT", `UID:piaogen-${index}-${d}@local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `SUMMARY:${item.title} · ${item.meta}`, `DESCRIPTION:${item.meta}；以票据/券面/卡面为准`, "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    download(`票根_到期日历_${isoToday()}.ics`, lines.join("\r\n"), "text/calendar;charset=utf-8");
    A.toast("已导出日历");
  }

  function renderDeadline() {
    const all = deadlineItems();
    const today = all.filter((item) => item.days === 0);
    const week = all.filter((item) => item.days > 0 && item.days <= 7);
    const month = all.filter((item) => item.days >= 0 && item.days <= 30);
    const later = all.filter((item) => item.days > 30);
    const shown = deadlineFilter === "7" ? all.filter((item) => item.days <= 7)
      : deadlineFilter === "30" ? all.filter((item) => item.days <= 30) : all;
    const kindLabel = { right: "权利", coupon: "券", point: "积分", card: "储值卡", sub: "续费", warranty: "保修", reminder: "提醒" };
    return `${head("还能退", "按截止日排成一张单。", "权利、券、积分、卡、续费、保修，只列有明确日期的；没有依据的项目不倒计时。", "back")}
      <div class="tb-stats">
        <div><b>${today.length}</b><span>今天截止</span></div>
        <div><b>${week.length}</b><span>7 天内</span></div>
        <div><b>${month.length}</b><span>30 天内</span></div>
      </div>
      <div class="tb-tabs">${[["all", "全部"], ["7", "7 天内"], ["30", "30 天内"]].map(([id, label]) => `<button class="tb-tab ${deadlineFilter === id ? "on" : ""}" type="button" data-tb="deadline-filter" data-filter="${id}">${label}</button>`).join("")}</div>
      ${shown.length ? `<div class="tb-deadline-list">${shown.map((item) => `<button class="tb-deadline-row ${item.days === 0 ? "today" : ""}" type="button" data-tb="deadline-open" data-kind="${item.kind}" data-id="${esc(item.id)}">
        <span class="tb-deadline-days">${item.days === 0 ? "今天" : `${item.days}<small>天</small>`}</span>
        <span class="tb-deadline-main"><b>${esc(item.title)}</b><small>${kindLabel[item.kind] || ""} · ${esc(item.meta)}${item.date ? ` · ${esc(item.date)}` : ""}</small></span>
        <em>›</em>
      </button>`).join("")}</div>` : `<div class="tb-empty"><p>没有符合条件的到期项。</p><button class="btn ghost" type="button" data-tb="billImport">导入账单</button></div>`}
      <div class="tb-actions">
        <button class="btn primary" type="button" data-tb="reminder-add">+ 加一条提醒</button>
        <button class="btn ghost" type="button" data-tb="deadline-ics">导出日历 .ics</button>
        <button class="btn ghost" type="button" data-tb="deadline-copy">复制清单</button>
      </div>
      <p class="note">日历只写日期，不写金额；到期日以票据、券面、卡面与平台规则为准。${later.length ? `另有 ${later.length} 项在 30 天以后。` : ""}</p>`;
  }

  function calcBuy() {
    const item = ($("#tbBuyItem") || {}).value ? $("#tbBuyItem").value.trim() : "";
    const aName = ($("#tbBuyA") || {}).value ? $("#tbBuyA").value.trim() : "平台 A";
    const bName = ($("#tbBuyB") || {}).value ? $("#tbBuyB").value.trim() : "平台 B";
    const a = Number(($("#tbBuyAPrice") || {}).value);
    const b = Number(($("#tbBuyBPrice") || {}).value);
    if (!item) { A.toast("先写买什么"); return; }
    if (!(a > 0) || !(b > 0)) { A.toast("两个平台的价格都填一下"); return; }
    const coupon = Math.max(0, Number(($("#tbBuyCoupon") || {}).value) || 0);
    const protect = Math.max(0, Number(($("#tbBuyProtect") || {}).value) || 0);
    const urgent = (($("#tbBuyUrgent") || {}).value || "no") === "yes";
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    const diff = high - low;
    const eff = Math.max(0, low - coupon);
    const cheaper = a <= b ? aName : bName;
    const group = priceGroups().find((g) => normMerchant(g.item) === normMerchant(item));
    const histLow = group && group.low !== null ? group.low : null;
    let verdict = "";
    let tone = "ok";
    const reasons = [];
    if (diff < 0.01) {
      verdict = "两个平台同价，选有券或价保的那个。";
      reasons.push("价差为 0；比的是券、运费、售后和价保，不是标价。");
    } else {
      reasons.push(`${cheaper} 比另一家便宜 ${money(diff)}（${Math.round(diff / high * 100)}%）。`);
    }
    if (histLow !== null) {
      reasons.push(`你记过的历史低是 ${money(histLow)}；这次到手 ${money(eff)}。`);
      if (eff < histLow) reasons.push("已经低于你记过的历史低。");
      else if (eff >= histLow * 1.03) reasons.push("比历史低高出一截，不是非买不可。");
    } else {
      reasons.push("还没有历史价格；先记两次，下次就能判断是不是低点。");
    }
    if (urgent) {
      verdict = `急用：选 ${cheaper}，到手 ${money(eff)}。`;
    } else if (histLow !== null && eff < histLow) {
      verdict = `可以买：到手 ${money(eff)}，低于你记过的历史低。`;
    } else if (diff >= low * 0.05) {
      verdict = `先换平台：去 ${cheaper}，到手 ${money(eff)}。`;
    } else if (histLow !== null && eff >= histLow * 1.03) {
      verdict = "先别买：不是历史低，加购物车等 3 天。";
      tone = "warn";
    } else {
      verdict = "可以再等 3 天：价差不大，看看有没有券。";
      tone = "warn";
    }
    if (protect > 0) reasons.push(`买后 ${protect} 天内降价，可看订单页价保；保留订单截图与当前价截图。`);
    else reasons.push("订单页没有价保标识，就不按价保倒计时。");
    buyResult = { item, aName, bName, a, b, coupon, protect, urgent, low, high, diff, eff, histLow, verdict, tone, reasons, cheaper };
    const out = $("#tbBuyOut");
    if (out) out.innerHTML = buyOutHtml(buyResult);
    const save = $("#tbBuySave");
    if (save) save.onclick = saveBuy;
  }

  function buyOutHtml(r) {
    return `<div class="tb-buy-out ${r.tone === "warn" ? "warn" : ""}">
      <div class="tb-buy-verdict"><b>${esc(r.verdict)}</b>${/到手/.test(r.verdict) ? "" : `<span>到手 ${money(r.eff)}</span>`}</div>
      <div class="tb-buy-grid">
        <div><span>${esc(r.aName)}</span><b>${money(r.a)}</b></div>
        <div><span>${esc(r.bName)}</span><b>${money(r.b)}</b></div>
        <div><span>价差</span><b>${money(r.diff)}</b></div>
        <div><span>券 / 满减</span><b>${money(r.coupon)}</b></div>
      </div>
      <ul>${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <div class="tb-actions">
        <button class="btn ghost" type="button" id="tbBuySave">把这两个价格记进比价卡</button>
      </div>
      <p class="tb-hint">价格是你手填的，不是实时抓取；价保以订单页规则为准，不承诺一定成功。</p>
    </div>`;
  }

  function saveBuy() {
    const r = buyResult;
    if (!r) return;
    const today = isoToday();
    const add = (merchant, amount) => {
      const dup = db.prices.some((p) => normMerchant(p.item) === normMerchant(r.item) && normMerchant(p.merchant) === normMerchant(merchant) && Number(p.amount) === amount && p.date === today);
      if (!dup) db.prices.push({ id: uid(), item: r.item, merchant, amount, date: today, url: "", note: "买前 60 秒记录" });
    };
    add(r.aName, r.a);
    add(r.bName, r.b);
    saveDb();
    A.toast("已记进比价卡");
    render();
  }

  function renderPrices() {
    const groups = priceGroups();
    const rows = db.prices.length;
    return `${head("比价卡", "只记你亲眼看到的价格。", "同一件东西，记下不同时间、不同渠道的价格；涨了降了一眼看到，不编价格、不抓接口。", "back")}
      <div class="tb-stats">
        <div><b>${groups.length}</b><span>件商品</span></div>
        <div><b>${rows}</b><span>条价格</span></div>
        <div><b>${groups.filter((g) => g.delta > 0).length}</b><span>比上次贵</span></div>
      </div>
      <section class="tb-buy">
        <div class="tb-buy-head"><div><b>买前 60 秒</b><small>手填你在两个平台看到的价格，先算再买。</small></div><span>不抓接口</span></div>
        <div class="tb-form">
          <label class="field"><span>买什么</span><input id="tbBuyItem" placeholder="如：某款抽纸 3 层 100 抽" /></label>
          <div class="tb-form-2">
            <label class="field"><span>平台 A</span><input id="tbBuyA" placeholder="京东" /></label>
            <label class="field"><span>价格 A（元）</span><input id="tbBuyAPrice" type="number" inputmode="decimal" placeholder="29.90" /></label>
          </div>
          <div class="tb-form-2">
            <label class="field"><span>平台 B</span><input id="tbBuyB" placeholder="淘宝" /></label>
            <label class="field"><span>价格 B（元）</span><input id="tbBuyBPrice" type="number" inputmode="decimal" placeholder="27.50" /></label>
          </div>
          <div class="tb-form-2">
            <label class="field"><span>券 / 满减（元）</span><input id="tbBuyCoupon" type="number" inputmode="decimal" placeholder="0" /></label>
            <label class="field"><span>价保天数（可空）</span><input id="tbBuyProtect" type="number" inputmode="numeric" placeholder="7" /></label>
          </div>
          <label class="field"><span>急用吗</span><select id="tbBuyUrgent"><option value="no">不着急，可以等</option><option value="yes">急用，今天就要</option></select></label>
        </div>
        <div class="tb-actions"><button class="btn primary" type="button" data-tb="buy-calc">算一下，值不值得现在买</button></div>
        <div id="tbBuyOut">${buyResult ? buyOutHtml(buyResult) : ""}</div>
      </section>
      <div class="tb-actions"><button class="btn primary" type="button" data-tb="price-add">+ 记一笔价格</button>
        <button class="btn ghost" type="button" data-tb="price-copy">复制比价清单</button></div>
      ${groups.length ? groups.map((g) => {
        const q = encodeURIComponent(g.item);
        const delta = g.delta;
        return `<section class="tb-section tb-price">
          <div class="tb-price-head"><div><b>${esc(g.item)}</b><small>${esc(g.latest.merchant || "")} · ${esc(g.latest.date)}</small></div>
            <strong class="${delta > 0 ? "warn" : delta < 0 ? "good" : ""}">${money(Number(g.latest.amount) || 0)}</strong></div>
          <div class="tb-line"><span>上次 ${g.prev ? `${money(Number(g.prev.amount) || 0)} · ${esc(g.prev.date)}` : "还没有第二次记录"}</span>
            <b class="${delta > 0 ? "warn" : delta < 0 ? "good" : ""}">${delta === null ? "—" : `${delta > 0 ? "+" : ""}${money(delta)}`}</b></div>
          <div class="tb-line"><span>历史最低 / 最高</span><b>${g.low === null ? "—" : `${money(g.low)} / ${money(g.high)}`}</b></div>
          <div class="tb-price-links">
            <a href="https://search.jd.com/Search?keyword=${q}" target="_blank" rel="noopener noreferrer">京东搜同款 ↗</a>
            <a href="https://s.taobao.com/search?q=${q}" target="_blank" rel="noopener noreferrer">淘宝搜同款 ↗</a>
            <a href="https://mobile.yangkeduo.com/search_result.html?search_key=${q}" target="_blank" rel="noopener noreferrer">拼多多搜同款 ↗</a>
          </div>
          <div class="tb-price-actions">
            <button class="link-btn" type="button" data-tb="price-add" data-item="${esc(g.item)}">再记一笔</button>
            ${delta > 0 ? `<button class="link-btn" type="button" data-tb="price-case" data-item="${esc(g.item)}" data-merchant="${esc(g.latest.merchant || "")}" data-amount="${Number(g.latest.amount) || 0}" data-prev="${Number(g.prev.amount) || 0}">买贵了 · 建价保案卷</button>` : ""}
          </div>
        </section>`;
      }).join("") : `<div class="tb-empty"><p>还没有价格记录。看到价格就记一笔，至少在两个渠道或两个时间各记一次。</p><button class="btn ghost" type="button" data-tb="price-add">记第一笔</button></div>`}
      <p class="note">价格来自你手工输入或商品页抄录；票根不做实时爬取，也不承诺价保一定成功。价保是平台/商家承诺，先看订单页规则。</p>`;
  }

  function openPriceSheet(itemName) {
    A.openSheet("记一笔价格", `<div class="tb-form">
      <label class="field"><span>商品</span><input id="tbPriceItem" value="${esc(itemName || "")}" placeholder="如：某款抽纸 3 层 100 抽" /></label>
      <label class="field"><span>渠道 / 商家</span><input id="tbPriceMerchant" placeholder="京东 / 淘宝 / 某超市" /></label>
      <div class="tb-form-2">
        <label class="field"><span>价格（元）</span><input id="tbPriceAmount" type="number" inputmode="decimal" placeholder="29.90" /></label>
        <label class="field"><span>日期</span><input id="tbPriceDate" type="date" value="${isoToday()}" /></label>
      </div>
      <label class="field"><span>链接（可选）</span><input id="tbPriceUrl" placeholder="https://" /></label>
      <label class="field"><span>备注</span><input id="tbPriceNote" placeholder="规格、活动、会员价" /></label>
    </div><div class="sheet-actions"><button class="btn primary" id="tbPriceSave" type="button">保存</button><button class="btn ghost" id="tbPriceCancel" type="button">取消</button></div>`, () => {
      $("#tbPriceCancel").onclick = A.closeSheet;
      $("#tbPriceSave").onclick = () => {
        const item = $("#tbPriceItem").value.trim();
        const amount = Number($("#tbPriceAmount").value);
        if (!item || !Number.isFinite(amount) || amount <= 0) { A.toast("商品和价格填一下"); return; }
        db.prices.push({
          id: uid(), item, merchant: $("#tbPriceMerchant").value.trim(), amount,
          date: $("#tbPriceDate").value || isoToday(), url: $("#tbPriceUrl").value.trim(),
          note: $("#tbPriceNote").value.trim()
        });
        saveDb(); A.closeSheet(); A.toast("已记录"); render();
      };
    });
  }

  function openReminderSheet(item) {
    const r = item || {};
    A.openSheet(item ? "编辑提醒" : "加一条提醒", `<div class="tb-form">
      <label class="field"><span>提醒什么</span><input id="tbRemTitle" value="${esc(r.title || "")}" placeholder="如：宽带到期 / 车险续保 / 取快递" /></label>
      <label class="field"><span>日期</span><input id="tbRemDate" type="date" value="${esc(r.date || fmtDate(addDays(new Date(), 7)))}" /></label>
      <label class="field"><span>备注（可选）</span><input id="tbRemNote" value="${esc(r.note || "")}" placeholder="带什么、找谁、号码" /></label>
      <p class="tb-hint">只存本机；会出现在「还能退」、家庭体检单和导出的日历里。到期日以你填的为准。</p>
    </div><div class="sheet-actions">
      ${item ? `<button class="btn ghost" id="tbRemDel" type="button">删除</button>` : ""}
      <button class="btn primary" id="tbRemSave" type="button">保存</button>
      <button class="btn ghost" id="tbRemCancel" type="button">取消</button>
    </div>`, () => {
      $("#tbRemCancel").onclick = A.closeSheet;
      if ($("#tbRemDel")) $("#tbRemDel").onclick = () => {
        db.reminders = db.reminders.filter((x) => x.id !== r.id);
        saveDb(); A.closeSheet(); A.toast("已删除"); render();
      };
      $("#tbRemSave").onclick = () => {
        const title = $("#tbRemTitle").value.trim();
        const date = $("#tbRemDate").value;
        if (!title || !date) { A.toast("提醒内容和日期填一下"); return; }
        const next = { id: r.id || uid(), title, date, note: $("#tbRemNote").value.trim() };
        if (r.id) db.reminders = db.reminders.map((x) => x.id === r.id ? next : x);
        else db.reminders.push(next);
        saveDb(); A.closeSheet(); A.toast("已保存"); render();
      };
    });
  }

  function priceText() {
    const groups = priceGroups();
    const lines = [`票根 · 比价清单（${isoToday()}）`];
    groups.forEach((g) => {
      lines.push(`${g.item}：最新 ${money(Number(g.latest.amount) || 0)}（${g.latest.merchant || "未注渠道"}，${g.latest.date}）${g.delta === null ? "" : `；比上次 ${g.delta > 0 ? "+" : ""}${money(g.delta)}`}`);
    });
    if (!groups.length) lines.push("还没有价格记录。");
    lines.push("", "只记录看到的价格；价保以订单页规则为准。");
    return lines.join("\n");
  }

  /* ---------- 收件箱：把一条通知变成下一步 ---------- */
  const NOTICE_TYPES = {
    charge: { label: "扣款 / 消费" },
    refund: { label: "退款 / 到账" },
    expiry: { label: "到期 / 有效期" },
    delivery: { label: "快递 / 取件" },
    appointment: { label: "预约 / 就诊" },
    overdue: { label: "催缴 / 欠费" },
    fraud: { label: "风险 / 验证码" },
    other: { label: "其他" }
  };

  function classifyNotice(text) {
    if (/验证码|安全账户|共享屏幕|屏幕共享|涉案|公检法|刷单|返利|陌生链接|点击链接|解冻|验资/.test(text)) return "fraud";
    if (/退款|退回|已到账|原路返回|赔付/.test(text)) return "refund";
    if (/逾期|欠费|催缴|滞纳金|影响征信|将上报/.test(text)) return "overdue";
    if (/到期|过期|有效期至|即将失效|截止/.test(text)) return "expiry";
    if (/快递|取件|派送|驿站|物流|签收|柜/.test(text)) return "delivery";
    if (/预约|挂号|就诊|体检|取号|候诊/.test(text)) return "appointment";
    if (/扣款|扣费|消费|支付成功|已支付|自动续费|代扣|支出/.test(text)) return "charge";
    return "other";
  }

  function extractAmount(text) {
    const m = text.match(/(?:¥|￥|RMB|人民币)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i)
      || text.match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*元/);
    if (!m) return "";
    const n = Number(String(m[1]).replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n.toFixed(2) : "";
  }

  function extractDate(text) {
    const full = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (full) return `${full[1]}-${String(full[2]).padStart(2, "0")}-${String(full[3]).padStart(2, "0")}`;
    const md = text.match(/(\d{1,2})月(\d{1,2})日/);
    if (md) return `${new Date().getFullYear()}-${String(md[1]).padStart(2, "0")}-${String(md[2]).padStart(2, "0")}`;
    return "";
  }

  function extractCardLast4(text) {
    const m = text.match(/(?:尾号|末四位|后四位)\s*([0-9]{4})/);
    return m ? m[1] : "";
  }

  function extractMerchant(text) {
    const bracket = text.match(/【([^】]{2,24})】/);
    if (bracket) return bracket[1].trim();
    const named = text.match(/(?:商户|商家|收款方|对方|来自)[:：\s]*([^\s，。；,;]{2,24})/);
    if (named) return named[1].trim();
    const leading = text.match(/^([一-龥A-Za-z0-9·（）()]{2,24}?)(?:提醒|通知|扣款|消费|退款|支付)/);
    if (leading) return leading[1].trim();
    return "";
  }

  function extractOrderNo(text) {
    const m = text.match(/(?:订单号|订单编号|交易号|流水号|商户单号)[:：\s]*([A-Za-z0-9_-]{6,32})/);
    return m ? m[1] : "";
  }

  function parseNotice(raw) {
    const text = String(raw || "").replace(/\r/g, "").trim();
    if (!text) return [];
    const chunks = text.split(/\n{2,}|\n(?=\s*【)/).map((s) => s.trim()).filter(Boolean);
    const lines = chunks.length > 1 ? chunks : [text];
    const seen = new Set();
    return lines.slice(0, 8).map((line) => ({
      type: classifyNotice(line),
      amount: extractAmount(line),
      date: extractDate(line),
      merchant: extractMerchant(line),
      orderNo: extractOrderNo(line),
      cardLast4: extractCardLast4(line),
      renewal: /连续包月|连续包年|自动续费|自动扣款|自动扣费|自动续订|订阅|包月|包年|会员年费|年费/.test(line),
      text: line.replace(/\s+/g, " ").slice(0, 160)
    })).filter((item) => {
      const key = `${item.type}|${item.amount}|${item.date}|${item.merchant}|${item.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function openDeliverySheet(item) {
    const r = item || {};
    A.openSheet("签收异议", `<p class="sheet-hint">只填运单后四位，不填地址和电话；票根不代投诉，只把 72 小时内该做的事排好。</p>
      <div class="tb-form">
        <label class="field"><span>快递公司</span><input id="tbDlCompany" value="${esc(r.merchant || "")}" placeholder="如：某快递" /></label>
        <div class="tb-form-2">
          <label class="field"><span>运单号后 4 位</span><input id="tbDlNo" maxlength="4" inputmode="numeric" placeholder="1234" /></label>
          <label class="field"><span>签收时间</span><input id="tbDlDate" type="date" value="${esc(r.date || isoToday())}" /></label>
        </div>
        <label class="field"><span>订单金额（可选，元）</span><input id="tbDlAmount" type="number" inputmode="decimal" value="${r.amount ? Number(r.amount) : ""}" /></label>
        <label class="field"><span>情况</span><select id="tbDlIssue">
          <option>显示已签收，但我没收到</option>
          <option>未经同意放驿站 / 快递柜</option>
          <option>送错地址 / 被别人拿走</option>
          <option>外包装破损 / 少件</option>
        </select></label>
      </div>
      <div class="sheet-actions"><button class="btn primary" id="tbDlMake" type="button">生成 72 小时行动卡</button><button class="btn ghost" id="tbDlCancel" type="button">取消</button></div>`, () => {
      $("#tbDlCancel").onclick = A.closeSheet;
      $("#tbDlMake").onclick = () => {
        const company = $("#tbDlCompany").value.trim() || "快递公司";
        const no = $("#tbDlNo").value.trim().replace(/\D/g, "").slice(-4);
        const date = $("#tbDlDate").value || isoToday();
        const amount = Number($("#tbDlAmount").value) || 0;
        const issue = $("#tbDlIssue").value;
        A.closeSheet();
        openDeliveryPlan({ company, no, date, amount, issue });
      };
    });
  }

  function deliveryPlanText(d) {
    const lines = [
      `【签收异议 · 72 小时】`,
      `快递：${d.company}${d.no ? `（运单后四位 ${d.no}）` : ""}`,
      `签收时间：${d.date}`,
      `情况：${d.issue}`,
      d.amount ? `订单金额：¥${Number(d.amount).toFixed(2)}` : "",
      "",
      "第 1 步（0–2 小时）：联系快递员或派件网点，要求核实签收人、投递位置与时间；记录工号、通话时间。",
      "第 2 步（24 小时内）：联系快递企业客服，报运单号，要求 24 小时内答复；未经同意不得代签收或投驿站/快递柜。",
      "第 3 步（48–72 小时）：仍未解决，向 12305（邮政业申诉）或当地邮政管理局提交订单、物流截图与沟通记录。",
      "",
      "依据：《快递市场管理办法》第二十八条、第五十四条（2024-03-01 施行）。",
      "证据：订单页、物流轨迹截图、签收人/驿站照片、通话记录、物品价值凭证。",
      "边界：只整理事实与路径，不代投诉、不承诺赔偿；如已收到请撤销。"
    ];
    return lines.filter((x) => x !== "").join("\n");
  }

  function openDeliveryPlan(d) {
    A.openSheet("签收异议 · 72 小时", `<div class="tb-delivery">
      <p class="tb-hint">先做第 1 步，再往上走；每一步都留时间、工号、截图。${d.no ? `运单后四位：${esc(d.no)}。` : ""}</p>
      <ol class="tb-list">
        <li><b>0–2 小时</b>：联系快递员或派件网点，核实签收人、投递位置与时间；记下工号与通话时间。</li>
        <li><b>24 小时内</b>：联系快递企业客服，报运单号，要求 24 小时内答复；未经同意不得代签收或投驿站 / 快递柜。</li>
        <li><b>48–72 小时</b>：仍未解决，向 <b>12305</b> 或当地邮政管理局提交订单、物流截图与沟通记录。</li>
      </ol>
      <p class="tb-hint">依据：<a href="https://www.gov.cn/zhengce/202401/content_6924448.htm" target="_blank" rel="noopener noreferrer">《快递市场管理办法》</a>第二十八条、第五十四条（2024-03-01 施行）。</p>
      <div class="tb-chips"><span>订单页</span><span>物流轨迹</span><span>签收人 / 驿站照片</span><span>通话记录</span><span>价值凭证</span></div>
      <div class="tb-actions">
        <button class="btn primary" type="button" id="tbDlRemind">加 72 小时跟进提醒</button>
        <button class="btn ghost" type="button" id="tbDlCopy">复制行动卡</button>
        <button class="btn ghost" type="button" id="tbDlCase">建支付争议案卷</button>
      </div>
      <p class="tb-hint">只整理事实与路径，不代投诉、不承诺赔偿；如已收到请撤销。</p>
    </div>`, () => {
      $("#tbDlRemind").onclick = () => {
        const title = `签收异议跟进：${d.company}`;
        const date = fmtDate(addDays(new Date(), 3));
        if (!db.reminders.some((r) => r.title === title && r.date === date)) {
          db.reminders.push({ id: uid(), title, date, note: `运单后四位 ${d.no || "—"}；确认是否收到、是否已答复。` });
          saveDb();
        }
        A.toast("已加 72 小时跟进提醒");
      };
      $("#tbDlCopy").onclick = () => copyText(deliveryPlanText(d));
      $("#tbDlCase").onclick = () => {
        A.closeSheet();
        if (!A.openFinanceBuilder) { A.toast("资金案卷暂不可用"); return; }
        A.openFinanceBuilder("payment", {
          merchant: d.company, amount: d.amount ? String(d.amount) : "", date: d.date || isoToday(),
          issue: "未收到商品/服务",
          notes: `来自签收异议：${d.issue}；运单后四位 ${d.no || "—"}。\n${deliveryPlanText(d)}`
        });
      };
    });
  }

  function renderInbox() {
    return `${head("收件箱", "把收到的那条消息贴进来。", "扣款、退款、到期、快递、催缴、验证码——先认出它想让你做什么，再给下一步。只在本机识别，不上传。", "back")}
      <div class="tb-form">
        <label class="field"><span>短信 / App 通知 / 催缴单原文</span>
          <textarea id="tbNoticeText" rows="6" placeholder="直接粘贴，例如：&#10;【某视频】您已开通连续包月，将于 12 月 3 日自动扣款 25 元。">${esc(noticeText)}</textarea>
        </label>
      </div>
      <div class="tb-actions">
        <button class="btn primary" type="button" data-tb="notice-parse">识别这条消息</button>
        <button class="btn ghost" type="button" data-tb="notice-paste">从剪贴板粘贴</button>
        <button class="btn ghost" type="button" data-tb="notice-clear">清空</button>
      </div>
      ${noticeItems.length ? `<section class="tb-section"><div class="tb-section-head"><h2>这条消息想让你做什么</h2><span>${noticeItems.length} 条</span></div>
        ${noticeItems.map((item, index) => `<div class="tb-notice">
          <div class="tb-notice-head"><b>${item.type === "charge" && item.renewal ? "续费扣款" : NOTICE_TYPES[item.type].label}</b>${item.amount ? `<strong>¥${item.amount}</strong>` : ""}</div>
          <p class="tb-notice-text">${esc(item.text)}</p>
          <div class="tb-notice-meta">${item.merchant ? `对方：${esc(item.merchant)}` : "对方未识别"}${item.date ? ` · ${item.type === "charge" && item.renewal ? "扣款日" : "日期"}：${esc(item.date)}` : ""}${item.orderNo ? ` · 订单号：${esc(item.orderNo)}` : ""}</div>
          <div class="tb-notice-actions">
            ${item.type === "fraud"
              ? `<button class="link-btn" type="button" data-tb="notice-act" data-act="fraud" data-idx="${index}">先看防诈自检</button>`
              : `<button class="link-btn" type="button" data-tb="notice-act" data-act="case" data-idx="${index}">建资金案卷</button>
                 ${item.type === "charge" ? (item.renewal
                   ? `<button class="link-btn" type="button" data-tb="notice-act" data-act="sub" data-idx="${index}">记为续费</button>`
                   : `<button class="link-btn" type="button" data-tb="notice-act" data-act="cardcase" data-idx="${index}">银行卡争议</button>`) : ""}
                 ${(item.type === "charge" || item.type === "refund") ? `<button class="link-btn" type="button" data-tb="notice-act" data-act="bill" data-idx="${index}">记一笔流水</button>` : ""}
                 ${item.type === "delivery" ? `<button class="link-btn" type="button" data-tb="notice-act" data-act="delivery" data-idx="${index}">没收到 / 被代签收</button>` : ""}
                 ${(item.type === "expiry" || item.type === "delivery" || item.type === "appointment") ? `<button class="link-btn" type="button" data-tb="notice-act" data-act="reminder" data-idx="${index}">加到期提醒</button>` : ""}
                 ${item.type === "overdue" ? `<button class="link-btn" type="button" data-tb="notice-act" data-act="find" data-idx="${index}">找谁问清楚</button>` : ""}
                 <button class="link-btn" type="button" data-tb="notice-act" data-act="complaint" data-idx="${index}">写成诉求</button>`}
          </div>
        </div>`).join("")}
        <p class="tb-hint">识别结果来自规则匹配，可能看错对方或金额；建案前请核对原文。票根不点链接、不回拨、不代提交。</p>
      </section>` : `<div class="tb-empty"><p>还没有识别结果。粘贴一条真实的扣款、到期或催缴消息试试。</p></div>`}
      <p class="note">不要粘贴完整卡号、验证码、身份证号；票根只处理你主动贴进来的文字，不上传、不读取短信。</p>`;
  }

  /* ---------- 权益账本 / 储值卡 ---------- */
  function allCards() {
    return db.cards.slice().sort((a, b) => {
      const da = a.expire ? daysLeft(parseDate(a.expire)) : 9999;
      const db_ = b.expire ? daysLeft(parseDate(b.expire)) : 9999;
      return (da === null ? 9999 : da) - (db_ === null ? 9999 : db_);
    });
  }

  function renderAccounts(tab) {
    const t = tab || accountTab;
    const coupons = (A.state.coupons || []).slice();
    const points = (A.state.points || []).slice();
    let supplies = [];
    try { supplies = A.assetSummary().supplies || []; } catch (e) {}
    const cards = allCards();
    const cardBalance = cards.reduce((s, c) => s + (Number(c.balance) || 0), 0);
    const couponSoon = coupons.filter((c) => {
      const d = A.couponDays ? A.couponDays(c) : null;
      return d !== null && d >= 0 && d <= 7;
    });
    const pointSoon = points.filter((p) => {
      const d = p.expiresAt ? daysLeft(parseDate(p.expiresAt)) : null;
      return d !== null && d >= 0 && d <= 30;
    });
    const tabs = [
      ["coupon", "券", `${coupons.length}`],
      ["point", "积分", `${points.reduce((s, p) => s + (Number(p.balance) || 0), 0)}`],
      ["supply", "囤货", `${supplies.length + db.stock.length}`],
      ["card", "储值卡", `${cards.length}`]
    ];
    const body = t === "point" ? renderPointTab(points)
      : t === "supply" ? renderSupplyTab(supplies, db.stock)
        : t === "card" ? renderCardTab(cards)
          : renderCouponTab(coupons);
    return `${head("权益账本", "四本账，一起看到期。", "券、积分、囤货、储值卡；只记不抓，金额和到期日以商家页面为准。", "back")}
      <div class="tb-stats">
        <div><b>${couponSoon.length}</b><span>7 天内到期券</span></div>
        <div><b>${pointSoon.length}</b><span>30 天内到期积分</span></div>
        <div><b>${money(cardBalance)}</b><span>储值余额</span></div>
      </div>
      <div class="tb-tabs" role="tablist">${tabs.map(([id, label, count]) => `<button class="tb-tab ${t === id ? "on" : ""}" type="button" role="tab" aria-selected="${t === id}" data-tb="acc-tab" data-tab="${id}">${label}<span>${count}</span></button>`).join("")}</div>
      ${body}
      <p class="note">券和积分属于商家权益，规则优先；储值卡退款按合同与当地规定处理。</p>`;
  }

  function renderCouponTab(coupons) {
    const rows = coupons.map((c) => ({ c, d: A.couponDays ? A.couponDays(c) : null }))
      .sort((a, b) => (a.d === null ? 9999 : a.d) - (b.d === null ? 9999 : b.d));
    return `<section class="tb-section"><div class="tb-section-head"><h2>券包</h2><button class="text-btn" type="button" data-tb="acc-coupon">管理 / 新增</button></div>
      ${rows.length ? rows.slice(0, 8).map(({ c, d }) => `<div class="tb-line">
        <span><b>${esc(c.name)}</b><small>${esc(c.merchant || "")}${c.amount ? ` · ${money(c.amount)}` : ""} · ${esc(c.expiresAt || "未填到期")}</small></span>
        <b class="${d !== null && d <= 7 ? "warn" : ""}">${d === null ? "—" : d < 0 ? "已过期" : `${d} 天`}</b>
      </div>`).join("") : `<p class="tb-none">还没有券。拍下券面或手动记一张。</p>`}
      <button class="btn ghost" type="button" data-tb="acc-coupon">打开券包</button>
    </section>`;
  }

  function renderPointTab(points) {
    const rows = points.slice().sort((a, b) => String(a.expiresAt || "9999").localeCompare(String(b.expiresAt || "9999")));
    return `<section class="tb-section"><div class="tb-section-head"><h2>积分</h2><button class="text-btn" type="button" data-tb="acc-point">管理 / 新增</button></div>
      ${rows.length ? rows.slice(0, 8).map((p) => {
        const d = p.expiresAt ? daysLeft(parseDate(p.expiresAt)) : null;
        return `<div class="tb-line"><span><b>${esc(p.platform)}</b><small>${p.expiresAt ? `${esc(p.expiresAt)} 到期` : "长期有效"}</small></span>
          <b class="${d !== null && d <= 30 ? "warn" : ""}">${Number(p.balance) || 0} 分</b></div>`;
      }).join("") : `<p class="tb-none">还没有积分记录。</p>`}
      <button class="btn ghost" type="button" data-tb="acc-point">打开积分台账</button>
    </section>`;
  }

  function renderSupplyTab(supplies, stock) {
    const manual = (stock || []).slice().map((s) => Object.assign({}, s, { days: stockDays(s) }))
      .sort((a, b) => (a.days === null ? 9999 : a.days) - (b.days === null ? 9999 : b.days));
    const low = manual.filter((s) => s.days !== null && s.days >= 0 && s.days <= 7);
    const soonCost = low.reduce((sum, s) => {
      const price = Number(s.lastPrice) || 0;
      const qty = Number(s.buyQty) || 0;
      return sum + (price > 0 && qty > 0 ? price * qty : 0);
    }, 0);
    return `<section class="tb-section"><div class="tb-section-head"><h2>囤货</h2><button class="text-btn" type="button" data-tb="stock-add">+ 新增</button></div>
      ${manual.length ? `${low.length ? `<p class="tb-hint">${low.length} 件快用完${soonCost ? `，按上次买价约需 ${money(soonCost)}` : ""}。建议提前 3 天下单。</p>` : ""}
        ${manual.map((s) => {
          const d = s.days;
          const price = Number(s.lastPrice) || 0;
          const qty = Number(s.buyQty) || 0;
          const suggest = d === null ? "" : fmtDate(addDays(new Date(), Math.max(0, d - 3)));
          const meta = [
            `${esc(s.qty || "")}${s.unit ? esc(s.unit) : ""}${Number(s.dailyUse) > 0 ? ` · 每天约 ${esc(s.dailyUse)}` : ""}`,
            s.expire ? `${esc(s.expire)} 到期` : "",
            s.note ? esc(s.note) : ""
          ].filter(Boolean).join(" · ");
          const extra = [
            suggest ? `建议 ${suggest.slice(5)} 补货` : "",
            price > 0 ? `上次 ${money(price)}${s.lastPriceDate ? `（${esc(s.lastPriceDate)}）` : ""}${qty > 0 ? ` × ${esc(s.buyQty)} ≈ ${money(price * qty)}` : ""}` : ""
          ].filter(Boolean).join(" · ");
          return `<div class="tb-card-row">
            <div class="tb-card-main"><b>${esc(s.name)}</b>
              <small>${meta}</small>
              ${extra ? `<em>${extra}</em>` : ""}
            </div>
            <div class="tb-card-side"><strong class="${d !== null && d <= 7 ? "warn" : ""}">${d === null ? "—" : d < 0 ? "已过期" : `${d} 天`}</strong>
              <div class="tb-card-actions"><button class="link-btn" type="button" data-tb="stock-edit" data-id="${s.id}">编辑</button>
              <button class="link-btn" type="button" data-tb="stock-del" data-id="${s.id}">删</button></div>
            </div>
          </div>`;
        }).join("")}` : ""}
      ${supplies.length ? supplies.slice(0, 8).map((s) => `<div class="tb-line"><span><b>${esc(s.name)}</b><small>按复购估算 · 约每 ${s.avgDays} 天买一次 · ${esc(s.merchant || "")}</small></span>
        <b class="${s.daysLeft <= 7 ? "warn" : ""}">${Math.max(0, s.daysLeft)} 天后</b></div>`).join("") : ""}
      ${!manual.length && !supplies.length ? `<p class="tb-none">记一件家里的囤货（米、纸、猫粮），或导入两笔同一商品的订单让票根估算。</p>` : ""}
      ${manual.length ? `<div class="tb-actions"><button class="btn ghost" type="button" data-tb="stock-copy">复制囤货清单</button><button class="btn ghost" type="button" data-tb="stock-share">分享给家人</button></div>` : ""}
      <p class="tb-hint">按“数量 ÷ 每天用量”推算可用天数，或按你填的到期日；买价只用于估算补货金额。复购估算按间隔推算，大促囤货会让估算偏晚。</p>
    </section>`;
  }

  function stockText() {
    const lines = [`票根 · 囤货清单（${isoToday()}）`];
    const items = (db.stock || []).map((s) => ({ s, days: stockDays(s) }))
      .sort((a, b) => (a.days === null ? 9999 : a.days) - (b.days === null ? 9999 : b.days));
    if (!items.length) lines.push("还没有囤货记录。");
    items.forEach(({ s, days }) => {
      const suggest = days === null ? "" : fmtDate(addDays(new Date(), Math.max(0, days - 3)));
      lines.push(`${s.name}：${s.qty || ""}${s.unit || ""}${days === null ? "" : ` · 还够 ${days} 天`}${suggest ? ` · 建议 ${suggest} 补货` : ""}${Number(s.lastPrice) > 0 ? ` · 上次 ${money(Number(s.lastPrice))}` : ""}`);
    });
    lines.push("", "按你填的数量与用量推算，不是商家库存。");
    return lines.join("\n");
  }

  function openStockSheet(item) {
    const s = item || {};
    A.openSheet(item ? "编辑囤货" : "新增囤货", `<div class="tb-form">
      <label class="field"><span>名称</span><input id="tbStockName" value="${esc(s.name || "")}" placeholder="如：抽纸 / 猫粮 / 大米" /></label>
      <div class="tb-form-2">
        <label class="field"><span>数量</span><input id="tbStockQty" type="number" inputmode="decimal" value="${esc(s.qty || "")}" placeholder="2" /></label>
        <label class="field"><span>单位</span><input id="tbStockUnit" value="${esc(s.unit || "")}" placeholder="包 / 袋 / 瓶" /></label>
        <label class="field"><span>每天用多少</span><input id="tbStockDaily" type="number" inputmode="decimal" value="${esc(s.dailyUse || "")}" placeholder="如 0.5" /></label>
        <label class="field"><span>到期/用完日期（可选）</span><input id="tbStockExpire" type="date" value="${esc(s.expire || "")}" /></label>
        <label class="field"><span>上次买价（元）</span><input id="tbStockPrice" type="number" inputmode="decimal" value="${esc(s.lastPrice || "")}" placeholder="如 39.9" /></label>
        <label class="field"><span>一次买几个</span><input id="tbStockBuyQty" type="number" inputmode="decimal" value="${esc(s.buyQty || "")}" placeholder="如 3" /></label>
      </div>
      <label class="field"><span>备注</span><input id="tbStockNote" value="${esc(s.note || "")}" placeholder="放在哪、谁在用" /></label>
      <p class="tb-hint">填“数量 + 每天用多少”就能算还够几天；填“上次买价 + 一次买几个”就能估补货要花多少。都不填也能只记到期日。</p>
    </div><div class="sheet-actions"><button class="btn primary" id="tbStockSave" type="button">保存</button><button class="btn ghost" id="tbStockCancel" type="button">取消</button></div>`, () => {
      $("#tbStockCancel").onclick = A.closeSheet;
      $("#tbStockSave").onclick = () => {
        const name = $("#tbStockName").value.trim();
        if (!name) { A.toast("先填名称"); return; }
        const next = {
          id: s.id || uid(),
          name, qty: $("#tbStockQty").value, unit: $("#tbStockUnit").value.trim(),
          dailyUse: $("#tbStockDaily").value,
          expire: $("#tbStockExpire").value, note: $("#tbStockNote").value.trim(),
          lastPrice: $("#tbStockPrice").value, lastPriceDate: $("#tbStockPrice").value ? (s.lastPriceDate || isoToday()) : "",
          buyQty: $("#tbStockBuyQty").value
        };
        if (s.id) db.stock = db.stock.map((x) => x.id === s.id ? next : x);
        else db.stock.push(next);
        saveDb(); A.closeSheet(); accountTab = "supply"; A.toast("已保存"); render();
      };
    });
  }

  async function shareText(text, title) {
    try {
      if (navigator.share) {
        await navigator.share({ title: title || "票根", text });
        return;
      }
    } catch (e) { if (e && e.name === "AbortError") return; }
    copyText(text);
  }

  function renderCardTab(cards) {
    const total = cards.reduce((s, c) => s + (Number(c.balance) || 0), 0);
    return `<section class="tb-section"><div class="tb-section-head"><h2>储值卡 / 会员卡</h2><button class="text-btn" type="button" data-tb="card-add">+ 新增</button></div>
      <p class="tb-hint">共 ${cards.length} 张，余额合计 ${money(total)}。只记余额与到期日，不存卡号、密码。</p>
      ${cards.length ? cards.map((c) => {
        const d = c.expire ? daysLeft(parseDate(c.expire)) : null;
        return `<div class="tb-card-row">
          <div class="tb-card-main"><b>${esc(c.name)}</b>
            <small>${esc(c.merchant || "")} · ${esc(c.type || "储值卡")}${c.remaining ? ` · 剩 ${esc(c.remaining)} 次` : ""}${c.person ? ` · ${esc(c.person)}` : ""}</small>
            <em class="${d !== null && d <= 30 ? "warn" : ""}">${d === null ? (c.expire ? esc(c.expire) : "未填到期") : d < 0 ? `已过期 ${Math.abs(d)} 天` : `${d} 天后到期`}</em>
          </div>
          <div class="tb-card-side"><strong>${money(Number(c.balance) || 0)}</strong>
            <div class="tb-card-actions">
              <button class="link-btn" type="button" data-tb="card-edit" data-id="${c.id}">编辑</button>
              <button class="link-btn" type="button" data-tb="card-case" data-id="${c.id}">建案</button>
              <button class="link-btn" type="button" data-tb="card-del" data-id="${c.id}">删</button>
            </div>
          </div>
        </div>`;
      }).join("") : `<p class="tb-none">还没有登记。储值卡、次卡、会员卡都可以记。</p>`}
    </section>`;
  }

  function openCardSheet(card) {
    const c = card || {};
    A.openSheet(card ? "编辑储值卡" : "新增储值卡", `
      <div class="tb-form">
        <label class="field"><span>名称</span><input id="tbCardName" value="${esc(c.name || "")}" placeholder="如：某健身年卡" /></label>
        <label class="field"><span>商家</span><input id="tbCardMerchant" value="${esc(c.merchant || "")}" placeholder="门店或品牌" /></label>
        <label class="field"><span>类型</span><select id="tbCardType">
          ${["储值卡", "次卡", "会员卡"].map((t) => `<option ${c.type === t ? "selected" : ""}>${t}</option>`).join("")}
        </select></label>
        <label class="field"><span>余额（元）</span><input id="tbCardBalance" type="number" inputmode="decimal" value="${c.balance != null ? c.balance : ""}" placeholder="0" /></label>
        <label class="field"><span>剩余次数（可选）</span><input id="tbCardRemaining" type="number" inputmode="numeric" value="${c.remaining != null ? c.remaining : ""}" placeholder="次数卡再填" /></label>
        <label class="field"><span>到期日（可选）</span><input id="tbCardExpire" type="date" value="${esc(c.expire || "")}" /></label>
        <label class="field"><span>谁的卡</span><select id="tbCardPerson">${["本人", "爸爸", "妈妈", "伴侣", "孩子", "全家"].map((p) => `<option ${c.person === p ? "selected" : ""}>${p}</option>`).join("")}</select></label>
        <label class="field"><span>备注</span><input id="tbCardNote" value="${esc(c.note || "")}" placeholder="充值时间、赠送金额、门店等" /></label>
      </div>
      <div class="sheet-actions">
        <button class="btn primary" id="tbCardSave" type="button">保存</button>
        <button class="btn ghost" id="tbCardCancel" type="button">取消</button>
      </div>`, () => {
      $("#tbCardCancel").onclick = A.closeSheet;
      $("#tbCardSave").onclick = () => {
        const name = $("#tbCardName").value.trim();
        if (!name) { A.toast("先填卡名"); return; }
        const next = {
          id: c.id || uid(),
          name,
          merchant: $("#tbCardMerchant").value.trim(),
          type: $("#tbCardType").value,
          balance: Number($("#tbCardBalance").value) || 0,
          remaining: $("#tbCardRemaining").value === "" ? null : Number($("#tbCardRemaining").value),
          expire: $("#tbCardExpire").value,
          person: $("#tbCardPerson").value,
          note: $("#tbCardNote").value.trim(),
          updatedAt: new Date().toISOString()
        };
        if (c.id) db.cards = db.cards.map((item) => item.id === c.id ? next : item);
        else db.cards.push(next);
        saveDb();
        A.closeSheet();
        accountTab = "card";
        A.toast("已保存");
        render();
      };
    });
  }

  /* ---------- 续费决策 ---------- */
  const CYCLES = {
    week: { label: "每周", perYear: 52 },
    month: { label: "每月", perYear: 12 },
    quarter: { label: "每季", perYear: 4 },
    year: { label: "每年", perYear: 1 }
  };
  function cycleInfo(cycle) { return CYCLES[cycle] || CYCLES.month; }

  function addSubFollowUp(sub, decision) {
    const step = sub.cycle === "week" ? 7 : sub.cycle === "quarter" ? 90 : sub.cycle === "year" ? 365 : 30;
    let base = sub.next ? parseDate(sub.next) : null;
    if (!base || base.getTime() < new Date().setHours(0, 0, 0, 0)) base = addDays(new Date(), step);
    const date = fmtDate(addDays(base, decision === "cancel" ? 1 : 0));
    const title = `${sub.merchant} · ${decision === "cancel" ? "确认已关闭" : "确认降档生效"}`;
    if (db.reminders.some((r) => r.title === title && r.date === date)) return null;
    db.reminders.push({
      id: uid(),
      title,
      date,
      note: decision === "cancel"
        ? "到 App / 银行流水确认没有按原价再次扣款；如仍扣款，回票根建资金案卷。"
        : "到 App / 账单确认新价格已生效；没有变化就回去再处理。"
    });
    return date;
  }

  function allSubs() {
    const map = new Map();
    try {
      PG.detectSubscriptions(A.state.tickets || []).forEach((s) => {
        const cycle = s.cycle && CYCLES[s.cycle] ? s.cycle : "month";
        map.set(normMerchant(s.merchant), {
          key: normMerchant(s.merchant), merchant: s.merchant,
          monthly: s.avg * cycleInfo(cycle).perYear / 12, amount: s.avg, cycle,
          lastDate: s.lastDate instanceof Date ? fmtDate(s.lastDate) : String(s.lastDate || ""),
          count: s.count, manual: false
        });
      });
    } catch (e) {}
    (db.subs || []).forEach((s) => {
      const key = normMerchant(s.merchant);
      if (!key) return;
      const cycle = s.cycle && CYCLES[s.cycle] ? s.cycle : "month";
      const amount = s.amount != null ? Number(s.amount) : Number(s.monthly) || 0;
      const monthly = amount * cycleInfo(cycle).perYear / 12;
      if (map.has(key)) {
        const old = map.get(key);
        map.set(key, Object.assign(old, { monthly, amount, cycle, nextDate: s.next || "", manual: true }));
      } else {
        map.set(key, {
          key, merchant: s.merchant, monthly, amount, cycle,
          lastDate: "", nextDate: s.next || "", count: 0, manual: true
        });
      }
    });
    return Array.from(map.values()).map((s) => {
      let next = "";
      if (s.nextDate) {
        next = s.nextDate;
      } else if (s.lastDate) {
        const d = parseDate(s.lastDate);
        if (d) {
          const step = s.cycle === "week" ? 7 : s.cycle === "quarter" ? 3 : s.cycle === "year" ? 12 : 1;
          const n = s.cycle === "week" ? addDays(d, 7) : addMonths(d, step);
          next = fmtDate(n);
        }
      }
      return Object.assign({}, s, { yearly: (Number(s.monthly) || 0) * 12, next, decision: decisionOf(s.key) });
    }).sort((a, b) => b.yearly - a.yearly);
  }

  function renderSubs() {
    const subs = allSubs();
    const annual = subs.reduce((s, x) => s + x.yearly, 0);
    const saved = subs.reduce((s, x) => s + savingsOf(x.key, x.monthly), 0);
    const pending = subs.filter((s) => !s.decision).length;
    return `${head("续费决策", "关、降、留，一项一项定。", "不是把所有续费都关掉，而是把每一项都变成你主动做的决定。", "back")}
      <div class="tb-stats">
        <div><b>${money(annual)}</b><span>一年续费</span></div>
        <div><b>${money(saved)}</b><span>已决定可省</span></div>
        <div><b>${pending}</b><span>待决定</span></div>
      </div>
      ${subs.length ? subs.map((s) => {
        const d = s.decision;
        return `<div class="tb-sub-row ${d ? "decided" : ""}">
          <div><b>${esc(s.merchant)}</b>
            <small>${s.cycle ? `${cycleInfo(s.cycle).label} ${money(s.amount)} · ` : ""}月均 ${money(s.monthly)} · 年 ${money(s.yearly)}${s.next ? ` · 下次约 ${esc(s.next)}` : ""}${s.manual ? " · 手动" : ` · 已扣 ${s.count} 次`}</small>
            ${d ? `<em class="tb-decision">${d.decision === "cancel" ? "决定关闭" : d.decision === "down" ? `降到 ${money(d.newAmount)}/月` : "决定保留"}${savingsOf(s.key, s.monthly) ? ` · 年省 ${money(savingsOf(s.key, s.monthly))}` : ""}</em>` : ""}
          </div>
          <div class="tb-sub-actions">
            <button class="tb-mini ${d && d.decision === "keep" ? "on" : ""}" type="button" data-tb="sub-decide" data-key="${esc(s.key)}" data-decide="keep">留</button>
            <button class="tb-mini ${d && d.decision === "down" ? "on" : ""}" type="button" data-tb="sub-decide" data-key="${esc(s.key)}" data-decide="down" data-monthly="${s.monthly}">降</button>
            <button class="tb-mini ${d && d.decision === "cancel" ? "on" : ""}" type="button" data-tb="sub-decide" data-key="${esc(s.key)}" data-decide="cancel">关</button>
          </div>
        </div>`;
      }).join("") : emptyBlock("还没有识别到续费。导入账单或拍几张会员订单。", "去导入账单", "billImport")}
      <div class="tb-actions">
        <button class="btn ghost" type="button" data-tb="sub-add">手动加一项</button>
        <button class="btn ghost" type="button" data-tb="sub-copy">复制决策清单</button>
      </div>
      <section class="tb-section"><h2>关之前，先核对三件事</h2>
        <ol class="tb-list">
          <li>扣费前有没有显著提醒？截图或短信留着。</li>
          <li>第一次发现扣款是哪个月？连续扣了几次？</li>
          <li>取消入口在哪？关掉后有没有收到确认？</li>
        </ol>
        <p class="tb-hint">按《互联网平台价格行为规则》核对提醒与默认勾选；能不能退、退几个月，以开通约定和平台处理为准，不承诺全额退回。</p>
      </section>`;
  }

  function decidedText() {
    const subs = allSubs();
    const lines = [`票根 · 续费决策（${isoToday()}）`];
    subs.forEach((s) => {
      const d = s.decision;
      lines.push(`${s.merchant}：${d ? (d.decision === "cancel" ? "关闭" : d.decision === "down" ? `降到 ${money(d.newAmount)}/月` : "保留") : "未决定"}（年 ${money(s.yearly)}）`);
    });
    lines.push(`一年合计 ${money(subs.reduce((a, b) => a + b.yearly, 0))}；已决定可省 ${money(subs.reduce((a, b) => a + savingsOf(b.key, b.monthly), 0))}。`);
    return lines.join("\n");
  }

  /* ---------- 找谁 ---------- */
  function renderFind() {
    return `${head("找谁", "先说该找谁，再帮你写。", "选一个最接近的场景，看到先找谁、怎么走、带什么；不替你判断谁一定对。", "back")}
      <div class="tb-search"><input id="tbFind" type="search" placeholder="搜：快递 / 押金 / 盗刷 / 续费…" value="${esc(findQuery)}" aria-label="搜索场景" /></div>
      <div class="tb-chips tb-cat-chips">${CATEGORIES.map((c) => `<button class="tb-cat ${findCat === c ? "on" : ""}" type="button" data-tb="find-cat" data-cat="${c}">${c}</button>`).join("")}</div>
      <div id="tbFindList">${findListHtml()}</div>`;
  }

  function findListHtml() {
    const q = findQuery.trim().toLowerCase();
    const list = SCENARIOS.filter((s) => (findCat === "全部" || s.cat === findCat)
      && (!q || `${s.title}${s.cue}${s.who}${s.keywords.join("")}`.toLowerCase().includes(q)));
    if (!list.length) return `<p class="tb-none">没有匹配的场景。换个词，或选“全部”。</p>`;
    return list.map((s) => `<button class="tb-find-row" type="button" data-tb="find-open" data-id="${s.id}">
      <span class="tb-find-cat">${s.cat}</span>
      <span class="tb-find-main"><b>${esc(s.title)}</b><small>${esc(s.cue)}</small></span>
      <span class="tb-find-who">${esc(s.who)}</span>
    </button>`).join("");
  }

  function renderFindDetail() {
    const s = SCENARIOS.find((x) => x.id === view.split(":")[1]) || SCENARIOS[0];
    const checked = db.materials[s.id] || [];
    return `${head(s.cat, s.title, s.cue, "find-back")}
      <section class="tb-who"><span>先找</span><b>${esc(s.who)}</b><small>备选：${esc(s.backup)}</small></section>
      <section class="tb-section"><h2>怎么走</h2><ol class="tb-list">${s.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></section>
      <section class="tb-section"><div class="tb-section-head"><h2>带什么</h2><span>${checked.length}/${s.materials.length}</span></div>
        <div class="tb-checks">${s.materials.map((m) => `<label class="tb-check"><input type="checkbox" data-tb="material" data-id="${s.id}" data-mat="${esc(m)}" ${checked.includes(m) ? "checked" : ""} /><span>${esc(m)}</span></label>`).join("")}</div>
      </section>
      <section class="tb-section"><h2>边界</h2><p class="tb-note">${esc(s.note)}</p></section>
      <div class="tb-actions">
        <button class="btn primary" type="button" data-tb="find-complaint" data-id="${s.id}">生成诉求草稿</button>
        <button class="btn ghost" type="button" data-tb="find-copy" data-id="${s.id}">复制材料清单</button>
        <button class="btn ghost" type="button" data-tb="find-case" data-id="${s.id}">建案卷</button>
      </div>
      <p class="note">热线号码以官方最新公布为准；先联系企业/平台，是多数行业申诉的前置步骤。</p>`;
  }

  /* ---------- 诉求助手 ---------- */
  const MATERIALS = ["订单/合同", "支付记录", "聊天记录", "商品照片/视频", "发票/收据", "检测单/维修单", "物流记录", "通话记录", "其他"];

  function complaintDraft() {
    const d = db.complaint || {};
    return {
      channel: d.channel || "平台客服",
      target: d.target || "",
      date: d.date || isoToday(),
      amount: d.amount || "",
      story: d.story || "",
      ask: d.ask || "退款",
      tone: d.tone || "平和",
      orderNo: d.orderNo || "",
      scenarioId: d.scenarioId || "",
      materials: Array.isArray(d.materials) ? d.materials : []
    };
  }

  function askSentence(ask, tone) {
    if (tone === "明确") return `请对方尽快${ask}，并告知预计处理时间与结果。`;
    if (tone === "据理") return `请对方${ask}；如无法处理，请书面说明理由与依据，并告知可继续申诉的上级渠道。`;
    return `请对方${ask}，并告知处理结果。`;
  }

  function renderComplaint() {
    const d = complaintDraft();
    const sc = d.scenarioId ? SCENARIOS.find((x) => x.id === d.scenarioId) : null;
    return `${head("诉求助手", "把话写清楚，别替自己加戏。", "只写发生过的事、能拿出的证据、你希望对方做什么；不编时间、不夸大金额。", "back")}
      ${sc ? `<section class="tb-who"><span>先找</span><b>${esc(sc.who)}</b><small>不被受理再找：${esc(sc.backup)}</small></section>` : ""}
      <div class="tb-form">
        <label class="field"><span>提交给谁</span><select data-cf="channel">
          ${["平台客服", "商家", "12345", "12315", "行业主管部门", "其他"].map((x) => `<option ${d.channel === x ? "selected" : ""}>${x}</option>`).join("")}
        </select></label>
        <label class="field"><span>被投诉对象</span><input data-cf="target" value="${esc(d.target)}" placeholder="商家/平台/机构名称" /></label>
        <div class="tb-form-2">
          <label class="field"><span>发生日期</span><input data-cf="date" type="date" value="${esc(d.date)}" /></label>
          <label class="field"><span>涉及金额</span><input data-cf="amount" type="number" inputmode="decimal" value="${esc(d.amount)}" placeholder="元" /></label>
        </div>
        <label class="field"><span>订单号（可选）</span><input data-cf="orderNo" value="${esc(d.orderNo)}" placeholder="只填订单号，不填卡号" /></label>
        <label class="field"><span>事情经过</span><textarea data-cf="story" rows="6" placeholder="什么时候、在哪、买了什么、对方怎么处理、现在卡在哪一步。只写事实。">${esc(d.story)}</textarea></label>
        <div class="tb-form-2">
          <label class="field"><span>你的诉求</span><select data-cf="ask">
            ${["退款", "退货", "换货", "维修", "解释并整改", "其他"].map((x) => `<option ${d.ask === x ? "selected" : ""}>${x}</option>`).join("")}
          </select></label>
          <label class="field"><span>语气</span><select data-cf="tone">
            ${["平和", "明确", "据理"].map((x) => `<option ${d.tone === x ? "selected" : ""}>${x}</option>`).join("")}
          </select></label>
        </div>
        <div class="field"><span>已备材料</span><div class="tb-checks">${MATERIALS.map((m) => `<label class="tb-check"><input type="checkbox" data-cf-mat="${esc(m)}" ${d.materials.includes(m) ? "checked" : ""} /><span>${esc(m)}</span></label>`).join("")}</div></div>
      </div>
      <section class="tb-section"><div class="tb-section-head"><h2>生成结果</h2><span>可直接复制</span></div>
        <pre class="tb-output" id="tbComplaintOut">${esc(complaintText(d))}</pre>
      </section>
      <section class="tb-section"><div class="tb-section-head"><h2>短版</h2><span>约 200 字 · 客服对话框</span></div>
        <pre class="tb-output" id="tbComplaintShort">${esc(complaintShort(d))}</pre>
      </section>
      <div class="tb-actions">
        <button class="btn primary" type="button" data-tb="cf-copy">复制全文</button>
        <button class="btn ghost" type="button" data-tb="cf-copy-short">复制短版</button>
        <button class="btn ghost" type="button" data-tb="cf-share">分享短版</button>
        <button class="btn ghost" type="button" data-tb="cf-save">存草稿</button>
        <button class="btn ghost" type="button" data-tb="cf-download">下载 .txt</button>
        <button class="btn ghost" type="button" data-tb="cf-clear">清空</button>
      </div>
      <section class="tb-section"><h2>提交前自检</h2>
        <ul class="tb-list">
          <li>时间、金额、订单号能和证据对上。</li>
          <li>只写自己亲历的事，不写“听说”“肯定”。</li>
          <li>诉求具体到退多少、换什么、修哪里。</li>
          <li>一事一单；不同问题分开提交。</li>
          <li>提交后保存回执编号，回来记到案卷。</li>
        </ul>
        <p class="tb-hint">票根只生成文字，不代提交；提交入口以平台/12345 官方页面为准。</p>
      </section>`;
  }

  function complaintText(d) {
    const ask = d.ask || "退款";
    const amount = d.amount ? `${Number(d.amount).toFixed(2)} 元` : "（金额待核对）";
    const story = String(d.story || "").trim() || "（请补充事情经过：时间、地点、商品/服务、对方处理、当前卡点。）";
    const mats = (d.materials && d.materials.length) ? d.materials.join("、") : "（按实际情况补充）";
    const title = `关于${d.target || "（对象待填）"}${ask}问题的诉求`;
    return `标题：${title}

一、基本情况
本人于 ${d.date || "（日期待填）"} 在 ${d.target || "（对象待填）"} 购买/接受商品或服务，涉及金额 ${amount}${d.orderNo ? `，订单号 ${d.orderNo}` : ""}。

二、事情经过
${story}

三、诉求
${askSentence(ask, d.tone)}

四、已备材料
${mats}

五、说明
以上事实以订单、支付记录、聊天记录等证据为准；本人未使用夸大或推测性表述，也未要求超出约定的赔偿。

提交人：__________
日期：${isoToday()}`;
  }

  function complaintShort(d) {
    const ask = d.ask || "退款";
    const amount = d.amount ? `${Number(d.amount).toFixed(2)} 元` : "金额待核对";
    const story = String(d.story || "").replace(/\s+/g, " ").trim();
    const brief = story.length > 90 ? `${story.slice(0, 90)}…` : (story || "经过待补充");
    const mats = (d.materials || []).slice(0, 4).join("、");
    return `【${ask}】${d.date || "日期待填"}在${d.target || "对方待填"}消费 ${amount}${d.orderNo ? `，订单号 ${d.orderNo}` : ""}。${brief} 诉求：${ask}。${mats ? `已备：${mats}。` : ""}请告知处理结果。`;
  }

  function bindComplaintPreview() {
    const out = $("#tbComplaintOut");
    if (!out) return;
    const short = $("#tbComplaintShort");
    const refresh = () => {
      const d = complaintDraft();
      out.textContent = complaintText(d);
      if (short) short.textContent = complaintShort(d);
    };
    $$("#toolboxBody [data-cf]").forEach((el) => {
      el.addEventListener("input", () => {
        db.complaint = complaintDraft();
        db.complaint[el.dataset.cf] = el.value;
        saveDb();
        refresh();
      });
      el.addEventListener("change", () => {
        db.complaint = complaintDraft();
        db.complaint[el.dataset.cf] = el.value;
        saveDb();
        refresh();
      });
    });
    $$("#toolboxBody [data-cf-mat]").forEach((el) => {
      el.addEventListener("change", () => {
        const d = complaintDraft();
        const set = new Set(d.materials);
        if (el.checked) set.add(el.dataset.cfMat); else set.delete(el.dataset.cfMat);
        db.complaint = Object.assign(d, { materials: Array.from(set) });
        saveDb();
        refresh();
      });
    });
  }

  /* ---------- 保修日期卡 ---------- */
  function warrantyExpiry(card) {
    const base = parseDate(card.purchase);
    if (!base) return null;
    const months = (Number(card.months) || 0) + (Number(card.extended) || 0);
    if (!months) return parseDate(card.until) || null;
    return addMonths(base, months);
  }

  function renderWarranty() {
    const cards = db.warranties.map((c) => {
      const exp = warrantyExpiry(c);
      return Object.assign({}, c, { exp, days: daysLeft(exp) });
    }).sort((a, b) => (a.days === null ? 9999 : a.days) - (b.days === null ? 9999 : b.days));
    const filtered = warrantyFilter === "all" ? cards : cards.filter((c) => {
      if (warrantyFilter === "active") return c.days !== null && c.days >= 0;
      if (warrantyFilter === "soon") return c.days !== null && c.days >= 0 && c.days <= 30;
      return c.days !== null && c.days < 0;
    });
    const soon = cards.filter((c) => c.days !== null && c.days >= 0 && c.days <= 30).length;
    return `${head("保修日期卡", "购买日 + 保修月数，算到哪天。", "只算日期与材料，不判断故障是否属于保修；结论以品牌售后检测为准。", "back")}
      <div class="tb-stats">
        <div><b>${cards.length}</b><span>台设备</span></div>
        <div><b>${soon}</b><span>30 天内到期</span></div>
        <div><b>${cards.filter((c) => c.days !== null && c.days < 0).length}</b><span>已过保</span></div>
      </div>
      <div class="tb-tabs">${[["all", "全部"], ["active", "保修中"], ["soon", "30 天内"], ["expired", "已过保"]].map(([id, label]) => `<button class="tb-tab ${warrantyFilter === id ? "on" : ""}" type="button" data-tb="warranty-filter" data-filter="${id}">${label}</button>`).join("")}</div>
      <div class="tb-actions">
        <button class="btn primary" type="button" data-tb="warranty-add">+ 新增设备</button>
        <button class="btn ghost" type="button" data-tb="warranty-import">从票据补全</button>
      </div>
      ${filtered.length ? filtered.map((c) => `<div class="tb-card-row">
        <div class="tb-card-main"><b>${esc(c.name)}</b>
          <small>${esc(c.brand || "品牌待填")}${c.model ? ` · ${esc(c.model)}` : ""} · 购于 ${esc(c.purchase || "待填")}</small>
          <em class="${c.days !== null && c.days <= 30 ? "warn" : ""}">${c.days === null ? "到期日待算" : c.days < 0 ? `已过保 ${Math.abs(c.days)} 天` : `剩 ${c.days} 天 · ${fmtDate(c.exp)}`}</em>
          <span class="tb-ev">${c.invoice ? "发票✓" : "发票缺"} · ${c.card ? "保修卡✓" : "保修卡缺"}</span>
        </div>
        <div class="tb-card-side">
          <div class="tb-card-actions">
            <button class="link-btn" type="button" data-tb="warranty-edit" data-id="${c.id}">编辑</button>
            <button class="link-btn" type="button" data-tb="warranty-copy" data-id="${c.id}">复制</button>
            <button class="link-btn" type="button" data-tb="warranty-del" data-id="${c.id}">删</button>
          </div>
        </div>
      </div>`).join("") : emptyBlock("还没有设备。手动加一台，或从已有票据补全。", "新增设备", "warranty-add")}
      <p class="note">保修期按购买日与保修月数计算；延保、主要部件单独保修以保修卡/合同为准。</p>`;
  }

  function openWarrantySheet(card) {
    const c = card || {};
    A.openSheet(card ? "编辑设备" : "新增设备", `
      <div class="tb-form">
        <label class="field"><span>设备名称</span><input id="tbWrName" value="${esc(c.name || "")}" placeholder="如：客厅空调" /></label>
        <label class="field"><span>品牌 / 型号</span><input id="tbWrBrand" value="${esc(c.brand || "")}" placeholder="品牌" /><input id="tbWrModel" value="${esc(c.model || "")}" placeholder="型号（可选）" /></label>
        <label class="field"><span>购买日期</span><input id="tbWrPurchase" type="date" value="${esc(c.purchase || "")}" /></label>
        <div class="tb-form-2">
          <label class="field"><span>整机保修（月）</span><input id="tbWrMonths" type="number" inputmode="numeric" value="${c.months != null ? c.months : 12}" /></label>
          <label class="field"><span>延保（月）</span><input id="tbWrExt" type="number" inputmode="numeric" value="${c.extended != null ? c.extended : ""}" placeholder="0" /></label>
        </div>
        <label class="field"><span>或直接填到期日</span><input id="tbWrUntil" type="date" value="${esc(c.until || "")}" /></label>
        <label class="field"><span>商家（可选）</span><input id="tbWrMerchant" value="${esc(c.merchant || "")}" placeholder="卖场/门店" /></label>
        <label class="field"><span>价格（可选）</span><input id="tbWrPrice" type="number" inputmode="decimal" value="${c.price != null ? c.price : ""}" /></label>
        <div class="tb-checks">
          <label class="tb-check"><input id="tbWrInvoice" type="checkbox" ${c.invoice ? "checked" : ""} /><span>发票已备</span></label>
          <label class="tb-check"><input id="tbWrCard" type="checkbox" ${c.card ? "checked" : ""} /><span>保修卡已备</span></label>
        </div>
      </div>
      <div class="sheet-actions"><button class="btn primary" id="tbWrSave" type="button">保存</button><button class="btn ghost" id="tbWrCancel" type="button">取消</button></div>`, () => {
      $("#tbWrCancel").onclick = A.closeSheet;
      $("#tbWrSave").onclick = () => {
        const name = $("#tbWrName").value.trim();
        const purchase = $("#tbWrPurchase").value;
        if (!name || (!purchase && !$("#tbWrUntil").value)) { A.toast("设备名和购买日/到期日填一下"); return; }
        const next = {
          id: c.id || uid(), name, brand: $("#tbWrBrand").value.trim(), model: $("#tbWrModel").value.trim(),
          purchase, months: Number($("#tbWrMonths").value) || 0, extended: Number($("#tbWrExt").value) || 0,
          until: $("#tbWrUntil").value, merchant: $("#tbWrMerchant").value.trim(),
          price: Number($("#tbWrPrice").value) || 0, invoice: $("#tbWrInvoice").checked,
          card: $("#tbWrCard").checked, ticketId: c.ticketId || ""
        };
        if (c.id) db.warranties = db.warranties.map((x) => x.id === c.id ? next : x);
        else db.warranties.push(next);
        saveDb(); A.closeSheet(); A.toast("已保存"); render();
      };
    });
  }

  function importTicketWarranties() {
    let added = 0;
    (A.state.tickets || []).forEach((t) => {
      const win = (t.windows || []).find((w) => w.type === "warranty");
      if (!win || win.applicability === "not_applicable" || !win.end) return;
      if (db.warranties.some((c) => c.ticketId === t.id)) return;
      const purchase = t.date || "";
      db.warranties.push({
        id: uid(), ticketId: t.id, name: t.product || t.merchant || "未命名设备",
        brand: t.brand || "", model: "", purchase, months: 0, extended: 0,
        until: win.end, merchant: t.merchant || "", price: Number(t.amount) || 0,
        invoice: (t.evidence || []).some((e) => /发票/.test(e.label || e.type || "")),
        card: (t.evidence || []).some((e) => /保修/.test(e.label || e.type || ""))
      });
      added++;
    });
    saveDb();
    A.toast(added ? `补全 ${added} 台设备` : "没有可补全的保修票据");
    render();
  }

  /* ---------- 家庭体检单 ---------- */
  function familyOverview() {
    const tickets = A.state.tickets || [];
    const rights = [];
    tickets.forEach((t) => (t.windows || []).forEach((w) => {
      if (w.status !== "closed" && typeof w.daysLeft === "number" && w.daysLeft >= 0) rights.push({ ticket: t, win: w });
    }));
    rights.sort((a, b) => a.win.daysLeft - b.win.daysLeft);
    const subs = allSubs();
    const cards = allCards();
    const cardBalance = cards.reduce((s, c) => s + (Number(c.balance) || 0), 0);
    const coupons = (A.state.coupons || []).filter((c) => {
      const d = A.couponDays ? A.couponDays(c) : null;
      return d !== null && d >= 0 && d <= 30;
    });
    const points = (A.state.points || []).filter((p) => {
      const d = p.expiresAt ? daysLeft(parseDate(p.expiresAt)) : null;
      return d !== null && d >= 0 && d <= 30;
    });
    const persons = new Map();
    tickets.forEach((t) => {
      const name = A.memberNameOf ? (A.memberNameOf(t) || "本人") : "本人";
      persons.set(name, (persons.get(name) || 0) + 1);
    });
    db.bills.forEach((b) => {
      const name = b.person || "本人";
      persons.set(name, (persons.get(name) || 0) + 1);
    });
    const fraudFlags = FRAUD_ITEMS.filter((f) => db.fraud[f.id] === "yes");
    const urgent = deadlineItems().filter((item) => item.days <= 7);
    return { rights, subs, cards, cardBalance, coupons, points, persons, fraudFlags, urgent };
  }

  function yearSummary() {
    const year = String(new Date().getFullYear());
    const rows = (db.bills || []).filter((b) => String(b.date || "").startsWith(year));
    const expense = rows.filter((b) => b.direction === "expense").reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const refund = rows.filter((b) => b.direction !== "expense").reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const recovered = (A.state.tickets || []).reduce((sum, t) => sum + (t.actions || [])
      .filter((a) => a.confirmed !== false && ["refunded", "promise"].includes(a.status))
      .reduce((s, a) => s + (Number(a.amount) || 0), 0), 0);
    const subs = allSubs();
    const saved = subs.reduce((s, x) => s + savingsOf(x.key, x.monthly), 0);
    const cardBalance = allCards().reduce((s, c) => s + (Number(c.balance) || 0), 0);
    const coupons = (A.state.coupons || []).filter((c) => {
      const d = A.couponDays ? A.couponDays(c) : null;
      return d !== null && d >= 0 && d <= 30;
    }).length;
    return { year, expense, refund, recovered, saved, cardBalance, coupons, bills: rows.length, subs: subs.length };
  }

  function renderFamily() {
    const o = familyOverview();
    const soon = o.urgent;
    const y = yearSummary();
    const annualSubs = o.subs.reduce((s, x) => s + x.yearly, 0);
    const unknownFraud = FRAUD_ITEMS.filter((f) => !db.fraud[f.id] || db.fraud[f.id] === "unsure").length;
    return `${head("家庭体检单", "一张单子，给爸妈看。", "把账单、订阅、卡、权利和防诈合成一页；只汇总本机已有记录，不登录任何账号。", "back")}
      <div class="tb-stats">
        <div><b>${soon.length}</b><span>7 天内要办</span></div>
        <div><b>${money(annualSubs)}</b><span>一年续费</span></div>
        <div><b>${money(o.cardBalance)}</b><span>卡里余额</span></div>
      </div>
      <section class="tb-section"><div class="tb-section-head"><h2>今年家里</h2><span>${y.year} · 只算本机记录</span></div>
        <div class="tb-line"><span><b>账单支出</b><small>${y.bills} 笔已导入流水</small></span><b>${money(y.expense)}</b></div>
        <div class="tb-line"><span><b>退款 / 收入</b><small>以原渠道到账为准</small></span><b>${money(y.refund)}</b></div>
        <div class="tb-line"><span><b>已确认守住</b><small>只算你确认过的到账 / 兑现</small></span><b class="good">${money(y.recovered)}</b></div>
        <div class="tb-line"><span><b>续费决策一年可省</b><small>${y.subs} 项续费</small></span><b>${money(y.saved)}</b></div>
        <div class="tb-line"><span><b>卡里余额</b><small>储值卡 / 次卡</small></span><b>${money(y.cardBalance)}</b></div>
        <div class="tb-line"><span><b>30 天内到期券</b><small>不用就作废</small></span><b>${y.coupons} 张</b></div>
        <p class="tb-hint">账单只统计你导入的部分，不代表全部消费；预计、确认、已到账三种金额始终分开。</p>
      </section>
      ${o.fraudFlags.length ? `<div class="tb-alert"><b>有 ${o.fraudFlags.length} 项正在发生的高危信号</b>
        <p>先挂断、不转账、不给验证码。拨 96110 反诈专线咨询；涉及转账或威胁，拨 110。</p></div>` : ""}
      <section class="tb-section tb-family-steps"><h2>帮爸妈，三步</h2>
        <ol class="tb-list tb-family-steps">
          <li><div class="tb-family-step"><span>先把家里的储值卡、券和续费记进来。</span><button class="link-btn" type="button" data-tb="go" data-view="accounts">去记</button></div></li>
          <li><div class="tb-family-step"><span>再让爸妈导出这个月的支付宝/微信账单，在本机导入。</span><button class="link-btn" type="button" data-tb="billImport">导账单</button></div></li>
          <li><div class="tb-family-step"><span>最后把这张单打印出来，或转发到家人群。</span><button class="link-btn" type="button" data-tb="family-share">转发</button></div></li>
        </ol>
        <p class="tb-hint">每个账号只导出自己的账单；票根不登录、不代操作。爸妈的手机上装一个同样的入口，数据各自留在各自手机。</p>
      </section>
      <section class="tb-section"><h2>家里现在有什么</h2>
        <div class="tb-line"><span>家庭成员</span><b>${Array.from(o.persons.keys()).join("、") || "还没有记录"}</b></div>
        <div class="tb-line"><span>未关闭权利</span><b>${o.rights.length} 件</b></div>
        <div class="tb-line"><span>7 天内到期</span><b class="${soon.length ? "warn" : ""}">${soon.length} 件</b></div>
        <div class="tb-line"><span>续费项</span><b>${o.subs.length} 项 / 年 ${money(annualSubs)}</b></div>
        <div class="tb-line"><span>储值卡</span><b>${o.cards.length} 张 / ${money(o.cardBalance)}</b></div>
        <div class="tb-line"><span>30 天内到期券 / 积分</span><b>${o.coupons.length} 张 / ${o.points.length} 项</b></div>
      </section>
      ${soon.length ? `<section class="tb-section"><h2>7 天内先办</h2>
        ${soon.slice(0, 8).map((r) => `<div class="tb-line"><span>${esc(r.title)}<small>${esc(r.meta)}</small></span><b class="warn">${r.days === 0 ? "今天" : `${r.days} 天`}</b></div>`).join("")}
      </section>` : ""}
      <section class="tb-section"><div class="tb-section-head"><h2>防诈自检</h2><span>${unknownFraud} 项未确认</span></div>
        <p class="tb-hint">下面任何一项是“有”，先停下来，不要按对方说的做。</p>
        ${FRAUD_ITEMS.map((f) => `<div class="tb-fraud-row"><span>${esc(f.text)}</span>
          <div class="tb-fraud-opts">${[["no", "没有"], ["unsure", "不确定"], ["yes", "有"]].map(([v, label]) => `<button class="tb-mini ${db.fraud[f.id] === v ? "on " + v : ""}" type="button" data-tb="fraud" data-id="${f.id}" data-value="${v}">${label}</button>`).join("")}</div>
        </div>`).join("")}
      </section>
      <div class="tb-actions">
        <button class="btn primary" type="button" data-tb="family-print">打印体检单</button>
        <button class="btn ghost" type="button" data-tb="family-copy">复制成一段话</button>
        <button class="btn ghost" type="button" data-tb="family-save">保存本次</button>
      </div>
      ${db.familyChecks.length ? `<section class="tb-section"><h2>最近体检</h2>${db.familyChecks.slice(-3).reverse().map((c) => `<div class="tb-line"><span>${esc(c.at.slice(0, 10))}</span><b>${c.soon} 件急办 · ${c.fraud} 项高危</b></div>`).join("")}</section>` : ""}
      <p class="note">本单只汇总本机记录；没有记录的项目显示为 0，不代表真的没有。96110 为反诈预警劝阻专线，号码以官方公布为准。</p>`;
  }

  function familyText() {
    const o = familyOverview();
    const soon = o.urgent;
    const y = yearSummary();
    const lines = [
      `票根 · 家庭体检单（${isoToday()}）`,
      "",
      `一、家里现在有什么`,
      `成员：${Array.from(o.persons.keys()).join("、") || "还没有记录"}`,
      `未关闭权利：${o.rights.length} 件；7 天内到期：${soon.length} 件`,
      `续费：${o.subs.length} 项，一年约 ${money(o.subs.reduce((s, x) => s + x.yearly, 0))}`,
      `储值卡：${o.cards.length} 张，余额约 ${money(o.cardBalance)}`,
      `30 天内到期券：${o.coupons.length} 张；积分：${o.points.length} 项`,
      "",
      `二、${y.year} 年总览`,
      `账单支出：${money(y.expense)}（${y.bills} 笔已导入）`,
      `退款 / 收入：${money(y.refund)}；已确认守住：${money(y.recovered)}`,
      `续费决策一年可省：${money(y.saved)}；卡里余额：${money(y.cardBalance)}`,
      "",
      "三、7 天内先办"
    ];
    if (soon.length) soon.slice(0, 8).forEach((r) => lines.push(`- ${r.title}：${r.meta}，${r.days === 0 ? "今天截止" : `剩 ${r.days} 天`}`));
    else lines.push("- 暂时没有 7 天内到期的权利。");
    lines.push("", "四、防诈自检");
    const flags = FRAUD_ITEMS.filter((f) => db.fraud[f.id] === "yes");
    if (flags.length) flags.forEach((f) => lines.push(`- 有：${f.text}`));
    else lines.push("- 没有勾选高危项；不确定的项建议当面再问一次。");
    lines.push("", "五、怎么办");
    lines.push("- 先挂断、不转账、不给验证码；拨 96110 咨询，涉及转账或威胁拨 110。");
    lines.push("- 权利与退款以票据和平台记录为准，不承诺结果。");
    lines.push("", "本单由本机账单、案卷与手工台账生成，未上传。");
    return lines.join("\n");
  }

  function printDoc(title, text) {
    const w = window.open("", "_blank");
    if (!w) { A.toast("浏览器拦截了新窗口，请允许后重试"); return; }
    const body = esc(text).replace(/\n/g, "<br />");
    w.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><title>${esc(title)}</title>
      <style>body{font-family:"Noto Sans SC","Microsoft YaHei UI",sans-serif;max-width:720px;margin:40px auto;padding:0 24px;color:#111;line-height:1.85;font-size:14px}h1{font-size:20px;margin:0 0 18px}pre{white-space:pre-wrap;font:inherit;margin:0}</style>
      </head><body><h1>${esc(title)}</h1><pre>${esc(text)}</pre><script>window.onload=function(){window.print()}<\/script></body></html>`);
    w.document.close();
  }

  /* ---------- 通用 ---------- */
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      A.toast("已复制");
    } catch (e) {
      A.openSheet("复制这段文字", `<p class="sheet-hint">浏览器没有给剪贴板权限，请手动全选复制。</p>
        <textarea class="sheet-textarea" rows="10">${esc(text)}</textarea>
        <div class="sheet-actions"><button class="btn ghost" id="tbCopyClose" type="button">关闭</button></div>`, () => {
        $("#tbCopyClose").onclick = A.closeSheet;
      });
    }
  }

  function watchSheetClose() {
    const root = $("#sheetOverlay");
    if (!root) return;
    const observer = new MutationObserver(() => {
      if (root.hidden) { observer.disconnect(); render(); }
    });
    observer.observe(root, { attributes: true, attributeFilter: ["hidden"] });
  }

  function confirmSheet(title, text, onYes) {
    A.openSheet(title, `<p class="sheet-hint">${esc(text)}</p>
      <div class="sheet-actions"><button class="btn primary" id="tbConfirmYes" type="button">确认</button><button class="btn ghost" id="tbConfirmNo" type="button">取消</button></div>`, () => {
      $("#tbConfirmNo").onclick = A.closeSheet;
      $("#tbConfirmYes").onclick = () => { A.closeSheet(); onYes(); };
    });
  }

  function openScenario(id) {
    view = `findDetail:${id}`;
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }

  /* ---------- 事件 ---------- */
  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-open-toolbox]");
    if (opener) {
      const origin = opener.dataset.origin || "today";
      open(opener.dataset.openToolbox || "list", origin);
      return;
    }
    const button = event.target.closest("[data-tb]");
    if (!button || button.disabled) return;
    const action = button.dataset.tb;
    if (action === "material") return;
    if (action === "back") {
      if (view === "findDetail") view = "find";
      else view = "list";
      render();
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      return;
    }
    if (action === "find-back") { view = "find"; render(); return; }
    if (action === "exit") { A.show(returnTo || "today"); return; }
    if (action === "go" || action === "brief-open") {
      if (button.dataset.view === "cards") { accountTab = "card"; open("accounts"); }
      else if (button.dataset.view === "accounts-card") { accountTab = "card"; open("accounts"); }
      else open(button.dataset.view);
      return;
    }
    if (action === "notice-parse") {
      noticeText = ($("#tbNoticeText") || {}).value || "";
      noticeItems = parseNotice(noticeText);
      if (!noticeItems.length) A.toast("先贴一条消息进来");
      render();
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      return;
    }
    if (action === "notice-paste") {
      if (!navigator.clipboard || !navigator.clipboard.readText) { A.toast("浏览器不支持读剪贴板，请手动粘贴"); return; }
      navigator.clipboard.readText().then((text) => {
        noticeText = String(text || "").slice(0, 4000);
        noticeItems = parseNotice(noticeText);
        render();
      }).catch(() => A.toast("没有剪贴板权限，请手动粘贴"));
      return;
    }
    if (action === "notice-clear") { noticeText = ""; noticeItems = []; render(); return; }
    if (action === "notice-act") {
      const item = noticeItems[Number(button.dataset.idx)];
      if (!item) return;
      const act = button.dataset.act;
      if (act === "case") {
        if (!A.openFinanceBuilder) { A.toast("资金案卷暂不可用"); return; }
        A.openFinanceBuilder(item.type === "charge" && item.renewal ? "renewal" : "payment", {
          merchant: item.merchant || "", amount: item.amount || "", date: item.date || isoToday(),
          orderNo: item.orderNo || "",
          notes: `来自粘贴的通知：\n${item.text}`
        });
        return;
      }
      if (act === "cardcase") {
        if (!A.openFinanceBuilder) { A.toast("资金案卷暂不可用"); return; }
        A.openFinanceBuilder("chargeback", {
          merchant: item.merchant || "", amount: item.amount || "", date: item.date || isoToday(),
          cardLast4: item.cardLast4 || "", bank: item.merchant || "",
          account: item.cardLast4 ? `尾号 ${item.cardLast4}` : "",
          notes: `来自粘贴的银行通知：\n${item.text}`
        });
        return;
      }
      if (act === "delivery") { openDeliverySheet(item); return; }
      if (act === "bill") {
        db.bills.push({
          id: uid(), date: item.date || isoToday(), time: "", merchant: item.merchant || "未识别",
          desc: item.text.slice(0, 80), category: "其他", source: "粘贴", person: "本人",
          direction: item.type === "refund" ? "income" : "expense",
          amount: Number(item.amount) || 0
        });
        saveDb(); A.toast("已记一笔流水"); render();
        return;
      }
      if (act === "sub") {
        if (!item.merchant || !item.amount) { A.toast("对方或金额没识别出来，先补一下"); return; }
        db.subs.push({ id: uid(), merchant: item.merchant, amount: Number(item.amount), cycle: "month", next: item.date || "" });
        saveDb(); A.toast("已记为续费，可去续费决策改周期"); render();
        return;
      }
      if (act === "reminder") {
        openReminderSheet({ title: item.merchant || NOTICE_TYPES[item.type].label, date: item.date || fmtDate(addDays(new Date(), 7)), note: item.text.slice(0, 80) });
        return;
      }
      if (act === "find") {
        findQuery = /欠费|催缴|逾期/.test(item.text) ? "欠费" : "快递";
        open("find");
        return;
      }
      if (act === "fraud") { open("family"); A.toast("先不要转账、不要给验证码"); return; }
      if (act === "complaint") {
        db.complaint = Object.assign(complaintDraft(), { story: item.text });
        saveDb(); open("complaint");
        return;
      }
      return;
    }
    if (action === "reminder-add") { openReminderSheet(null); return; }
    if (action === "deadline-filter") { deadlineFilter = button.dataset.filter; render(); return; }
    if (action === "deadline-open") {
      const kind = button.dataset.kind;
      if (kind === "right") {
        const ticket = (A.state.tickets || []).find((t) => t.id === button.dataset.id);
        if (ticket && A.openCase) { A.openCase(ticket); return; }
        open("list"); return;
      }
      if (kind === "coupon") { accountTab = "coupon"; open("accounts"); return; }
      if (kind === "point") { accountTab = "point"; open("accounts"); return; }
      if (kind === "card") { accountTab = "card"; open("accounts"); return; }
      if (kind === "sub") { open("subs"); return; }
      if (kind === "warranty") { open("warranty"); return; }
      if (kind === "reminder") { openReminderSheet(db.reminders.find((r) => r.id === button.dataset.id)); return; }
      return;
    }
    if (action === "deadline-ics") { exportDeadlineIcs(); return; }
    if (action === "deadline-copy") { copyText(deadlineText()); return; }
    if (action === "buy-calc") { calcBuy(); return; }
    if (action === "price-add") { openPriceSheet(button.dataset.item || ""); return; }
    if (action === "price-copy") { copyText(priceText()); return; }
    if (action === "price-case") {
      if (!A.openFinanceBuilder) { A.toast("资金案卷暂不可用"); return; }
      const item = button.dataset.item || "";
      const merchant = button.dataset.merchant || "";
      const amount = Number(button.dataset.amount) || 0;
      const prev = Number(button.dataset.prev) || 0;
      A.openFinanceBuilder("payment", {
        merchant: merchant || item,
        amount: prev > 0 ? String(prev) : String(amount),
        issue: "金额不符",
        notes: `价保申请：${item}；记录价 ${prev ? `¥${prev}` : "未记"} → 现价 ¥${amount}。价保是平台/商家承诺，以订单页规则为准。`
      });
      return;
    }
    if (action === "billImport") { openBillImport(); return; }
    if (action === "billPaste") { openBillPaste(); return; }
    if (action === "billExport") { exportMonthCsv(); return; }
    if (action === "bill-del") {
      const row = db.bills.find((b) => b.id === button.dataset.id);
      if (!row) return;
      confirmSheet("删除这笔流水", `${row.date} · ${row.merchant} · ${money(row.amount)}。只删本机记录。`, () => {
        db.bills = db.bills.filter((b) => b.id !== row.id);
        saveDb(); render(); A.toast("已删除");
      });
      return;
    }
    if (action === "billClear") {
      confirmSheet("清空账本", "会删除本机所有已导入流水、导入记录和续费决策，券、积分、卡不受影响。", () => {
        db.bills = []; db.imports = []; db.decisions = {}; db.subs = [];
        saveDb(); reportMonth = ""; render(); A.toast("账本已清空");
      });
      return;
    }
    if (action === "bill-sub") {
      A.openFinanceBuilder("renewal", {
        merchant: button.dataset.merchant, amount: button.dataset.amount,
        date: button.dataset.date, firstCharge: button.dataset.date,
        notes: `从账单月报识别的跨月重复扣费：${button.dataset.merchant}，月均 ${money(button.dataset.amount)}。`
      });
      return;
    }
    if (action === "acc-tab") { accountTab = button.dataset.tab; render(); return; }
    if (action === "acc-coupon") { if (A.openCouponSheet) { A.openCouponSheet(); watchSheetClose(); } return; }
    if (action === "acc-point") { if (A.openPointsSheet) { A.openPointsSheet(); watchSheetClose(); } return; }
    if (action === "stock-add") { openStockSheet(null); return; }
    if (action === "stock-edit") { openStockSheet(db.stock.find((s) => s.id === button.dataset.id)); return; }
    if (action === "stock-copy") { copyText(stockText()); return; }
    if (action === "stock-share") { shareText(stockText(), "票根 · 囤货清单"); return; }
    if (action === "stock-del") {
      db.stock = db.stock.filter((s) => s.id !== button.dataset.id);
      saveDb(); render(); A.toast("已删除");
      return;
    }
    if (action === "card-add") { openCardSheet(null); return; }
    if (action === "card-edit") { openCardSheet(db.cards.find((c) => c.id === button.dataset.id)); return; }
    if (action === "card-del") {
      const card = db.cards.find((c) => c.id === button.dataset.id);
      if (!card) return;
      confirmSheet("删除这张卡", `删除「${card.name}」的本机记录；已建立的案卷不受影响。`, () => {
        db.cards = db.cards.filter((c) => c.id !== card.id);
        saveDb(); render(); A.toast("已删除");
      });
      return;
    }
    if (action === "card-case") {
      const card = db.cards.find((c) => c.id === button.dataset.id);
      if (!card) return;
      A.openFinanceBuilder("prepaid", {
        merchant: card.merchant || card.name, amount: Number(card.balance) || 0,
        cardType: card.type === "次卡" ? "次数卡" : card.type,
        totalTimes: card.remaining != null ? card.remaining : "", usedTimes: "",
        expireDate: card.expire || "", notes: `储值卡：${card.name}${card.note ? `；${card.note}` : ""}`
      });
      return;
    }
    if (action === "sub-decide") {
      const key = button.dataset.key;
      const decision = button.dataset.decide;
      if (decision === "down") {
        A.openSheet("降到多少", `<p class="sheet-hint">只改记录，不会替你联系商家。填你打算保留的月费。</p>
          <label class="field"><span>新月费（元）</span><input id="tbDownAmount" type="number" inputmode="decimal" value="${button.dataset.monthly}" /></label>
          <div class="sheet-actions"><button class="btn primary" id="tbDownSave" type="button">保存</button><button class="btn ghost" id="tbDownCancel" type="button">取消</button></div>`, () => {
          $("#tbDownCancel").onclick = A.closeSheet;
          $("#tbDownSave").onclick = () => {
            const value = Number($("#tbDownAmount").value);
            if (!Number.isFinite(value) || value < 0) { A.toast("填一个有效金额"); return; }
            db.decisions[key] = { decision: "down", newAmount: value, at: new Date().toISOString() };
            saveDb(); A.closeSheet(); render(); A.toast("已记为降档");
          };
        });
        return;
      }
      db.decisions[key] = { decision, at: new Date().toISOString() };
      const sub = allSubs().find((x) => x.key === key);
      const follow = sub ? addSubFollowUp(sub, decision) : null;
      saveDb(); render();
      if (decision === "cancel") A.toast(follow ? "已记为关闭，并加了下次扣款复核提醒" : "已记为关闭；记得去商家取消授权");
      else if (decision === "down") A.toast(follow ? "已记为降档，并加了生效复核提醒" : "已记为降档");
      return;
    }
    if (action === "sub-add") {
      A.openSheet("手动加一项续费", `<div class="tb-form">
        <label class="field"><span>商家/服务</span><input id="tbSubMerchant" placeholder="如：某云存储" /></label>
        <div class="tb-form-2">
          <label class="field"><span>每次扣多少（元）</span><input id="tbSubAmount" type="number" inputmode="decimal" placeholder="25" /></label>
          <label class="field"><span>多久扣一次</span><select id="tbSubCycle">
            ${Object.keys(CYCLES).map((k) => `<option value="${k}" ${k === "month" ? "selected" : ""}>${CYCLES[k].label}</option>`).join("")}
          </select></label>
        </div>
        <label class="field"><span>下次扣款日</span><input id="tbSubNext" type="date" /></label>
        <p class="tb-hint">按周、季、年扣的会员也能记；票根会换算成月均和一年合计。</p>
      </div><div class="sheet-actions"><button class="btn primary" id="tbSubSave" type="button">加入</button><button class="btn ghost" id="tbSubCancel" type="button">取消</button></div>`, () => {
        $("#tbSubCancel").onclick = A.closeSheet;
        $("#tbSubSave").onclick = () => {
          const merchant = $("#tbSubMerchant").value.trim();
          const amount = Number($("#tbSubAmount").value);
          const cycle = $("#tbSubCycle").value;
          if (!merchant || !Number.isFinite(amount) || amount <= 0) { A.toast("商家和金额填一下"); return; }
          db.subs.push({
            id: uid(), merchant, amount, cycle, next: $("#tbSubNext").value || "",
            monthly: amount * cycleInfo(cycle).perYear / 12
          });
          saveDb(); A.closeSheet(); render(); A.toast("已加入");
        };
      });
      return;
    }
    if (action === "sub-copy") { copyText(decidedText()); return; }
    if (action === "find-cat") { findCat = button.dataset.cat; render(); return; }
    if (action === "find-open") { openScenario(button.dataset.id); return; }
    if (action === "find-complaint") {
      const s = SCENARIOS.find((x) => x.id === button.dataset.id);
      if (!s) return;
      db.complaint = Object.assign(complaintDraft(), {
        story: `${s.cue}\n\n目前卡在：`, materials: s.materials.slice(0, 6),
        scenarioId: s.id
      });
      saveDb();
      view = "complaint";
      render();
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      return;
    }
    if (action === "find-copy") {
      const s = SCENARIOS.find((x) => x.id === button.dataset.id);
      if (s) copyText(`【${s.title}】\n先找：${s.who}\n备选：${s.backup}\n材料：\n- ${s.materials.join("\n- ")}\n\n${s.note}`);
      return;
    }
    if (action === "find-case") {
      const s = SCENARIOS.find((x) => x.id === button.dataset.id);
      if (!s) return;
      A.openFinanceBuilder(s.finance || "payment", { notes: `${s.title}：${s.cue}\n先找：${s.who}\n材料：${s.materials.join("、")}` });
      return;
    }
    if (action === "cf-copy") { copyText(complaintText(complaintDraft())); return; }
    if (action === "cf-copy-short") { copyText(complaintShort(complaintDraft())); return; }
    if (action === "cf-share") { shareText(complaintShort(complaintDraft()), "票根 · 诉求短版"); return; }
    if (action === "cf-save") {
      const text = complaintText(complaintDraft());
      db.complaints.push({ id: uid(), at: new Date().toISOString(), text });
      saveDb(); A.toast("草稿已保存"); render();
      return;
    }
    if (action === "cf-download") { download(`票根_诉求_${isoToday()}.txt`, complaintText(complaintDraft())); return; }
    if (action === "cf-clear") {
      confirmSheet("清空诉求草稿", "只清空当前表单，不删除已保存的草稿。", () => {
        db.complaint = {}; saveDb(); render();
      });
      return;
    }
    if (action === "warranty-add") { openWarrantySheet(null); return; }
    if (action === "warranty-edit") { openWarrantySheet(db.warranties.find((c) => c.id === button.dataset.id)); return; }
    if (action === "warranty-del") {
      confirmSheet("删除设备", "只删除本机保修卡记录。", () => {
        db.warranties = db.warranties.filter((c) => c.id !== button.dataset.id);
        saveDb(); render(); A.toast("已删除");
      });
      return;
    }
    if (action === "warranty-import") { importTicketWarranties(); return; }
    if (action === "warranty-filter") { warrantyFilter = button.dataset.filter; render(); return; }
    if (action === "warranty-copy") {
      const c = db.warranties.find((x) => x.id === button.dataset.id);
      if (!c) return;
      const exp = warrantyExpiry(c);
      copyText(`【保修信息】${c.name}\n品牌/型号：${c.brand || "—"} ${c.model || ""}\n购买日：${c.purchase || "—"}\n保修到期：${exp ? fmtDate(exp) : "—"}\n商家：${c.merchant || "—"}\n材料：${c.invoice ? "发票✓" : "发票缺"}；${c.card ? "保修卡✓" : "保修卡缺"}\n\n报修时提供以上信息；是否属保修以售后检测为准。`);
      return;
    }
    if (action === "fraud") {
      db.fraud[button.dataset.id] = button.dataset.value;
      saveDb(); render();
      if (button.dataset.value === "yes") A.toast("先挂断、不转账；拨 96110 咨询");
      return;
    }
    if (action === "family-print") { printDoc(`票根 · 家庭体检单 ${isoToday()}`, familyText()); return; }
    if (action === "family-copy") { copyText(familyText()); return; }
    if (action === "family-share") { shareText(familyText(), "票根 · 家庭体检单"); return; }
    if (action === "family-save") {
      const o = familyOverview();
      db.familyChecks.push({
        at: new Date().toISOString(), soon: o.urgent.length,
        fraud: o.fraudFlags.length, cards: o.cards.length, subs: o.subs.length
      });
      if (db.familyChecks.length > 12) db.familyChecks = db.familyChecks.slice(-12);
      saveDb(); A.toast("已保存本次体检"); render();
      return;
    }
  });

  document.addEventListener("change", (event) => {
    const el = event.target;
    if (el.id === "tbMonth") { reportMonth = el.value; render(); return; }
    if (el.dataset && el.dataset.tb === "material") {
      const id = el.dataset.id;
      const set = new Set(db.materials[id] || []);
      if (el.checked) set.add(el.dataset.mat); else set.delete(el.dataset.mat);
      db.materials[id] = Array.from(set);
      saveDb();
      if (view.startsWith("findDetail")) {
        const count = $$(`#toolboxBody [data-tb="material"][data-id="${id}"]`).filter((x) => x.checked).length;
        const scenario = SCENARIOS.find((s) => s.id === id);
        const section = el.closest(".tb-section");
        const badge = section && section.querySelector(".tb-section-head span");
        if (badge && scenario) badge.textContent = `${count}/${scenario.materials.length}`;
      }
    }
  });

  document.addEventListener("input", (event) => {
    const el = event.target;
    if (el.id === "tbFind") {
      findQuery = el.value;
      const list = $("#tbFindList");
      if (list) list.innerHTML = findListHtml();
    }
  });

  window.PGToolbox = {
    render,
    open,
    reload: () => { db = loadDb(); render(); },
    parseNotice: (text) => parseNotice(text),
    views: () => ({ view, accountTab, reportMonth }),
    _db: () => db
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      const params = new URLSearchParams(location.search);
      if (params.get("tool")) open(params.get("tool"), params.get("from") || "today");
      else render();
    });
  } else {
    const params = new URLSearchParams(location.search);
    if (params.get("tool")) open(params.get("tool"), params.get("from") || "today");
    else render();
  }
})();
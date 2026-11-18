(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const STORE_KEY = "piaogen.v0.tickets";
  const SETTINGS_KEY = "piaogen.v0.settings";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state = {
    tickets: [],
    pending: [],
    tab: "window",
    selected: new Set(),
    current: null,
    currentWindow: null,
    editing: null,
    demo: false
  };

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "¥—";
    return "¥" + n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function todayLabel() {
    const d = new Date();
    return `今天 · ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      state.tickets = raw ? JSON.parse(raw) : [];
    } catch {
      state.tickets = [];
    }
    if (!Array.isArray(state.tickets)) state.tickets = [];
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.tickets));
  }

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function show(name) {
    $$(".screen").forEach((screen) => screen.classList.toggle("on", screen.dataset.screen === name));
    $$(".tabbar-item").forEach((item) => item.classList.toggle("on", item.dataset.nav === name));
    const main = $("#main");
    main.scrollTop = 0;
    if (name === "today") renderToday();
    if (name === "import") renderImport();
    if (name === "triage") renderTriage();
    if (name === "settings") renderSettings();
  }

  function openSheet(title, body, onMount) {
    $("#sheetTitle").textContent = title;
    $("#sheetBody").innerHTML = body;
    $("#sheetOverlay").hidden = false;
    if (onMount) onMount($("#sheetBody"));
  }

  function closeSheet() {
    $("#sheetOverlay").hidden = true;
  }

  function field(label, name, value, type = "text", options) {
    if (type === "select") {
      return `<div class="field"><label for="f-${name}">${escapeHtml(label)}</label><select id="f-${name}" name="${name}">${options.map(([v, t]) => `<option value="${escapeHtml(v)}" ${String(value) === String(v) ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}</select></div>`;
    }
    if (type === "textarea") {
      return `<div class="field"><label for="f-${name}">${escapeHtml(label)}</label><textarea id="f-${name}" name="${name}" placeholder="${escapeHtml(options || "")}">${escapeHtml(value || "")}</textarea></div>`;
    }
    return `<div class="field"><label for="f-${name}">${escapeHtml(label)}</label><input id="f-${name}" name="${name}" type="${type}" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(options || "")}" /></div>`;
  }

  function categoryOptions(value) {
    return Object.entries(PG.CATEGORY).map(([key, item]) => [key, item.label]).map(([key, label]) => [key, label]);
  }

  function channelOptions(value) {
    return Object.entries(PG.CHANNEL).map(([key, item]) => [key, item.label]);
  }

  function editTicketSheet(ticket, onSave, title = "改这张票") {
    const body = `
      <form id="sheetForm">
        ${field("商家", "merchant", ticket.merchant, "text", "例如：某家电卖场")}
        ${field("金额", "amount", ticket.amount, "number", "399.00")}
        ${field("购买日期", "date", ticket.date, "date")}
        ${field("品类", "category", ticket.category, "select", categoryOptions())}
        ${field("渠道", "channel", ticket.channel, "select", channelOptions())}
        ${field("商品", "product", ticket.product, "text", "例如：空气炸锅")}
        ${field("订单号", "orderNo", ticket.orderNo, "text", "可选")}
        ${field("商家承诺（可选）", "promise", ticket.promise, "text", "例如：整机保修 3 年")}
        <div class="sheet-actions">
          <button class="btn primary" id="sheetSave" type="button">保存</button>
          <button class="btn ghost" id="sheetCancel" type="button">取消</button>
        </div>
      </form>`;
    openSheet(title, body, () => {
      $("#sheetSave").addEventListener("click", () => {
        const data = Object.fromEntries(new FormData($("#sheetForm")).entries());
        const next = {
          ...ticket,
          merchant: String(data.merchant || "").trim(),
          amount: Number(data.amount || 0),
          date: data.date || ticket.date,
          category: data.category,
          channel: data.channel,
          product: String(data.product || "").trim(),
          orderNo: String(data.orderNo || "").trim(),
          promise: String(data.promise || "").trim()
        };
        next.review = false;
        next.needsConfirm = !next.merchant || !next.amount || !next.date;
        next.windows = PG.buildWindows(next).map((w) => ({ ...w, id: uid() }));
        onSave(next);
        closeSheet();
      });
      $("#sheetCancel").addEventListener("click", closeSheet);
    });
  }

  function outcomeSheet(ticket, win, status, onSave) {
    const body = `
      <form id="sheetForm">
        ${field("结果", "status", status, "select", [["refunded", "已到账/已退款"], ["repaired", "已修好/已换货"], ["promise", "承诺已兑现"], ["rejected", "被拒了"], ["abandoned", "今天不办了"]])}
        ${field("确认金额（可选）", "amount", "", "number", "例如：120.00")}
        ${field("备注", "note", "", "textarea", "例如：平台客服说 3 天内到账")}
        <div class="sheet-actions">
          <button class="btn primary" id="outcomeSave" type="button">记录结果</button>
          <button class="btn ghost" id="outcomeCancel" type="button">取消</button>
        </div>
      </form>`;
    openSheet("记录结果", body, () => {
      $("#outcomeSave").addEventListener("click", () => {
        const data = Object.fromEntries(new FormData($("#sheetForm")).entries());
        onSave({
          status: data.status,
          amount: data.amount ? Number(data.amount) : null,
          note: String(data.note || "").trim()
        });
        closeSheet();
      });
      $("#outcomeCancel").addEventListener("click", closeSheet);
    });
  }

  function parseDate(text) {
    const normalized = String(text || "").replace(/[年月/.]/g, "-").replace(/日/g, "");
    const match = normalized.match(/(20\d{2})[-\s]?(\d{1,2})[-\s]?(\d{1,2})/);
    if (!match) return "";
    const y = match[1];
    const m = String(match[2]).padStart(2, "0");
    const d = String(match[3]).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseAmount(text) {
    const value = String(text || "");
    const patterns = [
      /(?:实付|合计|总计|金额|应付|退款金额|价税合计)[:：\s]*[^\d]{0,3}([0-9]+(?:\.[0-9]{1,2})?)/,
      /[¥￥]\s*([0-9]+(?:\.[0-9]{1,2})?)/,
      /([0-9]+(?:\.[0-9]{1,2})?)\s*元/
    ];
    for (const re of patterns) {
      const m = value.match(re);
      if (m) return Number(m[1]);
    }
    const all = value.match(/[0-9]+(?:\.[0-9]{2})/g) || [];
    if (all.length) return Math.max(...all.map(Number));
    return null;
  }

  function parseMerchant(lines) {
    const keywords = ["公司", "店", "商城", "卖场", "超市", "家具", "家电", "建材", "装饰", "装修", "商行", "门店", "品牌"];
    for (const line of lines) {
      const t = line.trim();
      if (t.length < 2 || t.length > 30) continue;
      if (keywords.some((k) => t.includes(k))) return t.replace(/^(商家|商户|销售方)[:：\s]*/, "");
    }
    return lines.find((line) => line.trim().length >= 2 && line.trim().length <= 24)?.trim() || "";
  }

  function parseProduct(lines) {
    for (const line of lines) {
      const t = line.trim();
      if (/商品|品名|型号|规格|项目/.test(t)) {
        return t.replace(/^(商品|品名|型号|规格|项目)[:：\s]*/, "").slice(0, 40);
      }
    }
    return "";
  }

  function parseOrderNo(text) {
    const m = String(text || "").match(/(?:订单号|订单编号|交易号|发票号码)[:：\s]*([A-Za-z0-9-]{6,})/);
    return m ? m[1] : "";
  }

  function parsePromise(lines) {
    for (const line of lines) {
      const t = line.trim();
      if (/保修|保价|赠品|安装|退款|承诺|延保|终身/.test(t) && t.length <= 80) return t;
    }
    return "";
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/(?<=[\u4e00-\u9fa5])[ \t]+(?=[\u4e00-\u9fa5])/g, "")
      .replace(/(?<=[\u4e00-\u9fa5])[ \t]+(?=\d)/g, "")
      .replace(/(?<=\d)[ \t]+(?=[\u4e00-\u9fa5])/g, "")
      .trim();
  }

  function parseReceipt(text, fileName = "", ocrConfidence = 100) {
    const clean = normalizeText(text);
    const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
    const amount = parseAmount(clean);
    const date = parseDate(clean);
    const merchant = parseMerchant(lines);
    const product = parseProduct(lines);
    const orderNo = parseOrderNo(clean);
    const promise = parsePromise(lines);
    const category = PG.categoryOf(clean);
    let channel = PG.channelOf(clean);
    if (channel === "other" && /^TB/i.test(orderNo)) channel = "taobao";
    if (channel === "other" && /^JD/i.test(orderNo)) channel = "jd";
    const missing = [];
    if (!merchant) missing.push("商家");
    if (!amount) missing.push("金额");
    if (!date) missing.push("购买日期");
    if (!product) missing.push("商品名");
    const confidence = Math.max(10, Math.round(ocrConfidence - missing.length * 8));
    const review = ocrConfidence < 82;
    return {
      id: uid(),
      merchant: merchant || "待确认商家",
      amount: amount || 0,
      date: date || "",
      category,
      channel,
      product,
      orderNo,
      promise,
      evidence: [{
        id: uid(),
        type: fileName ? detectFileType(fileName) : "文本",
        label: fileName || "导入的文本",
        detail: clean.slice(0, 180),
        confidence: confidence,
        status: "active"
      }],
      missing,
      review,
      needsConfirm: missing.length > 0 || review,
      source: "ocr",
      createdAt: new Date().toISOString()
    };
  }

  function detectFileType(name) {
    const lower = String(name).toLowerCase();
    if (lower.endsWith(".pdf")) return "PDF";
    if (lower.endsWith(".ofd")) return "OFD";
    if (lower.endsWith(".xml")) return "XML 发票";
    if (/\.(png|jpe?g|webp|bmp)$/.test(lower)) return "图片";
    return "文件";
  }

  function setParse(progress, text, logs = []) {
    const bar = $("#parseBar");
    const count = $("#parseCount");
    const log = $("#parseLog");
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    if (count) count.textContent = text;
    if (log) {
      log.innerHTML = logs.map((item) => `<p class="${item.done ? "done" : "wait"}">${escapeHtml(item.text)}</p>`).join("");
    }
  }

  function showParse(title, sub) {
    $("#parseTitle").textContent = title;
    $("#parseSub").textContent = sub;
    setParse(4, "准备中…", [{ text: "读取文件", done: false }]);
    show("parsing");
  }

  async function fileToText(file) {
    const name = file.name || "";
    const lower = name.toLowerCase();
    if (lower.endsWith(".xml") || lower.endsWith(".txt")) {
      setParse(22, "读取文字层…", [{ text: "读取文件", done: true }, { text: "提取文字层", done: false }]);
      return { text: await file.text(), confidence: 100 };
    }
    if (lower.endsWith(".pdf")) {
      if (!window.pdfjsLib) throw new Error("PDF 组件未加载");
      setParse(18, "读取 PDF…", [{ text: "读取 PDF", done: false }]);
      const buffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
      const page = await pdf.getPage(1);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str).join("\n");
      if (text.trim().length > 24) {
        setParse(42, "找到文字层…", [{ text: "读取 PDF", done: true }, { text: "提取文字层", done: true }]);
        return { text, confidence: 100 };
      }
      setParse(38, "没有文字层，转图片识别…", [{ text: "读取 PDF", done: true }, { text: "转图片识别", done: false }]);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      return await ocrBlob(blob);
    }
    if (lower.endsWith(".ofd")) {
      if (!window.JSZip) throw new Error("OFD 组件未加载");
      setParse(18, "解开 OFD…", [{ text: "解开 OFD", done: false }]);
      const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
      const parts = [];
      for (const entry of Object.values(zip.files)) {
        if (entry.dir || !entry.name.toLowerCase().endsWith(".xml")) continue;
        const raw = await entry.async("string");
        const text = raw
          .replace(/<[^>]+>/g, "\n")
          .split("\n")
          .map((line) => line.replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join("\n");
        if (text) parts.push(text);
      }
      if (!parts.length) throw new Error("OFD 里没有可读文字");
      setParse(42, "找到 OFD 文字…", [{ text: "解开 OFD", done: true }, { text: "提取文字", done: true }]);
      return { text: parts.join("\n"), confidence: 100 };
    }
    if (/\.(png|jpe?g|webp|bmp)$/i.test(name) || file.type.startsWith("image/")) {
      return await ocrBlob(file);
    }
    throw new Error("暂不支持这种文件");
  }

  async function ocrBlob(blob) {
    if (!window.Tesseract) throw new Error("OCR 组件未加载");
    setParse(12, "加载中文识别…", [{ text: "加载中文识别", done: false }]);
    const result = await window.Tesseract.recognize(blob, "chi_sim+eng", {
      workerPath: "vendor/worker.min.js",
      corePath: "vendor",
      langPath: "vendor/lang",
      logger: (m) => {
        if (m.status === "recognizing text") {
          setParse(25 + Math.round((m.progress || 0) * 65), `识别中 ${Math.round((m.progress || 0) * 100)}%`, [
            { text: "加载中文识别", done: true },
            { text: "识别文字", done: false }
          ]);
        }
      }
    });
    setParse(96, "整理字段…", [{ text: "加载中文识别", done: true }, { text: "识别文字", done: true }]);
    return { text: result.data.text || "", confidence: Math.round(result.data.confidence || 60) };
  }

  async function handleFile(file) {
    showParse("正在读这张票", "先看文件，再找出商家、金额、日期和截止日。");
    try {
      const extracted = await fileToText(file);
      const text = extracted.text;
      if (!text || text.trim().length < 4) throw new Error("没有读到文字");
      const ticket = parseReceipt(text, file.name, extracted.confidence);
      state.pending = [ticket];
      state.selected = new Set(ticket.needsConfirm ? [] : [ticket.id]);
      state.tab = ticket.needsConfirm ? "pending" : "window";
      setParse(100, "读完了", [{ text: "读取文件", done: true }, { text: "识别文字", done: true }, { text: "整理字段", done: true }]);
      setTimeout(() => show("triage"), 260);
    } catch (error) {
      const text = `识别失败：${error.message || "未知错误"}`;
      const ticket = parseReceipt("", file.name);
      ticket.missing = ["商家", "金额", "购买日期", "商品名"];
      ticket.needsConfirm = true;
      ticket.evidence = [{ id: uid(), type: detectFileType(file.name), label: file.name, detail: text, confidence: 0, status: "needs" }];
      state.pending = [ticket];
      state.selected = new Set();
      state.tab = "pending";
      toast(text);
      show("triage");
    }
  }

  function defaultWindows(ticket) {
    ticket.windows = PG.buildWindows(ticket).map((window) => ({ ...window, id: uid() }));
    return ticket;
  }

  function renderImport() {
    $$("[data-source]").forEach((button) => {
      button.onclick = () => {
        const source = button.dataset.source;
        if (source === "camera") $("#fileCamera").click();
        if (source === "order") $("#fileOrder").click();
        if (source === "invoice") $("#fileInvoice").click();
        if (source === "manual") openManual();
    if (source === "bill") openBill();
        if (source === "demo") addDemo();
      };
    });
  }

  function parseBillLine(line) {
    const dm = line.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (!dm) return null;
    const date = `${dm[1]}-${String(dm[2]).padStart(2, "0")}-${String(dm[3]).padStart(2, "0")}`;
    const nums = [];
    const re = /([¥￥]\s*)?(-?\d+(?:\.\d{1,2})?)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (/^20\d{2}$/.test(m[2])) continue;
      nums.push({ currency: !!m[1], decimal: /\.\d/.test(m[2]), value: Math.abs(Number(m[2])) });
    }
    const cand = nums.filter((n) => n.currency || n.decimal);
    const amount = cand.length ? cand[cand.length - 1].value : null;
    if (!amount) return null;
    const fields = line.split(/\s*[,\t|]\s*|\s{2,}/).map((s) => s.trim()).filter(Boolean);
    let merchant = "";
    for (const f of fields) {
      if (/^20\d{2}/.test(f)) continue;
      if (/^[¥￥]?-?\d/.test(f)) continue;
      if (/^(支出|收入|不计收支|交易成功|已关闭|退款成功)$/.test(f)) continue;
      if (f.length >= 2) { merchant = f; break; }
    }
    return { date, amount, merchant: merchant || "未知商家", product: "", channel: PG.channelOf(line) };
  }

  function parseBillText(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^(交易时间|时间).*(金额)/.test(line))
      .map(parseBillLine)
      .filter(Boolean);
  }

  function openBill() {
    $("#sheetTitle").textContent = "粘贴账单";
    $("#sheetBody").innerHTML = `
      <p class="sheet-hint">从支付宝或微信账单里复制一段时间，直接粘贴进来。一行一单，能认出日期、商家和金额的才会导入。</p>
      <textarea id="billText" class="sheet-textarea" rows="8" placeholder="2026-11-13 12:30:00  某家电卖场  -399.00
2026-11-08 09:12:44  某家具城  -1280.00
2026-11-01 18:03:10  某装修公司  -5000.00"></textarea>
      <div class="sheet-actions">
        <button class="btn primary" id="billParse" type="button">解析并导入</button>
        <button class="btn ghost" id="billCancel" type="button">取消</button>
      </div>`;
    $("#sheetOverlay").hidden = false;
    $("#billCancel").addEventListener("click", closeSheet);
    $("#billParse").addEventListener("click", () => {
      const rows = parseBillText($("#billText").value);
      if (!rows.length) { toast("没认出账单行，检查一下日期和金额"); return; }
      state.pending = rows.map((row) => defaultWindows({
        ...row,
        id: uid(),
        evidence: [{ id: uid(), type: "账单", label: "账单记录", detail: `${row.merchant} · ${row.date} · ¥${row.amount}`, confidence: 90, status: "active" }],
        missing: [],
        needsConfirm: !row.merchant || row.merchant === "未知商家",
        source: "bill",
        createdAt: new Date().toISOString()
      }));
      state.selected = new Set(state.pending.filter((p) => !p.needsConfirm).map((p) => p.id));
      state.tab = state.pending.some((p) => p.needsConfirm) ? "pending" : "window";
      closeSheet();
      show("triage");
      toast(`认出 ${rows.length} 单`);
    });
  }

  function statsOf(tickets) {
    let recovered = 0, done = 0, spans = [];
    for (const ticket of tickets) {
      for (const action of (ticket.actions || [])) {
        if (action.status === "refunded" || action.status === "promise") {
          recovered += Number(action.amount) || 0;
          done += 1;
        } else if (action.status === "repaired") {
          done += 1;
        }
        if (ticket.date && action.createdAt) {
          const a = new Date(ticket.date), b = new Date(action.createdAt);
          const d = Math.round((b - a) / 86400000);
          if (d >= 0 && d < 3650) spans.push(d);
        }
      }
    }
    const avg = spans.length ? Math.round(spans.reduce((s, x) => s + x, 0) / spans.length) : null;
    return { recovered, done, avg };
  }

  function renderStats() {
    const host = $("#recoverLine");
    if (!host) return;
    const s = statsOf(state.tickets || []);
    if (!s.done) { host.classList.add("hidden"); host.innerHTML = ""; return; }
    host.classList.remove("hidden");
    host.innerHTML = `
      <span><b>${money(s.recovered)}</b> 已追回</span>
      <span><b>${s.done}</b> 件办成</span>
      ${s.avg === null ? "" : `<span><b>${s.avg}</b> 天平均</span>`}
      <button class="link-btn recover-more" id="recoverAnnual" type="button">年度账单 ›</button>`;
    $("#recoverAnnual").onclick = () => { renderAnnual(); show("annual"); };
  }

  function openManual() {
    const blank = { merchant: "", amount: "", date: new Date().toISOString().slice(0, 10), category: "appliance", channel: "other", product: "", orderNo: "", promise: "" };
    editTicketSheet(blank, (ticket) => {
      state.pending = [{ ...ticket, id: uid(), evidence: [{ id: uid(), type: "手动", label: "手动添加", detail: "用户填写的字段", confidence: 100, status: "active" }], missing: ticket.needsConfirm ? ["商家", "金额", "购买日期"].filter((key) => !ticket[key === "购买日期" ? "date" : key]) : [], source: "manual", createdAt: new Date().toISOString() }];
      state.selected = new Set(state.pending[0].needsConfirm ? [] : [state.pending[0].id]);
      state.tab = state.pending[0].needsConfirm ? "pending" : "window";
      show("triage");
    }, "手动添加");
  }

  function addDemo() {
    const demo = [
      {
        merchant: "某家电卖场",
        amount: 399,
        date: "2026-11-13",
        category: "appliance",
        channel: "taobao",
        product: "某品牌空气炸锅",
        orderNo: "TB202611130001",
        promise: "",
        evidence: [
          { type: "订单截图", label: "淘宝订单截图", detail: "某家电卖场 · 实付 ¥399 · 2026-11-13", confidence: 96, status: "active" },
          { type: "电子发票", label: "电子发票 PDF", detail: "销售方：某家电卖场 · 价税合计 ¥399", confidence: 94, status: "active" },
          { type: "合同照片", label: "合同照片", detail: "保修条款：整机 3 年", confidence: 82, status: "active" }
        ],
        missing: ["保修卡"]
      },
      {
        merchant: "某家具城",
        amount: 1280,
        date: "2026-11-08",
        category: "furniture",
        channel: "jd",
        product: "实木餐桌",
        orderNo: "JD202610240001",
        promise: "整机保修 2 年，30 天内降价退差",
        evidence: [
          { type: "订单截图", label: "京东订单截图", detail: "某家具城 · 实付 ¥1,280 · 2026-11-08", confidence: 93, status: "active" },
          { type: "电子发票", label: "电子发票 PDF", detail: "销售方：某家具城 · 价税合计 ¥1,280", confidence: 91, status: "active" }
        ],
        missing: ["承诺确认"]
      },
      {
        merchant: "某装修公司",
        amount: 5000,
        date: "2026-11-01",
        category: "renovation",
        channel: "offline",
        product: "厨房改造定金",
        orderNo: "",
        promise: "开工前可退定金，扣 10% 设计费",
        evidence: [
          { type: "合同照片", label: "定金收据", detail: "某装修公司 · 定金 ¥5,000 · 2026-11-01", confidence: 88, status: "active" },
          { type: "合同照片", label: "合同第 3 页", detail: "退款约定：开工前可退，扣 10% 设计费", confidence: 79, status: "active" }
        ],
        missing: ["合同原件"]
      }
    ].map((item) => defaultWindows({
      ...item,
      id: uid(),
      evidence: item.evidence.map((e) => ({ ...e, id: uid() })),
      needsConfirm: false,
      source: "demo",
      createdAt: new Date().toISOString()
    }));
    state.tickets = demo.concat(state.tickets.filter((t) => t.source !== "demo"));
    state.demo = true;
    save();
    toast("已加入 3 张示例票");
    show("today");
  }

  function renderToday() {
    renderStats();
    const hasTickets = state.tickets.length > 0;
    $("#todayEmpty").classList.toggle("hidden", hasTickets);
    $("#todayContent").classList.toggle("hidden", !hasTickets);
    $("#todayDate").textContent = todayLabel();
    if (!hasTickets) return;

    const ranked = state.tickets
      .map((ticket) => ({ ticket, win: PG.priority(ticket) }))
      .sort((a, b) => {
        const av = a.win ? a.win.daysLeft : 9999;
        const bv = b.win ? b.win.daysLeft : 9999;
        return av - bv;
      });
    const first = ranked[0];
    const open30 = state.tickets.filter((t) => (t.windows || []).some((w) => w.daysLeft !== null && w.daysLeft >= 0 && w.daysLeft <= 30)).length;
    const pending = state.tickets.filter((t) => t.needsConfirm).length;
    const warranties = state.tickets.flatMap((t) => (t.windows || []).filter((w) => w.type === "warranty" && w.daysLeft !== null)).sort((a, b) => a.daysLeft - b.daysLeft);

    $("#todayHeadline").textContent = first && first.win ? "今天先办这一件。" : "这批票暂时没有快到期的。";
    $("#todaySub").textContent = first && first.win
      ? `${first.ticket.merchant} · ${first.win.label} ${first.win.daysLeft} 天后关闭`
      : "可以先补充证据，或再加一张票。";

    if (first && first.win) {
      $("#todayCard").innerHTML = `
        <div class="focus-card">
          <div class="k">${escapeHtml(first.win.label)} · ${escapeHtml(first.win.end)} 关闭${first.ticket.source === "demo" ? " · 示例" : ""}</div>
          <div class="big">${first.win.daysLeft} 天</div>
          <div class="sub">${escapeHtml(first.ticket.merchant)} · ${escapeHtml(first.ticket.product || "这笔订单")} · ${money(first.ticket.amount)}</div>
          <button class="btn" id="focusAction" type="button">看它还能做什么</button>
        </div>`;
      $("#focusAction").addEventListener("click", () => openResult(first.ticket, first.win));
    } else {
      $("#todayCard").innerHTML = `<div class="focus-card" style="background:linear-gradient(145deg,#33413F,#202B29)"><div class="k">当前没有快到期的窗口</div><div class="big">0 天</div><div class="sub">已导入 ${state.tickets.length} 张票；可以先补充证据，或等新的截止日。</div></div>`;
    }

    $("#todayStats").innerHTML = `
      <div class="stat ${open30 ? "warn" : ""}"><b>${open30}</b><span>30 天内到期</span></div>
      <div class="stat ok"><b>${warranties.length ? warranties[0].daysLeft : "—"}</b><span>天 · 保修剩余</span></div>
      <div class="stat"><b>${pending}</b><span>待确认</span></div>`;

    $("#ticketList").innerHTML = ranked.map(({ ticket, win }) => {
      const days = win ? win.daysLeft : null;
      const cls = win ? (win.status === "expiring" ? "warn" : win.status === "closed" ? "closed" : "") : "closed";
      const label = win ? `${win.label} ${days} 天` : "暂无截止日";
      return `<button class="ticket-item" data-ticket="${ticket.id}" type="button">
        <div class="ticket-main"><b>${escapeHtml(ticket.merchant)}</b><small>${escapeHtml(ticket.product || "未填商品")} · ${escapeHtml(ticket.date || "日期待确认")} · ${money(ticket.amount)}</small></div>
        <div class="ticket-days ${cls}">${win ? `<b>${days}</b> 天` : label}</div>
      </button>`;
    }).join("");

    $$("[data-ticket]").forEach((button) => {
      button.addEventListener("click", () => {
        const ticket = state.tickets.find((t) => t.id === button.dataset.ticket);
        if (ticket) openResult(ticket, PG.priority(ticket));
      });
    });
  }

  function openResult(ticket, win) {
    state.current = ticket;
    state.currentWindow = win || PG.priority(ticket);
    renderResult(ticket);
    show("result");
  }

  function renderDeposit(ticket) {
    const host = $("#depositCalc");
    const hasDeposit = ticket && (ticket.category === "renovation" || (ticket.windows || []).some((w) => w.type === "deposit"));
    if (!hasDeposit) {
      host.classList.add("hidden");
      host.innerHTML = "";
      return;
    }
    const seed = Math.round(Number(ticket.amount) || 5000);
    host.classList.remove("hidden");
    host.innerHTML = `
      <div class="calc-head">
        <h2>定金怎么算</h2>
        <p>《民法典》第五百八十六条：定金不得超过合同标的额的 20%，超过部分不产生定金效力。</p>
      </div>
      <div class="calc-grid">
        <label>合同总额<input id="calcTotal" type="number" inputmode="decimal" min="0" step="100" value="${seed}" /></label>
        <label>已付定金<input id="calcPaid" type="number" inputmode="decimal" min="0" step="100" value="${seed}" /></label>
      </div>
      <div class="calc-seg" role="group" aria-label="谁违约">
        <button type="button" data-side="counter" class="on">商家违约</button>
        <button type="button" data-side="self">我违约</button>
      </div>
      <div class="calc-out" id="calcOut" aria-live="polite"></div>`;

    const total = $("#calcTotal");
    const paid = $("#calcPaid");
    const out = $("#calcOut");
    let side = "counter";
    const money = (n) => `¥${Number(n).toFixed(2)}`;

    const run = () => {
      const r = PG.depositCalc(Number(total.value) || 0, Number(paid.value) || 0, side === "counter");
      out.innerHTML = `
        <div class="calc-row"><span>20% 上限</span><b>${money(r.cap)}</b></div>
        <div class="calc-row"><span>有效定金</span><b>${money(r.valid)}</b></div>
        <div class="calc-row"><span>超出部分（按预付款退）</span><b>${money(r.excess)}</b></div>
        <div class="calc-row sum"><span>${side === "counter" ? "商家违约，应退" : "我违约，可退"}</span><b>${money(r.back)}</b></div>
        <p class="calc-note">${side === "counter"
          ? "《民法典》第五百八十七条：收受定金一方违约致合同目的不能实现，应双倍返还。"
          : "定金不退，但超过 20% 的部分仍属预付款，应当退还。"}</p>`;
    };

    total.addEventListener("input", run);
    paid.addEventListener("input", run);
    host.querySelectorAll("[data-side]").forEach((btn) => {
      btn.addEventListener("click", () => {
        side = btn.dataset.side;
        host.querySelectorAll("[data-side]").forEach((b) => b.classList.toggle("on", b === btn));
        run();
      });
    });
    run();
  }

  function renderTax(ticket) {
    const host = $("#taxCard");
    if (!host) return;
    const hints = PG.taxHints(ticket);
    const specific = hints.filter((h) => h.t !== "发票查验" && h.t !== "年度汇算");
    if (!specific.length) {
      host.classList.add("hidden");
      host.innerHTML = "";
      return;
    }
    host.classList.remove("hidden");
    host.innerHTML = `
      <div class="tax-head">
        <h2>这张票还能抵什么</h2>
        <p>发票不只是维权凭证，也是补贴和扣除的凭证。</p>
      </div>
      ${hints.map((h) => `
        <div class="tax-item">
          <b>${escapeHtml(h.t)}</b>
          <p>${escapeHtml(h.d)}</p>
          <small>需要：${escapeHtml(h.n)}</small>
        </div>`).join("")}
      <p class="tax-note">补贴比例和扣除标准按当年公告执行；这里只判断资格和凭证，不代算税额。</p>`;
  }

  function renderResult(ticket) {
    const actionable = (ticket.windows || []).filter((w) => w.status !== "closed");
    const nearest = PG.priority(ticket);
    $("#resultTitle").textContent = actionable.length
      ? `${actionable.length} 件事还能做`
      : "这张票暂时没有可主张的权利";
    $("#resultTicket").innerHTML = `
      <div class="receipt-top"><div><b>${escapeHtml(ticket.merchant)}</b><div class="receipt-meta">${escapeHtml(ticket.date || "日期待确认")} · ${escapeHtml(PG.CATEGORY[ticket.category]?.label || "其他")}</div></div><div class="amt">${money(ticket.amount)}</div></div>
      <div class="receipt-no"><span>${escapeHtml(ticket.orderNo || "CP—" + ticket.id.slice(0, 6).toUpperCase())}</span><span>${ticket.source === "demo" ? "示例" : "已保存"}</span></div>
      <div class="evidence-line"><span>证据 <b>${ticket.evidence?.length || 0}</b> 件${ticket.missing?.length ? ` · 还缺 ${escapeHtml(ticket.missing.join("、"))}` : ""}${ticket.review ? " · OCR 需复核" : ""}</span><button id="editTicket" type="button">改字段</button></div>
      <div class="receipt-edit" id="inlineEdit" style="display:none">
        <label>商家<input data-field="merchant" value="${escapeHtml(ticket.merchant)}" /></label>
        <label>金额<input data-field="amount" type="number" value="${escapeHtml(ticket.amount || "")}" /></label>
        <label>日期<input data-field="date" type="date" value="${escapeHtml(ticket.date || "")}" /></label>
        <label>商品<input data-field="product" value="${escapeHtml(ticket.product || "")}" /></label>
      </div>`;
    $("#editTicket").addEventListener("click", () => {
      const edit = $("#inlineEdit");
      edit.style.display = edit.style.display === "grid" ? "none" : "grid";
    });
    $$("#inlineEdit input").forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.field;
        if (field === "amount") ticket.amount = Number(input.value || 0);
        else if (field === "date") ticket.date = input.value;
        else ticket[field] = input.value.trim();
        ticket.needsConfirm = !ticket.merchant || !ticket.amount || !ticket.date;
        ticket.windows = PG.buildWindows(ticket).map((w) => ({ ...w, id: uid() }));
        save();
        renderResult(ticket);
        toast("已更新，期限重新算了");
      });
    });

    $("#resultWindows").innerHTML = (ticket.windows || []).map((w) => {
      const width = w.daysLeft === null ? 0 : Math.max(0, Math.min(100, Math.round((w.daysLeft / 365) * 100)));
      const cls = w.status === "expiring" ? "warn" : w.status === "closed" ? "closed" : w.status === "unknown" ? "unknown" : "";
      const value = w.daysLeft === null ? "待确认" : `${w.daysLeft} 天`;
      return `<div class="window ${cls}">
        <div class="window-top"><b>${escapeHtml(w.label)}</b><span><b>${value}</b></span></div>
        <p>${escapeHtml(w.source)}${w.end ? ` · 截止 ${escapeHtml(w.end)}` : ""}${w.basis && w.basis.url ? ` · <a href="${escapeHtml(w.basis.url)}" target="_blank" rel="noopener noreferrer">查看原文</a>` : ""}</p>
        ${w.note ? `<p class="window-note">${escapeHtml(w.note)}</p>` : ""}
        <div class="window-bar"><i style="width:${width}%"></i></div>
      </div>`;
    }).join("");

    renderDeposit(ticket);
    renderTax(ticket);

    const banner = $("#reviewBanner");
    if (banner) {
      if (ticket.review) {
        banner.innerHTML = `<div class="review-banner"><b>OCR 置信度偏低</b><span>金额、日期请核对后再用</span><button class="link-btn" id="reviewFix" type="button">改字段</button></div>`;
        $("#reviewFix").onclick = () => { const b = $("#editTicket"); if (b) b.click(); };
      } else {
        banner.innerHTML = "";
      }
    }

    $("#resultEvidence").innerHTML = `<h2>证据</h2>` + (ticket.evidence || []).map((e) => `
      <div class="evidence-item">
        <span class="ev-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14H7V3Z"/><path d="M14 3v5h5"/></svg></span>
        <div class="ev-main"><b>${escapeHtml(e.type)} · ${escapeHtml(e.label)}</b><small>${escapeHtml(e.detail || "")}</small></div>
        <span class="${e.status === "needs" ? "ev-need" : "ev-ok"}">${e.status === "needs" ? "需确认" : e.confidence ? `${e.confidence}%` : "已记录"}</span>
      </div>`).join("") + (ticket.missing || []).map((m) => `<div class="evidence-item"><span class="ev-ico">+</span><div class="ev-main"><b>还缺 ${escapeHtml(m)}</b><small>补上后重算保修/承诺</small></div><span class="ev-need">待补</span></div>`).join("");

    $("#resultActions").innerHTML = `
      <button class="btn primary" id="goAction" type="button">${nearest ? `去办：${escapeHtml(nearest.label)}` : "补充证据"}</button>
      ${nearest && nearest.end ? `<button class="btn ghost" id="toCalendar" type="button">加到日历</button>` : ""}
      <button class="btn ghost" id="backToday" type="button">回到今天</button>
      <button class="link-btn" id="deleteTicket" type="button">删除这张票</button>`;
    if ($("#toCalendar")) $("#toCalendar").addEventListener("click", () => addToCalendar(ticket, nearest));
    $("#goAction").addEventListener("click", () => {
      if (nearest) openAction(ticket, nearest);
      else toast("先补一张带金额/日期/商品名的票");
    });
    $("#backToday").addEventListener("click", () => show("today"));
    $("#deleteTicket").addEventListener("click", () => {
      state.tickets = state.tickets.filter((t) => t.id !== ticket.id);
      save();
      toast("已删除");
      show("today");
    });

    renderHelper(ticket);
    renderEmptyReason(ticket, actionable);
  }

  function renderHelper(ticket) {
    const host = $("#resultHelper");
    if (!host) return;
    const h = ticket.helper;
    if (h && h.forWhom) {
      host.innerHTML = `<div class="helper-card"><span>代办 · ${escapeHtml(h.name || "家人")} 为 ${escapeHtml(h.forWhom)} 办</span><button class="link-btn" id="editHelper" type="button">修改</button></div>`;
    } else {
      host.innerHTML = `<button class="helper-add" id="editHelper" type="button">帮家人办 →</button>`;
    }
    $("#editHelper").addEventListener("click", () => openHelperSheet(ticket));
  }

  function openHelperSheet(ticket) {
    const h = ticket.helper || {};
    $("#sheetTitle").textContent = "帮家人办";
    $("#sheetBody").innerHTML = `
      <p class="sheet-hint">填了之后，陪办话术会变成“我帮家人问的”，导出也会带上。</p>
      <label class="field"><span>这是谁的票</span><input id="helperFor" value="${escapeHtml(h.forWhom || "")}" placeholder="母亲 / 父亲 / 家人" /></label>
      <label class="field"><span>代办人</span><input id="helperName" value="${escapeHtml(h.name || "")}" placeholder="女儿 / 儿子 / 本人" /></label>
      <label class="field"><span>联系电话（可留空）</span><input id="helperPhone" value="${escapeHtml(h.phone || "")}" placeholder="138****" /></label>
      <div class="sheet-actions">
        <button class="btn primary" id="helperSave" type="button">保存</button>
        <button class="btn ghost" id="helperCancel" type="button">取消</button>
      </div>`;
    $("#sheetOverlay").hidden = false;
    $("#helperCancel").addEventListener("click", closeSheet);
    $("#helperSave").addEventListener("click", () => {
      const forWhom = $("#helperFor").value.trim();
      const name = $("#helperName").value.trim();
      const phone = $("#helperPhone").value.trim();
      ticket.helper = forWhom ? { forWhom, name, phone } : null;
      save();
      closeSheet();
      renderHelper(ticket);
      toast(forWhom ? `已记为 ${name || "家人"} 代办` : "已清除代办");
    });
  }

  function renderEmptyReason(ticket, actionable) {
    const host = $("#resultHelper");
    if (!host) return;
    if (actionable.length) return;
    host.innerHTML = `<div class="empty-reason">
      <b>这张票暂时没有可主张的权利</b>
      <p>${ticket.date ? "可能已经过了所有期限，或者品类不在法定范围内。" : "缺购买日期，无法计算起止时间。"}</p>
      <button class="link-btn" id="fixTicket" type="button">${ticket.date ? "补一张新票" : "补日期后重算"}</button>
    </div>`;
    $("#fixTicket").addEventListener("click", () => {
      if (ticket.date) { show("import"); return; }
      openResult(ticket);
      $("#editTicket")?.click();
    });
  }

  function addToCalendar(ticket, win) {
    const day = String(win.end || "").replace(/[.]/g, "-");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { toast("这条没有确切截止日"); return; }
    const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Piaogen//V0//CN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:piaogen-${ticket.id}-${win.type}@local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day.replace(/-/g, "")}`,
      `SUMMARY:票根 · ${ticket.merchant} ${win.label}截止`,
      `DESCRIPTION:${String(win.source || "").replace(/[\r\n]/g, " ")}`,
      "BEGIN:VALARM", "TRIGGER:-P3D", "ACTION:DISPLAY", "DESCRIPTION:还有 3 天", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `piaogen-${ticket.id}-${win.type}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    toast("已生成日历文件");
  }

  function openAction(ticket, win) {
    state.current = ticket;
    state.currentWindow = win;
    $("#actionTitle").textContent = `${win.label} · 先确认三件事`;
    $("#actionSteps").innerHTML = `<div class="step on"><i></i><span>1 看规则</span></div><div class="step"><i></i><span>2 备材料</span></div><div class="step"><i></i><span>3 去办理</span></div>`;
    $("#actionChecklist").innerHTML = PG.checklistFor(win).map((item) => `<label class="check-item"><input type="checkbox" /><span>${escapeHtml(item)}</span></label>`).join("");
    $("#actionScript").textContent = PG.scriptFor(ticket, win);
    $("#actionObjections").innerHTML = `<h2>对方可能会说</h2>` + PG.objectionsFor(win).map((pair) => `
      <div class="obj"><b>「${escapeHtml(pair[0])}」</b><p>${escapeHtml(pair[1])}</p></div>`).join("");
    const portal = PG.portalFor(win);
    $("#actionPortal").innerHTML = `<a href="${portal.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(portal.label)}<span>↗</span></a>`;
    show("action");
  }

  function recordOutcome(ticket, win, outcome) {
    const action = {
      id: uid(),
      type: win.type,
      label: win.label,
      status: outcome.status,
      amount: outcome.amount,
      note: outcome.note,
      createdAt: new Date().toISOString()
    };
    ticket.actions = (ticket.actions || []).concat(action);
    if (outcome.status === "refunded" || outcome.status === "repaired" || outcome.status === "promise") {
      win.status = "closed";
    }
    save();
    renderDone(ticket, win, outcome);
    show("done");
  }

  function renderDone(ticket, win, outcome) {
    const statusLabel = outcome.status === "refunded" ? "已到账/已退款" : outcome.status === "repaired" ? "已修好/已换货" : outcome.status === "promise" ? "承诺已兑现" : outcome.status === "rejected" ? "被拒了" : "今天不办了";
    $("#doneTitle").textContent = outcome.status === "rejected" ? "被拒了，记录还在。" : outcome.status === "abandoned" ? "先放着，记录还在。" : "办完了。";
    $("#doneSub").textContent = outcome.status === "rejected" ? "原记录保留；可以换一条路，或今天先不办。" : "结果已写进这张票。";
    $("#doneCard").innerHTML = `
      <div class="row"><span>${escapeHtml(win.label)}</span><b>${escapeHtml(statusLabel)}</b></div>
      <div class="row"><span>确认金额</span><b>${outcome.amount ? money(outcome.amount) : "未填"}</b></div>
      <div class="row"><span>商家</span><b>${escapeHtml(ticket.merchant)}</b></div>
      ${outcome.note ? `<div class="row"><span>备注</span><b>${escapeHtml(outcome.note)}</b></div>` : ""}`;
    const remaining = (ticket.windows || []).filter((w) => w.status !== "closed" && w.daysLeft !== null && w.daysLeft >= 0);
    $("#doneRemaining").innerHTML = remaining.length ? `<div class="section-head"><h2>这张票还剩</h2></div>` + remaining.slice(0, 3).map((w) => `<div class="window"><div class="window-top"><b>${escapeHtml(w.label)}</b><span><b>${w.daysLeft} 天</b></span></div><p>${escapeHtml(w.source)}</p></div>`).join("") : "";
    const next = $("#doneNext");
    if (next) {
      next.innerHTML = outcome.status === "rejected"
        ? `<h2>被拒之后还能做</h2>
           <div class="obj"><b>平台介入</b><p>回到订单页申请平台客服介入，把这次被拒的理由一起写进去。</p></div>
           <div class="obj"><b>12315</b><p>在全国 12315 平台提交投诉，写明诉求和依据条款，附上票据。</p></div>
           <div class="obj"><b>留证再谈</b><p>记下拒绝理由、时间和客服工号，换一条路再来。</p></div>`
        : "";
    }

    $("#doneToday").onclick = () => show("today");
    $("#doneExport").onclick = () => exportTicket(ticket);
  }

  function renderTriage() {
    const groups = { window: [], pending: [], flow: [], dup: [] };
    for (const ticket of state.pending) {
      const windows = PG.buildWindows(ticket).filter((w) => w.daysLeft !== null && w.daysLeft >= 0);
      ticket.windows = windows.map((w) => ({ ...w, id: uid() }));
      const duplicate = state.tickets.some((t) => t.merchant === ticket.merchant && Number(t.amount) === Number(ticket.amount) && t.date === ticket.date);
      if (duplicate) groups.dup.push(ticket);
      else if (ticket.needsConfirm) groups.pending.push(ticket);
      else if (windows.length) groups.window.push(ticket);
      else groups.flow.push(ticket);
    }
    $("#tabWindow").textContent = groups.window.length;
    $("#tabPending").textContent = groups.pending.length;
    $("#tabFlow").textContent = groups.flow.length;
    $("#tabDup").textContent = groups.dup.length;
    $("#triageTitle").textContent = `找到 ${state.pending.length} 单`;
    $("#triageSub").textContent = state.pending.length ? "先确认字段，再决定导不导入。" : "没有待导入的单。";
    $$(".tab").forEach((tab) => {
      const on = tab.dataset.tab === state.tab;
      tab.classList.toggle("on", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
    const list = groups[state.tab] || [];
    $("#triageList").innerHTML = list.length ? list.map((ticket) => {
      const checked = state.selected.has(ticket.id) ? "checked" : "";
      const chips = (ticket.windows || []).slice(0, 3).map((w) => `<span class="chip ${w.status === "expiring" ? "warn" : w.status === "unknown" ? "pending" : "ok"}">${escapeHtml(w.label)} ${w.daysLeft === null ? "待确认" : `${w.daysLeft} 天`}</span>`).join("") + (ticket.review ? `<span class="chip pending">OCR 需复核</span>` : "");
      return `<div class="triage-row" data-row="${ticket.id}">
        <label class="check"><input type="checkbox" ${checked} data-check="${ticket.id}" aria-label="选择 ${escapeHtml(ticket.merchant)}" /><span class="box"></span></label>
        <div class="triage-main">
          <div class="triage-top"><b>${escapeHtml(ticket.merchant)}</b><span class="amt">${money(ticket.amount)}</span></div>
          <div class="triage-meta">${escapeHtml(ticket.date || "日期待确认")} · ${escapeHtml(PG.CHANNEL[ticket.channel]?.label || "其他")}</div>
          <div class="triage-product">${escapeHtml(ticket.product || "商品名待确认")}</div>
          <div class="chips">${chips || `<span class="chip pending">待确认</span>`}</div>
          <div class="triage-actions"><button data-edit="${ticket.id}" type="button">改字段</button><button data-remove="${ticket.id}" type="button">不是这次购买</button></div>
        </div>
      </div>`;
    }).join("") : `<div class="empty" style="min-height:260px"><p class="lede">这一堆没有单。换一个 tab，或回导入。</p></div>`;

    $$("[data-check]").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) state.selected.add(input.dataset.check);
        else state.selected.delete(input.dataset.check);
        updateTriageBar();
      });
    });
    $$("[data-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        const ticket = state.pending.find((t) => t.id === button.dataset.edit);
        if (ticket) editTicketSheet(ticket, (next) => {
          const index = state.pending.findIndex((t) => t.id === ticket.id);
          state.pending[index] = next;
          state.tab = next.needsConfirm ? "pending" : "window";
          renderTriage();
        });
      });
    });
    $$("[data-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        state.pending = state.pending.filter((t) => t.id !== button.dataset.remove);
        state.selected.delete(button.dataset.remove);
        renderTriage();
      });
    });
    updateTriageBar();
  }

  function updateTriageBar() {
    const n = state.selected.size;
    $("#triageCount").textContent = n ? `已选 ${n} 单` : "还没选单";
    $("#triageImport").textContent = n ? `导入 ${n} 单` : "先选有截止日的单";
    $("#triageImport").disabled = n === 0;
  }

  function importSelected() {
    const chosen = state.pending.filter((t) => state.selected.has(t.id));
    if (!chosen.length) return;
    chosen.forEach((ticket) => {
      ticket.windows = PG.buildWindows(ticket).map((w) => ({ ...w, id: uid() }));
      ticket.source = ticket.source === "demo" ? "demo" : "real";
      state.tickets.unshift(ticket);
    });
    state.pending = state.pending.filter((t) => !state.selected.has(t.id));
    state.selected.clear();
    save();
    const first = chosen[0];
    toast(`已导入 ${chosen.length} 单`);
    openResult(first, PG.priority(first));
  }

  function exportTicket(ticket) {
    const blob = new Blob([JSON.stringify(ticket, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `piaogen-${ticket.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("已导出这张票");
  }

  function renderAnnual() {
    const year = new Date().getFullYear();
    const months = new Array(12).fill(0);
    let total = 0, count = 0, biggest = null;
    for (const ticket of (state.tickets || [])) {
      for (const action of (ticket.actions || [])) {
        if (action.status !== "refunded" && action.status !== "promise") continue;
        const d = new Date(action.createdAt || ticket.date);
        if (Number.isNaN(d.getTime()) || d.getFullYear() !== year) continue;
        const amt = Number(action.amount) || 0;
        months[d.getMonth()] += amt;
        total += amt;
        count += 1;
        if (!biggest || amt > biggest.amt) biggest = { amt, merchant: ticket.merchant };
      }
    }
    const body = $("#annualBody");
    if (!count) {
      body.innerHTML = `<div class="empty-reason">
        <b>${year} 年还没有追回记录</b>
        <p>办完一张票并记录“已到账”，这里就会长出第一根柱子。</p>
        <button class="link-btn" id="annualBack" type="button">回到今天</button>
      </div>`;
      $("#annualBack").onclick = () => show("today");
      return;
    }
    const max = Math.max.apply(null, months.concat([1]));
    body.innerHTML = `
      <div class="annual-total">
        <span>${year} 年追回</span>
        <b>${money(total)}</b>
        <small>${count} 笔 · 最大一笔 ${money(biggest.amt)}（${escapeHtml(biggest.merchant)}）</small>
      </div>
      <div class="annual-chart">
        ${months.map((v, i) => `<div class="bar"><i style="height:${Math.round((v / max) * 100)}%"></i><span>${i + 1}</span></div>`).join("")}
      </div>
      <p class="annual-note">只统计记录为“已到账/已退款”或“承诺已兑现”的金额；已修好、已换货计入件数，不计金额。</p>`;
  }

  function openRulesSheet() {
    const meta = PG.RULES_META;
    const rows = Object.entries(PG.BASIS).map(([id, b]) => `
      <div class="rule-row">
        <b>${escapeHtml(b.law)}${escapeHtml(b.article)}</b>
        <p>${escapeHtml(b.short)}</p>
        <small>${escapeHtml(PG.EFFECTIVE[id] || "")}${b.url ? ` · <a href="${escapeHtml(b.url)}" target="_blank" rel="noopener noreferrer">原文</a>` : ""}</small>
      </div>`).join("");
    $("#sheetTitle").textContent = "规则库";
    $("#sheetBody").innerHTML = `
      <p class="sheet-hint">版本 ${escapeHtml(meta.version)} · 核对于 ${escapeHtml(meta.checkedAt)} · 共 ${Object.keys(PG.BASIS).length} 条</p>
      ${rows}
      <p class="annual-note">价保属平台承诺，天数和条件以订单页为准，不写成法定权利。</p>`;
    $("#sheetOverlay").hidden = false;
  }

  function renderSettings() {
    $("#settingCount").textContent = String(state.tickets.length);
    const open = $("#openAnnual");
    if (open) open.onclick = () => { renderAnnual(); show("annual"); };
    const rules = $("#openRules");
    if (rules) rules.onclick = openRulesSheet;
  }

  function exportAll() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), tickets: state.tickets }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "piaogen-backup.json";
    a.click();
    URL.revokeObjectURL(url);
    toast("已导出备份");
  }

  function importAll(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const tickets = Array.isArray(data) ? data : data.tickets;
        if (!Array.isArray(tickets)) throw new Error("格式不对");
        state.tickets = tickets.concat(state.tickets);
        save();
        renderSettings();
        toast(`已导入 ${tickets.length} 张票`);
      } catch {
        toast("备份文件读不了");
      }
    };
    reader.readAsText(file);
  }

  function bind() {
    $$("[data-nav]").forEach((button) => button.addEventListener("click", () => show(button.dataset.nav)));
    $$("[data-back]").forEach((button) => button.addEventListener("click", () => show(button.dataset.back)));
    $("#settingsBtn").addEventListener("click", () => show("settings"));
    $("#emptyCamera").addEventListener("click", () => $("#fileCamera").click());
    $("#emptyImport").addEventListener("click", () => show("import"));
    $("#emptyDemo").addEventListener("click", addDemo);
    $("#addBtn").addEventListener("click", () => show("import"));
    $("#refreshBtn").addEventListener("click", () => {
      state.tickets.forEach((ticket) => { ticket.windows = PG.buildWindows(ticket).map((w) => ({ ...w, id: uid() })); });
      save();
      renderToday();
      toast("已重新计算");
    });
    $$("#fileCamera,#fileOrder,#fileInvoice").forEach((input) => {
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        input.value = "";
        if (file) handleFile(file);
      });
    });
    $("#triageImport").addEventListener("click", importSelected);
    $("#triageAll").addEventListener("click", () => {
      state.pending.forEach((ticket) => state.selected.add(ticket.id));
      renderTriage();
    });
    $$(".tab").forEach((tab) => tab.addEventListener("click", () => {
      state.tab = tab.dataset.tab;
      renderTriage();
    }));
    $("#copyScript").addEventListener("click", async () => {
      const text = $("#actionScript").textContent;
      try {
        await navigator.clipboard.writeText(text);
        toast("话术已复制");
      } catch {
        toast("浏览器不允许复制，请手动选中");
      }
    });
    $("#actionDone").addEventListener("click", () => {
      if (state.current && state.currentWindow) outcomeSheet(state.current, state.currentWindow, "refunded", (outcome) => recordOutcome(state.current, state.currentWindow, outcome));
    });
    $("#actionRejected").addEventListener("click", () => {
      if (state.current && state.currentWindow) outcomeSheet(state.current, state.currentWindow, "rejected", (outcome) => recordOutcome(state.current, state.currentWindow, outcome));
    });
    $("#exportData").addEventListener("click", exportAll);
    $("#importData").addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json";
      input.onchange = () => input.files[0] && importAll(input.files[0]);
      input.click();
    });
    $("#clearData").addEventListener("click", () => {
      if (!confirm("清空全部票据？不可恢复。")) return;
      state.tickets = [];
      save();
      renderSettings();
      toast("已清空");
    });
    $("#sheetClose").addEventListener("click", closeSheet);
    $("#sheetOverlay").addEventListener("click", (event) => { if (event.target === $("#sheetOverlay")) closeSheet(); });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !$("#sheetOverlay").hidden) closeSheet();
    });
  }

  function init() {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
    }
    load();
    bind();
    renderToday();
    renderImport();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

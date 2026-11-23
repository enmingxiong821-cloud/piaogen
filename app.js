(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const STORE_KEY = "piaogen.v0.tickets";
const COUPON_KEY = "piaogen.v0.coupons";
const POINT_KEY = "piaogen.v0.points";
  const FINANCE_KEY = "piaogen.v0.finance";
  const SETTINGS_KEY = "piaogen.v0.settings";
  const LOSS_KEY = "piaogen.v0.lossAudit";
  let deferredInstallPrompt = null;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state = {
    tickets: [],
    pending: [],
    finance: [],
    tab: "window",
    selected: new Set(),
    current: null,
    currentWindow: null,
    editing: null,
    currentFinance: null,
    demo: false,
    audit: null,
    familyFilter: "all",
    reportPeriod: "week",
    settings: { elder: false }
  };
  const auditDraft = { view: "intro", index: 0, answers: {} };

  const AUDIT_QUESTIONS = [
    {
      id: "cards",
      label: "会员卡 / 储值卡",
      question: "家里有几张会员卡、储值卡？大概还有多少余额？",
      hint: "余额和已过期未用的金额，都可以算进来。",
      fields: [{ key: "cards", label: "余额合计", unit: "元" }],
      options: [0, 500, 1000, 3000]
    },
    {
      id: "subs",
      label: "自动续费",
      question: "有没有连续包月、自动续费？每月大概多少？",
      hint: "只算你确定在扣的；记不清可以跳过。",
      fields: [
        { key: "subMonthly", label: "每月合计", unit: "元" },
        { key: "subUnused", label: "大概几个月没用", unit: "个月" }
      ],
      options: []
    },
    {
      id: "warranty",
      label: "保修 / 维修",
      question: "有没有快到期或已过期的保修？维修大概要花多少？",
      hint: "只算你有印象的家电/数码；没有就跳过。",
      fields: [{ key: "warranty", label: "维修大概花费", unit: "元" }],
      options: [0, 300, 800, 1500]
    },
    {
      id: "unused",
      label: "未用券 / 课程 / 健身卡",
      question: "买了但没用完的券、课程、健身卡，大概多少钱？",
      hint: "按你记得的剩余价值估算，不用精确。",
      fields: [{ key: "unused", label: "大概金额", unit: "元" }],
      options: [0, 500, 1000, 3000]
    },
    {
      id: "expired",
      label: "过期药 / 化妆品 / 耗材",
      question: "已经过期或快过期的药、化妆品、耗材，大概多少钱？",
      hint: "只算你确定不会再用的。",
      fields: [{ key: "expired", label: "大概金额", unit: "元" }],
      options: [0, 100, 300, 800]
    },
    {
      id: "price",
      label: "买贵了 / 价保",
      question: "最近买贵了、但还没申请价保的差价，大概多少？",
      hint: "没有同款确认就不算；这里只做估算。",
      fields: [{ key: "priceDiff", label: "大概差价", unit: "元" }],
      options: [0, 50, 120, 300]
    },
    {
      id: "deposit",
      label: "定金 / 押金",
      question: "有没有还没退的定金、押金？大概多少钱？",
      hint: "定金和订金不同；后面会按合同/违约方再判断。",
      fields: [{ key: "deposit", label: "大概金额", unit: "元" }],
      options: [0, 500, 1000, 5000]
    },
    {
      id: "idle",
      label: "闲置数码 / 家具",
      question: "家里闲置的数码、家具，大概值多少钱？",
      hint: "只算你愿意处理的，不是让你全卖。",
      fields: [{ key: "idle", label: "大概价值", unit: "元" }],
      options: [0, 500, 2000, 5000]
    }
  ];

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
    state.tickets = state.tickets.map((ticket) => {
      if (!Array.isArray(ticket.windows) || ticket.windows.some((w) => !w.applicability)) {
        ticket.windows = PG.buildWindows(ticket).map((w) => ({ ...w, id: w.id || uid() }));
      }
      return ticket;
    });
  }

  function loadAudit() {
    try {
      const raw = localStorage.getItem(LOSS_KEY);
      state.audit = raw ? JSON.parse(raw) : null;
    } catch {
      state.audit = null;
    }
    if (!state.audit || typeof state.audit !== "object") state.audit = null;
  }

  function saveAudit() {
    try {
      localStorage.setItem(LOSS_KEY, JSON.stringify(state.audit || null));
    } catch {}
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) state.settings = Object.assign({ elder: false }, JSON.parse(raw));
    } catch {}
    applySettings();
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings || {})); } catch {}
  }

  function applySettings() {
    document.body.classList.toggle("elder", !!state.settings.elder);
    const label = $("#elderState");
    if (label) label.textContent = state.settings.elder ? "开" : "关";
    const aiLabel = $("#aiState");
    if (aiLabel) aiLabel.textContent = aiConfig().enabled ? "开" : "关";
  }

  function loadCoupons() {
    try { state.coupons = JSON.parse(localStorage.getItem(COUPON_KEY) || "[]"); } catch (e) { state.coupons = []; }
    if (!Array.isArray(state.coupons)) state.coupons = [];
  }

  function loadPoints() {
    try { state.points = JSON.parse(localStorage.getItem(POINT_KEY) || "[]"); } catch (e) { state.points = []; }
    if (!Array.isArray(state.points)) state.points = [];
  }

  function savePoints() {
    try { localStorage.setItem(POINT_KEY, JSON.stringify(state.points || [])); } catch (e) {}
  }

  function saveCoupons() {
    try { localStorage.setItem(COUPON_KEY, JSON.stringify(state.coupons || [])); } catch (e) {}
  }

  function loadFinance() {
    try { state.finance = JSON.parse(localStorage.getItem(FINANCE_KEY) || "[]"); } catch { state.finance = []; }
    if (!Array.isArray(state.finance)) state.finance = [];
  }

  function saveFinance() {
    try { localStorage.setItem(FINANCE_KEY, JSON.stringify(state.finance || [])); }
    catch { toast("本机存储空间不足，资金凭证可能没存下"); }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.tickets));
    } catch (e) {
      toast("本机存储空间不足，截图可能没存下");
    }
  }

  function caseTickets() {
    return (state.tickets || []).filter((ticket) => !ticket.ledgerOnly);
  }

  function memberNameOf(ticket) {
    return String(ticket && ticket.helper && ticket.helper.forWhom || "").trim();
  }

  function memberShort(name) {
    const known = { 母亲: "妈", 妈妈: "妈", 父亲: "爸", 爸爸: "爸", 伴侣: "伴", 老公: "伴", 老婆: "伴", 子女: "子", 女儿: "女", 儿子: "子", 全家: "全", 我: "我" };
    return known[name] || String(name || "家").slice(0, 1);
  }

  function memberKeyOf(ticket) {
    const name = memberNameOf(ticket);
    return name ? `member:${name}` : "self";
  }

  function financeMemberName(c) {
    return String(c && c.member || "").trim();
  }

  function financeMemberText(c) {
    const name = financeMemberName(c);
    return name ? `帮 ${name} 办` : "我";
  }

  function financeFiltered(list = state.finance || []) {
    const key = state.familyFilter || "all";
    if (key === "all") return list;
    if (key === "self") return list.filter((c) => !financeMemberName(c));
    const name = String(key).replace(/^member:/, "");
    return list.filter((c) => financeMemberName(c) === name);
  }

  function financeMemberNames() {
    const names = [];
    const add = (name) => {
      const value = String(name || "").trim();
      if (value && value !== "我" && value !== "全家" && !names.includes(value)) names.push(value);
    };
    (state.finance || []).forEach((c) => add(financeMemberName(c)));
    try { familySummary(caseTickets()).forEach((member) => add(member.label)); } catch {}
    return names.slice(0, 6);
  }

  function financeMemberField(current) {
    const value = String(current || "").trim();
    const names = financeMemberNames();
    if (value && !names.includes(value)) names.unshift(value);
    const options = ["我", "母亲", "父亲", "伴侣"].concat(names.filter((name) => !["母亲", "父亲", "伴侣"].includes(name)));
    const selected = value || "我";
    return `<div class="finance-member-field">
      <span class="field-label">帮谁办</span>
      <div class="member-pills" role="radiogroup" aria-label="帮谁办">
        ${options.map((name) => `<label class="member-pill"><input type="radio" name="financeMember" value="${escapeHtml(name)}" ${name === selected ? "checked" : ""} /><span>${escapeHtml(name)}</span></label>`).join("")}
        <label class="member-pill"><input type="radio" name="financeMember" value="__custom" ${options.includes(selected) ? "" : "checked"} /><span>自定义</span></label>
      </div>
      <input class="member-custom" id="f-memberCustom" type="text" maxlength="10" placeholder="最多 10 字" value="${escapeHtml(options.includes(selected) ? "" : selected)}" ${options.includes(selected) ? "hidden" : ""} />
      <p class="finance-form-note">只存本机，不是共享账户</p>
    </div>`;
  }

  function financeMemberValue() {
    const picked = document.querySelector('input[name="financeMember"]:checked');
    if (!picked) return "";
    if (picked.value !== "__custom") return picked.value === "我" ? "" : picked.value;
    const custom = String($("#f-memberCustom")?.value || "").trim().slice(0, 10);
    return custom === "我" ? "" : custom;
  }

  function bindFinanceMemberField() {
    const custom = $("#f-memberCustom");
    if (!custom) return;
    $$('input[name="financeMember"]').forEach((input) => input.addEventListener("change", () => {
      const isCustom = input.value === "__custom";
      custom.hidden = !isCustom;
      if (isCustom) custom.focus();
    }));
  }

  function deadlineOf(ticket) {
    const win = PG.priority(ticket);
    if (win) {
      const end = new Date(String(win.end || "").replace(/\./g, "-"));
      return { win, end: Number.isNaN(end.getTime()) ? null : end };
    }
    const windows = (ticket.windows || []).filter((w) => w.applicability === "applicable" && w.daysLeft !== null && w.daysLeft >= 0 && w.status !== "closed");
    const fallback = windows.sort((a, b) => a.daysLeft - b.daysLeft)[0] || null;
    if (!fallback) return { win: null, end: null };
    const end = new Date(String(fallback.end || "").replace(/\./g, "-"));
    return { win: fallback, end: Number.isNaN(end.getTime()) ? null : end };
  }

  function expectedAmountOf(ticket) {
    const win = PG.priority(ticket);
    return Number(win && win.amount) || Number(ticket.amount) || 0;
  }

  function confirmedAmountOf(ticket) {
    return (ticket.actions || [])
      .filter((action) => action.confirmed !== false && ["refunded", "promise"].includes(action.status))
      .reduce((sum, action) => sum + (Number(action.amount) || 0), 0);
  }

  function memberRecord(key, label, tickets) {
    const open = tickets.flatMap((ticket) => (ticket.windows || [])
      .filter((w) => w.applicability === "applicable" && w.status !== "closed" && w.daysLeft !== null && w.daysLeft >= 0)
      .map((w) => ({ ticket, win: w })))
      .sort((a, b) => a.win.daysLeft - b.win.daysLeft);
    const urgentTickets = new Set(open.filter((row) => row.win.daysLeft <= 7).map((row) => row.ticket.id));
    const next = open[0] || null;
    return {
      key,
      label,
      short: label === "全家" ? "全" : label === "我" ? "我" : memberShort(label),
      tickets,
      count: tickets.length,
      openCount: new Set(open.map((row) => `${row.ticket.id}:${row.win.type}`)).size,
      urgent: urgentTickets.size,
      next,
      amount: tickets.reduce((sum, ticket) => sum + expectedAmountOf(ticket), 0),
      recovered: tickets.reduce((sum, ticket) => sum + confirmedAmountOf(ticket), 0),
      missing: tickets.reduce((sum, ticket) => sum + ((ticket.missing || []).length), 0)
    };
  }

  function familySummary(tickets) {
    const all = memberRecord("all", "全家", tickets);
    const selfTickets = tickets.filter((ticket) => !memberNameOf(ticket));
    const byMember = new Map();
    for (const ticket of tickets) {
      const name = memberNameOf(ticket);
      if (!name) continue;
      const key = `member:${name}`;
      if (!byMember.has(key)) byMember.set(key, []);
      byMember.get(key).push(ticket);
    }
    const members = Array.from(byMember.entries())
      .map(([key, rows]) => memberRecord(key, key.slice(7), rows))
      .sort((a, b) => {
        const av = a.next ? a.next.win.daysLeft : 9999;
        const bv = b.next ? b.next.win.daysLeft : 9999;
        return av - bv || a.label.localeCompare(b.label, "zh-CN");
      });
    const result = [all];
    if (selfTickets.length) result.push(memberRecord("self", "我", selfTickets));
    return result.concat(members);
  }

  function familyTickets(tickets, key) {
    if (key === "all") return tickets;
    if (key === "self") return tickets.filter((ticket) => !memberNameOf(ticket));
    const name = String(key || "").replace(/^member:/, "");
    return tickets.filter((ticket) => memberNameOf(ticket) === name);
  }

  const FINANCE_TYPES = {
    payment: {
      label: "支付 / 退款争议",
      short: "支付争议",
      desc: "付了没收到、重复扣款、退款没到账、金额不符",
      icon: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16v12H4V7Z"/><path d="M8 7V5h8v2"/><path d="M7 12h4M7 16h7"/></svg>`,
      deadlineLabel: "平台 / 商家承诺的处理截止日（没有就留空）",
      evidence: [
        { key: "order", label: "订单 / 服务页面", hint: "商品、金额、订单号、承诺" },
        { key: "pay", label: "支付流水", hint: "支付宝 / 微信 / 银行扣款记录" },
        { key: "chat", label: "聊天记录", hint: "商家承认退款或承诺处理" },
        { key: "refund", label: "退款申请 / 拒绝记录", hint: "申请时间、拒绝理由" },
        { key: "delivery", label: "物流 / 未履约证明", hint: "未发货、未送达、服务未发生" }
      ],
      rules: [
        { title: "先找谁", body: "先找收款方或平台订单，再找支付渠道；只有涉及银行卡时才进入发卡行争议。" },
        { title: "什么叫退款", body: "提交、受理、退款中都不等于到账；必须以银行或平台流水确认。" },
        { title: "边界", body: "票根整理事实与路径，不判断谁一定赢，也不代提交或代收款。" }
      ],
      routes: [
        { label: "支付宝", path: ["首页 → 账单", "找到这笔交易", "对此订单有疑问 / 投诉", "上传订单与沟通记录"], url: "https://www.alipay.com/", source: "支付宝 App" },
        { label: "微信支付", path: ["我 → 服务", "钱包 → 账单", "找到这笔 → 对此订单有疑问", "提交凭证"], url: "https://pay.weixin.qq.com/", source: "微信支付" },
        { label: "12315", path: ["选择投诉", "填写商家与订单", "上传证据", "保留受理编号"], url: "https://www.12315.cn/", source: "全国 12315 平台" },
        { label: "发卡行", path: ["银行 App → 交易明细", "选择争议 / 未授权交易", "按银行要求补材料"], url: "", source: "以发卡行规则为准" }
      ]
    },
    chargeback: {
      label: "银行卡 / 信用卡争议",
      short: "银行卡争议",
      desc: "盗刷、未授权、未收到货、重复扣款、退款没到",
      icon: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></svg>`,
      deadlineLabel: "银行 / 卡组织告知的补件或回复截止日（没有就留空）",
      evidence: [
        { key: "statement", label: "信用卡 / 银行卡账单", hint: "交易时间、商户、金额、卡尾号" },
        { key: "notice", label: "银行通知 / 争议编号", hint: "短信、App 消息、受理单" },
        { key: "loss", label: "挂失 / 冻结记录", hint: "挂失时间、银行受理编号" },
        { key: "noauth", label: "非本人交易证明", hint: "设备、位置、在岗、行程等" },
        { key: "police", label: "报警 / 反诈回执", hint: "未授权或诈骗时优先保留" },
        { key: "merchant", label: "商户沟通 / 订单", hint: "未收到货或服务未发生" }
      ],
      rules: [
        { title: "先止损", body: "发现未授权交易，先冻结/挂失卡片，修改密码，再联系发卡行；不要继续向对方转账。" },
        { title: "时限不猜", body: "银行卡拒付没有我们可公开确认的统一固定天数；只按发卡行或卡组织给你的截止日倒计时。" },
        { title: "隐私", body: "只填卡尾号，不填完整卡号、CVV、短信验证码、网银密码。" },
        { title: "持卡人过错", body: "法释〔2021〕10号第7条：持卡人对密码、验证码等保管有过错，或未及时挂失导致损失扩大的，可能承担相应责任；先挂失，再如实说明。" },
        { title: "别混同", body: "未收到货、货不对板是合同争议，走商户/平台/12315；不要包装成盗刷。" }
      ],
      routes: [
        { label: "发卡行", path: ["银行 App → 卡片管理", "交易明细 → 争议交易 / 未授权交易", "提交争议说明与证据", "记录争议编号"], url: "", source: "以发卡行规则为准" },
        { label: "银联", path: ["先由发卡行受理", "按银行要求补卡组织材料", "不要绕过发卡行直接找商户闹"], url: "https://www.unionpay.com/", source: "银联卡争议以发卡行受理为准" },
        { label: "报警 / 反诈", path: ["立即冻结卡片", "110 报警或联系 96110", "保存报警回执", "把回执交给银行"], url: "", source: "紧急止付优先" },
        { label: "12378", path: ["先走银行内部投诉", "保留工单与回复", "协商无果再向金融监管部门投诉"], url: "https://www.nfra.gov.cn/", source: "银行保险消费者投诉热线 12378" }
      ]
    },
    renewal: {
      label: "自动续费 / 代扣",
      short: "续费代扣",
      desc: "会员悄悄续费、免密代扣、忘记取消、未使用仍扣款",
      icon: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 1-2.34-5.66"/><path d="M20 4v7h-7"/><path d="M12 8v5l3 2"/></svg>`,
      deadlineLabel: "商家承诺的退款 / 回复截止日（没有就留空）",
      evidence: [
        { key: "agreement", label: "开通 / 授权页面", hint: "服务内容、周期、金额、取消方式" },
        { key: "notice", label: "扣费前提醒", hint: "应含扣款时间、金额、取消途径（2026-04-10 起）" },
        { key: "charges", label: "连续扣款记录", hint: "至少两期流水" },
        { key: "unused", label: "未使用证明", hint: "未登录、未预约、未核销" },
        { key: "cancel", label: "取消结果", hint: "取消成功页或失败原因" }
      ],
      rules: [
        { title: "每次扣款都要提醒", body: "《互联网平台价格行为规则》自 2026-04-10 起：自动续期、自动扣款每次扣款前，应显著提醒扣款时间、金额、取消途径，允许随时取消；收费标准变化应一并通知。" },
        { title: "显著提示", body: "《消费者权益保护法实施条例》第十条第二款：自动展期、自动续费，应在接受服务前和续费日期前，以显著方式提请消费者注意。" },
        { title: "别写五日", body: "《网络交易监督管理办法》第十八条在 2025-05-01 修订后已删除“五日前”。新规没有恢复“五日前”，而是要求每次扣款前提醒；别把两者混成一条。" },
        { title: "先关再谈", body: "先取消代扣，避免下一期继续扣；取消续费本身不等于商家会自动退款。" },
        { title: "证据", body: "重点不是“我忘了”，而是有没有显著提醒、有没有实际使用、商家是否拒绝提供授权与提醒记录。" }
      ],
      routes: [
        { label: "支付宝", path: ["我的 → 设置", "支付设置 → 免密支付 / 自动扣款", "找到服务 → 关闭"], url: "https://www.alipay.com/", source: "支付宝 App" },
        { label: "微信支付", path: ["我 → 服务", "钱包 → 支付设置", "自动续费 → 找到服务 → 关闭"], url: "https://pay.weixin.qq.com/", source: "微信支付" },
        { label: "商家客服", path: ["要求核对开通记录", "要求提供扣费前提醒记录", "提出退还未使用期间费用"], url: "", source: "先礼后兵，保留聊天" },
        { label: "12315", path: ["商家拒绝处理时提交投诉", "附授权页、流水、提醒缺失证据"], url: "https://www.12315.cn/", source: "全国 12315 平台" }
      ]
    },
    prepaid: {
      label: "预付卡 / 储值卡",
      short: "预付卡",
      desc: "健身、美容、教培、洗车、餐饮储值，余额退不回",
      icon: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h5M7 13h3M15 15h3"/></svg>`,
      deadlineLabel: "合同 / 商家承诺的退款截止日（没有就留空）",
      evidence: [
        { key: "contract", label: "合同 / 会员卡", hint: "金额、次数、有效期、退款条款" },
        { key: "pay", label: "付款记录", hint: "转账、刷卡、平台支付" },
        { key: "balance", label: "余额 / 剩余次数", hint: "App 截图、门店确认" },
        { key: "merchant", label: "迁店 / 停业 / 转店通知", hint: "公告、聊天、现场照片" },
        { key: "service", label: "服务不符 / 无法预约", hint: "预约失败、拒绝服务记录" }
      ],
      rules: [
        { title: "七日退款", body: "最高法预付式消费司法解释第十四条：消费者自付款之日起七日内，原则上可请求返还预付款本金；已获得过相同商品或服务的除外。" },
        { title: "可以解除", body: "司法解释第十三条列出迁店造成明显不便、未经同意转给第三人、计时卡无法正常服务等情形；具体仍看合同和证据。" },
        { title: "不打包票", body: "票根只提示可能适用的规则和证据，不替你判断法院一定支持。" }
      ],
      routes: [
        { label: "商家", path: ["书面提出解除合同", "要求列明余额与扣减项", "保留发送记录"], url: "", source: "先固定合同与余额" },
        { label: "12315", path: ["提交商家主体", "上传合同、付款、余额", "要求调解"], url: "https://www.12315.cn/", source: "市场监管投诉" },
        { label: "法院 / 调解", path: ["保存经营者主体信息", "整理预付、消费、余额证据", "考虑调解或诉讼"], url: "https://bxx.lncourt.gov.cn/article/detail/2025/03/id/8751313.shtml", source: "最高法预付式消费解释（法院发布）" },
        { label: "消协", path: ["向当地消费者组织求助", "提交同一套证据包"], url: "", source: "属地消费者组织" }
      ]
    },
    installment: {
      label: "分期 / 息费核对",
      short: "分期息费",
      desc: "分期手续费、增信费、提前还款、综合融资成本不透明",
      icon: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18V6"/><path d="M4 18h16"/><path d="M7 15l4-5 3 2 4-6"/></svg>`,
      deadlineLabel: "合同 / 机构告知的异议截止日（没有就留空）",
      evidence: [
        { key: "contract", label: "借款 / 分期合同", hint: "本金、期数、利率、费用" },
        { key: "cost", label: "综合融资成本明示表", hint: "利息、分期费、增信费、罚息" },
        { key: "schedule", label: "还款计划", hint: "每期应还与实际到账" },
        { key: "flow", label: "实际现金流", hint: "到账金额、每期扣款" },
        { key: "marketing", label: "营销页面", hint: "有没有突出年化利率" },
        { key: "promise", label: "电话 / 销售承诺", hint: "“免息”“低费率”的原话、录音或截图" }
      ],
      rules: [
        { title: "所有成本算进去", body: "中国人民银行公告〔2021〕第3号：贷款年化利率应以借款人承担的全部贷款成本与实际占用本金的比例折算；复利即 IRR，单利要说明；不只算名义利息。" },
        { title: "2026 新规", body: "《个人贷款业务明示综合融资成本规定》（金规〔2026〕2号）自 2026-08-01 施行，要求以明示表披露正常与违约情形下的综合融资成本。" },
        { title: "只做数学", body: "计算器按你填的现金流估算年化，不评价产品是否适合你，也不替你决定借不借。" },
        { title: "不套 4 倍 LPR", body: "金融机构及其分支机构因发放贷款引发的纠纷，不适用民间借贷 4 倍 LPR；票根只做数学测算，不判合规。" }
      ],
      routes: [
        { label: "机构客服", path: ["要求提供综合融资成本明示表", "核对每期费用与实际到账", "保存合同与页面"], url: "", source: "先向贷款人索取" },
        { label: "12378", path: ["银行 / 消费金融 / 保险机构", "先走机构投诉", "保留工单后再投诉"], url: "https://www.nfra.gov.cn/", source: "金融消费者投诉热线 12378" },
        { label: "12315", path: ["营销平台或助贷平台", "提交营销页面与费用证据"], url: "https://www.12315.cn/", source: "市场监管投诉" }
      ]
    },
    insurance: {
      label: "保险犹豫期 / 退保",
      short: "保险退保",
      desc: "刚买想退、被劝长险、看不清现金价值、犹豫期快过",
      icon: `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.6-2.9 7.5-7 9-4.1-1.5-7-4.4-7-9V6l7-3Z"/><path d="M9 12l2 2 4-5"/></svg>`,
      deadlineLabel: "保单 / 合同写的犹豫期截止日（没有就留空）",
      evidence: [
        { key: "policy", label: "保单 / 投保页", hint: "险种、保费、期间、销售渠道" },
        { key: "receipt", label: "保费支付记录", hint: "金额、日期、收款方" },
        { key: "cooling", label: "犹豫期条款", hint: "合同怎么写、从哪天起算" },
        { key: "sales", label: "销售沟通", hint: "收益承诺、保证续保、催促下单" },
        { key: "notice", label: "回访 / 签收记录", hint: "保单签收、电话回访" },
        { key: "cashvalue", label: "现金价值表", hint: "超过犹豫期退保能退多少" },
        { key: "application", label: "退保申请 / 受理编号", hint: "提交时间、材料、答复" }
      ],
      rules: [
        { title: "15 天的边界", body: "15 天仅长期健康险（《健康保险管理办法》第15条）、银保渠道一年期以上（《商业银行代理保险业务管理办法》第36条）有硬依据；10 天、20 天多为条款约定，其他以合同为准。" },
        { title: "超过犹豫期", body: "《保险法》第47条：投保人解除合同，保险人应自收到通知之日起 30 日内按合同退还现金价值；可能有损失。" },
        { title: "不劝买不劝退", body: "这里只整理材料、时限和联系电话，不做保险产品推荐或收益判断。" }
      ],
      routes: [
        { label: "保险公司", path: ["官方 App / 客服热线", "提出犹豫期解除或退保", "索取受理编号和到账时间"], url: "", source: "以保单载明渠道为准" },
        { label: "12378", path: ["先向保险公司投诉", "保留工单与回复", "协商无果再投诉"], url: "https://www.nfra.gov.cn/", source: "银行保险消费者投诉热线 12378" },
        { label: "销售留痕", path: ["保存销售聊天与录音", "核对风险提示与回访", "不要只口头沟通"], url: "", source: "证据优先" }
      ]
    }
  };

  const FINANCE_STATUS = {
    open: "待办",
    submitted: "已提交",
    accepted: "已受理",
    waiting: "等待补件 / 到账",
    resolved: "已解决",
    rejected: "被拒",
    closed: "已关闭"
  };

  function financeStatusLabel(status) {
    return FINANCE_STATUS[status] || "待办";
  }

  function financeDeadline(c) {
    const d = parseReportDate(c && c.deadline);
    if (!d) return { has: false, days: null, date: null };
    const today = calendarDay(new Date());
    return { has: true, days: Math.round((d - today) / 86400000), date: d };
  }

  function financeEvidenceReady(c) {
    return (c.evidence || []).filter((e) => e.status === "ready").length;
  }

  function financeRecovered(c) {
    return c && c.status === "resolved" ? (Number(c.recoveredAmount) || 0) : 0;
  }

  function financeConclusion(c) {
    const f = c.fields || {};
    if (c.type === "chargeback") {
      return {
        body: "没有统一拒付天数，本页不倒计时；持卡人对密码/验证码保管有过错、未及时挂失的，可能自担相应责任；未收到货不等于盗刷。",
        basis: "法释〔2021〕10号第7条；以发卡行/卡组织告知为准"
      };
    }
    if (c.type === "installment") {
      const x = c.calculation;
      return {
        body: x ? `按你填的现金流估算年化约 ${x.irrAnnual.toFixed(2)}%；只做数学测算，不判合规。` : "还缺本金、期数或月供，无法估算；先补现金流。",
        basis: "中国人民银行公告〔2021〕第3号；金融机构不适用民间借贷 4 倍 LPR"
      };
    }
    if (c.type === "insurance") {
      return {
        body: "15 天仅长期健康险、银保一年期以上有硬依据；10 天、20 天多为条款约定；超过犹豫期按现金价值，机构应在 30 日内处理。",
        basis: "《健康保险管理办法》第15条；《保险法》第47条"
      };
    }
    if (c.type === "renewal") {
      const parts = String(f.noticeParts || "");
      let noticeLine = "先核对扣款前是否提醒时间、金额、取消途径；没做到可作沟通依据，但不等于自动退款。";
      if (parts === "三项都有") noticeLine = "提醒要素齐全，重点转为是否实际使用、合同与退款约定。";
      else if (parts === "没有提醒") noticeLine = "未收到扣款前提醒，可据此与商家/平台沟通并要求核对；不等同于自动退款。";
      else if (parts === "缺取消途径") noticeLine = "提醒缺少取消途径，可作为沟通与投诉依据；仍以合同和实际损失为准。";
      else if (parts === "缺金额或时间") noticeLine = "提醒缺少金额或时间，可作为沟通与投诉依据；仍以合同和实际损失为准。";
      return {
        body: `${noticeLine}关闭续费不等于退款，先关代扣再谈未使用期间费用。`,
        basis: "《互联网平台价格行为规则》（2026-04-10 施行）；《消保法实施条例》第10条"
      };
    }
    if (c.type === "prepaid") {
      return {
        body: "付款 7 日内可主张返还预付款本金，但有“已获得相同商品/服务”等例外；不承诺必退。",
        basis: "法释〔2025〕4号第14条"
      };
    }
    return {
      body: "提交、受理、退款中都不等于到账；以银行或平台流水确认。",
      basis: "平台/银行处理规则；以实际流水为准"
    };
  }

  const AI_SYSTEM_PROMPT = "你是消费维权材料整理助手。只根据给定事实，给出最多 3 条建议，每条不超过 80 个汉字。建议只谈：还缺哪些证据、按什么顺序沟通、话术要避免什么。不得编造金额、日期或期限；不得承诺退款或拒付成功；不得给法律、金融结论。只输出 JSON：{\"suggestions\":[\"...\"]}";

  function aiConfig() {
    const ai = (state.settings && state.settings.ai) || {};
    return {
      enabled: !!ai.enabled,
      endpoint: String(ai.endpoint || "").trim(),
      model: String(ai.model || "").trim(),
      key: String(ai.key || "")
    };
  }

  function saveAiConfig(patch) {
    state.settings.ai = Object.assign({ enabled: false, endpoint: "", model: "", key: "" }, state.settings.ai || {}, patch);
    saveSettings();
    applySettings();
  }

  function aiFactKey(c) {
    return JSON.stringify({
      m: c.merchant || "",
      a: c.amount || "",
      d: c.date || "",
      s: c.status || "",
      e: (c.evidence || []).map((item) => (item.status === "ready" ? 1 : 0)).join("")
    });
  }

  function aiFacts(c, opts) {
    const def = FINANCE_TYPES[c.type] || FINANCE_TYPES.payment;
    const facts = {
      type: def.label,
      merchant: c.merchant || "",
      status: financeStatusLabel(c.status),
      evidence: (c.evidence || []).map((item) => ({ name: item.label, ready: item.status === "ready" })),
      note: String(c.notes || "").slice(0, 300)
    };
    if (opts && opts.amount && c.amount) facts.amount = Number(c.amount) || 0;
    if (opts && opts.date && c.date) facts.date = c.date;
    if (opts && opts.deadline && c.deadline) facts.deadline = c.deadline;
    return facts;
  }

  function parseAiItems(text) {
    const raw = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let list = [];
    try {
      const parsed = JSON.parse(raw);
      list = Array.isArray(parsed) ? parsed : parsed.suggestions;
    } catch {
      list = raw.split(/\r?\n/).map((line) => line.replace(/^[-*\d.、\s]+/, "").trim()).filter(Boolean);
    }
    return (Array.isArray(list) ? list : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((item) => (item.length > 80 ? item.slice(0, 80) : item));
  }

  function aiUnknownNumbers(c, text) {
    const known = new Set();
    [c.amount, c.recoveredAmount, c.calculation && c.calculation.totalRepay].forEach((value) => {
      if (value !== null && value !== undefined && value !== "") known.add(String(Number(value)));
    });
    const allowed = [c.date, c.deadline, c.signedDate, c.firstCharge].filter(Boolean).join(" ");
    const tokens = String(text || "").match(/\d+(?:\.\d+)?\s*(?:个工作日|工作日|天|日|个月|月|年|元|块)?/g) || [];
    return Array.from(new Set(tokens.map((token) => token.replace(/\s+/g, "")).filter((token) => {
      const num = (token.match(/^\d+(?:\.\d+)?/) || [""])[0];
      if (!num || known.has(num) || allowed.includes(num)) return false;
      return token.length > num.length || num.length > 1;
    }))).slice(0, 6);
  }

  function aiSuggestionBlock(c) {
    if (!aiConfig().enabled || state.settings.elder) return "";
    const busy = state.aiBusy === c.id;
    const suggestion = c.aiSuggestion;
    const expired = !!(suggestion && suggestion.factKey && suggestion.factKey !== aiFactKey(c));
    const statusText = busy ? "生成中" : c.aiError ? "生成失败" : expired ? "已过期" : suggestion ? (suggestion.ignored ? "已忽略" : "模型生成") : "可选";
    let inner = "";
    let actions = "";
    if (busy) {
      inner = `<p class="finance-ai-note">正在生成建议…规则结论不受影响。</p>`;
    } else if (c.aiError) {
      inner = `<p class="finance-ai-note">这次没生成建议。规则结论仍然可用。</p>
        <p class="finance-ai-detail">${escapeHtml(c.aiError)}</p>`;
      actions = `<button class="btn ghost" type="button" data-ai-action="preview">重试</button>`;
    } else if (!suggestion) {
      inner = `<p class="finance-ai-note">模型只整理证据和话术，不判断输赢，不改金额、日期、状态。发送前会先给你看内容。</p>`;
      actions = `<button class="btn primary" type="button" data-ai-action="preview">生成建议</button>`;
    } else if (suggestion.ignored && !expired) {
      inner = `<p class="finance-ai-note">建议已忽略。规则结论仍然可用。</p>`;
      actions = `<button class="btn ghost" type="button" data-ai-action="preview">重新生成</button>`;
    } else {
      const items = (suggestion.items || []).map((item, index) => {
        const warn = aiUnknownNumbers(c, item);
        return `<li class="${expired ? "expired" : ""}">
          <p>${escapeHtml(item)}</p>
          ${warn.length ? `<small>建议里出现了你未填写的数字（${escapeHtml(warn.slice(0, 4).join("、"))}），请核对。</small>` : ""}
          ${expired ? "" : `<button class="text-btn" type="button" data-ai-adopt="${index}">采纳到备注</button>`}
        </li>`;
      }).join("");
      inner = `<ol class="finance-ai-list">${items}</ol>
        ${expired ? `<p class="finance-ai-note">事实已变化，建议可能过期；旧建议不自动重算。</p>` : ""}`;
      actions = expired
        ? `<button class="btn ghost" type="button" data-ai-action="preview">重新生成</button>`
        : `<button class="btn ghost" type="button" data-ai-action="ignore">忽略</button>
           <button class="btn ghost" type="button" data-ai-action="why">为什么</button>
           <button class="btn ghost" type="button" data-ai-action="preview">重新生成</button>`;
    }
    return `<section class="finance-block finance-ai">
      <div class="finance-block-head"><h2>AI 建议 <em>仅供参考</em></h2><span>${statusText}</span></div>
      ${inner}
      <div class="finance-ai-actions">${actions}</div>
      <p class="finance-ai-note">模型可能出错；金额、日期、条款以原文为准。AI 不改金额、日期、状态、证据。</p>
    </section>`;
  }

  function bindAiActions(c) {
    $$("#financeCaseBody [data-ai-action]").forEach((button) => button.addEventListener("click", () => {
      const action = button.dataset.aiAction;
      if (action === "preview") openAiPreview(c);
      if (action === "ignore" && c.aiSuggestion) {
        c.aiSuggestion.ignored = true;
        saveFinance();
        renderFinanceCase(c);
        toast("已忽略这次建议");
      }
      if (action === "why") openAiWhySheet(c);
    }));
    $$("#financeCaseBody [data-ai-adopt]").forEach((button) => button.addEventListener("click", () => {
      const item = c.aiSuggestion && (c.aiSuggestion.items || [])[Number(button.dataset.aiAdopt)];
      if (item) openAiAdoptSheet(c, item);
    }));
  }

  function refreshAiBlock(c) {
    const current = document.querySelector("#financeCaseBody .finance-ai");
    if (!current) return;
    const holder = document.createElement("div");
    holder.innerHTML = aiSuggestionBlock(c);
    if (holder.firstElementChild) current.replaceWith(holder.firstElementChild);
    else current.remove();
    bindAiActions(c);
  }

  async function generateAiSuggestion(c, opts) {
    const cfg = aiConfig();
    if (!cfg.endpoint || !cfg.model) { openAiConfigSheet(); return; }
    const facts = aiFacts(c, opts);
    state.aiBusy = c.id;
    c.aiError = "";
    renderFinanceCase(c);
    try {
      const response = await fetch(cfg.endpoint, {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}),
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0.2,
          max_tokens: 400,
          messages: [
            { role: "system", content: AI_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(facts) }
          ]
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      const items = parseAiItems(text);
      if (!items.length) throw new Error("模型没有返回可用建议");
      c.aiSuggestion = { items, at: new Date().toISOString(), factKey: aiFactKey(c) };
      delete c.aiError;
    } catch (err) {
      c.aiError = String((err && err.message) || "网络错误，检查端点、模型或跨域设置").slice(0, 90);
    } finally {
      state.aiBusy = "";
      saveFinance();
      renderFinanceCase(c);
    }
  }

  function openAiPreview(c) {
    const cfg = aiConfig();
    if (!cfg.endpoint || !cfg.model) { openAiConfigSheet(); return; }
    const opts = { amount: false, date: false, deadline: false };
    const render = () => {
      const facts = aiFacts(c, opts);
      $("#sheetTitle").textContent = "本次将发送";
      $("#sheetBody").innerHTML = `
        <p class="sheet-hint">只发送下面这些字段，图片、卡号、订单号、手机号、地址、验证码不会发送。模型输出只作建议。</p>
        <label class="check-item"><input type="checkbox" id="aiSendAmount" ${opts.amount ? "checked" : ""} /><span>发送争议金额 ${money(c.amount)}</span></label>
        <label class="check-item"><input type="checkbox" id="aiSendDate" ${opts.date ? "checked" : ""} /><span>发送交易日期 ${escapeHtml(c.date || "未填")}</span></label>
        ${c.deadline ? `<label class="check-item"><input type="checkbox" id="aiSendDeadline" ${opts.deadline ? "checked" : ""} /><span>发送你填的截止日 ${escapeHtml(c.deadline)}</span></label>` : ""}
        <pre class="finance-script">${escapeHtml(JSON.stringify(facts, null, 2))}</pre>
        <div class="sheet-actions">
          <button class="btn primary" id="aiSend" type="button">发送并生成</button>
          <button class="btn ghost" id="aiCancel" type="button">取消</button>
        </div>`;
      ["Amount", "Date", "Deadline"].forEach((key) => {
        const box = $(`#aiSend${key}`);
        if (!box) return;
        box.addEventListener("change", () => {
          opts[key.toLowerCase()] = box.checked;
          render();
        });
      });
      $("#aiCancel").onclick = closeSheet;
      $("#aiSend").onclick = () => {
        closeSheet();
        generateAiSuggestion(c, Object.assign({}, opts));
      };
    };
    render();
    $("#sheetOverlay").hidden = false;
  }

  function openAiAdoptSheet(c, text) {
    const warn = aiUnknownNumbers(c, text);
    openSheet("采纳到备注", `
      <p class="sheet-hint">只写入备注，不改金额、日期、状态、证据。保存前请自己核对。</p>
      ${warn.length ? `<p class="finance-ai-warn">建议里出现了你未填写的数字（${escapeHtml(warn.slice(0, 4).join("、"))}）。修改后才能保存。</p>` : ""}
      <textarea class="sheet-textarea" id="aiAdoptText" rows="5">${escapeHtml(text)}</textarea>
      <div class="sheet-actions">
        <button class="btn primary" id="aiAdoptSave" type="button" ${warn.length ? "disabled" : ""}>保存到备注</button>
        <button class="btn ghost" id="aiAdoptCancel" type="button">取消</button>
      </div>`, () => {
      const area = $("#aiAdoptText");
      if (warn.length) area.addEventListener("input", () => { $("#aiAdoptSave").disabled = false; });
      $("#aiAdoptCancel").onclick = closeSheet;
      $("#aiAdoptSave").onclick = () => {
        const value = area.value.trim();
        if (!value) { toast("备注不能为空"); return; }
        c.notes = [String(c.notes || "").trim(), value].filter(Boolean).join("\n\n");
        c.updatedAt = new Date().toISOString();
        delete c.aiSuggestion;
        delete c.aiError;
        saveFinance();
        closeSheet();
        renderFinanceCase(c);
        toast("已写入备注");
      };
    });
  }

  function openAiWhySheet(c) {
    const facts = aiFacts(c, { amount: false, date: false, deadline: false });
    openSheet("为什么这样建议", `
      <p class="sheet-hint">模型只看到这些字段：类型、商家、状态、证据名称与是否已备、备注前 300 字。金额、日期默认不发送。</p>
      <pre class="finance-script">${escapeHtml(JSON.stringify(facts, null, 2))}</pre>
      <p class="annual-note">建议不改金额、日期、状态、证据；数字对不上时会要求你先改。模型可能出错，规则结论永远以确定性代码为准。</p>
      <div class="sheet-actions"><button class="btn ghost" id="aiWhyClose" type="button">关闭</button></div>`, () => {
      $("#aiWhyClose").onclick = closeSheet;
    });
  }

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function show(name) {
    const navName = name === "financeCase" ? "finance" : name;
    $$(".screen").forEach((screen) => screen.classList.toggle("on", screen.dataset.screen === name));
    $$(".tabbar-item").forEach((item) => item.classList.toggle("on", item.dataset.nav === navName));
    const main = $("#main");
    if (typeof main.scrollTo === "function") main.scrollTo({ top: 0, left: 0, behavior: "instant" });
    else main.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (name === "today") renderToday();
    if (name === "audit") renderAudit();
    if (name === "import") { renderImport(); warmOcr(); }
    if (name === "triage") renderTriage();
    if (name === "settings") renderSettings();
    if (name === "case" && state.current) renderCase(state.current);
    if (name === "cases") renderCases();
    if (name === "assets") renderAssets();
    if (name === "finance") renderFinance();
    if (name === "financeCase" && state.currentFinance) renderFinanceCase(state.currentFinance);
  }

  function openSheet(title, body, onMount) {
    $("#sheetTitle").textContent = title;
    $("#sheetBody").innerHTML = body;
    $("#sheetOverlay").hidden = false;
    $("#toast").classList.remove("show");
    $$(".file-row input[type=file]").forEach((input) => {
      input.addEventListener("change", () => {
        const label = input.closest(".file-row");
        const button = label && label.querySelector("b");
        if (button) button.textContent = input.files && input.files[0] ? input.files[0].name.slice(0, 18) : "选择图片";
      });
    });
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

  function fileRow(label, id, accept = "image/*") {
    return `<label class="file-row"><span>${escapeHtml(label)}</span><input id="${escapeHtml(id)}" type="file" accept="${escapeHtml(accept)}" /><b>选择图片</b></label>`;
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
        ${(ticket.merchantCandidates || []).length ? `<div class="candidate-row">${ticket.merchantCandidates.map((x) => `<button class="candidate" type="button" data-cand="merchant" data-value="${escapeHtml(x)}">${escapeHtml(x)}</button>`).join("")}</div>` : ""}
        ${field("金额", "amount", ticket.amount, "number", "399.00")}
        ${field("购买日期", "date", ticket.date, "date")}
        ${field("品类", "category", ticket.category, "select", categoryOptions())}
        ${field("渠道", "channel", ticket.channel, "select", channelOptions())}
        ${field("商品", "product", ticket.product, "text", "例如：空气炸锅")}
        ${(ticket.productCandidates || []).length ? `<div class="candidate-row">${ticket.productCandidates.map((x) => `<button class="candidate" type="button" data-cand="product" data-value="${escapeHtml(x)}">${escapeHtml(x)}</button>`).join("")}</div>` : ""}
        ${field("订单号", "orderNo", ticket.orderNo, "text", "可选")}
        ${field("商家承诺（可选）", "promise", ticket.promise, "text", "例如：整机保修 3 年")}
        <div class="sheet-actions">
          <button class="btn primary" id="sheetSave" type="button">保存</button>
          <button class="btn ghost" id="sheetCancel" type="button">取消</button>
        </div>
      </form>`;
    openSheet(title, body, () => {
      $$("[data-cand]").forEach((button) => {
        button.addEventListener("click", () => {
          const input = $(`#f-${button.dataset.cand}`);
          if (input) input.value = button.dataset.value || "";
        });
      });
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
        next.ocrError = null;
        next.needsConfirm = !next.merchant || !next.amount || !next.date;
        next.windows = PG.buildWindows(next).map((w) => ({ ...w, id: uid() }));
        onSave(next);
        closeSheet();
      });
      $("#sheetCancel").addEventListener("click", closeSheet);
    });
  }

  function outcomeSheet(ticket, win, status, onSave) {
    let replyImage = "";
    let proofImage = "";
    let replyText = "";
    let proofText = "";
    const body = `
      <form id="sheetForm">
        ${field("结果", "status", status, "select", [["acknowledged", "已受理 / 待到账"], ["refunded", "已到账 / 已退款"], ["repaired", "已修好 / 已换货"], ["promise", "承诺已兑现"], ["rejected", "被拒了"], ["abandoned", "今天不办了"]])}
        ${field("确认金额（可选）", "amount", "", "number", "例如：120.00")}
        ${field("备注", "note", "", "textarea", "例如：平台客服说 3 天内到账")}
        ${field("商家回复原文（可选，粘贴后点识别）", "merchantReply", "", "textarea", "例如：同意退120元，3天内到账")}
        <button class="btn ghost" id="parseReply" type="button">识别商家回复</button>
        ${fileRow("商家回复截图（可选）", "replyShot")}
        <button class="btn ghost" id="ocrReplyShot" type="button">识别回复截图</button>
        ${fileRow("到账截图（可选）", "proofShot")}
        <button class="btn ghost" id="ocrProofShot" type="button">识别到账截图</button>
        <label class="check-item"><input id="f-confirmed" type="checkbox" /><span>我确认已到账/已完成（有到账截图或账单记录）</span></label>
        <div class="sheet-actions">
          <button class="btn primary" id="outcomeSave" type="button">记录结果</button>
          <button class="btn ghost" id="outcomeCancel" type="button">取消</button>
        </div>
      </form>`;
    openSheet("记录结果", body, () => {
      $("#parseReply").addEventListener("click", () => {
        const parsed = PG.parseMerchantReply($("#f-merchantReply").value);
        if (!parsed) { toast("先粘贴一段商家回复"); return; }
        if (parsed.amount !== null) $("#f-amount").value = parsed.amount;
        if (parsed.intent === "reject") $("#f-status").value = "rejected";
        else if (parsed.intent === "agree_refund") $("#f-status").value = "acknowledged";
        else $("#f-status").value = "acknowledged";
        const bits = [parsed.nextAction, parsed.deadline ? `商家给的时间：${parsed.deadline}` : "", parsed.confidence ? `识别置信：${parsed.confidence}` : ""].filter(Boolean);
        $("#f-note").value = bits.join("；");
        toast("已识别，请核对金额和时间");
      });
      $("#ocrReplyShot").addEventListener("click", async () => {
        const file = $("#replyShot").files && $("#replyShot").files[0];
        if (!file) { toast("先选一张商家回复截图"); return; }
        try {
          const extracted = await ocrQuick(file);
          replyText = extracted.text || "";
          const parsed = PG.parseMerchantReply(replyText);
          if (parsed && parsed.amount !== null) $("#f-amount").value = parsed.amount;
          if (parsed && parsed.intent === "reject") $("#f-status").value = "rejected";
          else if (parsed) $("#f-status").value = "acknowledged";
          if (parsed) $("#f-note").value = [parsed.nextAction, parsed.deadline ? `商家给的时间：${parsed.deadline}` : ""].filter(Boolean).join("；");
          $("#f-merchantReply").value = replyText.slice(0, 500);
          replyImage = await new Promise((resolve) => {
            shrinkImage(file, 900, 0.6).then((blob) => {
              const fr = new FileReader();
              fr.onload = () => resolve(String(fr.result || ""));
              fr.readAsDataURL(blob);
            }).catch(() => resolve(""));
          });
          toast(parsed ? "回复已识别，请核对" : "没认出回复，可手动粘贴");
        } catch (e) {
          toast("回复截图识别失败");
        }
      });
      $("#ocrProofShot").addEventListener("click", async () => {
        const file = $("#proofShot").files && $("#proofShot").files[0];
        if (!file) { toast("先选一张到账截图"); return; }
        try {
          const extracted = await ocrQuick(file);
          proofText = extracted.text || "";
          const amount = parseAmount(proofText);
          const date = parseDate(proofText);
          if (amount) $("#f-amount").value = amount;
          if (date) $("#f-note").value = [String($("#f-note").value || ""), `到账日期：${date}`].filter(Boolean).join("；");
          proofImage = await new Promise((resolve) => {
            shrinkImage(file, 900, 0.6).then((blob) => {
              const fr = new FileReader();
              fr.onload = () => resolve(String(fr.result || ""));
              fr.readAsDataURL(blob);
            }).catch(() => resolve(""));
          });
          toast(amount ? `识别到账 ¥${amount.toFixed(2)}，请确认` : "没认出金额，请手动填");
        } catch (e) {
          toast("到账截图识别失败");
        }
      });
      $("#outcomeSave").addEventListener("click", () => {
        const data = Object.fromEntries(new FormData($("#sheetForm")).entries());
        const confirmed = !!$("#f-confirmed").checked;
        let nextStatus = data.status;
        if (["refunded", "repaired", "promise"].includes(nextStatus) && !confirmed) nextStatus = "acknowledged";
        onSave({
          status: nextStatus,
          amount: data.amount ? Number(data.amount) : null,
          note: String(data.note || "").trim(),
          merchantReply: String(data.merchantReply || "").trim(),
          confirmed,
          replyImage,
          proofImage,
          replyText,
          proofText
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
    if (Number(match[2]) < 1 || Number(match[2]) > 12) return "";
    if (Number(match[3]) < 1 || Number(match[3]) > 31) return "";
    const y = match[1];
    const m = String(match[2]).padStart(2, "0");
    const d = String(match[3]).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseAmount(text) {
    const value = String(text || "");
    const lines = value.split(/\n/).filter((line) => /(实付款|实付|合计|到手|应付|总计)/.test(line));
    for (const line of lines) {
      const tail = line.split(/合计|到手|应付|实付款|实付|总计/).pop() || "";
      const nums = tail.match(/[0-9]+(?:[.,][0-9]{1,2})?/g) || [];
      if (!nums.length) continue;
      const preferred = /共减|优惠/.test(line) && !/合计|到手/.test(line) ? nums[nums.length - 1] : nums[0];
      for (const raw of [preferred].concat(nums)) {
        const n = Number(String(raw).replace(/,/g, ""));
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
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
    const bad = /已签收|收货|地址|电话|订单|退款|售后|客服|申请|驿站|查看物流|再次购买|使用帮助|卖了换钱/;
    const strip = (value) => value
      .replace(/^(淘宝|天猫|京东|拼多多|抖音|饿了么|闪购|拍拍二手)\s*/i, "")
      .replace(/\s*[>›].*$/, "")
      .replace(/^(商家|商户|销售方)[:：\s]*/, "")
      .trim();
    const shop = lines.find((line) => {
      const t = line.trim();
      return t.length >= 2 && t.length <= 40 && !bad.test(t) && /旗舰店|专营店|专卖店|卖场|商城|商行|门店|超市|百货/.test(t);
    });
    if (shop) return strip(shop);
    const platform = lines.find((line) => {
      const t = line.trim();
      return t.length >= 4 && t.length <= 40 && !bad.test(t) && /^(淘宝|天猫|京东|拼多多|抖音|饿了么|闪购|拍拍二手)\s+/i.test(t);
    });
    if (platform) return strip(platform);
    const keywords = ["公司", "店", "商城", "卖场", "超市", "家具", "家电", "建材", "装饰", "装修", "商行", "门店", "品牌"];
    for (const line of lines) {
      const t = line.trim();
      if (t.length < 2 || t.length > 30 || bad.test(t)) continue;
      if (keywords.some((k) => t.includes(k))) return strip(t);
    }
    return lines.find((line) => line.trim().length >= 2 && line.trim().length <= 24 && !bad.test(line))?.trim() || "";
  }

  function parseProduct(lines) {
    const bad = /旗舰店|专营店|已签收|收货|地址|实付款|合计|订单|退款|售后|客服|优惠|已售|好评|数量|规格|颜色|尺码|申请售后|加入购物车|使用帮助|^\d{1,2}:\d{2}|[0-9]{2}%|5G|4G|WiFi/;
    const productWords = /耳机|手机|显示器|空调|冰箱|洗衣机|空气炸锅|麦片|手串|内裤|袜子|拉面|会员|调机器|优化|手表|Watch|KTC|OPPO|UZIS|西麦|cs2|游戏|竞速|点卡|兑换码|鞋|包|书|桌|床|沙发/;
    for (const line of lines) {
      const t = line.trim();
      if (t.length >= 3 && t.length <= 80 && !bad.test(t) && productWords.test(t)) {
        return t.replace(/^(商品|品名|型号|规格|项目)[:：\s]*/, "").slice(0, 60);
      }
    }
    for (const line of lines) {
      const t = line.trim();
      if (/商品|品名|型号|规格|项目/.test(t) && !bad.test(t)) {
        return t.replace(/^(商品|品名|型号|规格|项目)[:：\s]*/, "").slice(0, 40);
      }
    }
    return "";
  }

  function candidateList(lines, mode) {
    const bad = /已签收|收货|地址|电话|订单|退款|售后|客服|申请|驿站|查看物流|再次购买|实付款|合计|优惠|已售|好评|^\d{1,2}:\d{2}|[0-9]{2}%|5G|4G|WiFi/;
    const merchantWords = /旗舰店|专营店|专卖店|卖场|商城|商行|门店|超市|百货/;
    const productWords = /耳机|手机|显示器|空调|冰箱|洗衣机|空气炸锅|麦片|手串|内裤|袜子|拉面|会员|调机器|优化|手表|Watch|KTC|OPPO|UZIS|西麦|cs2|游戏|竞速|点卡|兑换码|鞋|包|书|桌|床|沙发/;
    const seen = new Set();
    const out = [];
    for (const line of lines) {
      const t = line.trim().replace(/[>›]\s*$/, "");
      if (t.length < 2 || t.length > 60 || bad.test(t) || seen.has(t)) continue;
      if (mode === "merchant" ? merchantWords.test(t) : productWords.test(t)) {
        seen.add(t);
        out.push(t);
      }
      if (out.length >= 4) break;
    }
    return out;
  }

  function parseOrderNo(text) {
    const m = String(text || "").match(/(?:订单号|订单编号|交易号|发票号码)[:：\s]*([A-Za-z0-9-]{6,})/);
    return m ? m[1] : "";
  }

  function parsePromise(lines) {
    for (const line of lines) {
      const t = line.trim();
      if (/退款\/售后|卖了换钱|使用帮助|申请售后|售后服务|退款说明|查看更多|退货宝|支持7天无理由|7天价保|价格保护/.test(t)) continue;
      if (/承诺|保修|延保|终身|免费安装|赠品|包退|包换|退差|假一赔十/.test(t) && t.length <= 80) return t;
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

  function parseReceipt(text, fileName = "", ocrConfidence = 100, overrides = {}) {
    const clean = normalizeText(text);
    const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
    const amount = Number.isFinite(overrides.amount) && overrides.amount > 0 ? overrides.amount : parseAmount(clean);
    const date = overrides.date || parseDate(clean);
    const merchant = parseMerchant(lines);
    const product = parseProduct(lines);
    const orderNo = parseOrderNo(clean);
    const promise = parsePromise(lines);
    const category = PG.categoryOf(clean);
    let channel = PG.channelOf(clean);
    if (channel === "other" && /京东自营|京东白条|PLUS/.test(clean)) channel = "jd";
    if (channel === "other" && /菜鸟驿站|退货宝|交易成功/.test(clean)) channel = "taobao";
    if (channel === "other" && /蜂鸟|饿了么/.test(clean)) channel = "eleme";
    if (channel === "other" && /^TB/i.test(orderNo)) channel = "taobao";
    if (channel === "other" && /^JD/i.test(orderNo)) channel = "jd";
    const noReasonUnsupported = /不支持(7|七)天无理由|不支持无理由|不适用(7|七)天无理由/.test(clean);
    const noReasonSupported = !noReasonUnsupported && /支持(7|七)天无理由|(7|七)天无理由退货|七天无理由/.test(clean);
    const priceDay = clean.match(/(\d+)\s*天价保/);
    const priceMarked = /价保|价格保护/.test(clean) && !/不支持价保|不参与价保/.test(clean);
    const merchantCandidates = candidateList(lines, "merchant");
    const productCandidates = candidateList(lines, "product");
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
      merchantCandidates,
      productCandidates,
      orderNo,
      promise,
      noReason: noReasonSupported ? true : noReasonUnsupported ? false : null,
      noReasonException: noReasonUnsupported,
      priceProtection: priceMarked ? {
        hasMark: "yes",
        days: priceDay ? Number(priceDay[1]) : null,
        deadline: "",
        note: "订单页写明有价保；截止日需要用户确认"
      } : {},
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

  async function preprocessImage(blob) {
    try {
      const bmp = await createImageBitmap(blob);
      const scale = Math.min(3, 3000 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(bmp.width * Math.max(1, scale));
      cv.height = Math.round(bmp.height * Math.max(1, scale));
      const g = cv.getContext("2d");
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(bmp, 0, 0, cv.width, cv.height);
      const img = g.getImageData(0, 0, cv.width, cv.height);
      const d = img.data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      }
      const average = sum / Math.max(1, d.length / 4);
      const invert = average < 110;
      for (let i = 0; i < d.length; i += 4) {
        let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (invert) v = 255 - v;
        const c = Math.max(0, Math.min(255, (v - 128) * 1.6 + 128));
        d[i] = d[i + 1] = d[i + 2] = c;
      }      g.putImageData(img, 0, 0);
      return await new Promise((res) => cv.toBlob((b) => res(b || blob), "image/png"));
    } catch (e) {
      return blob;
    }
  }

  async function ocrPrecise(blob) {
    setParse(8, "加载精确模型…", [{ text: "加载精确模型", done: false }]);
    const result = await window.Tesseract.recognize(blob, "chi_sim_hq", {
      workerPath: "vendor/worker.min.js",
      corePath: "vendor",
      langPath: "vendor/lang",
      logger: (m) => {
        if (m.status === "recognizing text") {
          setParse(20 + Math.round((m.progress || 0) * 70), `精确识别 ${Math.round((m.progress || 0) * 100)}%`, [
            { text: "加载精确模型", done: true },
            { text: "重新识别", done: false }
          ]);
        }
      }
    });
    return result.data.text || "";
  }

  async function ocrBlob(blob) {
    if (!window.Tesseract) throw new Error("OCR 组件未加载");
    setParse(12, "加载中文识别…", [{ text: "加载中文识别", done: false }]);
    const input = await preprocessImage(blob);
    const result = await window.Tesseract.recognize(input, "chi_sim", {
      workerPath: "vendor/worker.min.js",
      corePath: "vendor",
      langPath: "vendor/lang-fast-v4",
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
    return {
      text: result.data.text || "",
      confidence: Math.round(result.data.confidence || 60),
      lines: result.data.lines || [],
      input
    };
  }

  async function ocrQuick(blob) {
    const input = await preprocessImage(blob);
    const result = await window.Tesseract.recognize(input, "chi_sim", {
      workerPath: "vendor/worker.min.js",
      corePath: "vendor",
      langPath: "vendor/lang-fast-v4",
      tessedit_pageseg_mode: "6"
    });
    return { text: result.data.text || "", confidence: Math.round(result.data.confidence || 60), lines: result.data.lines || [], input };
  }

  function parsePriceText(text) {
    const value = String(text || "");
    const lines = value.split(/\n/).filter((line) => /(到手|现价|券后|售价|价格)/.test(line));
    for (const line of lines) {
      const amount = parseAmount(line);
      if (amount) return amount;
    }
    return parseAmount(value);
  }

  async function cropLineBlob(input, bbox, rightRatio = 1) {
    const bmp = await createImageBitmap(input);
    const pad = 8;
    const x0 = Math.max(0, Math.floor(bbox.x0 - pad));
    const y0 = Math.max(0, Math.floor(bbox.y0 - pad));
    const x1 = Math.min(bmp.width, Math.ceil(bbox.x1 + pad));
    const y1 = Math.min(bmp.height, Math.ceil(bbox.y1 + pad));
    const startX = rightRatio < 1 ? x0 + Math.floor((x1 - x0) * rightRatio) : x0;
    const cropW = Math.max(1, x1 - startX);
    const cropH = Math.max(1, y1 - y0);
    const scale = Math.max(2, Math.min(4, 1400 / cropW));
    const cv = document.createElement("canvas");
    cv.width = Math.round(cropW * scale);
    cv.height = Math.round(cropH * scale);
    const g = cv.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(bmp, startX, y0, cropW, cropH, 0, 0, cv.width, cv.height);
    return new Promise((resolve) => cv.toBlob((b) => resolve(b), "image/png"));
  }

  async function ocrLine(extracted, bbox, rightRatio, whitelist) {
    const crop = await cropLineBlob(extracted.input, bbox, rightRatio);
    const result = await window.Tesseract.recognize(crop, "chi_sim", {
      workerPath: "vendor/worker.min.js",
      corePath: "vendor",
      langPath: "vendor/lang-fast-v4",
      tessedit_pageseg_mode: "7",
      tessedit_char_whitelist: whitelist || ""
    });
    return result.data.text || "";
  }

  async function refineOrderFields(extracted) {
    if (!extracted || !extracted.input || !Array.isArray(extracted.lines) || !extracted.lines.length) {
      return {};
    }
    const lines = extracted.lines.filter((line) => line && line.bbox && line.text);
    let height = 0;
    try {
      const bmp = await createImageBitmap(extracted.input);
      height = bmp.height;
    } catch (e) {}
    const topAmount = height ? lines.filter((line) => line.bbox.y0 < height * 0.6) : lines;
    const topDate = height ? lines.filter((line) => line.bbox.y0 < height * 0.78) : lines;
    const amountLine =
      topAmount.find((line) => /(合计|到手)/.test(line.text)) ||
      topAmount.find((line) => /(实付款|实付|应付|总计)/.test(line.text));
    let amount = null;
    if (amountLine) {
      try {
        const text = await ocrLine(extracted, amountLine.bbox, 0.30, "0123456789.,¥￥");
        const parsed = parseAmount(text);
        if (parsed && parsed > 0) amount = parsed;
      } catch (e) {}
    }
    const itemLine = topAmount.find((line) =>
      /商品|数量|热销|新品|规格|KTC|OPPO|西麦|cs2|手串|内裤|袜子/.test(line.text) &&
      !/优惠|已售|好评|立减|共减|旗舰店|专营店|卖场/.test(line.text) &&
      /[0-9]+(?:\.[0-9]{1,2})?/.test(line.text)
    );
    let itemPrice = 0;
    if (itemLine) {
      const nums = (itemLine.text.match(/[0-9]+(?:\.[0-9]{1,2})?/g) || [])
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);
      itemPrice = nums.length ? Math.max(...nums) : 0;
      if (itemPrice && (!amount || amount < itemPrice * 0.5)) amount = itemPrice;
    }
    const dateLine =
      topDate.find((line) => /(支付时间|下单时间)/.test(line.text)) ||
      topDate.find((line) => /(签收|送达|订单时间)/.test(line.text));
    let date = "";
    if (dateLine) {
      try {
        const text = await ocrLine(extracted, dateLine.bbox, 0, "0123456789-/.年月日 ");
        const parsed = parseDate(text);
        if (parsed) date = parsed;
      } catch (e) {}
    }
    return { amount, date };
  }

  async function handleFile(file) {
    showParse("正在读这张票", "先看文件，再找出商家、金额、日期和截止日。");
    try {
      if (file.type && file.type.startsWith("image/")) state.lastFile = file;
      const extracted = await Promise.race([
        fileToText(file),
        new Promise((_, reject) => setTimeout(() => reject(new Error("识别包下载太慢，先手动填三项")), 90000))
      ]);
      const text = extracted.text;
      if (!text || text.trim().length < 4) throw new Error("没有读到文字");
      setParse(88, "核对金额和日期…", [{ text: "读取文件", done: true }, { text: "识别文字", done: true }, { text: "核对关键字段", done: false }]);
      const refined = await refineOrderFields(extracted).catch(() => ({}));
      const ticket = parseReceipt(text, file.name, extracted.confidence, refined);
      state.pending = [ticket];
      state.selected = new Set(ticket.needsConfirm ? [] : [ticket.id]);
      state.tab = ticket.needsConfirm ? "pending" : "window";
      setParse(100, "读完了", [{ text: "读取文件", done: true }, { text: "识别文字", done: true }, { text: "整理字段", done: true }]);
      setTimeout(() => show("triage"), 260);
    } catch (error) {
      const text = `识别失败：${error.message || "未知错误"}`;
      const ticket = parseReceipt("", file.name);
      ticket.review = true;
      ticket.ocrError = error.message || "未知错误";
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

  function warmOcr() {
    try { if (localStorage.getItem("pg.langWarm") === "1") return; } catch (e) { return; }
    const files = ["vendor/lang-fast-v4/chi_sim.traineddata.gz"];
    Promise.all(files.map((f) => fetch(f).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)))
      .then((res) => {
        if (res.every(Boolean)) { try { localStorage.setItem("pg.langWarm", "1"); } catch (e) {} }
      });
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
      nums.push({ currency: !!m[1], decimal: /\.\d/.test(m[2]), value: Math.abs(Number(m[2])), negative: String(m[2]).trim().startsWith("-") });
    }
    const cand = nums.filter((n) => n.currency || n.decimal);
    const chosen = cand.length ? cand[cand.length - 1] : null;
    const amount = chosen ? chosen.value : null;
    if (!amount) return null;
    const fields = line.split(/\s*[,\t|]\s*|\s+/).map((s) => s.trim()).filter(Boolean);
    let merchant = "";
    for (const f of fields) {
      if (/^20\d{2}/.test(f)) continue;
      if (/^[¥￥]?-?\d/.test(f)) continue;
      if (/^(支出|收入|不计收支|交易成功|已关闭|退款成功)$/.test(f)) continue;
      if (f.length >= 2) { merchant = f; break; }
    }
    const direction = /收入|退款|退回|入账|转入|收款/.test(line)
      ? "in"
      : /支出|付款|消费|扣款|转出|支付/.test(line)
        ? "out"
        : chosen && chosen.negative
          ? "out"
          : "unknown";
    return { date, amount, merchant: merchant || "未知商家", product: "", channel: PG.channelOf(line), direction };
  }

  function parseBillText(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^(交易时间|时间).*(金额)/.test(line))
      .map(parseBillLine)
      .filter(Boolean);
  }

  function openBillCheckSheet(subs, rows) {
    const monthly = subs.reduce((sum, item) => sum + (Number(item.avg) || 0), 0);
    const body = `
      <p class="sheet-hint">从这段账单里找到 <b>${subs.length}</b> 笔可能自动续费，合计约 <b>${money(monthly)}/月</b>。只是提示，是否在扣以账单和 App 为准。</p>
      ${subs.map((s) => {
        const path = PG.portalFor({ type: "subscription" }, { channel: s.channel });
        return `<div class="rule-row">
          <b>${escapeHtml(s.merchant)}</b>
          <p>${money(s.avg)}/月 · 连续 ${s.count} 次 · 间隔约 ${s.lastGap} 天</p>
          <small>${escapeHtml(path.label)}：${escapeHtml((path.path || []).join(" → "))}</small>
          <small>${escapeHtml(path.fallback || "")}</small>
        </div>`;
      }).join("")}
      <p class="annual-note">判定：同一商户、金额相近、间隔 25–35 天、至少 2 次。先确认，再关；关完再回来记结果。</p>
      <div class="sheet-actions">
        <button class="btn primary" id="billToTriage" type="button">继续导入这些票据</button>
        <button class="btn ghost" id="billCheckClose" type="button">先看订阅</button>
      </div>
      ${subs.length ? `<button class="btn ghost" id="billToFinance" type="button" style="margin-top:8px">把首笔续费建成资金案卷</button>` : ""}`;
    openSheet("账单体检", body, () => {
      $("#billToTriage").addEventListener("click", () => { closeSheet(); show("triage"); });
      $("#billCheckClose").addEventListener("click", closeSheet);
      if ($("#billToFinance")) $("#billToFinance").addEventListener("click", () => {
        const first = subs[0];
        closeSheet();
        openFinanceBuilder("renewal", {
          merchant: first.merchant,
          amount: first.avg,
          date: first.lastDate ? new Date(first.lastDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          notes: `账单体检发现连续 ${first.count} 次扣款，间隔约 ${first.lastGap} 天。先核对开通授权与扣费前提醒。`
        });
      });
    });
  }

  function openBill() {
    $("#sheetTitle").textContent = "粘贴账单";
    $("#sheetBody").innerHTML = `
      <p class="sheet-hint">从支付宝或微信账单里复制一段时间，直接粘贴进来。一行一单，能认出日期、商家和金额的才会导入。</p>
      ${field("账单来源", "billChannel", "alipay", "select", [["alipay", "支付宝"], ["wechat", "微信"], ["other", "其他 / 不确定"]])}
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
      const chosenChannel = $("#f-billChannel") ? $("#f-billChannel").value : "other";
      rows.forEach((row) => { if (chosenChannel !== "other") row.channel = chosenChannel; });
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
      show("triage");
      const subs = PG.detectSubscriptions(rows);
      if (subs.length) {
        openBillCheckSheet(subs, rows);
        toast(`认出 ${rows.length} 单，${subs.length} 笔可能自动续费`);
      } else {
        closeSheet();
        toast(`认出 ${rows.length} 单，没发现明显的自动续费`);
      }
    });
  }

  function financeSummaryData(list = financeFiltered()) {
    const all = list;
    const active = all.filter((c) => !["resolved", "closed"].includes(c.status));
    const deadlineRows = active
      .map((c) => ({ c, due: financeDeadline(c) }))
      .filter((row) => row.due.has)
      .sort((a, b) => a.due.days - b.due.days);
    const recovered = all.reduce((sum, c) => sum + financeRecovered(c), 0);
    return {
      all,
      active,
      nearest: deadlineRows[0] || null,
      overdue: deadlineRows.filter((row) => row.due.days < 0).length,
      amount: active.reduce((sum, c) => sum + (Number(c.amount) || 0), 0),
      recovered,
      resolved: all.filter((c) => c.status === "resolved").length,
      submitted: active.filter((c) => c.status !== "open").length
    };
  }

  function renderFinanceAlert() {
    const host = $("#financeAlert");
    if (!host) return;
    const summary = financeSummaryData(financeFiltered());
    const scopeName = state.familyFilter === "all" ? "" : state.familyFilter === "self" ? "我" : String(state.familyFilter).replace(/^member:/, "");
    if (!summary.active.length) {
      host.innerHTML = "";
      return;
    }
    const nearest = summary.nearest;
    const dueText = nearest
      ? `${nearest.c.type === "chargeback" ? "银行时限" : "最近时限"} ${nearest.due.days < 0 ? `已过 ${-nearest.due.days} 天` : `还剩 ${nearest.due.days} 天`}`
      : "未填截止日 · 不猜";
    host.innerHTML = `<button class="finance-alert ${summary.overdue ? "late" : ""}" id="financeAlertOpen" type="button">
      <span>${scopeName ? `${escapeHtml(scopeName)} · ${summary.active.length} 宗资金在途` : `资金售后 · ${summary.active.length} 宗在途`}</span>
      <b>${escapeHtml(dueText)}</b>
      <em>${money(summary.amount)}</em>
      <small>看案卷 ›</small>
    </button>`;
    $("#financeAlertOpen").addEventListener("click", () => show("finance"));
  }

  function renderFinance() {
    const body = $("#financeBody");
    if (!body) return;
    const summary = financeSummaryData(financeFiltered());
    const allFinance = state.finance || [];
    const memberCounts = new Map();
    allFinance.forEach((c) => {
      const key = financeMemberName(c) ? `member:${financeMemberName(c)}` : "self";
      memberCounts.set(key, (memberCounts.get(key) || 0) + 1);
    });
    if (state.familyFilter.startsWith("member:") && !memberCounts.has(state.familyFilter)) memberCounts.set(state.familyFilter, 0);
    if (state.familyFilter === "self" && !memberCounts.has("self")) memberCounts.set("self", 0);
    const hasNamedMember = Array.from(memberCounts.keys()).some((key) => key !== "self");
    const scopeName = state.familyFilter === "all" ? "全家" : state.familyFilter === "self" ? "我" : String(state.familyFilter).replace(/^member:/, "");
    const scopePills = [`<button class="finance-scope-pill ${state.familyFilter === "all" ? "on" : ""}" type="button" data-finance-scope="all" role="radio" aria-checked="${state.familyFilter === "all"}">全家 ${allFinance.length}</button>`]
      .concat(Array.from(memberCounts.entries()).map(([key, count]) => {
        const label = key === "self" ? "我" : key.slice(7);
        return `<button class="finance-scope-pill ${state.familyFilter === key ? "on" : ""}" type="button" data-finance-scope="${escapeHtml(key)}" role="radio" aria-checked="${state.familyFilter === key}">${escapeHtml(label)} ${count}</button>`;
      }))
      .concat(`<button class="finance-scope-pill more" type="button" id="financeScopeMore">更多</button>`)
      .join("");
    const scopeHtml = (hasNamedMember || state.familyFilter !== "all")
      ? `<div class="finance-scope" role="radiogroup" aria-label="资金案卷归属筛选">
          <div class="finance-scope-head"><span>家庭视角</span></div>
          <div class="finance-scope-pills">${scopePills}</div>
          <p class="finance-scope-note">当前：${escapeHtml(scopeName)} · ${summary.active.length} 宗在途 · ${money(summary.amount)}</p>
        </div>`
      : "";
    const subscribed = (() => {
      try { return PG.detectSubscriptions(caseTickets()); } catch { return []; }
    })();
    $("#financeSub").textContent = summary.active.length
      ? `还有 ${summary.active.length} 宗在途，争议金额 ${money(summary.amount)}。争议金额是“涉及多少钱”，不是“一定能退回”。`
      : "支付、退款、拒付、续费、预付卡、分期和保险，都能建一宗有证据、有路径、有回执的案卷。";
    const toolButtons = Object.entries(FINANCE_TYPES).map(([key, def]) => `<button class="finance-tool" type="button" data-finance-type="${key}">
      <span class="ft-ico">${def.icon}</span>
      <span class="ft-main"><b>${escapeHtml(def.short)}</b><small>${escapeHtml(def.desc)}</small></span>
      <span class="ft-chev" aria-hidden="true">›</span>
    </button>`).join("");
    const cases = financeFiltered().slice().sort((a, b) => {
      const aa = ["resolved", "closed"].includes(a.status) ? 1 : 0;
      const bb = ["resolved", "closed"].includes(b.status) ? 1 : 0;
      return aa - bb || String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    });
    const caseRows = cases.map((c) => {
      const def = FINANCE_TYPES[c.type] || FINANCE_TYPES.payment;
      const due = financeDeadline(c);
      const ready = financeEvidenceReady(c);
      const dueText = due.has
        ? (due.days < 0 ? `时限已过 ${-due.days} 天` : `还剩 ${due.days} 天`)
        : "未填时限";
      return `<button class="finance-case-row" type="button" data-finance-case="${c.id}">
        <span class="fcr-top"><b>${escapeHtml(c.merchant || "未填写商家")}</b><em>${money(c.amount)}</em></span>
        <span class="fcr-mid"><span class="finance-member">${escapeHtml(financeMemberText(c))}</span> · ${escapeHtml(def.short)} · ${escapeHtml(c.date || "日期待确认")} · ${ready}/${(c.evidence || []).length} 件证据${c.source === "demo" ? " · 示例" : ""}</span>
        <span class="fcr-foot"><i class="finance-state st-${escapeHtml(c.status)}">${escapeHtml(financeStatusLabel(c.status))}</i><small class="${due.has && due.days <= 3 ? "hot" : ""}">${escapeHtml(dueText)}</small></span>
      </button>`;
    }).join("");
    const nearest = summary.nearest;
    body.innerHTML = `
      <section class="finance-hero ${summary.overdue ? "late" : ""}">
        <div class="fh-top"><span>资金售后雷达</span><span>只存本机</span></div>
        <h2>${summary.active.length ? `${summary.active.length} 宗钱的事，还没落地。` : "现在没有在途争议。"}</h2>
        <div class="finance-total ${summary.active.length ? "" : "zero"}">${money(summary.amount)}</div>
        <p>${summary.amount ? "争议金额不是可追回金额；只有填了银行/平台截止日才倒计时。" : "先建一宗，或粘贴一段账单做资金体检。"}</p>
        ${nearest ? `<div class="finance-hero-due"><span>${nearest.c.type === "chargeback" ? "银行/卡组织时限" : "最近一条你填的时限"}</span><b>${nearest.due.days < 0 ? `已过 ${-nearest.due.days} 天` : `还剩 ${nearest.due.days} 天`}</b><small>${escapeHtml(nearest.c.merchant || "")}</small></div>` : ""}
      </section>
      ${scopeHtml}
      <div class="finance-metrics">
        <div><span>待处理</span><b>${summary.active.length}</b></div>
        <div><span>已提交 / 受理</span><b>${summary.submitted}</b></div>
        <div class="${summary.recovered ? "ok" : ""}"><span>确认解决</span><b>${money(summary.recovered)}</b></div>
      </div>
      <button class="finance-bill-card" id="financeBillCheck" type="button">
        <span class="fbc-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg></span>
        <span><b>粘贴一段账单，先做资金体检</b><small>自动找重复扣款、疑似自动续费、陌生商户</small></span>
        <span class="ft-chev" aria-hidden="true">›</span>
      </button>
      ${subscribed.length ? `<p class="finance-nudge">已导入的票据里还有 <b>${subscribed.length}</b> 个疑似自动续费，可以在账单体检里核对扣费前提醒。</p>` : ""}
      <div class="section-head"><h2>建一宗资金案卷</h2><span class="fine" style="margin:0">六类任务</span></div>
      <div class="finance-tools">${toolButtons}</div>
      <div class="section-head"><h2>我的资金案卷</h2><button class="text-btn" id="financeAddInline" type="button">+ 手动新建</button></div>
      <div class="finance-case-list">${caseRows || (state.familyFilter !== "all"
        ? `<div class="finance-empty"><b>${escapeHtml(scopeName)}名下还没有资金案卷。</b><p>可以先看全家，或替${escapeHtml(scopeName)}建一宗。</p><div class="finance-empty-actions"><button class="text-btn" id="financeScopeAll" type="button">看全家</button><button class="text-btn" id="financeEmptyAdd" type="button">替${escapeHtml(scopeName)}建案卷</button></div></div>`
        : `<div class="finance-empty"><b>还没有资金案卷</b><p>先选一个场景。所有金额、日期和截止日都由你确认；没有截止日就不编倒计时。</p></div>`)}</div>
      <p class="report-note">票根不代提交、不代收款、不做金融/法律确定性结论；涉及银行、保险、贷款时以机构书面回复和合同为准。</p>`;
    $$("#financeBody [data-finance-type]").forEach((button) => button.addEventListener("click", () => openFinanceBuilder(button.dataset.financeType)));
    $$("#financeBody [data-finance-case]").forEach((button) => button.addEventListener("click", () => {
      const c = state.finance.find((item) => item.id === button.dataset.financeCase);
      if (c) openFinanceCase(c);
    }));
    $("#financeBillCheck").addEventListener("click", openFinanceBill);
    $("#financeAddInline").addEventListener("click", openFinanceTypeSheet);
    $$("#financeBody [data-finance-scope]").forEach((button) => button.addEventListener("click", () => {
      state.familyFilter = button.dataset.financeScope;
      renderFinance();
    }));
    if ($("#financeScopeMore")) $("#financeScopeMore").addEventListener("click", openFinanceScopeSheet);
    if ($("#financeScopeAll")) $("#financeScopeAll").addEventListener("click", () => { state.familyFilter = "all"; renderFinance(); });
    if ($("#financeEmptyAdd")) $("#financeEmptyAdd").addEventListener("click", openFinanceTypeSheet);
  }

  function openFinanceScopeSheet() {
    const counts = new Map();
    (state.finance || []).forEach((c) => {
      const key = financeMemberName(c) ? `member:${financeMemberName(c)}` : "self";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const rows = Array.from(counts.entries()).sort((a, b) => (a[0] === "self" ? 1 : 0) - (b[0] === "self" ? 1 : 0) || a[0].localeCompare(b[0], "zh-CN"));
    openSheet("家庭视角", `<p class="sheet-hint">只切换查看范围，不改案卷归属；只存本机。</p>
      <div class="finance-scope-list">
        <button class="finance-scope-row ${state.familyFilter === "all" ? "on" : ""}" type="button" data-finance-scope-pick="all"><span>全家</span><small>${(state.finance || []).length} 宗</small></button>
        ${rows.map(([key, count]) => `<button class="finance-scope-row ${state.familyFilter === key ? "on" : ""}" type="button" data-finance-scope-pick="${escapeHtml(key)}"><span>${escapeHtml(key === "self" ? "我" : key.slice(7))}</span><small>${count} 宗</small></button>`).join("")}
      </div>`, () => {
      $$("#sheetBody [data-finance-scope-pick]").forEach((button) => button.addEventListener("click", () => {
        state.familyFilter = button.dataset.financeScopePick;
        closeSheet();
        renderFinance();
      }));
    });
  }

  function openFinanceTypeSheet() {
    openSheet("新建资金案卷", `<p class="sheet-hint">先选一个问题。只有你填了截止日，才会出现倒计时。</p>
      <div class="finance-type-list">${Object.entries(FINANCE_TYPES).map(([key, def]) => `<button class="finance-type-row" type="button" data-finance-pick="${key}">
        <span class="ft-ico">${def.icon}</span><span class="ft-main"><b>${escapeHtml(def.label)}</b><small>${escapeHtml(def.desc)}</small></span><span class="ft-chev" aria-hidden="true">›</span>
      </button>`).join("")}</div>`, () => {
      $$("#sheetBody [data-finance-pick]").forEach((button) => button.addEventListener("click", () => {
        closeSheet();
        openFinanceBuilder(button.dataset.financePick);
      }));
    });
  }

  function financeLoanCalc(input) {
    const principal = Number(input.principal) || 0;
    const periods = Math.max(0, Math.round(Number(input.periods) || 0));
    const monthly = Number(input.monthly) || 0;
    const upfrontFee = Number(input.upfrontFee) || 0;
    const disclosedApr = Number(input.disclosedApr);
    if (!principal || !periods || !monthly) return null;
    const totalRepay = monthly * periods + upfrontFee;
    const totalCost = totalRepay - principal;
    const simpleAnnual = totalCost / principal / (periods / 12) * 100;
    const cashflows = [principal - upfrontFee, ...Array(periods).fill(-monthly)];
    const npv = (rate) => cashflows.reduce((sum, value, index) => sum + value / Math.pow(1 + rate, index), 0);
    let low = -0.5;
    let high = 1;
    let rate = 0;
    let lowValue = npv(low);
    const highValue = npv(high);
    if (Math.abs(lowValue) < 1e-9) {
      rate = low;
    } else if (lowValue * highValue > 0) {
      rate = simpleAnnual / 100 / 12;
    } else {
      for (let i = 0; i < 160; i += 1) {
        const mid = (low + high) / 2;
        const midValue = npv(mid);
        if (lowValue * midValue <= 0) {
          high = mid;
        } else {
          low = mid;
          lowValue = midValue;
        }
      }
      rate = (low + high) / 2;
    }
    const irrAnnual = (Math.pow(1 + rate, 12) - 1) * 100;
    return {
      principal,
      periods,
      monthly,
      upfrontFee,
      totalRepay,
      totalCost,
      simpleAnnual,
      irrAnnual,
      disclosedApr: Number.isFinite(disclosedApr) ? disclosedApr : null,
      gap: Number.isFinite(disclosedApr) ? irrAnnual - disclosedApr : null,
      lowInput: totalRepay < principal
    };
  }

  function openFinanceBuilder(type, prefill = {}) {
    const def = FINANCE_TYPES[type];
    if (!def) return;
    const p = Object.assign({
      merchant: "",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      account: "",
      channel: "alipay",
      deadline: "",
      notes: "",
      issue: "未收到商品/服务",
      orderNo: "",
      bank: "",
      cardLast4: "",
      authorized: "不确定",
      policeNo: "",
      firstCharge: "",
      notice: "不确定",
      canceled: "还没关",
      unusedMonths: "",
      principal: "",
      periods: "",
      monthly: "",
      upfrontFee: "",
      disclosedApr: "",
      insurer: "",
      policyType: "长期健康险",
      premium: "",
      signedDate: "",
      coolingDays: "",
      reason: "其他",
      member: state.familyFilter.startsWith("member:") ? state.familyFilter.slice(7) : ""
    }, prefill);
    if (!p.member && p.linkedTicketId) {
      const linkedTicket = state.tickets.find((ticket) => ticket.id === p.linkedTicketId);
      p.member = linkedTicket ? memberNameOf(linkedTicket) : "";
    }
    const extras = {
      payment: `
        ${field("问题类型", "issue", p.issue, "select", [["未收到商品/服务", "未收到商品/服务"], ["商品/服务不符", "商品/服务不符"], ["重复扣款", "重复扣款"], ["退款未到账", "退款未到账"], ["金额不符", "金额不符"], ["其他", "其他"]])}
        ${field("订单号（可选）", "orderNo", p.orderNo, "text", "订单号 / 商户单号")}`,
      chargeback: `
        ${field("发卡行", "bank", p.bank, "text", "例如：招商银行")}
        ${field("卡尾号（只填后四位）", "cardLast4", p.cardLast4, "text", "1234")}
        ${field("是否本人授权", "authorized", p.authorized, "select", [["不确定", "不确定"], ["否，非本人授权", "否，非本人授权"], ["是，但未收到/有问题", "是，但未收到/有问题"]])}
        ${field("报警 / 反诈回执号（可选）", "policeNo", p.policeNo, "text", "只填编号，不上传身份证")}`,
      renewal: `
        ${field("第一次发现扣款", "firstCharge", p.firstCharge, "date")}
        ${field("扣费前是否收到显著提醒", "notice", p.notice, "select", [["不确定", "不确定"], ["没收到", "没收到"], ["收到但没注意", "收到但没注意"], ["确认收到", "确认收到"]])}
        ${field("提醒里有哪些内容（2026-04-10 起每次扣款前都应有）", "noticeParts", p.noticeParts, "select", [["不确定", "不确定"], ["三项都有", "时间、金额、取消途径都有"], ["缺取消途径", "缺取消途径"], ["缺金额或时间", "缺金额或时间"], ["没有提醒", "没有收到提醒"]])}
        ${field("自动续费现在关闭了吗", "canceled", p.canceled, "select", [["已关闭", "已关闭"], ["还没关", "还没关"], ["关闭失败", "关闭失败"]])}
        ${field("大概几个月没用", "unusedMonths", p.unusedMonths, "number", "例如：3")}`,
      prepaid: `
        ${field("合同 / 储值总额（元）", "paid", p.paid, "number", "例如：3000")}
        ${field("还剩多少余额 / 次数价值（元）", "balance", p.balance, "number", "例如：1800")}
        ${field("退款理由", "reason", p.reason, "select", [["付款 7 日内", "付款 7 日内"], ["迁店 / 到店明显不便", "迁店 / 到店明显不便"], ["未经同意转店", "未经同意转店"], ["服务无法正常提供", "服务无法正常提供"], ["身体原因", "身体原因"], ["其他", "其他"]])}`,
      installment: `
        ${field("实际到手本金（元）", "principal", p.principal, "number", "扣完费用后实际到账")}
        ${field("期数（月）", "periods", p.periods, "number", "例如：12")}
        ${field("每期还款（元）", "monthly", p.monthly, "number", "例如：900")}
        ${field("额外一次性费用（元）", "upfrontFee", p.upfrontFee, "number", "服务费 / 担保费等，没有填 0")}
        ${field("机构披露年化利率（%，可选）", "disclosedApr", p.disclosedApr, "number", "例如：7.2")}
        <p class="finance-form-note">保存后会按“实际到手 + 每期还款”估算综合年化；这是数学结果，不是机构结论。</p>`,
      insurance: `
        ${field("保险公司", "insurer", p.insurer, "text", "例如：某人寿 / 某财险")}
        ${field("险种", "policyType", p.policyType, "select", [["长期健康险", "长期健康险"], ["银保一年期以上", "银保一年期以上"], ["长期人身险（其他）", "长期人身险（其他）"], ["一年期健康险", "一年期健康险"], ["财产险", "财产险"], ["其他", "其他"]])}
        ${field("保费（元）", "premium", p.premium, "number", "例如：4800")}
        ${field("签收 / 起算日", "signedDate", p.signedDate, "date")}
        ${field("合同写的犹豫期天数", "coolingDays", p.coolingDays, "number", "以合同为准，例如 10 / 15 / 20")}
        <p class="finance-form-note">15 天仅长期健康险/银保一年期以上有硬依据；其他以合同为准。填了“签收日 + 合同天数”才会推算截止日。</p>`
    };
    openSheet(def.label, `
      <p class="sheet-hint">${escapeHtml(def.desc)}。只填你确认过的事实，不填完整卡号、验证码、密码。</p>
      ${field("商家 / 平台 / 机构", "merchant", p.merchant, "text", "谁收了这笔钱")}
      ${field("争议金额（元）", "amount", p.amount, "number", "涉及多少钱，不等于一定能退")}
      ${field("交易日期", "date", p.date, "date")}
      ${field("付款账户 / 卡尾号（只填尾号）", "account", p.account, "text", "支付宝 / 微信 / 尾号 1234")}
      ${field("渠道", "channel", p.channel, "select", channelOptions(p.channel))}
      ${financeMemberField(p.member)}
      ${extras[type] || ""}
      ${field(def.deadlineLabel, "deadline", p.deadline, "date")}
      ${field("备注", "notes", p.notes, "textarea", "对方回复、承诺、还缺什么、何时提交")}
      <div class="sheet-actions">
        <button class="btn primary" id="financeSave" type="button">建立资金案卷</button>
        <button class="btn ghost" id="financeCancel" type="button">取消</button>
      </div>`, () => {
      bindFinanceMemberField();
      const syncCoolingDeadline = () => {
        if (type !== "insurance") return;
        const signed = $("#f-signedDate")?.value;
        const days = Number($("#f-coolingDays")?.value || 0);
        if (signed && days > 0 && !$("#f-deadline")?.dataset.touched) {
          const d = new Date(signed);
          d.setDate(d.getDate() + days);
          $("#f-deadline").value = d.toISOString().slice(0, 10);
        }
      };
      ["#f-signedDate", "#f-coolingDays"].forEach((selector) => {
        if ($(selector)) $(selector).addEventListener("input", syncCoolingDeadline);
      });
      if ($("#f-deadline")) $("#f-deadline").addEventListener("input", (event) => { event.target.dataset.touched = "1"; });
      $("#financeCancel").addEventListener("click", closeSheet);
      $("#financeSave").addEventListener("click", () => {
        const get = (name) => {
          const el = $(`#f-${name}`);
          return el ? String(el.value || "").trim() : "";
        };
        const merchant = get("merchant") || p.merchant;
        const amount = Number(get("amount") || get("principal") || get("premium") || p.amount || 0);
        if (!merchant) { toast("先填商家 / 平台 / 机构"); return; }
        if (!amount) { toast("先填争议金额"); return; }
        const member = financeMemberValue();
        const now = new Date().toISOString();
        const fields = {};
        for (const key of ["issue", "orderNo", "bank", "cardLast4", "authorized", "policeNo", "firstCharge", "notice", "noticeParts", "canceled", "unusedMonths", "principal", "periods", "monthly", "upfrontFee", "disclosedApr", "insurer", "policyType", "premium", "signedDate", "coolingDays", "reason"]) {
          const value = get(key);
          if (value) fields[key] = value;
        }
        const c = {
          id: `FM-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${uid().slice(0, 5).toUpperCase()}`,
          type,
          merchant,
          amount,
          date: get("date") || p.date,
          account: get("account") || p.account,
          channel: get("channel") || p.channel,
          deadline: get("deadline") || "",
          notes: get("notes") || p.notes || "",
          member,
          fields,
          evidence: def.evidence.map((item) => ({ ...item, id: uid(), status: "missing" })),
          attachments: [],
          status: "open",
          history: [{ status: "open", note: "建立资金案卷", at: now }],
          createdAt: now,
          updatedAt: now,
          linkedTicketId: p.linkedTicketId || ""
        };
        if (type === "installment") c.calculation = financeLoanCalc(fields);
        state.finance.unshift(c);
        saveFinance();
        closeSheet();
        openFinanceCase(c);
        toast("资金案卷已建立");
      });
    });
  }

  function openFinanceCase(c) {
    state.currentFinance = c;
    show("financeCase");
  }

  function financeChannelLabel(id) {
    return (PG.CHANNEL && PG.CHANNEL[id] && PG.CHANNEL[id].label) || "原支付渠道";
  }

  function financeScript(c) {
    const def = FINANCE_TYPES[c.type] || FINANCE_TYPES.payment;
    const f = c.fields || {};
    const who = c.merchant || "相关机构";
    const amount = money(c.amount);
    const when = c.date || "购买日待确认";
    const deadline = c.deadline ? `请在 ${c.deadline} 前书面回复。` : "如有时限，请书面告知具体截止日。";
    if (c.type === "chargeback") {
      return `你好，我是尾号 ${f.cardLast4 || "（待填）"} 的银行卡持卡人。${when} 发生的 ${who} 交易 ${amount}，${f.authorized || "是否本人授权待确认"}。现申请交易争议 / 拒付处理，请告知争议编号、所需材料和补件截止日。${f.policeNo ? `报警/反诈回执号：${f.policeNo}。` : ""}${deadline}`;
    }
    if (c.type === "renewal") {
      return `你好，我在 ${when} 通过 ${financeChannelLabel(c.channel)} 向 ${who} 支付 ${amount}。这笔自动续费${f.notice === "没收到" ? "未收到显著扣费前提醒" : "的扣费提醒与授权需要核对"}。请提供开通授权记录、续费前提醒记录和扣费明细；如无法提供，请退还未使用期间费用并停止后续代扣。${deadline}`;
    }
    if (c.type === "prepaid") {
      return `你好，我于 ${when} 在 ${who} 支付 ${amount} 购买预付式服务${f.balance ? `，目前剩余约 ${money(f.balance)}` : ""}。因为${f.reason || "合同履行发生变化"}，现提出解除合同并退还剩余预付款。请列明已消费金额、扣减项目和计算方式，并书面回复。${deadline}`;
    }
    if (c.type === "installment") {
      const x = c.calculation;
      return `你好，我于 ${when} 在 ${who} 办理分期 / 借款 ${amount}。${x ? `按实际到手 ${money(x.principal)}、每期 ${money(x.monthly)}、${x.periods} 期估算，综合年化约 ${x.irrAnnual.toFixed(2)}%，总成本约 ${money(x.totalCost)}。` : ""}${x && x.disclosedApr !== null ? `机构页面披露年化为 ${x.disclosedApr.toFixed(2)}%。` : ""}请提供综合融资成本明示表，逐项说明利息、分期费、增信服务费及其他费用。${deadline}`;
    }
    if (c.type === "insurance") {
      return `你好，我于 ${f.signedDate || when} 收到 ${who} 的${f.policyType || "保险"}保单，保费 ${amount}。合同约定的犹豫期为 ${f.coolingDays || "（待核对）"} 天${c.deadline ? `，截止 ${c.deadline}` : ""}。现申请犹豫期解除 / 退保，请书面确认受理编号、退款金额、扣减项和到账时间。`;
    }
    return `你好，我于 ${when} 通过 ${financeChannelLabel(c.channel)} 向 ${who} 支付 ${amount}。目前问题是：${f.issue || "交易与约定不符"}。${f.orderNo ? `订单号：${f.orderNo}。` : ""}请核对并书面回复：是否退款、退款金额、处理依据和预计到账时间。${deadline}`;
  }

  function financeCouncil(c, def, ready, total) {
    const f = c.fields || {};
    const due = financeDeadline(c);
    const complete = !!(c.merchant && c.amount && c.date);
    const flowDetail = complete
      ? `金额 ${money(c.amount)}、日期 ${c.date}、渠道 ${financeChannelLabel(c.channel)} 已记录。`
      : "商家、金额或日期还没齐，先补事实。";
    let ruleDetail = def.rules[0] ? def.rules[0].body : "先确认适用规则。";
    let ruleStatus = "assert";
    if (c.type === "chargeback" && !due.has) {
      ruleStatus = "confirm";
      ruleDetail = "没有你填写的银行截止日，所以不倒计时；以发卡行/卡组织书面通知为准。";
    }
    if (c.type === "installment" && !c.calculation) {
      ruleStatus = "confirm";
      ruleDetail = "还缺本金、期数或月供，综合融资成本无法估算。";
    }
    const auditStatus = complete && ready === total ? "assert" : "confirm";
    return [
      { id: "flow", name: "流水", status: complete ? "assert" : "confirm", detail: flowDetail },
      { id: "rule", name: "规则", status: ruleStatus, detail: ruleDetail },
      { id: "evidence", name: "证据", status: ready === total ? "assert" : "confirm", detail: `${ready}/${total} 件已备${ready < total ? `，还缺 ${total - ready} 件` : "，清单已齐"}。` },
      { id: "audit", name: "审计", status: auditStatus, detail: due.has ? "没有伪造或跳过你填写的时限；不代提交、不承诺结果。" : "未填截止日就不生成倒计时；不代提交、不承诺结果。" }
    ];
  }

  function renderFinanceCase(c) {
    const body = $("#financeCaseBody");
    if (!body || !c) return;
    const def = FINANCE_TYPES[c.type] || FINANCE_TYPES.payment;
    const due = financeDeadline(c);
    const ready = financeEvidenceReady(c);
    const totalEvidence = (c.evidence || []).length;
    const script = financeScript(c);
    const council = financeCouncil(c, def, ready, totalEvidence);
    const conclusion = financeConclusion(c);
    $("#financeCaseTitle").textContent = `${def.short} · ${c.merchant || "待确认"}`;
    const calc = c.calculation;
    const calcHtml = calc ? `<div class="finance-calc">
      <div><span>总还款</span><b>${money(calc.totalRepay)}</b></div>
      <div><span>总成本</span><b class="warn">${money(calc.totalCost)}</b></div>
      <div><span>按现金流估算年化</span><b class="${calc.gap !== null && Math.abs(calc.gap) > 1 ? "warn" : "ok"}">${calc.irrAnnual.toFixed(2)}%</b></div>
      ${calc.disclosedApr !== null ? `<div><span>机构披露年化</span><b>${calc.disclosedApr.toFixed(2)}%</b></div><div><span>差值</span><b>${calc.gap.toFixed(2)} 个百分点</b></div>` : ""}
      ${calc.lowInput ? `<p>月供总额低于本金，先核对输入，避免得出错误结论。</p>` : `<p>按你填的现金流估算，不是机构的最终口径；把明示表带进材料包再核对。</p>`}
    </div>` : "";
    const rules = def.rules.map((rule) => `<div class="finance-rule"><b>${escapeHtml(rule.title)}</b><p>${escapeHtml(rule.body)}</p></div>`).join("");
    const evidence = (c.evidence || []).map((item, index) => `<label class="finance-evidence ${item.status === "ready" ? "ready" : ""}">
      <input type="checkbox" data-finance-evidence="${index}" ${item.status === "ready" ? "checked" : ""} />
      <span><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.hint || "")}</small></span>
      <em>${item.status === "ready" ? "已备" : "待补"}</em>
    </label>`).join("");
    const routes = def.routes.map((route) => `<div class="finance-route">
      <div class="fr-head"><b>${escapeHtml(route.label)}</b><span>${escapeHtml(route.source || "")}</span></div>
      <ol>${(route.path || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      ${route.url ? `<a href="${escapeHtml(route.url)}" target="_blank" rel="noopener noreferrer">打开官方页面<span>↗</span></a>` : ""}
    </div>`).join("");
    const attachments = (c.attachments || []).map((item, index) => `<figure class="finance-attachment">
      <img src="${escapeHtml(item.dataUrl)}" alt="${escapeHtml(item.label || "凭证")}" />
      <figcaption>${escapeHtml(item.label || "凭证")}<button type="button" data-finance-attach-del="${index}" aria-label="删除这张凭证">删</button></figcaption>
    </figure>`).join("");
    const history = (c.history || []).slice().reverse().map((row) => `<li><b>${escapeHtml(financeStatusLabel(row.status))}</b><span>${escapeHtml(String(row.at || "").slice(0, 10))}</span><p>${escapeHtml(row.note || "")}</p></li>`).join("");
    body.innerHTML = `
      <div class="finance-case-hero">
        <div class="fch-top"><span>${escapeHtml(def.label)}${c.source === "demo" ? " · 示例" : ""}<button class="finance-member-inline" id="financeMemberEdit" type="button" aria-label="修改归属">${escapeHtml(financeMemberText(c))}</button></span><i class="finance-state st-${escapeHtml(c.status)}">${escapeHtml(financeStatusLabel(c.status))}</i></div>
        <h2>${escapeHtml(c.merchant || "商家待确认")}</h2>
        <div class="fch-money">${money(c.amount)}<small>争议金额 / 涉及金额</small></div>
        <div class="fch-meta"><span>${escapeHtml(c.date || "日期待确认")}</span><span>${escapeHtml(financeChannelLabel(c.channel))}</span>${c.account ? `<span>${escapeHtml(c.account)}</span>` : ""}</div>
        ${(() => {
          const linked = c.linkedTicketId ? state.tickets.find((ticket) => ticket.id === c.linkedTicketId) : null;
          return linked ? `<button class="finance-linked-ticket" id="financeLinkedTicketInline" type="button">关联票据：${escapeHtml(linked.merchant || "票据")} ${money(linked.amount)} ›</button>` : "";
        })()}
        ${due.has ? `<div class="finance-due ${due.days < 0 ? "late" : due.days <= 3 ? "hot" : ""}"><span>${c.type === "chargeback" ? "银行/卡组织告知" : "你填写的截止日"}</span><b>${due.days < 0 ? `已过 ${-due.days} 天` : `还剩 ${due.days} 天`}</b><small>${escapeHtml(c.deadline)}</small></div>` : `<p class="finance-no-deadline">没有填截止日，所以不倒计时、不猜时限；以银行、平台或合同通知为准。</p>`}
      </div>
      <div class="finance-case-next">
        <button class="btn primary" id="financeNext" type="button">${ready < totalEvidence ? `先补齐 ${totalEvidence - ready} 件证据` : "打开下一步路径"}</button>
      </div>
      ${calcHtml}
      <section class="finance-council">
        <div class="finance-block-head"><h2>资金合议</h2><span>4 个判断单元</span></div>
        <div class="finance-council-grid">
          ${council.map((agent) => `<div class="finance-agent ${agent.status}">
            <span class="fa-mark">${agent.status === "assert" ? "✓" : agent.status === "veto" ? "!" : "◐"}</span>
            <b>${escapeHtml(agent.name)}</b>
            <small>${escapeHtml(agent.detail)}</small>
          </div>`).join("")}
        </div>
        <p class="finance-council-note">审查只决定“材料够不够、路径对不对”，不判断你一定赢；缺证据时会明确待补。</p>
      </section>
      <section class="finance-block">
        <div class="finance-block-head"><h2>这宗案卷怎么判断</h2><span>规则与边界</span></div>
        <div class="finance-rules">${rules}</div>
      </section>
      <section class="finance-block" id="financeEvidenceBlock">
        <div class="finance-block-head"><h2>证据门</h2><span id="financeEvidenceCount">${ready}/${totalEvidence} 件已备</span></div>
        <div class="finance-evidence-list">${evidence}</div>
      </section>
      <section class="finance-block finance-conclusion">
        <div class="finance-block-head"><h2>规则结论</h2><span>确定性规则，不是模型</span></div>
        <p class="fc-body">${escapeHtml(conclusion.body)}</p>
        <p class="fc-basis">依据：${escapeHtml(conclusion.basis)}</p>
      </section>
      <section class="finance-block finance-notes">
        <div class="finance-block-head"><h2>事实与诉求</h2><button class="text-btn" id="financeNotesEdit" type="button">编辑</button></div>
        <p class="finance-notes-body">${c.notes ? escapeHtml(c.notes) : "还没有填写。可以把订单事实、你的诉求、对方回复要点写在这里。"}</p>
      </section>
      ${aiSuggestionBlock(c)}
      <section class="finance-block">
        <div class="finance-block-head"><h2>下一步路径</h2><span>你自己提交</span></div>
        <div class="finance-routes">${routes}</div>
      </section>
      <section class="finance-block">
        <div class="finance-block-head"><h2>可直接说的话</h2><button class="text-btn" id="financeCopy" type="button">复制</button></div>
        <pre class="finance-script" id="financeScriptText">${escapeHtml(script)}</pre>
      </section>
      <section class="finance-block">
        <div class="finance-block-head"><h2>凭证图片</h2><span>最多 3 张</span></div>
        <div class="finance-attach-grid">${attachments || `<p class="finance-empty-note">还没有本机凭证图。只存本机，不上传。</p>`}</div>
        ${(c.attachments || []).length < 3 ? `<label class="finance-upload">加一张凭证<input id="financeAttach" type="file" accept="image/*" /></label>` : ""}
      </section>
      <section class="finance-block">
        <div class="finance-block-head"><h2>经历</h2><span>回执时间线</span></div>
        <ol class="finance-history">${history}</ol>
      </section>
      <div class="finance-case-actions">
        <button class="btn primary" id="financeStatus" type="button">更新进度</button>
        <button class="btn ghost" id="financeExport" type="button">导出材料包</button>
        <button class="btn ghost" id="financeShare" type="button">分享回执</button>
        ${c.linkedTicketId ? `<button class="btn ghost" id="financeLinkedTicket" type="button">看关联票据</button>` : ""}
        <button class="link-btn" id="financeDelete" type="button">删除这宗案卷</button>
      </div>
      <p class="report-note">资金案卷只在本机保存。不代提交、不代收款；不提供“保证退回 / 保证拒付成功”的结论。</p>`;

    $("#financeNext").addEventListener("click", () => {
      const target = ready < totalEvidence ? $("#financeEvidenceBlock") : $(".finance-routes");
      if (target) target.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    });
    $$("#financeCaseBody [data-finance-evidence]").forEach((checkbox) => checkbox.addEventListener("change", () => {
      const item = c.evidence[Number(checkbox.dataset.financeEvidence)];
      if (!item) return;
      item.status = checkbox.checked ? "ready" : "missing";
      c.updatedAt = new Date().toISOString();
      saveFinance();
      const nextReady = financeEvidenceReady(c);
      checkbox.closest(".finance-evidence").classList.toggle("ready", checkbox.checked);
      checkbox.closest(".finance-evidence").querySelector("em").textContent = checkbox.checked ? "已备" : "待补";
      $("#financeEvidenceCount").textContent = `${nextReady}/${totalEvidence} 件已备`;
      $("#financeNext").textContent = nextReady < totalEvidence ? `先补齐 ${totalEvidence - nextReady} 件证据` : "打开下一步路径";
      refreshAiBlock(c);
    }));
    $("#financeCopy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(script); toast("话术已复制"); }
      catch { toast("浏览器不允许复制，请手动选中"); }
    });
    $("#financeStatus").addEventListener("click", () => openFinanceStatusSheet(c));
    $("#financeMemberEdit").addEventListener("click", () => openFinanceMemberEdit(c));
    $("#financeNotesEdit").addEventListener("click", () => openFinanceNotesSheet(c));
    if ($("#financeLinkedTicketInline")) $("#financeLinkedTicketInline").addEventListener("click", () => {
      const ticket = state.tickets.find((item) => item.id === c.linkedTicketId);
      if (ticket) openResult(ticket, PG.priority(ticket));
    });
    $("#financeExport").addEventListener("click", () => exportFinancePack(c));
    $("#financeShare").addEventListener("click", () => shareFinanceCard(c));
    bindAiActions(c);
    if ($("#financeLinkedTicket")) $("#financeLinkedTicket").addEventListener("click", () => {
      const ticket = state.tickets.find((t) => t.id === c.linkedTicketId);
      if (ticket) openResult(ticket, PG.priority(ticket));
      else toast("关联票据已删除");
    });
    $("#financeDelete").addEventListener("click", () => {
      if (!confirm("删除这宗资金案卷？本机记录不可恢复。")) return;
      state.finance = state.finance.filter((item) => item.id !== c.id);
      saveFinance();
      state.currentFinance = null;
      show("finance");
      toast("已删除资金案卷");
    });
    if ($("#financeAttach")) $("#financeAttach").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      try {
        const blob = await shrinkImage(file, 900, 0.58);
        const dataUrl = await new Promise((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result || ""));
          fr.readAsDataURL(blob);
        });
        c.attachments = (c.attachments || []).concat([{ id: uid(), label: file.name.slice(0, 18), dataUrl }]);
        c.updatedAt = new Date().toISOString();
        saveFinance();
        renderFinanceCase(c);
        toast("凭证已存本机");
      } catch {
        toast("图片处理失败");
      }
    });
    $$("#financeCaseBody [data-finance-attach-del]").forEach((button) => button.addEventListener("click", () => {
      c.attachments = (c.attachments || []).filter((_, index) => index !== Number(button.dataset.financeAttachDel));
      c.updatedAt = new Date().toISOString();
      saveFinance();
      renderFinanceCase(c);
    }));
  }

  function openFinanceNotesSheet(c) {
    openSheet("事实与诉求", `
      <p class="sheet-hint">写订单事实、你的诉求、对方回复要点。这里只存本机，会进入材料包；不写卡号、验证码、密码。</p>
      <textarea class="sheet-textarea" id="financeNotesText" rows="6">${escapeHtml(c.notes || "")}</textarea>
      <div class="sheet-actions">
        <button class="btn primary" id="financeNotesSave" type="button">保存</button>
        <button class="btn ghost" id="financeNotesCancel" type="button">取消</button>
      </div>`, () => {
      $("#financeNotesCancel").onclick = closeSheet;
      $("#financeNotesSave").onclick = () => {
        c.notes = $("#financeNotesText").value.trim();
        c.updatedAt = new Date().toISOString();
        saveFinance();
        closeSheet();
        renderFinanceCase(c);
        toast("事实与诉求已保存");
      };
    });
  }

  function openFinanceMemberEdit(c) {
    openSheet("改归属", `<p class="sheet-hint">只存本机，不是共享账户；不会改变金额、时限或路径。</p>
      ${financeMemberField(c.member)}
      <div class="sheet-actions">
        <button class="btn primary" id="financeMemberSave" type="button">保存归属</button>
        <button class="btn ghost" id="financeMemberCancel" type="button">取消</button>
      </div>`, () => {
      bindFinanceMemberField();
      $("#financeMemberCancel").addEventListener("click", closeSheet);
      $("#financeMemberSave").addEventListener("click", () => {
        c.member = financeMemberValue();
        c.updatedAt = new Date().toISOString();
        saveFinance();
        closeSheet();
        renderFinanceCase(c);
        toast("归属已更新");
      });
    });
  }

  function openFinanceStatusSheet(c) {
    const current = c.status || "open";
    openSheet("更新资金进度", `
      <p class="sheet-hint">“已提交 / 已受理”不等于到账。只有你确认到账或问题真的解决，才选“已解决”。</p>
      ${field("当前状态", "financeStatus", current, "select", [
        ["open", "待办"],
        ["submitted", "已提交"],
        ["accepted", "已受理"],
        ["waiting", "等待补件 / 到账"],
        ["resolved", "已解决"],
        ["rejected", "被拒"],
        ["closed", "先不办了 / 关闭"]
      ])}
      ${field("实际退回 / 解决金额（元，可留空）", "financeRecovered", c.recoveredAmount || "", "number", "只填你确认到的金额")}
      ${field("备注", "financeNote", "", "textarea", "例如：银行已受理，争议编号……；商家答应 3 天内退……")}
      <label class="check-item"><input id="financeConfirmed" type="checkbox" ${c.status === "resolved" ? "checked" : ""} /><span>我确认钱已到账 / 问题已实际解决（有流水或书面凭证）</span></label>
      <div class="sheet-actions">
        <button class="btn primary" id="financeStatusSave" type="button">保存进度</button>
        <button class="btn ghost" id="financeStatusCancel" type="button">取消</button>
      </div>`, () => {
      $("#financeStatusCancel").addEventListener("click", closeSheet);
      $("#financeStatusSave").addEventListener("click", () => {
        const status = $("#f-financeStatus").value;
        const confirmed = !!$("#financeConfirmed").checked;
        if (status === "resolved" && !confirmed) {
          toast("先确认到账/解决，再选“已解决”");
          return;
        }
        c.status = status;
        c.recoveredAmount = status === "resolved" ? Number($("#f-financeRecovered").value || 0) : 0;
        c.updatedAt = new Date().toISOString();
        c.history = (c.history || []).concat([{
          status,
          note: $("#f-financeNote").value.trim(),
          at: c.updatedAt
        }]);
        if (status === "resolved") c.resolvedAt = c.updatedAt;
        saveFinance();
        closeSheet();
        renderFinanceCase(c);
        toast(status === "resolved" ? "已记录为确认解决" : "资金进度已更新");
      });
    });
  }

  function exportFinancePack(c) {
    const def = FINANCE_TYPES[c.type] || FINANCE_TYPES.payment;
    const due = financeDeadline(c);
    const lines = [
      "票根 · 资金售后材料包",
      "=====================",
      `案卷号：${c.id}`,
      `类型：${def.label}`,
      `帮谁办：${financeMemberText(c)}`,
      `商家 / 机构：${c.merchant || "待确认"}`,
      `争议金额：${money(c.amount)}`,
      `交易日期：${c.date || "待确认"}`,
      `付款渠道：${financeChannelLabel(c.channel)}`,
      c.account ? `账户 / 卡尾号：${c.account}` : "",
      due.has ? `你填写的截止日：${c.deadline}（${due.days < 0 ? `已过 ${-due.days} 天` : `还剩 ${due.days} 天`}）` : "截止日：未填写，不生成倒计时",
      `当前状态：${financeStatusLabel(c.status)}`,
      `规则结论：${financeConclusion(c).body}`,
      `依据：${financeConclusion(c).basis}`,
      "",
      "一、事实与诉求",
      c.notes || "（备注为空）",
      "",
      "二、规则与边界",
      ...def.rules.map((rule) => `- ${rule.title}：${rule.body}`),
      "",
      "三、证据清单",
      ...(c.evidence || []).map((e, i) => `${i + 1}. [${e.status === "ready" ? "已备" : "待补"}] ${e.label}：${e.hint || ""}`),
      `本机凭证图片：${(c.attachments || []).length} 张（请从票根 App 内单独保存）`,
      "",
      "四、下一步路径",
      ...def.routes.flatMap((route) => [`- ${route.label}：${(route.path || []).join(" → ")}`, route.url ? `  ${route.url}` : ""]),
      "",
      "五、可直接说的话",
      financeScript(c),
      "",
      "六、计算口径",
      c.calculation ? `实际到手 ${money(c.calculation.principal)}；总还款 ${money(c.calculation.totalRepay)}；总成本 ${money(c.calculation.totalCost)}；按现金流估算年化 ${c.calculation.irrAnnual.toFixed(2)}%。这是按用户输入估算，不是机构结论。` : "本宗案卷未进行息费计算。",
      "",
      "七、声明",
      "- 你自己提交；票根不代提交、不代收款。",
      "- 金额、期限、资格以合同、账单、银行/平台书面回复为准。",
      "- 这不是金融/法律意见，也不保证一定能退回或拒付成功。",
      "",
      `生成时间：${new Date().toLocaleString("zh-CN")}`
    ].filter(Boolean);
    const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `piaogen-finance-${c.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast("资金材料包已导出");
  }

  function detectBillAnomalies(rows) {
    const outRows = rows.filter((row) => row.direction !== "in" && row.merchant && row.merchant !== "未知商家");
    const groups = [];
    for (let i = 0; i < outRows.length; i += 1) {
      const row = outRows[i];
      if (groups.some((group) => group.rows.includes(row))) continue;
      const date = parseReportDate(row.date);
      if (!date) continue;
      const groupRows = [row];
      for (let j = i + 1; j < outRows.length; j += 1) {
        const other = outRows[j];
        const otherDate = parseReportDate(other.date);
        if (!otherDate) continue;
        const gap = Math.abs((otherDate - date) / 86400000);
        if (other.merchant === row.merchant && Math.abs(Number(other.amount) - Number(row.amount)) < 0.01 && gap <= 3) {
          groupRows.push(other);
        }
      }
      if (groupRows.length > 1) groups.push({ rows: groupRows, merchant: row.merchant, amount: Number(row.amount), dates: groupRows.map((x) => x.date) });
    }
    let subscriptions = [];
    try { subscriptions = PG.detectSubscriptions(rows); } catch {}
    const unknown = rows.filter((row) => !row.merchant || /^未知/.test(row.merchant));
    return { groups, subscriptions, unknown };
  }

  function financeRefundChecks(rows) {
    const inflows = rows
      .map((row, index) => ({ row, index }))
      .filter((item) => item.row.direction === "in" && Number(item.row.amount) > 0);
    const used = new Set();
    return (state.finance || [])
      .filter((c) => !["resolved", "closed"].includes(c.status)
        && c.type === "payment"
        && (String((c.fields || {}).issue || "").includes("退款")
          || String(c.notes || "").includes("退款")
          || ["submitted", "accepted", "waiting"].includes(c.status)))
      .map((c) => {
        const caseDate = parseReportDate(c.date);
        const amount = Number(c.amount) || 0;
        const candidates = inflows
          .filter(({ row, index }) => {
            if (used.has(index)) return false;
            const d = parseReportDate(row.date);
            if (!caseDate || !d || d < caseDate) return false;
            if (Math.abs((d - caseDate) / 86400000) > 120) return false;
            if (Number(row.amount) > amount + 0.01) return false;
            const cm = String(c.merchant || "").replace(/\s/g, "");
            const rm = String(row.merchant || "").replace(/\s/g, "");
            if (cm && rm && !rm.includes(cm) && !cm.includes(rm) && !/^未知/.test(rm)) return false;
            return true;
          })
          .sort((a, b) => {
            const exactA = Math.abs(Number(a.row.amount) - amount) < 0.01 ? 1 : 0;
            const exactB = Math.abs(Number(b.row.amount) - amount) < 0.01 ? 1 : 0;
            return exactB - exactA || Number(b.row.amount) - Number(a.row.amount);
          });
        if (!candidates.length) return { case: c, status: "missing", found: 0, row: null };
        const picked = candidates[0];
        used.add(picked.index);
        const found = Number(picked.row.amount) || 0;
        return {
          case: c,
          status: Math.abs(found - amount) < 0.01 ? "exact" : "partial",
          found,
          row: picked.row
        };
      });
  }

  function openFinanceAnomalySheet(rows, source) {
    const anomaly = detectBillAnomalies(rows);
    const refundChecks = financeRefundChecks(rows);
    const total = anomaly.groups.length + anomaly.subscriptions.length + anomaly.unknown.length;
    const duplicateCards = anomaly.groups.map((group, index) => `<div class="finance-anomaly-card">
      <div class="fa-top"><b>${escapeHtml(group.merchant)}</b><em>${money(group.amount)}</em></div>
      <p>${group.rows.length} 次同额扣款，日期：${escapeHtml(group.dates.join("、"))}。可能是重复扣款，也可能是一笔订单拆单；先核对订单号。</p>
      <button class="link-btn" type="button" data-finance-anomaly="duplicate" data-index="${index}">建重复扣款案卷 →</button>
    </div>`).join("");
    const subCards = anomaly.subscriptions.map((sub, index) => `<div class="finance-anomaly-card">
      <div class="fa-top"><b>${escapeHtml(sub.merchant)}</b><em>${money(sub.avg)}/期</em></div>
      <p>连续 ${sub.count} 次，间隔约 ${sub.lastGap} 天；可能自动续费。先确认扣费前有没有显著提醒。</p>
      <button class="link-btn" type="button" data-finance-anomaly="renewal" data-index="${index}">建续费案卷 →</button>
    </div>`).join("");
    const unknownCards = anomaly.unknown.map((row, index) => `<div class="finance-anomaly-card">
      <div class="fa-top"><b>商户待确认</b><em>${money(row.amount)}</em></div>
      <p>${escapeHtml(row.date)} 有一笔扣款，商户名没识别出来。不要只凭金额猜，先回账单核对。</p>
      <button class="link-btn" type="button" data-finance-anomaly="unknown" data-index="${index}">建支付争议案卷 →</button>
    </div>`).join("");
    const refundCards = refundChecks.map((check) => `<button class="finance-refund-check ${check.status}" type="button" data-refund-case="${check.case.id}">
      <span>${check.status === "exact" ? "可能已到账" : check.status === "partial" ? "只匹配到部分" : "账单里暂未匹配"}</span>
      <b>${escapeHtml(check.case.merchant || "退款案卷")} · ${money(check.case.amount)}</b>
      <small>${check.status === "exact" ? `${escapeHtml(check.row.date)} 有一笔流入 ${money(check.found)}，请打开案卷确认` : check.status === "partial" ? `匹配到 ${money(check.found)}，还差 ${money(Math.max(0, Number(check.case.amount) - check.found))}` : "继续保留在途，不自动判为没退"}</small>
      <em>打开确认 ›</em>
    </button>`).join("");
    openSheet("资金体检结果", `
      <p class="sheet-hint">从${escapeHtml(source)}账单里找到 <b>${total}</b> 个需要核对的点。这里只提示，不直接认定扣错。</p>
      ${refundCards ? `<div class="finance-refund-block"><h2>退款到账核对</h2>${refundCards}</div>` : ""}
      ${duplicateCards}${subCards}${unknownCards || ""}
      ${total ? "" : `<div class="finance-empty"><b>没有发现明显异常</b><p>不代表一定没问题；你可以手动建一宗，把已知的退款、扣款或拒付放进去。</p></div>`}
      <p class="annual-note">判定：重复扣款看同商户同金额 3 天内多次；自动续费看 25–35 天连续扣款；陌生商户只做核对提醒。</p>
      <div class="sheet-actions">
        <button class="btn primary" id="financeAnomalyManual" type="button">手动建资金案卷</button>
        <button class="btn ghost" id="financeAnomalyClose" type="button">关闭</button>
      </div>`, () => {
      $$("#sheetBody [data-finance-anomaly]").forEach((button) => button.addEventListener("click", () => {
        const kind = button.dataset.financeAnomaly;
        const index = Number(button.dataset.index);
        closeSheet();
        if (kind === "duplicate") {
          const group = anomaly.groups[index];
          openFinanceBuilder("payment", {
            merchant: group.merchant,
            amount: group.amount,
            date: group.dates[group.dates.length - 1] || new Date().toISOString().slice(0, 10),
            issue: "重复扣款",
            notes: `账单里同一商户同额出现 ${group.rows.length} 次：${group.dates.join("、")}。需要核对订单号，确认是重复扣款还是拆单。`
          });
        } else if (kind === "renewal") {
          const sub = anomaly.subscriptions[index];
          openFinanceBuilder("renewal", {
            merchant: sub.merchant,
            amount: sub.avg,
            date: sub.lastDate ? new Date(sub.lastDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
            firstCharge: sub.lastDate ? new Date(new Date(sub.lastDate).getTime() - sub.count * 30 * 86400000).toISOString().slice(0, 10) : "",
            notes: `账单里连续 ${sub.count} 次，间隔约 ${sub.lastGap} 天；是否为自动续费需要核对授权和扣费前提醒。`
          });
        } else {
          const row = anomaly.unknown[index];
          openFinanceBuilder("payment", {
            merchant: "未知商户",
            amount: row.amount,
            date: row.date,
            issue: "金额不符",
            notes: "账单商户名未识别。先回原账单核对商户全称、订单号和支付方式。"
          });
        }
      }));
      $$("#sheetBody [data-refund-case]").forEach((button) => button.addEventListener("click", () => {
        const c = state.finance.find((item) => item.id === button.dataset.refundCase);
        if (!c) return;
        closeSheet();
        openFinanceCase(c);
      }));
      $("#financeAnomalyManual").addEventListener("click", () => { closeSheet(); openFinanceTypeSheet(); });
      $("#financeAnomalyClose").addEventListener("click", closeSheet);
    });
  }

  function openFinanceBill() {
    openSheet("资金体检", `
      <p class="sheet-hint">粘贴支付宝、微信或银行账单里的几行。只做本机核对，不上传，也不自动扣款/退款。</p>
      ${field("账单来源", "financeBillChannel", "alipay", "select", [["支付宝", "支付宝"], ["微信支付", "微信支付"], ["银行卡", "银行卡"], ["其他", "其他"]])}
      <textarea id="financeBillText" class="sheet-textarea" rows="8" placeholder="2026-11-15 某视频会员 -25.00
2026-11-13 某家电卖场 -399.00
2026-11-08 某家具城 -1280.00"></textarea>
      <div class="sheet-actions">
        <button class="btn primary" id="financeBillParse" type="button">开始体检</button>
        <button class="btn ghost" id="financeBillCancel" type="button">取消</button>
      </div>`, () => {
      $("#financeBillCancel").addEventListener("click", closeSheet);
      $("#financeBillParse").addEventListener("click", () => {
        const source = $("#f-financeBillChannel").value;
        const rows = parseBillText($("#financeBillText").value);
        if (!rows.length) { toast("没认出账单行，检查日期和金额"); return; }
        openFinanceAnomalySheet(rows, source);
      });
    });
  }

  function statsOf(tickets) {
    let recovered = 0, done = 0, spans = [];
    for (const ticket of tickets) {
      for (const action of (ticket.actions || [])) {
        if (action.confirmed !== false && (action.status === "refunded" || action.status === "promise")) {
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
      <button class="link-btn recover-more" id="recoverAnnual" type="button">权利报告 ›</button>`;
    $("#recoverAnnual").onclick = () => openReport("week");
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
    const demoDay = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    const demo = [
      {
        merchant: "某家电卖场",
        amount: 399,
        date: demoDay(-8),
        category: "appliance",
        channel: "taobao",
        product: "某品牌空气炸锅",
        orderNo: "TB202611130001",
        receivedDate: demoDay(-8),
        promise: "",
        priceProtection: { hasMark: "yes", deadline: demoDay(11), note: "订单页 30 天价保，截止日已核对" },
        priceCheck: { sameModel: true, model: "某品牌空气炸锅", price: 279, date: demoDay(0), source: "user" },
        evidence: [
          { type: "订单截图", label: "淘宝订单截图", detail: `某家电卖场 · 实付 ¥399 · ${demoDay(-8)}`, confidence: 96, status: "active" },
          { type: "电子发票", label: "电子发票 PDF", detail: "销售方：某家电卖场 · 价税合计 ¥399", confidence: 94, status: "active" },
          { type: "价保截图", label: "订单页价保", detail: "30 天价保 · 截止日已核对", confidence: 92, status: "active" },
          { type: "当前价", label: "当前商品页", detail: "同款 ¥279 · 用户确认同款", confidence: 90, status: "active" }
        ],
        missing: ["保修卡"]
      },
      {
        merchant: "某家电卖场",
        amount: 3299,
        date: demoDay(-6),
        category: "appliance",
        channel: "jd",
        product: "1.5 匹空调",
        orderNo: "JD202610240001",
        invoiceDate: demoDay(-6),
        receivedDate: demoDay(-4),
        issue: "quality",
        warrantyPart: "",
        promise: "整机保修 6 年",
        helper: { forWhom: "父亲", name: "我", phone: "" },
        priceProtection: { hasMark: "no" },
        evidence: [
          { type: "订单截图", label: "京东订单截图", detail: "某家电卖场 · 实付 ¥3,299", confidence: 93, status: "active" },
          { type: "电子发票", label: "电子发票 PDF", detail: "销售方：某家电卖场 · 价税合计 ¥3,299", confidence: 91, status: "active" },
          { type: "故障视频", label: "空调不制冷", detail: "开机 10 分钟仍不制冷", confidence: 88, status: "active" }
        ],
        missing: ["保修卡"]
      },
      {
        merchant: "某装修公司",
        amount: 5000,
        date: demoDay(-20),
        category: "renovation",
        channel: "offline",
        product: "厨房改造定金",
        orderNo: "",
        promise: "开工前可退定金，扣 10% 设计费",
        deposit: { total: 50000, paid: 5000, breach: "seller" },
        helper: { forWhom: "母亲", name: "我", phone: "" },
        evidence: [
          { type: "合同照片", label: "定金收据", detail: "某装修公司 · 定金 ¥5,000 · 2026-11-01", confidence: 88, status: "active" },
          { type: "合同照片", label: "合同第 3 页", detail: "退款约定：开工前可退，扣 10% 设计费", confidence: 79, status: "active" }
        ],
        missing: ["合同原件"]
      },
      {
        merchant: "某视频会员",
        amount: 25,
        date: "2026-09-15",
        category: "other",
        channel: "alipay",
        product: "视频会员月费",
        orderNo: "",
        promise: "",
        noWindows: true,
        ledgerOnly: true,
        evidence: [{ type: "账单", label: "支付宝账单", detail: "某视频会员 · ¥25 · 2026-09-15", confidence: 99, status: "active" }],
        missing: []
      },
      {
        merchant: "某视频会员",
        amount: 25,
        date: "2026-10-15",
        category: "other",
        channel: "alipay",
        product: "视频会员月费",
        orderNo: "",
        promise: "",
        noWindows: true,
        ledgerOnly: true,
        evidence: [{ type: "账单", label: "支付宝账单", detail: "某视频会员 · ¥25 · 2026-10-15", confidence: 99, status: "active" }],
        missing: []
      },
      {
        merchant: "某视频会员",
        amount: 25,
        date: "2026-11-15",
        category: "other",
        channel: "alipay",
        product: "视频会员月费",
        orderNo: "",
        promise: "",
        noWindows: true,
        ledgerOnly: true,
        evidence: [{ type: "账单", label: "支付宝账单", detail: "某视频会员 · ¥25 · 2026-11-15", confidence: 99, status: "active" }],
        missing: []
      },
      {
        merchant: "某超市",
        amount: 49.9,
        date: "2026-10-05",
        category: "grocery",
        channel: "offline",
        product: "洗衣液 3kg",
        orderNo: "",
        promise: "",
        noWindows: true,
        ledgerOnly: true,
        evidence: [{ type: "小票", label: "超市小票", detail: "某超市 · 洗衣液 3kg · ¥49.90", confidence: 92, status: "active" }],
        missing: []
      },
      {
        merchant: "某超市",
        amount: 49.9,
        date: "2026-11-04",
        category: "grocery",
        channel: "offline",
        product: "洗衣液 3kg",
        orderNo: "",
        promise: "",
        noWindows: true,
        ledgerOnly: true,
        evidence: [{ type: "小票", label: "超市小票", detail: "某超市 · 洗衣液 3kg · ¥49.90", confidence: 92, status: "active" }],
        missing: []
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
    const plusDays = (n) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };
    state.coupons = [
      { id: uid(), name: "满 199 减 30", merchant: "某超市", amount: 30, expiresAt: plusDays(6) },
      { id: uid(), name: "家电清洗券", merchant: "某家电卖场", amount: 50, expiresAt: plusDays(20) }
    ];
    saveCoupons();
    state.points = [
      { id: uid(), platform: "某航司", balance: 12000, expiresAt: "2026-12-31" },
      { id: uid(), platform: "某超市", balance: 860, expiresAt: "2027-03-31" }
    ];
    savePoints();
    const demoNow = new Date().toISOString();
    const demoFinance = [
      {
        id: `FM-DEMO-${uid().slice(0, 5).toUpperCase()}`,
        type: "payment",
        merchant: "某电商旗舰店",
        amount: 399,
        date: demoDay(-9),
        account: "支付宝",
        channel: "alipay",
        deadline: demoDay(2),
        notes: "商家回复“已退款”，但支付宝账单仍未入账；先核对商户退款单号。",
        fields: { issue: "退款未到账", orderNo: "TB-DEMO-399" },
        evidence: FINANCE_TYPES.payment.evidence.map((item, index) => ({ ...item, id: uid(), status: index < 3 ? "ready" : "missing" })),
        attachments: [],
        status: "submitted",
        history: [
          { status: "open", note: "示例：建立资金案卷", at: demoNow },
          { status: "submitted", note: "示例：已在平台提交", at: demoNow }
        ],
        createdAt: demoNow,
        updatedAt: demoNow,
        source: "demo"
      },
      {
        id: `FM-DEMO-${uid().slice(0, 5).toUpperCase()}`,
        type: "chargeback",
        merchant: "某线下商户",
        amount: 1200,
        date: demoDay(-3),
        account: "某银行 · 尾号 1234",
        channel: "other",
        deadline: "",
        notes: "示例：银行已受理争议，正在等补件通知；没有把预计时限写成银行时限。",
        fields: { bank: "某银行", cardLast4: "1234", authorized: "否，非本人授权" },
        evidence: FINANCE_TYPES.chargeback.evidence.map((item, index) => ({ ...item, id: uid(), status: index < 2 ? "ready" : "missing" })),
        attachments: [],
        status: "waiting",
        history: [
          { status: "open", note: "示例：建立资金案卷", at: demoNow },
          { status: "waiting", note: "示例：银行受理，等待补件", at: demoNow }
        ],
        createdAt: demoNow,
        updatedAt: demoNow,
        source: "demo"
      },
      {
        id: `FM-DEMO-${uid().slice(0, 5).toUpperCase()}`,
        type: "renewal",
        merchant: "某视频会员",
        amount: 25,
        date: demoDay(-6),
        account: "支付宝",
        channel: "alipay",
        deadline: "",
        notes: "示例：合同写连续包月，但未找到扣费前的显著提醒；尚未关闭代扣。",
        fields: { notice: "没收到", canceled: "还没关", firstCharge: demoDay(-96) },
        evidence: FINANCE_TYPES.renewal.evidence.map((item, index) => ({ ...item, id: uid(), status: index < 2 ? "ready" : "missing" })),
        attachments: [],
        status: "open",
        history: [{ status: "open", note: "示例：建立资金案卷", at: demoNow }],
        createdAt: demoNow,
        updatedAt: demoNow,
        source: "demo"
      }
    ];
    state.finance = demoFinance.concat((state.finance || []).filter((item) => item.source !== "demo"));
    saveFinance();
    state.demo = true;
    save();
    toast("已加入 3 宗案卷 + 5 条记录 + 3 宗资金售后示例");
    show("today");
  }

  function auditNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function auditItem(q, answers) {
    const a = answers[q.id] || {};
    let amount = 0;
    let kind = "atRisk";
    if (q.id === "subs") {
      amount = auditNumber(a.subMonthly) * auditNumber(a.subUnused);
      kind = "lost";
    } else {
      amount = auditNumber(a[q.fields[0].key]);
      if (q.id === "unused" || q.id === "expired") kind = "lost";
      if (q.id === "price" || q.id === "deposit") kind = "recoverable";
    }
    return { id: q.id, label: q.label, amount, kind };
  }

  function computeAudit(answers) {
    const items = AUDIT_QUESTIONS.map((q) => auditItem(q, answers)).filter((x) => x.amount > 0);
    const sum = (kind) => items.filter((x) => x.kind === kind).reduce((n, x) => n + x.amount, 0);
    const lost = sum("lost");
    const atRisk = sum("atRisk");
    const recoverable = sum("recoverable");
    return {
      items: items.sort((a, b) => b.amount - a.amount),
      lost,
      atRisk,
      recoverable,
      total: lost + atRisk + recoverable,
      completedAt: new Date().toISOString()
    };
  }

  function startAudit(reset = true) {
    if (reset) {
      auditDraft.view = "intro";
      auditDraft.index = 0;
      auditDraft.answers = {};
    }
    show("audit");
  }

  function auditFieldsHtml(q) {
    const saved = auditDraft.answers[q.id] || {};
    return q.fields.map((f) => `
      <label class="audit-field">
        <span>${escapeHtml(f.label)}</span>
        <span class="audit-input-wrap">
          <input data-audit-key="${escapeHtml(f.key)}" type="number" min="0" inputmode="decimal" value="${saved[f.key] != null ? escapeHtml(saved[f.key]) : ""}" placeholder="0" />
          <em>${escapeHtml(f.unit)}</em>
        </span>
      </label>`).join("");
  }

  function renderAudit() {
    const body = $("#auditBody");
    if (!body) return;
    const title = $("#auditTitle");

    if (auditDraft.view === "intro") {
      title.textContent = "看看家里悄悄亏了多少";
      body.innerHTML = `
        <div class="audit-intro">
          <p class="eyebrow">不用上传票据</p>
          <h2>3 分钟，先算一个数。</h2>
          <p>会员卡、自动续费、保修、没用的券、过期耗材、价保、定金、闲置残值。记不清就跳过，我们不替你编数。</p>
          <div class="audit-stats-preview">
            <div><b>8</b><span>个问题</span></div>
            <div><b>3</b><span>分钟</span></div>
            <div><b>本机</b><span>只存本地</span></div>
          </div>
          <button class="btn primary" id="auditStart" type="button">开始体检</button>
          ${state.audit ? `<button class="btn ghost" id="auditLast" type="button">查看上次结果（${money(state.audit.total)}）</button>` : ""}
          <p class="fine">不是法律/医疗结论；金额是估算，以票据和合同为准。</p>
        </div>`;
      $("#auditStart").addEventListener("click", () => {
        auditDraft.view = "question";
        auditDraft.index = 0;
        auditDraft.answers = {};
        renderAudit();
      });
      if ($("#auditLast")) $("#auditLast").addEventListener("click", () => {
        auditDraft.view = "result";
        auditDraft.answers = {};
        renderAudit();
      });
      return;
    }

    if (auditDraft.view === "question") {
      const q = AUDIT_QUESTIONS[auditDraft.index];
      title.textContent = `${auditDraft.index + 1} / ${AUDIT_QUESTIONS.length}`;
      body.innerHTML = `
        <div class="audit-progress"><i style="width:${((auditDraft.index + 1) / AUDIT_QUESTIONS.length) * 100}%"></i></div>
        <div class="audit-card">
          <p class="eyebrow">${escapeHtml(q.label)}</p>
          <h2>${escapeHtml(q.question)}</h2>
          <p class="lede">${escapeHtml(q.hint)}</p>
          <div class="audit-fields">${auditFieldsHtml(q)}</div>
          ${q.options.length ? `<div class="audit-options">${q.options.map((n) => `<button type="button" data-audit-option="${n}">${n === 0 ? "没有" : `¥${n}`}</button>`).join("")}</div>` : ""}
          <div class="audit-actions">
            <button class="btn ghost" id="auditBack" type="button">${auditDraft.index ? "上一题" : "先不做"}</button>
            <button class="btn primary" id="auditNext" type="button">${auditDraft.index === AUDIT_QUESTIONS.length - 1 ? "看结果" : "下一题"}</button>
          </div>
          <button class="link-btn" id="auditSkip" type="button">记不清，跳过</button>
        </div>`;

      $$("[data-audit-option]").forEach((button) => {
        button.addEventListener("click", () => {
          const input = $(`[data-audit-key="${q.fields[0].key}"]`);
          if (input) input.value = button.dataset.auditOption;
          $$("[data-audit-option]").forEach((b) => b.classList.toggle("on", b === button));
        });
      });
      const saveAnswer = () => {
        const answer = {};
        $$("[data-audit-key]").forEach((input) => { answer[input.dataset.auditKey] = input.value; });
        auditDraft.answers[q.id] = answer;
      };
      $("#auditNext").addEventListener("click", () => {
        saveAnswer();
        if (auditDraft.index >= AUDIT_QUESTIONS.length - 1) {
          auditDraft.view = "result";
        } else {
          auditDraft.index += 1;
        }
        renderAudit();
      });
      $("#auditSkip").addEventListener("click", () => {
        auditDraft.answers[q.id] = {};
        if (auditDraft.index >= AUDIT_QUESTIONS.length - 1) auditDraft.view = "result";
        else auditDraft.index += 1;
        renderAudit();
      });
      $("#auditBack").addEventListener("click", () => {
        saveAnswer();
        if (auditDraft.index === 0) auditDraft.view = "intro";
        else auditDraft.index -= 1;
        renderAudit();
      });
      return;
    }

    const hasAnswers = auditDraft.answers && Object.keys(auditDraft.answers).length;
    const r = hasAnswers ? computeAudit(auditDraft.answers) : (state.audit || computeAudit({}));
    state.audit = { ...r, answers: auditDraft.answers };
    saveAudit();
    title.textContent = "家庭隐形损失";
    const top = (r.items || []).slice(0, 3);
    const pct = r.total > 0 ? Math.min(100, Math.round((r.recoverable / r.total) * 100)) : 0;
    body.innerHTML = `
      <div class="audit-result">
        <p class="eyebrow">估算 · 只存本机</p>
        <h2>今年你家悄悄亏了</h2>
        <div class="audit-total" id="auditTotal">¥0</div>
        <div class="audit-ring-row">
          <div class="audit-ring" style="--p:${pct}">
            <span>${pct}%</span>
            <small>可追回</small>
          </div>
          <div class="audit-breakdown">
            <div><span>已损失</span><b>${money(r.lost)}</b></div>
            <div><span>将损失</span><b>${money(r.atRisk)}</b></div>
            <div class="ok"><span>可追回</span><b>${money(r.recoverable)}</b></div>
          </div>
        </div>
        <div class="audit-top">
          <div class="section-head"><h2>最大三笔</h2><span>估算</span></div>
          ${top.length ? top.map((x, i) => `<div class="audit-top-row"><b>${i + 1}</b><span>${escapeHtml(x.label)}</span><em>${money(x.amount)}</em></div>`).join("") : `<p class="lede">没有填出明显损失；这很好。可以补一张票再算精确权利。</p>`}
        </div>
        <button class="btn primary" id="auditGo" type="button">${state.tickets.length ? "回到今天，先办一件" : "去补一张票，算精确权利"}</button>
        <button class="btn ghost" id="auditShare" type="button">分享给家人</button>
        <button class="link-btn" id="auditRetry" type="button">重新体检</button>
        <p class="fine">金额是估算，可跳过；不是法律/医疗结论。</p>
      </div>`;
    const ring = $(".audit-ring");
    if (ring && !reduce) {
      ring.style.setProperty("--p", "0");
      requestAnimationFrame(() => requestAnimationFrame(() => ring.style.setProperty("--p", String(pct))));
    }
    animateNumber($("#auditTotal"), r.total, 700);
    $("#auditGo").addEventListener("click", () => {
      if (state.tickets.length) show("today");
      else show("import");
    });
    $("#auditShare").addEventListener("click", () => shareAuditCard(r));
    $("#auditRetry").addEventListener("click", () => startAudit(true));
  }

  function animateNumber(el, target, duration = 700) {
    if (!el) return;
    const end = Math.max(0, Number(target) || 0);
    if (reduce) { el.textContent = money(end); return; }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = money(Math.round(end * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function shareAuditCard(r) {
    const W = 1080, H = 1440;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = "#0A0E0F"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#9DF0C2"; g.fillRect(0, 0, W, 12);
    g.fillStyle = "#9DF0C2";
    g.font = '700 34px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("票根 · 家庭隐形损失", 78, 110);
    g.fillStyle = "#B6C4C0";
    g.font = '400 24px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("今年你家悄悄亏了（估算）", 78, 190);
    g.fillStyle = "#FF715B";
    g.font = '600 104px "Space Grotesk","Consolas",monospace';
    g.fillText(money(r.total), 78, 310);
    g.fillStyle = "#B6C4C0";
    g.font = '400 24px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText(`已损失 ${money(r.lost)} · 将损失 ${money(r.atRisk)} · 可追回 ${money(r.recoverable)}`, 78, 360);
    let y = 470;
    (r.items || []).slice(0, 4).forEach((x, i) => {
      g.fillStyle = "#1A2426"; g.fillRect(78, y - 36, W - 156, 78);
      g.fillStyle = "#9DF0C2";
      g.font = '600 22px "Space Grotesk","Consolas",monospace';
      g.fillText(String(i + 1).padStart(2, "0"), 104, y + 12);
      g.fillStyle = "#F1F7F4";
      g.font = '500 26px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
      g.fillText(String(x.label).slice(0, 14), 170, y + 12);
      g.fillStyle = "#FF715B";
      g.font = '600 26px "Space Grotesk","Consolas",monospace';
      g.textAlign = "right"; g.fillText(money(x.amount), W - 104, y + 12); g.textAlign = "left";
      y += 96;
    });
    g.strokeStyle = "#273234"; g.beginPath(); g.moveTo(78, H - 210); g.lineTo(W - 78, H - 210); g.stroke();
    g.fillStyle = "#82918D";
    g.font = '400 22px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("先算损失，再把还能拿回的钱办回来。", 78, H - 150);
    g.fillText("票根 · 付款之后，权利开始计时", 78, H - 110);
    cv.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "piaogen-loss.png"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("已生成家庭损失卡");
    }, "image/png");
  }

  function renderLossBanner() {
    const host = $("#lossBanner");
    if (!host) return;
    if (!state.audit) { host.innerHTML = ""; return; }
    host.innerHTML = `<button class="loss-banner" id="lossBannerOpen" type="button">
      <span>家庭隐形损失（估算）</span>
      <b>${money(state.audit.total)}</b>
      <small>其中可追回 ${money(state.audit.recoverable)} · 看报告</small>
    </button>`;
    $("#lossBannerOpen").addEventListener("click", () => {
      auditDraft.view = "result";
      auditDraft.answers = state.audit.answers || {};
      show("audit");
    });
  }

  function clockView(ticket, types, fallback) {
    const label = types[0] === "return" ? "退货" : types[0] === "price" ? "价保" : "保修";
    const windows = ticket.windows || [];
    let win = null;
    for (const type of types) {
      win = windows.find((w) => w.type === type);
      if (win) break;
    }
    if (!win) return { label, value: "—", note: fallback, cls: "unknown", pct: 0 };
    if (win.applicability === "not_applicable") {
      return { label, value: "不适用", note: String(win.source || "页面/规则排除").slice(0, 34), cls: "na", pct: 0 };
    }
    if (win.status === "closed" || (win.daysLeft !== null && win.daysLeft < 0)) {
      return { label, value: "已关闭", note: win.end ? `到 ${win.end} 关闭` : fallback, cls: "closed", pct: 100 };
    }
    if (win.daysLeft === null) {
      return { label, value: "待确认", note: fallback, cls: "unknown", pct: 0 };
    }
    return {
      label,
      value: `${win.daysLeft} 天`,
      note: win.end ? `到 ${win.end} 关闭` : fallback,
      cls: win.daysLeft <= 3 ? "urgent" : "open",
      pct: Math.max(2, Math.min(100, windowProgress(win)))
    };
  }

  function renderFamilyRail(families) {
    const host = $("#familyRail");
    if (!host) return;
    if (!families.length || !families[0].count) {
      host.innerHTML = "";
      return;
    }
    const active = families.find((member) => member.key === state.familyFilter) || families[0];
    if (active.key !== state.familyFilter) state.familyFilter = "all";
    const stack = families.slice(0, 3).map((member) => `<i>${escapeHtml(member.short)}</i>`).join("");
    const memberNames = families.map((member) => member.label).join("、");
    host.innerHTML = `<div class="family-rail-row">
      <button class="family-strip" id="openFamilyDeck" type="button" aria-haspopup="dialog" aria-label="家庭视角：${escapeHtml(memberNames)}。当前 ${escapeHtml(active.label)}，${active.count} 张票">
        <span class="family-mini" aria-hidden="true">${stack}</span>
        <span class="family-copy">
          <small>家庭视角${active.key === "all" ? " · 所有人的票" : " · 当前只看一人"}</small>
          <b>${escapeHtml(active.label)}</b>
          <span>${active.count} 张票${active.urgent ? ` · ${active.urgent} 件 7 天内` : ""}</span>
        </span>
        <span class="family-side">
          <b>${active.amount ? money(active.amount) : "—"}</b>
          <small>${active.recovered ? `已守住 ${money(active.recovered)}` : "可争取 · 估算"}</small>
        </span>
        <span class="family-chev" aria-hidden="true">›</span>
      </button>
      ${active.key === "all" ? "" : `<button class="family-clear" id="familyClear" type="button" aria-label="看全家的票">看全家</button>`}
    </div>`;
    $("#openFamilyDeck").addEventListener("click", openFamilySheet);
    if ($("#familyClear")) $("#familyClear").addEventListener("click", () => {
      state.familyFilter = "all";
      renderToday();
      toast("已回到全家视角");
    });
  }

  function renderWeekBrief(tickets) {
    const host = $("#weekBrief");
    if (!host) return;
    const report = reportData("week", tickets);
    const due = report.dueWindows.length;
    const hasRecovered = report.confirmedTotal > 0;
    host.innerHTML = `<button class="week-brief" id="openWeekReport" type="button">
      <span class="week-brief-label">本周回执 · ${escapeHtml(report.info.rangeLabel)}</span>
      <b>${due ? `${due} 件要办` : hasRecovered ? "本周办成了" : "本周暂无到期"}</b>
      <em>${hasRecovered ? `已守住 ${money(report.confirmedTotal)}` : report.dueAmount ? `可争取 ${money(report.dueAmount)}` : "先补一张票"}</em>
      <span class="week-brief-arrow">看报告 ›</span>
    </button>`;
    $("#openWeekReport").addEventListener("click", () => openReport("week"));
  }

  function receiptBackHtml(ticket, nearest) {
    const evidence = ticket.evidence || [];
    const missing = ticket.missing || [];
    const actions = ticket.actions || [];
    const last = actions[actions.length - 1];
    const confirmed = confirmedAmountOf(ticket);
    const predicted = nearest ? (Number(nearest.amount) || Number(ticket.amount) || 0) : 0;
    const progress = derivedProgress(ticket);
    const stage = progress ? (PROGRESS_STAGES.find((item) => item.key === progress.stage) || {}).label || "已记录" : "";
    let council = "尚未合议";
    try {
      const result = PG.agents.run(ticket, { tickets: state.tickets, coupons: state.coupons, points: state.points });
      council = `${result.status}${result.conflict ? " · 有一处冲突" : " · 规则一致"}`;
    } catch {}
    const source = nearest && nearest.source ? nearest.source : "先补齐日期、资格与证据，再生成依据。";
    return `<div class="receipt-face receipt-back" data-face="back" aria-hidden="true" inert>
      <div class="receipt-hero receipt-back-card">
        <div class="receipt-overline receipt-back-head">
          <span>回执背面 · 依据与凭证</span>
          <button class="receipt-flip-btn" type="button" data-flip-action="front" aria-label="翻回回执正面">正面</button>
        </div>
        <dl class="receipt-back-list">
          <div><dt>依据</dt><dd>${escapeHtml(source)}</dd></div>
          <div><dt>证据</dt><dd><b>${evidence.length} 件</b>${missing.length ? ` · <span class="warn">还缺 ${escapeHtml(missing.join("、"))}</span>` : " · 清单已齐"}</dd></div>
          <div><dt>合议</dt><dd>${escapeHtml(council)}</dd></div>
          <div><dt>金额口径</dt><dd>预计 <b>${predicted ? money(predicted) : "待确认"}</b> · 已确认 <b class="ok">${money(confirmed)}</b><br />提交、受理不等于到账。</dd></div>
          <div><dt>归属</dt><dd>${ticket.helper && ticket.helper.forWhom ? `帮 <b>${escapeHtml(ticket.helper.forWhom)}</b> 办${ticket.helper.name ? ` · 代办人 ${escapeHtml(ticket.helper.name)}` : ""}` : "我自己的票"}</dd></div>
          <div><dt>办理进度</dt><dd>${escapeHtml(stage || (last ? outcomeLabel(last.status) : "还没开始"))}${progress && progress.note ? ` · ${escapeHtml(progress.note)}` : ""}</dd></div>
        </dl>
        <div class="receipt-back-foot">
          <button class="btn primary" type="button" data-flip-action="front">翻回正面，继续办</button>
        </div>
        <div class="receipt-foot-links">
          <button class="link-btn" type="button" data-flip-case>看案卷 · 3+1</button>
          <span class="fine">不代提交 · 以原文为准</span>
        </div>
      </div>
    </div>`;
  }

  function bindReceiptFlip(root, ticket) {
    if (!root) return;
    const front = $('[data-face="front"]', root);
    const back = $('[data-face="back"]', root);
    if (!front || !back) return;
    const flip = (toBack) => {
      root.classList.toggle("is-flipped", toBack);
      front.inert = toBack;
      back.inert = !toBack;
      front.setAttribute("aria-hidden", toBack ? "true" : "false");
      back.setAttribute("aria-hidden", toBack ? "false" : "true");
      const focusHost = toBack ? back : front;
      requestAnimationFrame(() => {
        const target = focusHost.querySelector(toBack ? ".receipt-flip-btn" : '[data-flip-action="back"]');
        if (target) target.focus({ preventScroll: true });
      });
    };
    root.querySelectorAll("[data-flip-action]").forEach((button) => {
      button.addEventListener("click", () => flip(button.dataset.flipAction === "back"));
    });
    const caseButton = root.querySelector("[data-flip-case]");
    if (caseButton) caseButton.addEventListener("click", () => openCase(ticket));
  }

  function renderToday() {
    renderStats();
    const allTickets = caseTickets();
    const hasTickets = allTickets.length > 0;
    const hasAudit = !!state.audit;
    const financePre = financeSummaryData();
    const hasFinance = financePre.active.length > 0;
    $("#todayEmpty").classList.toggle("hidden", hasTickets || hasAudit || hasFinance);
    $("#todayContent").classList.toggle("hidden", !hasTickets && !hasAudit && !hasFinance);
    $("#todayDate").textContent = todayLabel();
    if (!hasTickets) {
      $("#familyRail").innerHTML = "";
      $("#weekBrief").innerHTML = "";
      const listTitle = $("#ticketListTitle");
      if (listTitle) listTitle.textContent = "所有票";
      renderFinanceAlert();
      if (!hasAudit) {
        if (!hasFinance) return;
        $("#financeAlert").innerHTML = "";
        const nearest = financePre.nearest;
        $("#todayHeadline").textContent = "钱的事，先办这一件。";
        $("#todaySub").textContent = `${financePre.active.length} 宗资金售后在途，争议金额 ${money(financePre.amount)}。`;
        $("#todayCard").innerHTML = `<div class="receipt-hero">
          <div class="receipt-overline"><span>资金售后 · 本机</span><span>${nearest ? (nearest.due.days < 0 ? "时限已过" : "有时限") : "未填时限"}</span></div>
          <div class="receipt-merchant"><div><b>${money(financePre.amount)}</b><small>争议金额不是可追回金额；${nearest ? `最近一条${nearest.c.type === "chargeback" ? "银行" : "你填"}时限${nearest.due.days < 0 ? `已过 ${-nearest.due.days} 天` : `还剩 ${nearest.due.days} 天`}` : "没有截止日就不猜时限"}。</small></div></div>
          <div class="receipt-foot"><button class="btn primary" id="todayFinanceOpen" type="button">去资金售后，先办最急一宗</button></div>
        </div>`;
        $("#todayStats").innerHTML = `
          <div class="stat warn"><b>${financePre.active.length}</b><span>在途案卷</span></div>
          <div class="stat"><b>${financePre.overdue}</b><span>时限已过</span></div>
          <div class="stat ok"><b>${money(financePre.recovered)}</b><span>已确认解决</span></div>`;
        $("#ticketList").innerHTML = "";
        $("#todayFinanceOpen").addEventListener("click", () => show("finance"));
        return;
      }
      const r = state.audit;
      $("#todayHeadline").textContent = "先把第一张票补上。";
      $("#todaySub").textContent = "体检结果已保存；补一张票，就能算出精确权利。";
      $("#todayCard").innerHTML = `
        <div class="receipt-hero">
          <div class="receipt-overline"><span>票根 · 家庭损失（估算）</span><span>只存本机</span></div>
          <div class="receipt-merchant">
            <div><b>${money(r.total)}</b><small>已损失 ${money(r.lost)} · 将损失 ${money(r.atRisk)} · 可追回 ${money(r.recoverable)}</small></div>
          </div>
          <div class="receipt-foot">
            <button class="btn primary" id="auditImport" type="button">拍一张票，算精确权利</button>
            <button class="link-btn" id="auditOpen" type="button">看体检报告</button>
          </div>
        </div>`;
      $("#todayStats").innerHTML = `
        <div class="stat warn"><b>${money(r.lost)}</b><span>已损失</span></div>
        <div class="stat"><b>${money(r.atRisk)}</b><span>将损失</span></div>
        <div class="stat ok"><b>${money(r.recoverable)}</b><span>可追回</span></div>`;
      $("#ticketList").innerHTML = "";
      $("#auditImport").addEventListener("click", () => show("import"));
      $("#auditOpen").addEventListener("click", () => {
        auditDraft.view = "result";
        auditDraft.answers = state.audit.answers || {};
        show("audit");
      });
      return;
    }

    const families = familySummary(allTickets);
    if (!families.some((member) => member.key === state.familyFilter)) state.familyFilter = "all";
    const active = families.find((member) => member.key === state.familyFilter) || families[0];
    const tickets = familyTickets(allTickets, state.familyFilter);
    renderFamilyRail(families);
    renderWeekBrief(allTickets);
    renderFinanceAlert();
    const listTitle = $("#ticketListTitle");
    if (listTitle) listTitle.textContent = state.familyFilter === "all" ? "所有票" : `${active.label}的票`;

    if (!tickets.length) {
      $("#todayHeadline").textContent = `${active.label}这里还没有票。`;
      $("#todaySub").textContent = "换个家人看看，或把一张票标记给 TA。";
      $("#todayCard").innerHTML = `<div class="receipt-hero">
        <div class="receipt-overline"><span>票根 · 家庭视角</span><span>${escapeHtml(active.label)}</span></div>
        <div class="receipt-merchant"><div><b>暂时空着</b><small>关系只保存在本机；在任意一张票的底部点“帮家人办”即可归属。</small></div></div>
        <div class="receipt-foot"><button class="btn primary" id="watchAll" type="button">看全家的票</button></div>
      </div>`;
      $("#todayStats").innerHTML = `
        <div class="stat"><b>0</b><span>张票</span></div>
        <div class="stat"><b>—</b><span>最近到期</span></div>
        <div class="stat"><b>0</b><span>件要办</span></div>`;
      $("#ticketList").innerHTML = "";
      $("#watchAll").addEventListener("click", () => {
        state.familyFilter = "all";
        renderToday();
      });
      return;
    }

    const ranked = tickets
      .map((ticket) => ({ ticket, win: PG.priority(ticket) }))
      .sort((a, b) => {
        const av = a.win ? a.win.daysLeft : 9999;
        const bv = b.win ? b.win.daysLeft : 9999;
        return av - bv;
      });
    const first = ranked[0];
    const open30 = tickets.filter((t) => (t.windows || []).some((w) => w.applicability === "applicable" && w.daysLeft !== null && w.daysLeft >= 0 && w.daysLeft <= 30)).length;
    const pending = tickets.filter((t) => t.needsConfirm || (t.windows || []).some((w) => w.applicability === "unknown")).length;
    const warranties = tickets.flatMap((t) => (t.windows || []).filter((w) => w.type === "warranty" && w.applicability === "applicable" && w.daysLeft !== null)).sort((a, b) => a.daysLeft - b.daysLeft);

    $("#todayHeadline").textContent = first && first.win
      ? (state.familyFilter === "all" ? "今天先办这一件。" : `${active.label}这 1 件，今天先办。`)
      : "这批票暂时没有快到期的。";
    $("#todaySub").textContent = first && first.win
      ? `${first.win.label} · ${first.win.daysLeft} 天后关闭 · ${first.win.amount ? `可退 ${money(first.win.amount)}` : money(first.ticket.amount)}`
      : "可以先补充证据，或再加一张票。";

    if (first && first.win) {
      const clocks = [
        clockView(first.ticket, ["return", "three_return", "quality"], "补签收日或订单页"),
        clockView(first.ticket, ["price"], "补订单页价保标识"),
        clockView(first.ticket, ["warranty"], "补发票或保修卡")
      ];
      const urgent = first.win.daysLeft !== null && first.win.daysLeft >= 0 && first.win.daysLeft <= 3;
      $("#todayCard").innerHTML = `
        <div class="receipt-flip" data-flip>
          <div class="receipt-face receipt-front" data-face="front" aria-hidden="false">
            <div class="receipt-hero">
              <div class="receipt-overline">
                <span>票根 · 权利回执</span>
                <span class="receipt-overline-right">${urgent ? `<b class="urgent-label">临期</b> · ` : ""}${first.ticket.source === "demo" ? "示例" : "已保存"} · ${escapeHtml(first.ticket.date || "日期待确认")}</span>
              </div>
              <div class="receipt-merchant">
                <div>
                  <b>${escapeHtml(first.ticket.merchant || "商家待确认")}</b>
                  <small>${first.ticket.helper && first.ticket.helper.forWhom ? `帮 ${escapeHtml(first.ticket.helper.forWhom)} 办 · ` : ""}${escapeHtml(first.ticket.product || "这笔订单")}</small>
                </div>
                <span class="receipt-amount">${money(first.ticket.amount)}</span>
              </div>
              <div class="receipt-meta">
                <span>${escapeHtml(first.ticket.date || "购买日待确认")} 购买</span>
                <span>${first.ticket.orderNo ? `订单 ${escapeHtml(String(first.ticket.orderNo).slice(-8))}` : "订单号待确认"}</span>
              </div>
              <div class="clock-list">
                ${clocks.map((c) => `
                  <div class="clock-row ${c.cls}">
                    <span class="clock-label">${c.label}</span>
                    <div class="clock-track"><i style="--p:${c.pct}%"></i><b class="clock-pin" style="--p:${c.pct}%"></b></div>
                    <span class="clock-value">${escapeHtml(c.value)}</span>
                    <span class="clock-note">${escapeHtml(c.note)}</span>
                  </div>`).join("")}
              </div>
              <div class="receipt-foot">
                <button class="btn primary" id="focusAction" type="button">看它还能做什么</button>
                <div class="receipt-foot-links">
                  <button class="link-btn" id="focusCase" type="button">看案卷</button>
                  <button class="link-btn" id="flipFocus" type="button" data-flip-action="back">翻到背面 · 依据与凭证</button>
                </div>
              </div>
            </div>
          </div>
          ${receiptBackHtml(first.ticket, first.win)}
        </div>`;
      $("#focusAction").addEventListener("click", () => openResult(first.ticket, first.win));
      $("#focusCase").addEventListener("click", () => openCase(first.ticket));
      bindReceiptFlip($("#todayCard .receipt-flip"), first.ticket);
    } else {
      const ticket = ranked[0] ? ranked[0].ticket : tickets[0];
      $("#todayCard").innerHTML = `<div class="receipt-flip" data-flip>
        <div class="receipt-face receipt-front" data-face="front" aria-hidden="false">
          <div class="receipt-hero">
            <div class="receipt-overline"><span>票根 · 权利回执</span><span>已保存</span></div>
            <div class="receipt-merchant"><div><b>当前没有快到期的窗口</b><small>已导入 ${tickets.length} 宗案卷；可以先补充证据，或等新的截止日。</small></div></div>
            <div class="receipt-foot">
              <button class="btn primary" id="focusAction" type="button">看这张票的证据</button>
              <div class="receipt-foot-links">
                <button class="link-btn" id="focusCase" type="button">看案卷</button>
                <button class="link-btn" id="flipFocus" type="button" data-flip-action="back">翻到背面 · 依据与凭证</button>
              </div>
            </div>
          </div>
        </div>
        ${receiptBackHtml(ticket, null)}
      </div>`;
      $("#focusAction").addEventListener("click", () => openResult(ticket));
      $("#focusCase").addEventListener("click", () => openCase(ticket));
      bindReceiptFlip($("#todayCard .receipt-flip"), ticket);
    }

    $("#todayStats").innerHTML = `
      <div class="stat ${open30 ? "warn" : ""}"><b>${open30}</b><span>30 天内到期</span></div>
      <div class="stat ok"><b>${warranties.length ? warranties[0].daysLeft : "—"}</b><span>天 · 保修剩余</span></div>
      <div class="stat"><b>${pending}</b><span>待确认</span></div>`;

    $("#ticketList").innerHTML = ranked.map(({ ticket, win }) => {
      const unknown = (ticket.windows || []).find((w) => w.applicability === "unknown");
      const days = win ? win.daysLeft : null;
      const cls = win ? (win.status === "expiring" ? "warn" : win.status === "closed" ? "closed" : "") : unknown ? "pending" : "closed";
      const label = win ? `${win.label} ${days} 天` : unknown ? `${unknown.label} 待确认` : "暂无可用权利";
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

  function agentSymbol(status) {
    return status === "assert" ? "✓" : status === "confirm" ? "◐" : status === "veto" ? "!" : "○";
  }

  function agentStateLabel(status) {
    return status === "assert" ? "一致" : status === "confirm" ? "待确认" : status === "veto" ? "否决" : "弃权";
  }

  function outcomeLabel(status) {
    return status === "acknowledged" ? "已受理 / 待到账"
      : status === "refunded" ? "已到账/已退款"
      : status === "repaired" ? "已修好/已换货"
      : status === "promise" ? "承诺已兑现"
      : status === "rejected" ? "被拒了"
      : status === "abandoned" ? "今天不办了"
      : status || "已记录";
  }

  function openCase(ticket) {
    state.current = ticket;
    show("case");
  }

  function renderCase(ticket) {
    const result = PG.agents.run(ticket, {
      tickets: state.tickets,
      coupons: state.coupons,
      points: state.points
    });
    const missing = ticket.missing || [];
    const evidence = ticket.evidence || [];
    const open = (ticket.windows || []).filter((w) => w.applicability === "applicable" && w.status !== "closed" && w.daysLeft !== null && w.daysLeft >= 0);
    const nearest = PG.priority(ticket) || open[0] || null;
    const actions = ticket.actions || [];
    const confirmed = actions.filter((a) => a.confirmed !== false && ["refunded", "repaired", "promise"].includes(a.status)).reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    const predicted = open.reduce((max, w) => Math.max(max, Number(w.amount) || 0), 0);
    const statusClass = result.status === "已办结" ? "done" : result.status === "进行中" ? "live" : "wait";
    $("#caseTitle").textContent = result.headline;

    const evidenceRows = evidence.map((e) => `
      <div class="case-ev-row">
        <span class="case-ev-type">${escapeHtml(e.type)}</span>
        <span class="case-ev-date">${escapeHtml(String(e.date || ticket.date || "").slice(0, 10))}</span>
        <span class="case-ev-main"><b>${escapeHtml(e.label)}</b><small>${escapeHtml(e.detail || "")}</small></span>
        <span class="case-ev-state ${e.status === "needs" ? "warn" : "ok"}">${e.status === "needs" ? "需确认" : e.confidence ? `${escapeHtml(e.confidence)}%` : "已记录"}</span>
      </div>`).join("") + missing.map((m) => `
      <div class="case-ev-row missing">
        <span class="case-ev-type">${escapeHtml(m)}</span>
        <span class="case-ev-date">—</span>
        <span class="case-ev-main"><b>还缺</b><small>补上后重算期限</small></span>
        <span class="case-ev-state warn">待补</span>
      </div>`).join("");

    const findingOrder = { reader: 0, rule: 1, negotiator: 2, auditor: 3, price: 4, steward: 5 };
    const orderedFindings = [...result.findings].sort((a, b) => (findingOrder[a.id] ?? 9) - (findingOrder[b.id] ?? 9));
    const findingRows = orderedFindings.map((f) => `
      <div class="case-finding ${f.status === "veto" ? "vetoed" : ""}" id="cf-${f.id}">
        <button class="case-finding-btn" type="button" aria-expanded="false" aria-controls="cfp-${f.id}">
          <span class="case-f-name">${escapeHtml(f.name)}</span>
          <span class="case-f-claim">${escapeHtml(f.claim)}</span>
          <span class="case-f-state ${f.status === "assert" ? "ok" : f.status === "confirm" ? "warn" : f.status === "veto" ? "veto" : ""}">${agentStateLabel(f.status)}</span>
        </button>
        <div class="case-finding-panel" id="cfp-${f.id}">
          <p>${escapeHtml(f.detail)}</p>
          <div class="case-basis">${(f.basis || []).map((b) => `<span>${escapeHtml(b)}</span>`).join("")}</div>
        </div>
      </div>`).join("");

    const ladder = `
      <div class="case-step ${ticket.review ? "now" : "done"}"><span class="dot">●</span><b>核对字段</b><span>${ticket.review ? "现在" : "已完成"}</span></div>
      <div class="case-step ${ticket.review ? "" : nearest ? "now" : "done"}"><span class="dot">${ticket.review ? "○" : nearest ? "●" : "●"}</span><b>去办 ${escapeHtml(nearest ? nearest.label : "这件事")}</b><span>${ticket.review ? "待核对" : nearest ? "现在" : "已关闭"}</span></div>
      <div class="case-step ${actions.length ? "done" : ""}"><span class="dot">${actions.length ? "●" : "○"}</span><b>回填结果</b><span>${actions.length ? "已记录" : "待办理"}</span></div>`;

    $("#caseBody").innerHTML = `
      <div class="case-grid">
      <div class="case-col case-col-main">
      <div class="case-head">
        <div class="case-tags">
          <span class="case-tag ${statusClass}">${escapeHtml(result.status)}</span>
          ${nearest ? `<span class="case-tag warn">${escapeHtml(nearest.label)}剩 ${nearest.daysLeft} 天</span>` : ""}
          ${ticket.helper && ticket.helper.forWhom ? `<span class="case-tag">帮 ${escapeHtml(ticket.helper.forWhom)} 办</span>` : ""}
        </div>
        <h2 class="case-merchant">${escapeHtml(ticket.merchant || "商家待确认")}</h2>
        <div class="case-line"><span>${escapeHtml(ticket.product || "商品待确认")}</span><b>${money(ticket.amount)}</b></div>
        <div class="case-meta"><span>${escapeHtml(ticket.date || "日期待确认")}</span><span>案卷 ${escapeHtml(result.caseId)}</span><span>证据 ${evidence.length} 件${missing.length ? ` · 还缺 ${missing.length} 件` : ""}</span></div>
      </div>

      <div class="council-head"><b>3+1 合议</b><span>读票 · 规则 · 陪办 · 审计</span></div>
      <div class="case-consensus" role="group" aria-label="3+1 合议">
        ${orderedFindings.map((f) => `
          <button class="case-agent ${f.status} ${f.id === "price" || f.id === "steward" ? "plugin" : ""}" type="button" data-case-agent="${f.id}" aria-expanded="false" aria-controls="cf-${f.id}">
            <span class="mark" aria-hidden="true">${agentSymbol(f.status)}</span>
            <span class="name">${escapeHtml(f.name.replace("员", ""))}</span>
            <span class="state">${agentStateLabel(f.status)}</span>
          </button>`).join("")}
      </div>
      <p class="council-note">比价、管家为插件；不属辖区时弃权，审计员可否决。</p>

      ${result.conflict ? `
        <div class="case-conflict ${result.conflict.tone === "seal" ? "seal" : ""}">
          <b>${escapeHtml(result.conflict.title)}</b>
          <p>${escapeHtml(result.conflict.body)}</p>
          ${result.conflict.action === "edit" ? `<button class="btn ghost" id="caseConflictEdit" type="button">去改字段</button>` : ""}
        </div>` : `<p class="case-ok-note">规则一致，没有冲突。结论可以进入主行动。</p>`}

      <div class="case-primary">
        <p class="eyebrow">今天先办</p>
        <h2>${escapeHtml(result.primary.label)}</h2>
        <p>${escapeHtml(result.primary.detail)}</p>
        <div class="case-primary-actions">
          <button class="btn primary" id="caseDo" type="button">${result.primary.action === "edit" ? "去核对字段" : result.primary.action === "import" ? "去补一张票" : "去办这件事"}</button>
          <button class="btn ghost" id="caseEdit" type="button">改字段</button>
        </div>
      </div>
      </div>

      <aside class="case-col case-col-side">
      <div class="case-block">
        <div class="case-block-head"><h2>证据</h2><span>${evidence.length} 件${missing.length ? ` · 还缺 ${missing.length} 件` : ""}</span></div>
        <div class="case-evidence">${evidenceRows || `<p class="case-empty">还没有证据。拍一张小票，或手动补三项。</p>`}</div>
      </div>

      <div class="case-block">
        <div class="case-block-head"><h2>3+1 怎么说</h2><span>点一行展开依据</span></div>
        <div class="case-findings">${findingRows}</div>
      </div>
      </aside>

      <div class="case-col case-col-foot">
      <div class="case-block">
        <div class="case-block-head"><h2>动作</h2><span>${actions.length ? "已记录 " + actions.length + " 次" : "还没开始"}</span></div>
        <div class="case-ladder">${ladder}</div>
      </div>

      <div class="case-block">
        <div class="case-block-head"><h2>结果</h2><span>预计与已确认分开</span></div>
        <div class="case-outcome">
          <p>预计 <b>${predicted ? money(predicted) : "待确认"}</b> · 已确认 <b class="ok">${money(confirmed)}</b></p>
          <p>${actions.length ? `最近一次：${escapeHtml(actions[actions.length - 1].label)} · ${escapeHtml(outcomeLabel(actions[actions.length - 1].status))}` : "还没有提交申请。"}</p>
        </div>
      </div>

      <div class="case-footer">
        ${nearest ? `<button class="btn ghost" id="caseRecord" type="button">记录结果</button>` : ""}
        <button class="btn ghost" id="caseBack" type="button">回到今天</button>
        <button class="btn text" id="caseResult" type="button">看这张票的完整结果</button>
      </div>
      </div>
      </div>`;

    $("#caseDo").addEventListener("click", () => {
      if (result.primary.action === "edit") return openCaseEdit(ticket);
      if (result.primary.action === "import") return show("import");
      openAction(ticket, PG.priority(ticket) || open[0]);
    });
    $("#caseEdit").addEventListener("click", () => openCaseEdit(ticket));
    if ($("#caseConflictEdit")) $("#caseConflictEdit").addEventListener("click", () => openCaseEdit(ticket));
    if ($("#caseRecord")) $("#caseRecord").addEventListener("click", () => {
      outcomeSheet(ticket, nearest, "acknowledged", (outcome) => {
        if (outcome.replyImage) {
          ticket.evidence = (ticket.evidence || []).concat([{
            id: uid(), type: "商家回复", label: "回复截图",
            detail: String(outcome.merchantReply || outcome.replyText || "").slice(0, 120),
            confidence: 90, status: "active", dataUrl: outcome.replyImage
          }]);
        }
        if (outcome.proofImage) {
          ticket.evidence = (ticket.evidence || []).concat([{
            id: uid(), type: "到账凭证", label: "到账截图",
            detail: outcome.amount ? `¥${Number(outcome.amount).toFixed(2)}` : "已上传",
            confidence: 90, status: "active", dataUrl: outcome.proofImage
          }]);
        }
        ticket.actions = (ticket.actions || []).concat({
          id: uid(),
          type: nearest.type,
          label: nearest.label,
          status: outcome.status,
          amount: outcome.amount,
          note: outcome.note,
          merchantReply: outcome.merchantReply || "",
          confirmed: outcome.confirmed === true,
          createdAt: new Date().toISOString()
        });
        if (outcome.confirmed === true && ["refunded", "repaired", "promise"].includes(outcome.status)) nearest.status = "closed";
        save();
        renderCase(ticket);
        toast("结果已写回案卷");
      });
    });
    $("#caseBack").addEventListener("click", () => show("today"));
    $("#caseResult").addEventListener("click", () => openResult(ticket, PG.priority(ticket)));

    $$(".case-agent").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.caseAgent;
        const panel = $(`#cf-${id}`);
        const open = button.getAttribute("aria-expanded") === "true";
        $$(".case-agent").forEach((b) => b.setAttribute("aria-expanded", "false"));
        button.setAttribute("aria-expanded", open ? "false" : "true");
        if (panel) panel.classList.toggle("open", !open);
        if (!open && panel) panel.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
      });
    });
    $$(".case-finding-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const item = button.closest(".case-finding");
        const open = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", open ? "false" : "true");
        item.classList.toggle("open", !open);
      });
    });
  }

  function openCaseEdit(ticket) {
    editTicketSheet(ticket, (next) => {
      Object.assign(ticket, next);
      save();
      renderCase(ticket);
      toast("已更新，规则重新合议");
    }, "改字段 · 重算合议");
  }

  function parseIntake(text) {
    const raw = String(text || "").trim();
    const intent = /退款|退货|退钱/.test(raw) ? "return"
      : /换货|换一个|换新/.test(raw) ? "exchange"
      : /保修|维修|坏了|故障|不工作/.test(raw) ? "warranty"
      : /价保|降价|差价|买贵/.test(raw) ? "price"
      : /续费|扣费|会员|订阅/.test(raw) ? "subscription"
      : /券|优惠券/.test(raw) ? "coupon"
      : /积分/.test(raw) ? "point"
      : /用完|补货|耗材|纸巾|洗衣液|猫砂|牙膏/.test(raw) ? "supply"
      : /定金|尾款/.test(raw) ? "deposit"
      : "unknown";
    const category = Object.entries(PG.CATEGORY)
      .filter(([key]) => key !== "other")
      .find(([, item]) => (item.keywords || []).some((kw) => raw.includes(kw)))?.[0] || null;
    const amountMatch = raw.match(/(?:¥|￥)\s*(\d{2,6}(?:\.\d{1,2})?)/) || raw.match(/(\d{2,6}(?:\.\d{1,2})?)\s*(?:元|块)/);
    const amount = amountMatch ? Number(amountMatch[1]) : null;
    let daysAgo = null;
    if (/今天|刚才/.test(raw)) daysAgo = 0;
    else if (/昨天/.test(raw)) daysAgo = 1;
    else if (/前天/.test(raw)) daysAgo = 2;
    else if (/上周/.test(raw)) daysAgo = 7;
    else if (/本周|这周/.test(raw)) daysAgo = 3;
    else if (/上个月|上月/.test(raw)) daysAgo = 30;
    else if (/这个月|本月/.test(raw)) daysAgo = 15;
    let date = null;
    const md = raw.match(/(\d{1,2})月(\d{1,2})日?/);
    if (md) {
      const now = new Date();
      const d = new Date(now.getFullYear(), Number(md[1]) - 1, Number(md[2]));
      if (d > now) d.setFullYear(d.getFullYear() - 1);
      date = d.toISOString().slice(0, 10);
    }
    return { raw, intent, category, amount, daysAgo, date };
  }

  function findIntakeCandidate(parsed) {
    let best = null;
    let bestScore = 0;
    for (const ticket of caseTickets()) {
      let score = 0;
      if (parsed.category && ticket.category === parsed.category) score += 4;
      if (parsed.amount && Number(ticket.amount) && Math.abs(Number(ticket.amount) - parsed.amount) <= Math.max(1, parsed.amount * 0.01)) score += 3;
      if (parsed.date && ticket.date === parsed.date) score += 3;
      if (parsed.daysAgo !== null && ticket.date) {
        const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(ticket.date).getTime()) / 86400000);
        if (Math.abs(days - parsed.daysAgo) <= 1) score += 3;
        else if (Math.abs(days - parsed.daysAgo) <= 3) score += 1;
      }
      const productKey = String(ticket.product || "").replace(/某品牌|某|\s/g, "");
      if (productKey.length >= 2 && parsed.raw.includes(productKey)) score += 3;
      const keywordHit = (PG.CATEGORY[ticket.category]?.keywords || [])
        .filter((kw) => kw.length >= 2 && parsed.raw.includes(kw))
        .some((kw) => String(ticket.product || "").includes(kw));
      if (keywordHit) score += 3;
      if (ticket.merchant && parsed.raw.includes(ticket.merchant)) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = ticket;
      }
    }
    const threshold = (parsed.category || parsed.amount || parsed.date) ? 4 : 3;
    return bestScore >= threshold ? best : null;
  }

  function intakeIntentLabel(intent) {
    return intent === "return" ? "退货"
      : intent === "exchange" ? "换货"
      : intent === "warranty" ? "保修/维修"
      : intent === "price" ? "价保"
      : intent === "deposit" ? "定金"
      : "售后";
  }

  function detectFinanceIntent(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;
    let type = "";
    if (/盗刷|非本人|未授权|半夜.{0,4}(刷|扣)|银行卡.{0,8}(刷|扣|少)|信用卡.{0,8}(刷|扣|少)|拒付|争议交易/.test(raw)) type = "chargeback";
    else if (/保险|保单|犹豫期|退保|保费/.test(raw)) type = "insurance";
    else if (/分期|月供|手续费|年化|利息|贷款|借了|提前还款|还了?\s*\d+\s*期/.test(raw)) type = "installment";
    else if (/预付|储值|健身|美容|教培|洗车|卡里.{0,8}(还有|余额|剩)|余额.{0,8}退|门店.{0,5}(关门|跑路)|迁店|转店/.test(raw)) type = "prepaid";
    else if (/自动续费|连续包月|会员.{0,8}(扣|续费)|忘了取消|忘记取消|免密支付|代扣|又扣了|悄悄扣/.test(raw)) type = "renewal";
    else if (/退款.{0,6}(没|未|不).{0,4}(到|账)|没.{0,4}到账|重复扣|多扣|扣了.{0,3}次|没收到|未收到|货不对板|金额不对|付了.{0,8}(没|未)/.test(raw)) type = "payment";
    if (!type) return null;
    let amount = null;
    const moneyMatches = Array.from(raw.matchAll(/(?:¥|￥)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:元|块)/g));
    if (moneyMatches.length) {
      const last = moneyMatches[moneyMatches.length - 1];
      amount = Number(last[1] || last[2]);
    }
    if (!amount) {
      const balance = raw.match(/(?:余额|还有|卡里|剩)\D{0,8}(\d+(?:\.\d{1,2})?)/);
      if (balance) amount = Number(balance[1]);
    }
    const months = raw.match(/(\d+)\s*个月/);
    const periods = raw.match(/(\d+)\s*期/);
    let issue = "其他";
    if (/重复/.test(raw)) issue = "重复扣款";
    else if (/退款/.test(raw) && /(没|未|不).{0,4}(到|账)/.test(raw)) issue = "退款未到账";
    else if (/(没|未)收到/.test(raw)) issue = "未收到商品/服务";
    else if (/金额|扣多|多扣/.test(raw)) issue = "金额不符";
    else if (/货不对板|不符/.test(raw)) issue = "商品/服务不符";
    const prefill = {
      date: new Date().toISOString().slice(0, 10),
      amount: amount || "",
      notes: raw
    };
    if (type === "payment") {
      prefill.issue = issue;
    } else if (type === "renewal") {
      prefill.notice = /(没|未).{0,3}提醒|没通知/.test(raw) ? "没收到" : "不确定";
      if (months) prefill.unusedMonths = months[1];
    } else if (type === "prepaid") {
      prefill.reason = /七日|7日|七天/.test(raw) ? "付款 7 日内"
        : /迁店|转店/.test(raw) ? "迁店 / 到店明显不便"
        : /关门|跑路|停业/.test(raw) ? "服务无法正常提供"
        : "其他";
    } else if (type === "installment") {
      if (periods) prefill.periods = periods[1];
    } else if (type === "insurance") {
      const days = raw.match(/(\d+)\s*天/);
      if (days) prefill.coolingDays = days[1];
    }
    return { type, raw, amount, prefill };
  }

  function financeIntentSheet(intent, parsed) {
    const def = FINANCE_TYPES[intent.type];
    const dueHint = intent.type === "chargeback"
      ? "银行卡争议不会自动编时限；只有银行/卡组织给了截止日，才倒计时。"
      : intent.type === "insurance"
        ? "犹豫期以保单约定为准；你可以在下一步填写合同天数。"
        : "截止日由你填写；没有就不猜。";
    openSheet("这更像资金售后", `
      <div class="intake-found finance-intake-found">
        <p class="eyebrow">${escapeHtml(def.label)} · 先确认</p>
        <h2>${escapeHtml(intent.raw.slice(0, 36) || def.label)}</h2>
        <p>${escapeHtml(def.desc)}</p>
        <p class="note">${escapeHtml(dueHint)}</p>
        <div class="intake-detected">
          <span>金额</span><b>${intent.amount ? money(intent.amount) : "待填"}</b>
          <span>下一步</span><b>建一宗资金案卷</b>
        </div>
        <div class="sheet-actions">
          <button class="btn primary" id="financeIntentYes" type="button">建资金案卷</button>
          ${intent.type === "renewal" ? `<button class="btn ghost" id="financeIntentSubs" type="button">先看已导入的订阅</button>` : ""}
          <button class="btn ghost" id="financeIntentNo" type="button">不是，按消费售后找</button>
        </div>
      </div>`, () => {
      $("#financeIntentYes").addEventListener("click", () => {
        closeSheet();
        openFinanceBuilder(intent.type, intent.prefill);
      });
      if ($("#financeIntentSubs")) $("#financeIntentSubs").addEventListener("click", () => {
        closeSheet();
        openSubsSheet();
      });
      $("#financeIntentNo").addEventListener("click", () => {
        closeSheet();
        intakeNoMatchSheet(parsed);
      });
    });
  }

  function runIntake(text) {
    const parsed = parseIntake(text);
    if (!parsed.raw) {
      toast("先说一句要办什么");
      return;
    }
    const financeIntent = detectFinanceIntent(parsed.raw);
    if (financeIntent) return financeIntentSheet(financeIntent, parsed);
    if (parsed.intent === "subscription") return openSubsSheet();
    if (parsed.intent === "coupon") return openCouponSheet();
    if (parsed.intent === "point") return openPointsSheet();
    if (parsed.intent === "supply") return openSupplySheet(assetSummary().supplies);
    const candidate = findIntakeCandidate(parsed);
    if (candidate) return intakeConfirmSheet(candidate, parsed);
    return intakeNoMatchSheet(parsed);
  }

  function intakeConfirmSheet(ticket, parsed) {
    const nearest = PG.priority(ticket);
    openSheet("找到了，先确认", `
      <div class="intake-found">
        <p class="eyebrow">${escapeHtml(intakeIntentLabel(parsed.intent))} · 案卷 ${escapeHtml(PG.agents.caseId(ticket))}</p>
        <h2>${escapeHtml(ticket.merchant || "商家待确认")}</h2>
        <p>${escapeHtml(ticket.product || "商品待确认")} · ${money(ticket.amount)} · ${escapeHtml(ticket.date || "日期待确认")}</p>
        <p class="note">${nearest ? `${escapeHtml(nearest.label)} ${nearest.daysLeft} 天后关闭；` : ""}先确认是不是这一笔，再往下办。</p>
        <div class="sheet-actions">
          <button class="btn primary" id="intakeYes" type="button">是这一笔</button>
          <button class="btn ghost" id="intakeNo" type="button">不是</button>
          <button class="btn ghost" id="intakeManual" type="button">手动填</button>
        </div>
      </div>`, () => {
      $("#intakeYes").addEventListener("click", () => { closeSheet(); openCase(ticket); });
      $("#intakeNo").addEventListener("click", () => { closeSheet(); intakeNoMatchSheet(parsed); });
      $("#intakeManual").addEventListener("click", () => { closeSheet(); show("import"); setTimeout(() => $('[data-source="manual"]')?.click(), 80); });
    });
  }

  function intakeNoMatchSheet(parsed) {
    openSheet("没找到对应的票", `
      <p class="sheet-empty">没找到“${escapeHtml(parsed.raw.slice(0, 40))}”对应的票。可以拍一张，或手动填三项。</p>
      <div class="sheet-actions">
        <button class="btn primary" id="intakeCamera" type="button">拍一张</button>
        <button class="btn ghost" id="intakeManual2" type="button">手动填</button>
        <button class="btn ghost" id="intakeCancel" type="button">算了</button>
      </div>`, () => {
      $("#intakeCamera").addEventListener("click", () => { closeSheet(); $("#fileCamera").click(); });
      $("#intakeManual2").addEventListener("click", () => { closeSheet(); show("import"); setTimeout(() => $('[data-source="manual"]')?.click(), 80); });
      $("#intakeCancel").addEventListener("click", closeSheet);
    });
  }

  function intakeSheet() {
    openSheet("说一句，直接立案", `
      <form id="intakeSheetForm">
        <label for="intakeSheetText">要办什么？</label>
        <input id="intakeSheetText" type="text" autocomplete="off" placeholder="例如：我上周买的空气炸锅坏了，商家不给退" />
        <p class="note">也可以说：会员连续扣了 7 个月 / 银行卡半夜被刷 1200 / 健身房关门卡里还有 3000 / 贷款每期 900 还 12 期</p>
        <div class="sheet-actions">
          <button class="btn primary" id="intakeSheetGo" type="button">立案</button>
          <button class="btn ghost" id="intakeSheetCancel" type="button">取消</button>
        </div>
      </form>`, () => {
      $("#intakeSheetGo").addEventListener("click", () => {
        const text = $("#intakeSheetText").value;
        closeSheet();
        runIntake(text);
      });
      $("#intakeSheetCancel").addEventListener("click", closeSheet);
      $("#intakeSheetText").focus();
    });
  }

  function renderCases() {
    const host = $("#casesBody");
    const tickets = caseTickets();
    if (!tickets.length) {
      host.innerHTML = `
        <div class="empty" style="min-height:60dvh">
          <div class="empty-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6V3Z"/><path d="M14 3v5h5"/><path d="M9 12h6M9 16h4"/></svg>
          </div>
          <p class="eyebrow">还没有案卷</p>
          <h1>拍一张票，<br />或者直接说一句。</h1>
          <p class="lede">每宗案卷会把证据、期限、动作和结果放在一起，办到哪一步一眼能看到。</p>
          <button class="btn primary" id="casesImport" type="button">去立案</button>
        </div>`;
      $("#casesImport").addEventListener("click", () => show("import"));
      return;
    }
    host.innerHTML = tickets.map((ticket) => {
      const result = PG.agents.run(ticket, { tickets: state.tickets, coupons: state.coupons, points: state.points });
      const nearest = PG.priority(ticket);
      const abstain = result.findings.filter((f) => f.status === "abstain").length;
      const stateClass = result.status === "已办结" ? "done" : result.status === "进行中" ? "live" : "wait";
      return `<button class="case-list-item" type="button" data-case="${ticket.id}">
        <div class="case-list-top"><b>${escapeHtml(ticket.merchant || "商家待确认")}</b><span>${money(ticket.amount)}</span></div>
        <div class="case-list-sub">${escapeHtml(ticket.product || "商品待确认")} · ${escapeHtml(ticket.date || "日期待确认")} · 证据 ${(ticket.evidence || []).length} 件</div>
        <div class="case-list-foot">
          <span class="case-list-state ${stateClass}">${escapeHtml(result.status)}</span>
          <span>${nearest ? `${escapeHtml(nearest.label)} ${nearest.daysLeft} 天` : "暂无截止日"}</span>
          <span>${abstain ? `${abstain} 方弃权` : result.conflict ? "有冲突" : "规则一致"}</span>
        </div>
      </button>`;
    }).join("");
    $$("[data-case]").forEach((button) => {
      button.addEventListener("click", () => {
        const ticket = state.tickets.find((t) => t.id === button.dataset.case);
        if (ticket) openCase(ticket);
      });
    });
  }

  function detectSupplies(tickets) {
    const groups = new Map();
    for (const ticket of (tickets || [])) {
      if (!ticket.product || !ticket.date) continue;
      if (ticket.noSupply) continue;
      if (/会员|订阅|月费|服务/.test(String(ticket.product))) continue;
      const key = String(ticket.product).replace(/\s+/g, "").replace(/某品牌|某/g, "").toLowerCase();
      if (key.length < 2) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(ticket);
    }
    const out = [];
    for (const rows of groups.values()) {
      if (rows.length < 2) continue;
      rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const gaps = [];
      for (let i = 1; i < rows.length; i += 1) {
        const gap = Math.round((new Date(rows[i].date) - new Date(rows[i - 1].date)) / 86400000);
        if (gap >= 7 && gap <= 365) gaps.push(gap);
      }
      if (!gaps.length) continue;
      const avgDays = Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length);
      const last = rows[rows.length - 1];
      const next = new Date(last.date);
      next.setDate(next.getDate() + avgDays);
      const daysLeft = Math.ceil((next - new Date().setHours(0, 0, 0, 0)) / 86400000);
      out.push({ name: last.product, merchant: last.merchant, count: rows.length, avgDays, next: next.toISOString().slice(0, 10), daysLeft, amount: last.amount });
    }
    return out.sort((a, b) => a.daysLeft - b.daysLeft);
  }

  function assetSummary() {
    const rights = [];
    for (const ticket of caseTickets()) {
      for (const win of (ticket.windows || [])) {
        if (win.status !== "closed" && win.daysLeft !== null && win.daysLeft >= 0) rights.push({ ticket, win });
      }
    }
    rights.sort((a, b) => a.win.daysLeft - b.win.daysLeft);
    const subs = PG.detectSubscriptions(state.tickets || []).map((sub) => {
      const next = new Date(sub.lastDate);
      next.setDate(next.getDate() + sub.lastGap);
      return { ...sub, next: next.toISOString().slice(0, 10), daysLeft: Math.ceil((next - new Date().setHours(0, 0, 0, 0)) / 86400000) };
    });
    const coupons = (state.coupons || [])
      .map((coupon) => ({ ...coupon, days: couponDays(coupon) }))
      .filter((coupon) => coupon.days !== null)
      .sort((a, b) => a.days - b.days);
    const points = (state.points || []).slice().sort((a, b) => String(a.expiresAt || "").localeCompare(String(b.expiresAt || "")));
    const supplies = detectSupplies(state.tickets || []);
    const residual = caseTickets().filter((ticket) => ["appliance", "digital", "furniture", "auto"].includes(ticket.category));
    return { rights, subs, coupons, points, supplies, residual };
  }

  function renderAssets() {
    const summary = assetSummary();
    const nextSub = summary.subs[0];
    const nextCoupon = summary.coupons[0];
    const nextPoint = summary.points[0];
    const nextSupply = summary.supplies[0];
    const rows = [
      {
        key: "right",
        label: "权利",
        value: summary.rights.length ? `${summary.rights.length} 件` : "0 件",
        meta: summary.rights.length ? `最近：${summary.rights[0].win.label} ${summary.rights[0].win.daysLeft} 天后关闭` : "还没有快到期的权利"
      },
      {
        key: "subscription",
        label: "订阅",
        value: summary.subs.length ? `${summary.subs.length} 项` : "0 项",
        meta: nextSub ? `年支出 ${money(nextSub.yearly)} · 下次约 ${nextSub.next}` : "还没有识别到周期扣款"
      },
      {
        key: "coupon",
        label: "券",
        value: summary.coupons.length ? `${summary.coupons.length} 张` : "0 张",
        meta: nextCoupon ? `最近 ${nextCoupon.days} 天后到期 · ${nextCoupon.name}` : "还没有登记券"
      },
      {
        key: "point",
        label: "积分",
        value: summary.points.length ? `${summary.points.reduce((sum, p) => sum + (Number(p.balance) || 0), 0).toLocaleString("zh-CN")} 分` : "0 分",
        meta: nextPoint ? `最近 ${nextPoint.expiresAt || "未填到期"} · ${nextPoint.platform}` : "还没有登记积分"
      },
      {
        key: "supply",
        label: "耗材",
        value: summary.supplies.length ? `${summary.supplies.length} 件` : "0 件",
        meta: nextSupply ? `${nextSupply.name} 约 ${Math.max(0, nextSupply.daysLeft)} 天后补货` : "导入两笔同一商品的订单就能估算"
      },
      {
        key: "residual",
        label: "残值",
        value: summary.residual.length ? `${summary.residual.length} 件` : "0 件",
        meta: summary.residual.length ? "买入价与使用时长已记录；参考区间待接入" : "还没有耐用品"
      }
    ];
    const urgent = summary.rights.filter((item) => item.win.daysLeft <= 7).length
      + summary.coupons.filter((coupon) => coupon.days <= 7).length
      + summary.supplies.filter((supply) => supply.daysLeft <= 7).length;
    $("#assetsBody").innerHTML = `
      <p class="lede">六类会过期、会贬值、会被忘记的东西。不是每笔付款都要立案，但每笔都可以进资产。</p>
      <div class="asset-strip">
        <div><b>${urgent}</b><span>7 天内要处理</span></div>
        <div><b>${summary.rights.length}</b><span>未关闭权利</span></div>
        <div><b>${summary.subs.length + summary.coupons.length + summary.supplies.length}</b><span>周期资产</span></div>
      </div>
      <div class="asset-list">
        ${rows.map((row) => `
          <button class="asset-row" type="button" data-asset="${row.key}">
            <span class="asset-name">${row.label}</span>
            <span class="asset-value">${row.value}</span>
            <span class="asset-meta">${escapeHtml(row.meta)}</span>
            <span class="asset-chev" aria-hidden="true">›</span>
          </button>`).join("")}
      </div>
      <p class="note">金额只在本机计算；券、积分、耗材都不登录抓取，只用手动记录或账单复购估算。</p>`;

    $$("[data-asset]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.asset;
        if (key === "right") return openRightsSheet(summary.rights);
        if (key === "subscription") return openSubsSheet();
        if (key === "coupon") return openCouponSheet();
        if (key === "point") return openPointsSheet();
        if (key === "supply") return openSupplySheet(summary.supplies);
        if (key === "residual") return openResidualSheet(summary.residual);
      });
    });
  }

  function openRightsSheet(rights) {
    if (!rights.length) {
      openSheet("权利", `<p class="sheet-empty">还没有未关闭的权利。拍一张带购买日期的票，或导入订单。</p>`);
      return;
    }
    const body = `<div class="asset-sheet-list">${rights.map((item) => `
      <button class="asset-sheet-row" type="button" data-right="${item.ticket.id}">
        <span><b>${escapeHtml(item.ticket.merchant)}</b><small>${escapeHtml(item.win.label)} · ${escapeHtml(item.win.end || "日期待确认")}</small></span>
        <em>${item.win.daysLeft} 天</em>
      </button>`).join("")}</div>`;
    openSheet("权利 · 还没关闭", body, () => {
      $$("[data-right]").forEach((button) => {
        button.addEventListener("click", () => {
          const ticket = state.tickets.find((t) => t.id === button.dataset.right);
          closeSheet();
          if (ticket) openCase(ticket);
        });
      });
    });
  }

  function openSupplySheet(supplies) {
    if (!supplies.length) {
      openSheet("耗材", `<p class="sheet-empty">还没有复购记录。导入两笔同一商品的订单，就能按真实间隔估算下次大概什么时候用完。</p>`);
      return;
    }
    const body = `<div class="asset-sheet-list">${supplies.map((item) => `
      <div class="asset-sheet-row static">
        <span><b>${escapeHtml(item.name)}</b><small>约每 ${item.avgDays} 天买一次 · 上次 ${escapeHtml(item.merchant || "")}</small></span>
        <em>${Math.max(0, item.daysLeft)} 天后</em>
      </div>`).join("")}</div>
      <p class="note">按复购间隔估算，不判断你家每天用多少；大促囤货会让估算偏晚。</p>`;
    openSheet("耗材 · 按复购估算", body);
  }

  function openResidualSheet(residual) {
    if (!residual.length) {
      openSheet("残值", `<p class="sheet-empty">还没有耐用品。家电、数码、家具、汽车会出现在这里。</p>`);
      return;
    }
    const body = `<div class="asset-sheet-list">${residual.map((ticket) => {
      const days = ticket.date ? Math.max(0, Math.round((Date.now() - new Date(ticket.date).getTime()) / 86400000)) : null;
      return `<div class="asset-sheet-row static">
        <span><b>${escapeHtml(ticket.product || ticket.merchant)}</b><small>${escapeHtml(ticket.merchant)} · 买入 ${money(ticket.amount)}${days !== null ? ` · 已用 ${days} 天` : ""}</small></span>
        <em>参考待接入</em>
      </div>`;
    }).join("")}</div>
      <p class="note">残值需要同款成交数据；没有数据源就不编区间。V1 接入二手成交参考后再给价格。</p>`;
    openSheet("残值 · 耐用品", body);
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
    const deposit = ticket.deposit || {};
    const totalSeed = Math.round(Number(deposit.total) || seed);
    const paidSeed = Math.round(Number(deposit.paid) || seed);
    let side = deposit.breach === "buyer" ? "self" : "counter";
    host.classList.remove("hidden");
    host.innerHTML = `
      <div class="calc-head">
        <h2>定金怎么算</h2>
        <p>《民法典》第五百八十六条：定金不得超过合同标的额的 20%，超过部分不产生定金效力。</p>
      </div>
      <div class="calc-grid">
        <label>合同总额<input id="calcTotal" type="number" inputmode="decimal" min="0" step="100" value="${totalSeed}" /></label>
        <label>已付定金<input id="calcPaid" type="number" inputmode="decimal" min="0" step="100" value="${paidSeed}" /></label>
      </div>
      <div class="calc-seg" role="group" aria-label="谁违约">
        <button type="button" data-side="counter" class="${side === "counter" ? "on" : ""}">商家违约</button>
        <button type="button" data-side="self" class="${side === "self" ? "on" : ""}">我违约</button>
      </div>
      <div class="calc-out" id="calcOut" aria-live="polite"></div>`;

    const total = $("#calcTotal");
    const paid = $("#calcPaid");
    const out = $("#calcOut");
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

  function windowProgress(w) {
    if (!w || !w.start || !w.end || w.daysLeft === null) return 0;
    const start = new Date(String(w.start).replace(/\./g, "-"));
    const end = new Date(String(w.end).replace(/\./g, "-"));
    const total = Math.max(1, Math.round((end - start) / 86400000));
    return Math.max(0, Math.min(100, Math.round((1 - w.daysLeft / total) * 100)));
  }

  function renderResult(ticket) {
    const applicable = (ticket.windows || []).filter((w) => w.applicability === "applicable" && w.status !== "closed" && w.daysLeft !== null && w.daysLeft >= 0);
    const unknown = (ticket.windows || []).filter((w) => w.applicability === "unknown");
    const actionable = applicable;
    const nearest = PG.priority(ticket);
    $("#resultTitle").textContent = actionable.length
      ? `权利回执 · ${actionable.length} 件能办`
      : unknown.length
        ? `权利回执 · ${unknown.length} 件待确认`
        : "权利回执 · 暂无可主张";
    $("#resultSub").textContent = actionable.length
      ? (unknown.length ? `${unknown.length} 件待确认：先补证据，再判断。` : "金额与日期由规则计算，证据可逐条核对。")
      : (unknown.length ? "先补截止日或证据，票根不猜。" : "这张票暂时没有可主张的权利。");
    $("#resultTicket").innerHTML = `
      <div class="receipt-overline"><span>权利回执</span><span>${ticket.source === "demo" ? "示例" : "已保存"}</span></div>
      <div class="receipt-top"><div><b>${escapeHtml(ticket.merchant)}</b><div class="receipt-meta">${escapeHtml(ticket.date || "日期待确认")} · ${escapeHtml(PG.CATEGORY[ticket.category]?.label || "其他")}</div></div><div class="amt">${money(ticket.amount)}</div></div>
      <div class="receipt-no"><span>${escapeHtml(ticket.orderNo || "CP—" + ticket.id.slice(0, 6).toUpperCase())}</span><span>${ticket.source === "demo" ? "示例" : "已保存"}</span></div>
      ${ticket.warranty ? `<div class="warranty-line">保修至 ${escapeHtml(ticket.warranty.until || "未填")}${ticket.warranty.phone ? ` · 售后 ${escapeHtml(ticket.warranty.phone)}` : ""}${ticket.warranty.model ? ` · ${escapeHtml(ticket.warranty.model)}` : ""}</div>` : ""}
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
        ticket.ocrError = null;
        if (!ticket.needsConfirm) ticket.review = false;
        ticket.windows = PG.buildWindows(ticket).map((w) => ({ ...w, id: uid() }));
        save();
        renderResult(ticket);
        toast("已更新，期限重新算了");
      });
    });

    $("#resultWindows").innerHTML = (ticket.windows || []).map((w) => {
      const na = w.applicability === "not_applicable";
      const width = na ? 0 : windowProgress(w);
      const cls = na ? "not-applicable" : w.status === "expiring" ? "warn" : w.status === "closed" ? "closed" : w.status === "unknown" ? "unknown" : "";
      const value = na ? "不适用" : w.status === "closed" ? "已关闭" : w.daysLeft === null ? "待确认" : `${w.daysLeft} 天`;
      return `<div class="window ${cls}">
        <div class="window-top"><b>${escapeHtml(w.label)}</b><span><b>${value}</b></span></div>
        <p>${escapeHtml(w.source)}${w.end && !na ? ` · 截止 ${escapeHtml(w.end)}` : ""}${w.basis && w.basis.url ? ` · <a href="${escapeHtml(w.basis.url)}" target="_blank" rel="noopener noreferrer">查看原文</a>` : ""}</p>
        ${w.details ? `<p class="window-note">${escapeHtml(w.details)}</p>` : ""}
        ${w.note ? `<p class="window-note">${escapeHtml(w.note)}</p>` : ""}
        ${na ? "" : `<div class="window-bar"><i style="width:${width}%"></i></div>`}
      </div>`;
    }).join("");

    renderDeposit(ticket);
    renderTax(ticket);

    const banner = $("#reviewBanner");
    if (banner) {
      if (ticket.ocrError) {
        banner.innerHTML = `<div class="review-banner"><b>识别没完成</b><span>${escapeHtml(ticket.ocrError)}。先手动填商家、金额、日期三项。</span><button class="link-btn" id="reviewFix" type="button">手动填</button></div>`;
        $("#reviewFix").onclick = () => { const b = $("#editTicket"); if (b) b.click(); };
      } else if (ticket.review) {
        banner.innerHTML = `<div class="review-banner"><b>OCR 置信度偏低</b><span>金额、日期请核对后再用</span><button class="link-btn" id="reviewPrecise" type="button">精确模式</button><button class="link-btn" id="reviewFix" type="button">改字段</button></div>`;
        $("#reviewFix").onclick = () => { const b = $("#editTicket"); if (b) b.click(); };
        $("#reviewPrecise").onclick = async () => {
          if (!state.lastFile) { toast("这张票没有原图，手动改字段即可"); return; }
          try {
            showParse("精确模式", "重新加载完整中文模型，比快速模式更准，但要多下一些数据。");
            const text = await ocrPrecise(state.lastFile);
            if (!text || text.trim().length < 4) throw new Error("还是没读到文字");
            const fresh = parseReceipt(text, state.lastFile.name || "receipt", 95);
            Object.assign(ticket, fresh, { id: ticket.id, actions: ticket.actions || [], helper: ticket.helper || null, source: ticket.source });
            save();
            renderResult(ticket);
            toast("已用精确模型重新识别");
          } catch (err) {
            toast("精确模式失败：" + (err.message || "换个文件试试"));
            renderResult(ticket);
          }
        };
      } else {
        banner.innerHTML = "";
      }
    }

    $("#resultEvidence").innerHTML = `<h2>证据</h2>` + (ticket.evidence || []).map((e) => `
      <div class="evidence-item">
        <span class="ev-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14H7V3Z"/><path d="M14 3v5h5"/></svg></span>
        <div class="ev-main"><b>${escapeHtml(e.type)} · ${escapeHtml(e.label)}</b><small>${escapeHtml(e.detail || "")}</small>${e.dataUrl ? `<img class="ev-thumb" src="${escapeHtml(e.dataUrl)}" alt="${escapeHtml(e.label)}" />` : ""}</div>
        <span class="${e.status === "needs" ? "ev-need" : "ev-ok"}">${e.status === "needs" ? "需确认" : e.confidence ? `${e.confidence}%` : "已记录"}</span>
      </div>`).join("") + (ticket.missing || []).map((m) => `<div class="evidence-item"><span class="ev-ico">+</span><div class="ev-main"><b>还缺 ${escapeHtml(m)}</b><small>补上后重算保修/承诺</small></div><span class="ev-need">待补</span></div>`).join("");

    $("#resultActions").innerHTML = `
      <button class="btn primary" id="goAction" type="button">${nearest ? `去办：${escapeHtml(nearest.label)}` : "补充证据"}</button>
      <button class="btn ghost" id="materialPack" type="button">材料包</button>
      ${nearest && nearest.end ? `<button class="btn ghost" id="toCalendar" type="button">加到日历</button>` : ""}
      ${nearest ? `<button class="btn ghost" id="writeComplaint" type="button">写投诉</button>` : ""}
      ${(ticket.windows || []).some((w) => w.type === "price") ? `<button class="btn ghost" id="capturePrice" type="button">拍当前价</button>` : ""}
      <button class="btn ghost" id="addEvidence" type="button">加一条证据</button>
      ${["appliance","digital","furniture","auto"].indexOf(ticket.category) >= 0 ? `<button class="btn ghost" id="editWarranty" type="button">保修卡</button>` : ""}
      ${(ticket.windows || []).some((w) => w.basis) ? `<button class="btn ghost" id="toShareCard" type="button">生成分享图</button>` : ""}
      ${(ticket.windows || []).some((w) => w.applicability !== "applicable") ? `<button class="btn ghost" id="fixEligibility" type="button">补资格 / 改条件</button>` : ""}
      <button class="btn ghost" id="viewCase" type="button">看案卷 · 3+1 合议</button>
      <button class="btn ghost" id="financeFromTicket" type="button">退款没到 / 走资金售后</button>
      <button class="btn ghost" id="backToday" type="button">回到今天</button>
      <button class="link-btn" id="deleteTicket" type="button">删除这张票</button>`;
    if ($("#toCalendar")) $("#toCalendar").addEventListener("click", () => addToCalendar(ticket, nearest));
    if ($("#materialPack")) $("#materialPack").addEventListener("click", () => exportMaterialPack(ticket, nearest));
    if ($("#capturePrice")) $("#capturePrice").addEventListener("click", () => captureCurrentPrice(ticket));
    if ($("#addEvidence")) $("#addEvidence").addEventListener("click", () => openEvidenceSheet(ticket));
    if ($("#toShareCard")) $("#toShareCard").addEventListener("click", () => shareCard(ticket));
    if ($("#writeComplaint")) $("#writeComplaint").addEventListener("click", () => openComplaintSheet(ticket, nearest));
    if ($("#editWarranty")) $("#editWarranty").addEventListener("click", () => openWarrantySheet(ticket));
    if ($("#fixEligibility")) $("#fixEligibility").addEventListener("click", () => openEligibilitySheet(ticket));
    if ($("#viewCase")) $("#viewCase").addEventListener("click", () => openCase(ticket));
    if ($("#financeFromTicket")) $("#financeFromTicket").addEventListener("click", () => {
      openFinanceBuilder("payment", {
        merchant: ticket.merchant || "",
        amount: ticket.amount || "",
        date: ticket.date || new Date().toISOString().slice(0, 10),
        channel: ticket.channel || "alipay",
        issue: ticket.progress && ["accepted", "refund_pending", "refunding"].includes(ticket.progress.stage) ? "退款未到账" : "商品/服务不符",
        notes: `从票据 ${ticket.orderNo || ticket.id} 转入资金售后；先核对退款/到账流水。`,
        linkedTicketId: ticket.id
      });
    });
    $("#goAction").addEventListener("click", () => {
      if (nearest) openAction(ticket, nearest);
      else openEligibilitySheet(ticket);
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
    renderTimeline(ticket);
    renderProgress(ticket);
  }

  function couponDays(c) {
    const d = new Date(c.expiresAt);
    if (Number.isNaN(d.getTime())) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.ceil((d - today) / 86400000);
  }

  function openFamilySheet() {
    const tickets = caseTickets();
    const families = familySummary(tickets);
    if (!families.length) {
      toast("先加一张票，再分给家人");
      return;
    }
    let current = Math.max(0, families.findIndex((member) => member.key === state.familyFilter));
    if (!families[current]) current = 0;
    let swipeStart = null;

    const openTicket = (id) => {
      const ticket = state.tickets.find((item) => item.id === id);
      if (!ticket) return;
      closeSheet();
      openResult(ticket, PG.priority(ticket));
    };

    const editTicket = (id) => {
      const ticket = state.tickets.find((item) => item.id === id);
      if (!ticket) return;
      openHelperSheet(ticket, () => openFamilySheet());
    };

    const renderPicker = () => {
      const rows = tickets.slice()
        .sort((a, b) => {
          const ad = deadlineOf(a).win;
          const bd = deadlineOf(b).win;
          return (ad ? ad.daysLeft : 9999) - (bd ? bd.daysLeft : 9999);
        })
        .map((ticket) => {
          const member = memberNameOf(ticket) || "我";
          const due = deadlineOf(ticket).win;
          return `<div class="family-ticket-row">
            <button class="family-ticket-main" type="button" data-pick="${ticket.id}">
              <b>${escapeHtml(ticket.merchant)}</b>
              <span>${escapeHtml(ticket.product || "这笔订单")} · ${money(ticket.amount)}</span>
              <em>${escapeHtml(member)}${due ? ` · ${due.daysLeft} 天` : ""}</em>
            </button>
          </div>`;
        }).join("");
      $("#sheetTitle").textContent = "标记一张票给家人";
      $("#sheetBody").innerHTML = `<p class="sheet-hint">选一张票，再填“帮谁办”。关系只保存在本机，不会上传。</p>
        ${rows}
        <div class="sheet-actions" style="margin-top:12px"><button class="btn ghost" id="familyPickerBack" type="button">返回家庭</button></div>`;
      $$("#sheetBody [data-pick]").forEach((button) => button.addEventListener("click", () => editTicket(button.dataset.pick)));
      $("#familyPickerBack").addEventListener("click", () => openFamilySheet());
    };

    const render = () => {
      const active = families[current];
      const activeTickets = familyTickets(tickets, active.key)
        .slice()
        .sort((a, b) => {
          const ad = deadlineOf(a).win;
          const bd = deadlineOf(b).win;
          return (ad ? ad.daysLeft : 9999) - (bd ? bd.daysLeft : 9999);
        });
      const cards = families.map((member, index) => {
        const depth = (index - current + families.length) % families.length;
        const visible = depth < 3;
        const tx = depth === 0 ? 0 : depth === 1 ? -14 : 14;
        const ty = depth * 10;
        const rot = depth === 0 ? 0 : depth === 1 ? -2.8 : 2.8;
        const scale = 1 - depth * 0.035;
        const fill = member.recovered + member.amount ? Math.min(100, Math.round((member.recovered / (member.recovered + member.amount)) * 100)) : 0;
        const next = member.next;
        return `<button class="family-deck-card ${depth === 0 ? "active" : ""}" type="button"
          data-family-go="${index}" aria-label="切到 ${escapeHtml(member.label)}"
          style="--tx:${tx}px;--ty:${ty}px;--rot:${rot}deg;--scale:${scale};--z:${10 - depth};--op:${visible ? 1 - depth * 0.1 : 0};visibility:${visible ? "visible" : "hidden"}">
          <span class="fd-top"><span class="fd-name">${escapeHtml(member.label)}</span><span class="fd-count">${member.count} 张</span></span>
          <span class="fd-meta">
            <span class="${member.urgent ? "hot" : ""}">${member.urgent ? `${member.urgent} 件 7 天内` : "7 天内无到期"}</span>
            <span>${next ? `${next.win.label} ${next.win.daysLeft} 天` : "暂无截止日"}</span>
          </span>
          <span class="fd-money">
            <b>${member.amount ? money(member.amount) : member.recovered ? money(member.recovered) : "—"}</b>
            <small>${member.recovered ? `已守住 ${money(member.recovered)}` : "可争取 · 估算"}</small>
          </span>
          <span class="fd-line"><i style="--fill:${fill}%"></i></span>
        </button>`;
      }).join("");
      const dots = families.map((member, index) => `<i class="${index === current ? "on" : ""}"></i>`).join("");
      const chips = families.map((member, index) => `<button class="${index === current ? "on" : ""}" type="button" data-family-go="${index}" aria-pressed="${index === current}">${escapeHtml(member.label)} · ${member.count}</button>`).join("");
      const rows = activeTickets.map((ticket) => {
        const due = deadlineOf(ticket);
        const member = memberNameOf(ticket) || "我";
        return `<div class="family-ticket-row">
          <button class="family-ticket-main" type="button" data-open="${ticket.id}">
            <b>${escapeHtml(ticket.merchant)}</b>
            <span>${escapeHtml(ticket.product || "这笔订单")} · ${money(ticket.amount)}</span>
            <em>${due.win ? `${due.win.label} ${due.win.daysLeft} 天` : "暂无截止日"}</em>
          </button>
          <button class="family-ticket-edit" type="button" data-edit="${ticket.id}" aria-label="改这张票的归属">${escapeHtml(member)} · 改</button>
        </div>`;
      }).join("");
      $("#sheetTitle").textContent = "家庭权利";
      $("#sheetBody").innerHTML = `
        <p class="family-sheet-summary">全家 <b>${families[0].count} 张票</b> · <b>${families[0].urgent} 件</b> 7 天内到期 · 可争取 <b>${money(families[0].amount)}</b>（估算）</p>
        <div class="family-deck" id="familyDeck" aria-label="家庭成员卡片，可左右滑动">${cards}</div>
        <div class="family-deck-dots" aria-hidden="true">${dots}</div>
        <div class="family-member-chips">${chips}</div>
        <div class="family-sheet-actions">
          <button class="btn primary" id="familyView" type="button">${active.key === "all" ? "看全家的票" : `只看${escapeHtml(active.label)}的票`}</button>
          <button class="btn ghost" id="familyAssign" type="button">标记一张票</button>
        </div>
        <div class="report-section-head" style="margin-top:4px"><h2>${active.key === "all" ? "全家在办的票" : `${escapeHtml(active.label)}在办的票`}</h2><span>${activeTickets.length} 张</span></div>
        <div class="family-ticket-list">${rows || `<p class="sheet-hint">这里还没有票。</p>`}</div>
        <p class="annual-note">只在本机保存“帮谁办”的关系；这不是共享账户，也不会把票据发给家人。长辈模式可在设置里打开。</p>`;

      const go = (index) => {
        current = (index + families.length) % families.length;
        render();
      };
      $$("#sheetBody [data-family-go]").forEach((button) => button.addEventListener("click", () => {
        const index = Number(button.dataset.familyGo);
        if (index !== current) go(index);
      }));
      $$("#sheetBody [data-open]").forEach((button) => button.addEventListener("click", () => openTicket(button.dataset.open)));
      $$("#sheetBody [data-edit]").forEach((button) => button.addEventListener("click", () => editTicket(button.dataset.edit)));
      $("#familyView").addEventListener("click", () => {
        state.familyFilter = active.key;
        closeSheet();
        show("today");
        toast(active.key === "all" ? "已回到全家视角" : `已只看 ${active.label} 的票`);
      });
      $("#familyAssign").addEventListener("click", renderPicker);

      const deck = $("#familyDeck");
      if (deck) {
        deck.addEventListener("pointerdown", (event) => { swipeStart = event.clientX; });
        deck.addEventListener("pointercancel", () => { swipeStart = null; });
        deck.addEventListener("pointerup", (event) => {
          if (swipeStart === null) return;
          const dx = event.clientX - swipeStart;
          swipeStart = null;
          if (Math.abs(dx) < 34) return;
          go(current + (dx < 0 ? 1 : -1));
        });
        deck.addEventListener("keydown", (event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            go(current + (event.key === "ArrowRight" ? 1 : -1));
          }
        });
      }
    };

    $("#sheetOverlay").hidden = false;
    $("#toast").classList.remove("show");
    render();
  }

  function openPointsSheet() {
    const rows = (state.points || []).slice()
      .sort((a, b) => String(a.expiresAt || "9999").localeCompare(String(b.expiresAt || "9999")))
      .map((p) => `<div class="coupon-row">
        <b>${escapeHtml(p.platform)}</b>
        <span>${Number(p.balance) || 0} 分${p.expiresAt ? ` · ${escapeHtml(p.expiresAt)} 到期` : " · 长期有效"}</span>
        <em>${Number(p.balance) || 0}</em>
        <button class="link-btn" data-delp="${p.id}" type="button">删</button>
      </div>`).join("");
    const total = (state.points || []).reduce((s, p) => s + (Number(p.balance) || 0), 0);
    $("#sheetTitle").textContent = "积分台账";
    $("#sheetBody").innerHTML = `
      <p class="sheet-hint">把各平台积分记进来，共 ${(state.points || []).length} 项、合计 ${total} 分。积分不通用，这里只做台账和到期提醒。</p>
      ${rows || `<p class="annual-note">还没有记录。</p>`}
      <div class="coupon-form">
        <input id="ptPlatform" placeholder="平台，如 某航司 / 某商超" />
        <input id="ptBalance" type="number" inputmode="numeric" placeholder="积分余额" />
        <input id="ptExp" type="date" />
        <button class="btn ghost" id="ptAdd" type="button">加入台账</button>
      </div>
      <div class="sheet-actions"><button class="btn ghost" id="closePoints" type="button">关闭</button></div>`;
    $("#sheetOverlay").hidden = false;
    $("#closePoints").onclick = closeSheet;
    $("#ptAdd").onclick = () => {
      const platform = $("#ptPlatform").value.trim();
      const balance = Number($("#ptBalance").value) || 0;
      if (!platform || !balance) { toast("平台和积分填一下"); return; }
      state.points.push({ id: uid(), platform, balance, expiresAt: $("#ptExp").value || "" });
      savePoints(); renderSettings(); openPointsSheet();
      toast("已加入台账");
    };
    $("#sheetBody").querySelectorAll("[data-delp]").forEach((btn) => {
      btn.onclick = () => {
        state.points = state.points.filter((p) => p.id !== btn.dataset.delp);
        savePoints(); renderSettings(); openPointsSheet();
      };
    });
  }

  function openCouponSheet() {
    const list = (state.coupons || []).slice().sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));
    const rows = list.map((c) => {
      const days = couponDays(c);
      const cls = days === null ? "" : days < 0 ? "gone" : days <= 7 ? "soon" : "";
      const tip = days === null ? "" : days < 0 ? "已过期" : `${days} 天后到期`;
      return `<div class="coupon-row ${cls}">
        <b>${escapeHtml(c.name)}</b>
        <span>${escapeHtml(c.merchant || "")}${c.amount ? ` · ${money(c.amount)}` : ""} · ${escapeHtml(c.expiresAt || "")}</span>
        <em>${tip}</em>
        <button class="link-btn" data-del="${c.id}" type="button">删</button>
      </div>`;
    }).join("");
    $("#sheetTitle").textContent = "券包";
    $("#sheetBody").innerHTML = `
      ${list.length ? rows : `<p class="sheet-hint">还没有券。把快到期的券记进来，票根按到期日排好。</p>`}
      <div class="coupon-form">
        <input id="cpName" placeholder="券名，如 满199减30" />
        <input id="cpMerchant" placeholder="商家（可留空）" />
        <input id="cpAmount" type="number" inputmode="decimal" placeholder="面额" />
        <input id="cpExp" type="date" />
        <button class="btn ghost" id="cpAdd" type="button">加入券包</button>
      </div>
      <div class="sheet-actions"><button class="btn ghost" id="closeCoupons" type="button">关闭</button></div>`;
    $("#sheetOverlay").hidden = false;
    $("#closeCoupons").onclick = closeSheet;
    $("#cpAdd").onclick = () => {
      const name = $("#cpName").value.trim();
      const exp = $("#cpExp").value;
      if (!name || !exp) { toast("券名和到期日填一下"); return; }
      state.coupons.push({ id: uid(), name, merchant: $("#cpMerchant").value.trim(), amount: Number($("#cpAmount").value) || 0, expiresAt: exp });
      saveCoupons();
      renderSettings();
      openCouponSheet();
      toast("已加入券包");
    };
    $("#sheetBody").querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        state.coupons = state.coupons.filter((c) => c.id !== btn.dataset.del);
        saveCoupons(); renderSettings(); openCouponSheet();
      };
    });
  }

  async function shrinkImage(file, max, quality) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(bmp.width * scale);
    cv.height = Math.round(bmp.height * scale);
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise((res) => cv.toBlob((b) => res(b), "image/jpeg", quality));
  }

  function openWarrantySheet(ticket) {
    const w = ticket.warranty || {};
    $("#sheetTitle").textContent = "保修卡";
    $("#sheetBody").innerHTML = `
      <p class="sheet-hint">填一次，之后办保修直接出示。照片会压缩后存在本机。</p>
      <div class="coupon-form">
        <input id="wrBrand" placeholder="品牌" value="${escapeHtml(w.brand || "")}" />
        <input id="wrModel" placeholder="型号" value="${escapeHtml(w.model || "")}" />
        <input id="wrUntil" type="date" value="${escapeHtml(w.until || "")}" />
        <input id="wrPhone" placeholder="售后电话" value="${escapeHtml(w.phone || "")}" />
      </div>
      <label class="field"><span>备注</span><input id="wrNote" placeholder="如：整机 3 年、主要部件 5 年" value="${escapeHtml(w.note || "")}" /></label>
      ${fileRow("保修卡照片（可选，1 张）", "wrPhoto")}
      ${w.photo ? `<p class="annual-note">已存一张保修卡照片。</p>` : ""}
      <div class="sheet-actions">
        <button class="btn primary" id="wrSave" type="button">保存</button>
        <button class="btn ghost" id="wrClose" type="button">关闭</button>
      </div>`;
    $("#sheetOverlay").hidden = false;
    $("#wrClose").onclick = closeSheet;
    $("#wrSave").onclick = async () => {
      const next = {
        brand: $("#wrBrand").value.trim(),
        model: $("#wrModel").value.trim(),
        until: $("#wrUntil").value || "",
        phone: $("#wrPhone").value.trim(),
        note: $("#wrNote").value.trim(),
        photo: w.photo || ""
      };
      const file = $("#wrPhoto").files && $("#wrPhoto").files[0];
      if (file) {
        try {
          const blob = await shrinkImage(file, 720, 0.55);
          next.photo = await new Promise((res) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result || ""));
            fr.readAsDataURL(blob);
          });
        } catch (e) { toast("照片处理失败，其余信息仍会保存"); }
      }
      ticket.warranty = next;
      ticket.warrantyUntil = next.until || "";
      ticket.warrantyBrand = next.brand || "";
      ticket.windows = PG.buildWindows(ticket).map((w) => ({ ...w, id: uid() }));
      try { save(); } catch (e) { toast("本机存储空间不足，照片可能没存下"); }
      closeSheet();
      if ($('[data-screen="case"]').classList.contains("on")) renderCase(ticket);
      else renderResult(ticket);
      toast("保修卡已保存");
    };
  }

  function openEligibilitySheet(ticket) {
    const pp = ticket.priceProtection || {};
    const catalog = PG.catalogFor(ticket);
    const brand = PG.brandFor(ticket);
    const depositCase = ticket.category === "renovation" || ticket.category === "prepaid" || ticket.deposit;
    const showPrice = !depositCase;
    const showReturn = !depositCase && ((PG.CHANNEL[ticket.channel] || {}).online || !!catalog);
    const showWarranty = ["appliance", "digital", "furniture", "auto"].includes(ticket.category);
    const showDeposit = ticket.category === "renovation" || ticket.deposit;
    const body = `
      <p class="sheet-hint">先判资格，再算天数。没有确认的字段不会生成倒计时。</p>
      ${showPrice ? `<div class="elig-block">
        <h3>价保</h3>
        ${field("订单页有价保标识吗？", "ppMark", pp.hasMark || "unknown", "select", [["unknown", "不确定，先拍订单页"], ["yes", "有"], ["no", "没有"]])}
        ${field("订单页写的价保截止日", "ppDeadline", pp.deadline || "", "date")}
        ${field("当前同款价格", "currentPrice", ticket.priceCheck && ticket.priceCheck.price || "", "number")}
        <label class="check-item"><input id="f-sameModel" type="checkbox" ${ticket.priceCheck && ticket.priceCheck.sameModel ? "checked" : ""} /><span>我确认：同一商家、同一商品、同一规格</span></label>
        <p class="annual-note">没有价保标识时，不生成价保倒计时；当前价必须由你确认同款。</p>
      </div>` : ""}
      ${showReturn ? `<div class="elig-block">
        <h3>退货 / 三包</h3>
        ${field("签收日（线上无理由从这天算）", "receivedDate", ticket.receivedDate || "", "date")}
        ${field("发票日（三包从这天算）", "invoiceDate", ticket.invoiceDate || ticket.date || "", "date")}
        ${field("商品问题", "issue", ticket.issue || "", "select", [["", "暂不确定"], ["quality", "质量问题 / 性能故障"], ["other", "其他 / 无质量问题"]])}
        <label class="check-item"><input id="f-noReasonException" type="checkbox" ${ticket.noReasonException ? "checked" : ""} /><span>属于无理由退货例外（定制 / 鲜活 / 拆封音像软件 / 报刊 / 确认不宜退货）</span></label>
      </div>` : ""}
      ${showWarranty ? `<div class="elig-block">
        <h3>保修</h3>
        <p class="annual-note">${catalog ? `在目录：${escapeHtml(catalog.name)}，整机 ${catalog.wholeYears} 年${catalog.mainYears ? `，主要部件 ${catalog.mainYears} 年` : ""}` : "不在 18 类三包目录，按品牌/商家保修承诺。"}</p>
        ${catalog
          ? field("坏的是整机还是主要部件？", "warrantyPart", ticket.warrantyPart || "", "select", [["", "不确定"], ["whole", "整机"], ["main", "主要部件"]])
          : field("品牌保修截止日（如有）", "warrantyUntil", ticket.warrantyUntil || "", "date")}
        ${brand ? `<p class="annual-note">品牌售后：<a href="${escapeHtml(brand.serviceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(brand.brand)}官方服务</a></p>` : ""}
      </div>` : ""}
      ${showDeposit ? `<div class="elig-block">
        <h3>定金</h3>
        ${field("合同总额", "depositTotal", ticket.deposit && ticket.deposit.total || "", "number")}
        ${field("已付定金", "depositPaid", ticket.deposit && ticket.deposit.paid || "", "number")}
        ${field("谁违约", "depositBreach", ticket.deposit && ticket.deposit.breach || "seller", "select", [["seller", "商家违约"], ["buyer", "我违约"], ["none", "不可归责 / 协商解决"]])}
      </div>` : ""}
      <button class="btn primary" id="eligSave" type="button">保存并重算</button>`;
    openSheet("先判资格，再算天数", body, () => {
      $("#eligSave").addEventListener("click", () => {
        if ($("#f-ppMark")) {
          const mark = $("#f-ppMark").value;
          const deadline = $("#f-ppDeadline").value;
          ticket.priceProtection = {
            hasMark: mark,
            deadline: mark === "yes" ? deadline : "",
            note: mark === "yes" ? "订单页价保，截止日由用户确认" : mark === "no" ? "订单页无价保标识" : "待确认"
          };
        }
        const currentPrice = Number($("#f-currentPrice") && $("#f-currentPrice").value || 0);
        if (currentPrice > 0) {
          ticket.priceCheck = {
            sameModel: !!$("#f-sameModel").checked,
            model: ticket.product || "",
            price: currentPrice,
            date: new Date().toISOString().slice(0, 10),
            source: "user"
          };
        }
        if ($("#f-receivedDate")) ticket.receivedDate = $("#f-receivedDate").value;
        if ($("#f-invoiceDate")) ticket.invoiceDate = $("#f-invoiceDate").value;
        if ($("#f-issue")) ticket.issue = $("#f-issue").value;
        if ($("#f-noReasonException")) ticket.noReasonException = $("#f-noReasonException").checked;
        if ($("#f-warrantyPart")) ticket.warrantyPart = $("#f-warrantyPart").value;
        if ($("#f-warrantyUntil")) ticket.warrantyUntil = $("#f-warrantyUntil").value;
        if ($("#f-depositTotal")) {
          ticket.deposit = {
            total: Number($("#f-depositTotal").value) || 0,
            paid: Number($("#f-depositPaid").value) || 0,
            breach: $("#f-depositBreach").value
          };
        }
        const hasDate = ticket.date || ticket.invoiceDate || ticket.receivedDate;
        ticket.missing = [["商家", ticket.merchant], ["金额", ticket.amount], ["日期", hasDate], ["商品", ticket.product]]
          .filter(([, value]) => !value)
          .map(([label]) => label);
        ticket.windows = PG.buildWindows(ticket).map((w) => ({ ...w, id: uid() }));
        save();
        closeSheet();
        if ($('[data-screen="case"]').classList.contains("on")) renderCase(ticket);
        else renderResult(ticket);
        toast("资格已更新，期限重新算了");
      });
    });
  }

  function captureCurrentPrice(ticket) {
    let image = (ticket.priceCheck && ticket.priceCheck.image) || "";
    const body = `
      <p class="sheet-hint">拍当前商品页，识别同款价格，再由你确认。没有当前价，就不算差价。</p>
      ${fileRow("当前商品页截图", "priceShot")}
      <button class="btn ghost" id="priceOcr" type="button">识别当前价</button>
      <div class="field"><label for="f-priceValue">当前价</label><input id="f-priceValue" type="number" inputmode="decimal" value="${escapeHtml(ticket.priceCheck && ticket.priceCheck.price || "")}" /></div>
      <label class="check-item"><input id="f-priceSame" type="checkbox" ${ticket.priceCheck && ticket.priceCheck.sameModel ? "checked" : ""} /><span>我确认：与订单是同一商家、同一商品、同一规格</span></label>
      <p class="annual-note" id="priceOcrNote">识别结果只作草稿；型号/规格对不上就弃权，不拿相似款凑数。</p>
      <div class="sheet-actions">
        <button class="btn primary" id="priceSave" type="button">保存当前价</button>
        <button class="btn ghost" id="priceCancel" type="button">取消</button>
      </div>`;
    openSheet("拍当前价", body, () => {
      $("#priceCancel").addEventListener("click", closeSheet);
      $("#priceOcr").addEventListener("click", async () => {
        const file = $("#priceShot").files && $("#priceShot").files[0];
        if (!file) { toast("先选一张当前商品页截图"); return; }
        try {
          const extracted = await ocrQuick(file);
          const price = parsePriceText(extracted.text);
          if (price) $("#f-priceValue").value = price;
          $("#priceOcrNote").textContent = price
            ? `识别到 ¥${price.toFixed(2)}；请确认同款后再保存。`
            : "没认出价格，请手动填。原图会留在证据里。";
          image = await new Promise((resolve) => {
            shrinkImage(file, 900, 0.6).then((blob) => {
              const fr = new FileReader();
              fr.onload = () => resolve(String(fr.result || ""));
              fr.readAsDataURL(blob);
            }).catch(() => resolve(""));
          });
        } catch (e) {
          toast("识别失败，手动填当前价");
        }
      });
      $("#priceSave").addEventListener("click", () => {
        const price = Number($("#f-priceValue").value);
        if (!price || price <= 0) { toast("先填当前价"); return; }
        const same = !!$("#f-priceSame").checked;
        ticket.priceCheck = {
          sameModel: same,
          model: ticket.product || "",
          price,
          date: new Date().toISOString().slice(0, 10),
          source: "current-screenshot"
        };
        if (image) {
          ticket.evidence = (ticket.evidence || []).concat([{
            id: uid(),
            type: "当前价",
            label: "当前商品页",
            detail: `¥${price.toFixed(2)} · 同款${same ? "已确认" : "未确认"}`,
            confidence: 90,
            status: "active",
            dataUrl: image
          }]);
        }
        ticket.windows = PG.buildWindows(ticket).map((w) => ({ ...w, id: uid() }));
        save();
        closeSheet();
        renderResult(ticket);
        toast("当前价已保存");
      });
    });
  }

  function openEvidenceSheet(ticket) {
    const body = `
      <p class="sheet-hint">补一张真正能用的证据：故障、包装、聊天、保修卡都可以。图片只存本机。</p>
      ${field("证据类型", "evType", "故障照片", "select", [["故障照片", "故障照片/视频截图"], ["订单截图", "订单/支付截图"], ["聊天记录", "聊天记录"], ["包装/吊牌", "包装/吊牌/赠品"], ["保修卡", "保修卡/发票"], ["其他", "其他"]])}
      ${fileRow("选择图片", "evFile")}
      ${field("备注（可选）", "evNote", "", "text", "例如：开机 10 分钟仍不制冷")}
      <div class="sheet-actions">
        <button class="btn primary" id="evSave" type="button">保存证据</button>
        <button class="btn ghost" id="evCancel" type="button">取消</button>
      </div>`;
    openSheet("加一条证据", body, () => {
      $("#evCancel").addEventListener("click", closeSheet);
      $("#evSave").addEventListener("click", async () => {
        const file = $("#evFile").files && $("#evFile").files[0];
        if (!file) { toast("先选一张图片"); return; }
        try {
          const blob = await shrinkImage(file, 900, 0.6);
          const dataUrl = await new Promise((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result || ""));
            fr.readAsDataURL(blob);
          });
          const type = $("#f-evType").value;
          ticket.evidence = (ticket.evidence || []).concat([{
            id: uid(),
            type,
            label: file.name || type,
            detail: String($("#f-evNote").value || "").trim(),
            confidence: 90,
            status: "active",
            dataUrl
          }]);
          ticket.windows = PG.buildWindows(ticket).map((w) => ({ ...w, id: uid() }));
          save();
          closeSheet();
          renderResult(ticket);
          toast("证据已保存");
        } catch (e) {
          toast("图片处理失败，换一张试试");
        }
      });
    });
  }

  function subNextDate(sub) {
    const d = new Date(sub && sub.lastDate);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + (Number(sub.lastGap) || 30));
    return d;
  }

  function icsText(value) {
    return String(value == null ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function exportSubsCalendar(subs) {
    const withNext = (subs || []).map((sub) => ({ sub, next: subNextDate(sub) })).filter((x) => x.next);
    if (!withNext.length) { toast("还没有可推算的扣费日"); return; }
    const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const events = withNext.map(({ sub, next }) => {
      const day = next.toISOString().slice(0, 10).replace(/-/g, "");
      return [
        "BEGIN:VEVENT",
        `UID:piaogen-sub-${encodeURIComponent(sub.merchant)}-${day}@local`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${day}`,
        `SUMMARY:${icsText(`预计扣费 · ${sub.merchant} ${money(sub.avg)}`)}`,
        `DESCRIPTION:${icsText(`按最近 ${sub.count} 次扣款间隔（约 ${sub.lastGap || 30} 天）推算，仅作提醒；是否续费、实际金额与日期以平台账单和 App 内为准。`)}`,
        "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${icsText(`${sub.merchant} 预计明天扣费`)}`, "END:VALARM",
        "END:VEVENT"
      ].join("\r\n");
    }).join("\r\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Piaogen//V0//CN", "CALSCALE:GREGORIAN", events, "END:VCALENDAR"];
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "piaogen-subs.ics";
    a.click();
    URL.revokeObjectURL(url);
    toast(`已生成 ${withNext.length} 条扣费提醒`);
  }

  function exportSubsChecklist(subs) {
    if (!subs || !subs.length) { toast("还没有可导出的周期扣款"); return; }
    const lines = [
      "票根 · 家人扣费检查清单",
      "=======================",
      `生成日期：${new Date().toISOString().slice(0, 10)}`,
      "用途：拿这份清单和爸妈逐项核对；票根不登录、不代关闭。",
      ""
    ];
    subs.forEach((sub, index) => {
      const next = subNextDate(sub);
      const path = PG.portalFor({ type: "subscription" }, { channel: sub.channel });
      lines.push(
        `${index + 1}. ${sub.merchant}`,
        `   金额：约 ${money(sub.avg)}/月，合计约 ${money(sub.yearly)}/年`,
        `   上次扣款：${sub.lastDate ? new Date(sub.lastDate).toISOString().slice(0, 10) : "待确认"}${next ? `；预计下次：${next.toISOString().slice(0, 10)} 前后` : ""}`,
        `   关闭路径：${path.label}：${(path.path || []).join(" → ")}`,
        "   要问家人：扣款前有没有收到提醒？提醒里有没有扣款时间、金额和取消途径？",
        ""
      );
    });
    lines.push(
      "判定说明",
      "- 同一商家、金额波动不超过 5%、间隔 25–35 天、连续至少 2 次，才会被识别为周期扣款。",
      "- 2026-04-10 起，自动续期/自动扣款每次扣款前都应显著提醒时间、金额、取消途径；没做到可作沟通依据，但不等于自动退款。",
      "- 预计日期按历史间隔推算，只作提醒；以平台账单和 App 内为准。",
      "- 本清单只含商家、金额和路径，不含卡号、订单号、手机号和地址。"
    );
    const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "piaogen-subs-checklist.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast("已生成检查清单");
  }

  function openSubsSheet() {
    const subs = PG.detectSubscriptions(state.tickets || []);
    const total = subs.reduce((s, x) => s + x.yearly, 0);
    const rows = subs.map((s) => {
      const path = PG.portalFor({ type: "subscription" }, { channel: s.channel });
      const next = subNextDate(s);
      const lastDay = s.lastDate ? new Date(s.lastDate).toISOString().slice(0, 10) : "";
      const nextDay = next ? next.toISOString().slice(0, 10) : "";
      return `<div class="sub-row">
        <b>${escapeHtml(s.merchant)}</b>
        <span>${money(s.avg)}/月 · 连续 ${s.count} 次${s.lastGap ? ` · 间隔约 ${s.lastGap} 天` : ""}</span>
        <em>${money(s.yearly)}/年</em>
        ${nextDay ? `<small>上次 ${lastDay} · 预计下次 ${nextDay} 前后</small>` : ""}
        <small>${escapeHtml(path.label)}：${escapeHtml((path.path || []).join(" → "))}</small>
      </div>`;
    }).join("");
    $("#sheetTitle").textContent = "自动续费体检";
    $("#sheetBody").innerHTML = subs.length
      ? `<p class="sheet-hint">从你导入的账单里找出来的周期性扣款，共 ${subs.length} 项，合计约 <b>${money(total)}/年</b>。</p>
         ${rows}
         <p class="annual-note">判定规则：同一商家、金额波动不超过 5%、相邻扣款间隔 25–35 天、连续至少 2 次。下次扣费日按历史间隔推算，只作提醒；是否续费、实际金额与日期以账单和 App 内为准。</p>
         <div class="sheet-actions"><button class="btn primary" id="subsCal" type="button">写入日历</button><button class="btn ghost" id="subsList" type="button">导出检查清单</button><button class="btn ghost" id="subsBill" type="button">去粘账单</button><button class="btn ghost" id="closeSubs" type="button">关闭</button></div>`
      : `<p class="sheet-hint">还没有发现周期性扣款。</p>
         <p class="annual-note">先从支付宝或微信账单里复制一段（至少包含同一个商家连续两个月的扣款），粘贴到「导入 → 粘贴账单」，再回来体检。</p>
         <div class="sheet-actions"><button class="btn primary" id="subsBill" type="button">去粘账单</button><button class="btn ghost" id="closeSubs" type="button">关闭</button></div>`;
    $("#sheetOverlay").hidden = false;
    if ($("#closeSubs")) $("#closeSubs").onclick = closeSheet;
    if ($("#subsBill")) $("#subsBill").onclick = () => { closeSheet(); openBill(); };
    if ($("#subsCal")) $("#subsCal").onclick = () => exportSubsCalendar(subs);
    if ($("#subsList")) $("#subsList").onclick = () => exportSubsChecklist(subs);
  }

  function openComplaintSheet(ticket, win) {
    let variant = "12315";
    const render = () => {
      const c = PG.complaintFor(ticket, win, variant);
      $("#sheetTitle").textContent = "写投诉";
      $("#sheetBody").innerHTML = `
        <div class="seg" role="group" aria-label="投诉版本">
          <button type="button" data-v="12315" class="${variant === "12315" ? "on" : ""}">12315</button>
          <button type="button" data-v="12345" class="${variant === "12345" ? "on" : ""}">12345</button>
          <button type="button" data-v="platform" class="${variant === "platform" ? "on" : ""}">平台介入</button>
          <button type="button" data-v="heimao" class="${variant === "heimao" ? "on" : ""}">黑猫</button>
        </div>
        <div class="checks">
          ${c.checks.map((x) => `<span class="${x.ok ? "ok" : "no"}">${x.ok ? "✓" : "○"} ${escapeHtml(x.label)}</span>`).join("")}
        </div>
        <details class="escalation">
          <summary>被拒了，怎么升级</summary>
          <ol>
            <li>先要书面理由：让商家 / 平台说明拒绝依据和对应条款。</li>
            <li>平台内二次申诉：换人工客服，附订单、聊天、流水。</li>
            <li>12315 / 12345：用上面的模板；12345 会转市场监管部门。</li>
            <li>网站或 App 服务：可加投<a href="https://ts.isc.org.cn/" target="_blank" rel="noopener noreferrer">互联网信息服务投诉平台</a>。</li>
            <li>金额大或涉及人身：保留证据，咨询调解 / 诉讼；票根不代提交。</li>
          </ol>
        </details>
        <pre class="complaint-body" id="complaintBody">${escapeHtml(c.body)}</pre>
        <div class="sheet-actions">
          <button class="btn primary" id="copyComplaint" type="button">复制全文</button>
          <button class="btn ghost" id="closeComplaint" type="button">关闭</button>
        </div>`;
      $("#sheetBody").querySelectorAll("[data-v]").forEach((btn) => {
        btn.onclick = () => { variant = btn.dataset.v; render(); };
      });
      $("#copyComplaint").onclick = async () => {
        const text = $("#complaintBody").textContent;
        try {
          await navigator.clipboard.writeText(text);
          toast("已复制，去 12315 / 平台 / 黑猫粘贴");
        } catch (e) {
          const ta = document.createElement("textarea");
          ta.value = text; document.body.appendChild(ta); ta.select();
          document.execCommand("copy"); document.body.removeChild(ta);
          toast("已复制");
        }
      };
      $("#closeComplaint").onclick = closeSheet;
    };
    render();
    $("#sheetOverlay").hidden = false;
  }

  function shareCard(ticket) {
    const W = 1080, H = 1440;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = "#0A0E0F"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#9DF0C2"; g.fillRect(0, 0, W, 12);
    g.fillStyle = "#9DF0C2"; g.beginPath(); g.arc(110, 116, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#06110C"; g.font = '700 30px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("票", 96, 128);
    g.fillStyle = "#F1F7F4"; g.font = '700 38px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("票根", 162, 126);
    g.fillStyle = "#82918D"; g.font = '400 20px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("消费权利回执", 162, 156);
    g.textAlign = "right";
    g.fillStyle = "#82918D"; g.font = '400 18px "Space Grotesk","Consolas",monospace';
    g.fillText(ticket.date || "日期待确认", W - 88, 126);
    g.textAlign = "left";
    g.strokeStyle = "#273234"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(88, 204); g.lineTo(W - 88, 204); g.stroke();

    g.fillStyle = "#B6C4C0"; g.font = '400 22px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("商家", 88, 260);
    g.fillStyle = "#F1F7F4"; g.font = '600 44px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    let merchantText = String(ticket.merchant || "商家待确认");
    while (merchantText.length > 4 && g.measureText(merchantText).width > W - 176) {
      merchantText = merchantText.slice(0, -1);
    }
    if (merchantText !== String(ticket.merchant || "商家待确认")) merchantText = merchantText.slice(0, -1) + "…";
    g.fillText(merchantText, 88, 316);
    g.fillStyle = "#9DF0C2"; g.font = '600 76px "Space Grotesk","Consolas",monospace';
    g.fillText(money(ticket.amount), 88, 410);
    g.fillStyle = "#82918D"; g.font = '400 22px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText(`${ticket.date || "日期待确认"} · ${PG.CATEGORY[ticket.category]?.label || "其他"}`, 88, 452);

    const wins = (ticket.windows || []).filter((w) => w.applicability === "applicable" && w.daysLeft !== null && w.daysLeft >= 0).slice(0, 3);
    const nearest = wins[0];
    if (nearest) {
      const urgent = nearest.daysLeft <= 3;
      const color = urgent ? "#FF715B" : "#9DF0C2";
      const pct = Math.max(0.04, Math.min(1, windowProgress(nearest) / 100));
      g.strokeStyle = "#273234"; g.lineWidth = 16;
      g.beginPath(); g.arc(190, 630, 92, -Math.PI / 2, Math.PI * 1.5); g.stroke();
      g.strokeStyle = color;
      g.beginPath(); g.arc(190, 630, 92, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); g.stroke();
      g.fillStyle = "#F1F7F4"; g.textAlign = "center";
      g.font = '600 64px "Space Grotesk","Consolas",monospace';
      g.fillText(String(nearest.daysLeft), 190, 640);
      g.fillStyle = "#82918D"; g.font = '400 18px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
      g.fillText("天", 190, 670);
      g.textAlign = "left";
      g.fillStyle = urgent ? "#FF715B" : "#9DF0C2";
      g.font = '500 20px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
      g.fillText(urgent ? "临期" : "最急的一项", 330, 590);
      g.fillStyle = "#F1F7F4"; g.font = '600 36px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
      g.fillText(nearest.label, 330, 640);
      g.fillStyle = "#B6C4C0"; g.font = '400 22px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
      g.fillText(nearest.end ? `到 ${nearest.end} 关闭` : "截止日待确认", 330, 680);
      g.fillStyle = "#9DF0C2"; g.font = '600 30px "Space Grotesk","Consolas",monospace';
      g.fillText(nearest.amount ? `可退 ${money(nearest.amount)}` : "先补证据再算", 330, 724);
    } else {
      g.fillStyle = "#B6C4C0"; g.font = '400 30px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
      g.fillText("暂时没有可主张的权利；先补资格或证据。", 88, 620);
    }

    g.strokeStyle = "#273234"; g.beginPath(); g.moveTo(88, 790); g.lineTo(W - 88, 790); g.stroke();
    const rights = (ticket.windows || []).filter((w) => ["return", "price", "warranty", "three_return", "quality"].includes(w.type)).slice(0, 3);
    rights.forEach((w, i) => {
      const y = 850 + i * 92;
      g.fillStyle = "#B6C4C0"; g.font = '500 24px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
      g.fillText(w.label, 88, y);
      const pct = w.applicability === "not_applicable" ? 0 : Math.max(0.03, Math.min(1, windowProgress(w) / 100));
      g.fillStyle = "#273234"; g.fillRect(330, y - 12, 500, 5);
      g.fillStyle = w.daysLeft !== null && w.daysLeft <= 3 ? "#FF715B" : "#9DF0C2";
      g.fillRect(330, y - 12, 500 * pct, 5);
      g.textAlign = "right";
      g.fillStyle = w.applicability === "not_applicable" ? "#82918D" : (w.daysLeft !== null && w.daysLeft <= 3 ? "#FF715B" : "#F1F7F4");
      g.font = '600 22px "Space Grotesk","Consolas",monospace';
      g.fillText(w.applicability === "not_applicable" ? "不适用" : w.daysLeft === null ? "待确认" : `${w.daysLeft} 天`, W - 88, y);
      g.textAlign = "left";
    });
    g.strokeStyle = "#273234"; g.beginPath(); g.moveTo(88, H - 210); g.lineTo(W - 88, H - 210); g.stroke();
    g.fillStyle = "#9DF0C2"; g.font = '600 26px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("付款之后，权利开始计时。", 88, H - 150);
    g.fillStyle = "#82918D"; g.font = '400 20px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("不代提交 · 不承诺结果 · 依据以原文为准", 88, H - 112);
    cv.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `piaogen-card-${ticket.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast("已生成分享图");
    }, "image/png");
  }

  function shareFinanceCard(c) {
    const def = FINANCE_TYPES[c.type] || FINANCE_TYPES.payment;
    const due = financeDeadline(c);
    const ready = financeEvidenceReady(c);
    const totalEvidence = (c.evidence || []).length;
    const W = 1080, H = 1440;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = "#0A0E0F"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#8BD3FF"; g.fillRect(0, 0, W, 12);

    g.fillStyle = "#9DF0C2"; g.beginPath(); g.arc(110, 116, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#06110C"; g.font = '700 30px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("票", 96, 128);
    g.fillStyle = "#F1F7F4"; g.font = '700 38px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("票根", 162, 126);
    g.fillStyle = "#82918D"; g.font = '400 20px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("资金售后回执", 162, 156);
    g.textAlign = "right";
    g.fillStyle = "#82918D"; g.font = '400 18px "Space Grotesk","Consolas",monospace';
    g.fillText(c.date || "日期待确认", W - 88, 126);
    g.textAlign = "left";

    const statusColor = c.status === "resolved" ? "#9DF0C2" : c.status === "rejected" ? "#FF715B" : c.status === "open" ? "#F4B860" : "#8BD3FF";
    g.strokeStyle = "#273234"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(88, 204); g.lineTo(W - 88, 204); g.stroke();
    g.fillStyle = "#B6C4C0"; g.font = '400 22px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText(`${def.label}${c.source === "demo" ? " · 示例" : ""}`, 88, 260);
    g.fillStyle = statusColor; g.font = '600 24px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.textAlign = "right";
    g.fillText(financeStatusLabel(c.status), W - 88, 260);
    g.textAlign = "left";

    g.fillStyle = "#F1F7F4"; g.font = '600 52px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    let merchantText = String(c.merchant || "商家 / 机构待确认");
    while (merchantText.length > 4 && g.measureText(merchantText).width > W - 176) merchantText = merchantText.slice(0, -1);
    if (merchantText !== String(c.merchant || "商家 / 机构待确认")) merchantText = merchantText.slice(0, -1) + "…";
    g.fillText(merchantText, 88, 330);

    g.fillStyle = "#8BD3FF"; g.font = '600 84px "Space Grotesk","Consolas",monospace';
    g.fillText(money(c.amount), 88, 446);
    g.fillStyle = "#82918D"; g.font = '400 22px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("争议金额 / 涉及金额", 88, 486);
    g.fillText(`${financeChannelLabel(c.channel)} · ${c.member ? "帮家人办" : "本人"}`, 88, 524);

    g.strokeStyle = "#273234"; g.beginPath(); g.moveTo(88, 588); g.lineTo(W - 88, 588); g.stroke();
    const stats = [
      ["证据", `${ready}/${totalEvidence} 件`, ready >= totalEvidence && totalEvidence ? "#9DF0C2" : "#F4B860"],
      ["确认解决", c.status === "resolved" ? money(c.recoveredAmount || c.amount) : "—", c.status === "resolved" ? "#9DF0C2" : "#82918D"],
      ["时限", due.has ? (due.days < 0 ? `已过 ${-due.days} 天` : `还剩 ${due.days} 天`) : "未填截止日", due.has && due.days <= 3 ? "#FF715B" : "#F1F7F4"]
    ];
    stats.forEach(([label, value, color], i) => {
      const x = 88 + i * 310;
      g.fillStyle = "#82918D"; g.font = '400 20px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
      g.fillText(label, x, 648);
      g.fillStyle = color; g.font = '600 34px "Space Grotesk","Consolas",monospace';
      g.fillText(value, x, 696);
    });

    g.fillStyle = "#82918D"; g.font = '400 20px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("下一步", 88, 790);
    g.fillStyle = "#F1F7F4"; g.font = '500 28px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    const nextStep = (def.routes[0] && def.routes[0].path && def.routes[0].path[0]) || "先补齐证据，再打开官方路径";
    let line = nextStep;
    while (line.length > 4 && g.measureText(line).width > W - 176) line = line.slice(0, -1);
    if (line !== nextStep) line = line.slice(0, -1) + "…";
    g.fillText(line, 88, 838);
    g.fillStyle = "#82918D"; g.font = '400 20px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("规则结论由确定性代码生成；AI 建议默认关闭，不改变金额、日期、状态。", 88, 890);

    g.fillStyle = "#82918D"; g.font = '400 20px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("证据清单", 88, 962);
    (c.evidence || []).slice(0, 4).forEach((item, i) => {
      const y = 1012 + i * 56;
      const ok = item.status === "ready";
      g.fillStyle = ok ? "#9DF0C2" : "#F4B860";
      g.font = '600 24px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
      g.fillText(ok ? "✓" : "○", 88, y);
      g.fillStyle = ok ? "#F1F7F4" : "#B6C4C0";
      g.font = '400 24px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
      let label = String(item.label || "");
      while (label.length > 4 && g.measureText(label).width > W - 300) label = label.slice(0, -1);
      if (label !== String(item.label || "")) label = label.slice(0, -1) + "…";
      g.fillText(label, 132, y);
      g.textAlign = "right";
      g.fillStyle = ok ? "#9DF0C2" : "#82918D";
      g.font = '400 20px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
      g.fillText(ok ? "已备" : "待补", W - 88, y);
      g.textAlign = "left";
    });

    g.strokeStyle = "#273234"; g.beginPath(); g.moveTo(88, H - 210); g.lineTo(W - 88, H - 210); g.stroke();
    g.fillStyle = "#8BD3FF"; g.font = '600 26px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("付款之后，权利开始计时。", 88, H - 150);
    g.fillStyle = "#82918D"; g.font = '400 20px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("不代提交 · 不代收款 · 金额以流水为准", 88, H - 112);
    g.fillText("本卡不含卡号、订单号与凭证图。", 88, H - 76);
    cv.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `piaogen-finance-${c.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast("已生成资金回执图");
    }, "image/png");
  }

  function exportMaterialPack(ticket, win) {
    const w = win || PG.priority(ticket);
    const portal = w ? PG.portalFor(w, ticket) : { label: "官方入口待补", path: [] };
    const lines = [
      "票根 · 办理材料包",
      "==================",
      `商家：${ticket.merchant || "待确认"}`,
      `商品：${ticket.product || "待确认"}`,
      `金额：${money(ticket.amount)}`,
      `购买日期：${ticket.date || "待确认"}`,
      `订单号：${ticket.orderNo || "待确认"}`,
      "",
      "一、这张票还能做什么",
      ...(ticket.windows || []).filter((x) => x.applicability !== "not_applicable").map((x) =>
        `- ${x.label}：${x.daysLeft === null ? "待确认" : x.daysLeft + " 天"}；${x.end ? "截止 " + x.end : "截止日待确认"}；依据：${x.source || "规则库"}`
      ),
      "",
      "二、证据",
      ...(ticket.evidence || []).map((e, i) => `${i + 1}. ${e.type} · ${e.label}：${e.detail || ""}`),
      ...(ticket.missing || []).map((m) => `- 还缺：${m}`),
      "",
      "三、下一步",
      w ? `- 主行动：${w.label}` : "- 先补证据/资格",
      ...(portal.path || []).map((p, i) => `${i + 1}. ${p}`),
      portal.url ? `入口：${portal.url}` : "",
      "",
      "四、话术（可直接复制）",
      w ? PG.scriptFor(ticket, w) : "先补一张带金额和日期的票，再生成话术。",
      "",
      "五、原则",
      "- 你自己提交；票根不代提交、不代付。",
      "- 预计金额与确认金额分开；提交、受理、到账分开。",
      "- 这不是法律意见；争议可走平台客服、12315 或法律援助。",
      "",
      `生成时间：${new Date().toLocaleString("zh-CN")}`
    ].filter((x) => x !== "");
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `piaogen-pack-${ticket.id}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    toast("材料包已导出");
  }

  const PROGRESS_STAGES = [
    { key: "submitted", label: "已提交" },
    { key: "accepted", label: "已受理" },
    { key: "returning", label: "已寄回" },
    { key: "merchant_received", label: "商家收货" },
    { key: "refund_pending", label: "退款中" },
    { key: "refunded", label: "已到账" }
  ];

  function derivedProgress(ticket) {
    if (ticket.progress && ticket.progress.stage) return ticket.progress;
    const acts = (ticket.actions || []).slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    const last = acts[acts.length - 1];
    if (!last) return null;
    const map = {
      acknowledged: "accepted",
      refunded: "refunded",
      repaired: "refunded",
      promise: "refunded",
      rejected: "rejected",
      abandoned: "abandoned",
      submitted: "submitted"
    };
    return { stage: map[last.status] || "submitted", note: last.note || "", updatedAt: last.createdAt };
  }

  function renderProgress(ticket) {
    const host = $("#resultProgress");
    if (!host) return;
    const p = derivedProgress(ticket);
    if (!p) { host.innerHTML = ""; return; }
    const rejected = p.stage === "rejected";
    const idx = rejected ? 0 : PROGRESS_STAGES.findIndex((x) => x.key === p.stage);
    host.innerHTML = `
      <div class="progress-block">
        <div class="progress-head"><h2>退款进度</h2><button class="text-btn" id="updateProgress" type="button">更新</button></div>
        <div class="progress-track ${rejected ? "rejected" : ""}">
          ${PROGRESS_STAGES.map((s, i) => `<div class="progress-step ${i < idx ? "done" : i === idx ? "now" : ""}"><i></i><span>${s.label}</span></div>`).join("")}
        </div>
        <p class="progress-note">${rejected ? "被拒了。记录还在，可以换一条路。" : p.note ? escapeHtml(p.note) : "只记录你确认过的进度；不把提交当成到账。"}</p>
      </div>`;
    $("#updateProgress").addEventListener("click", () => openProgressSheet(ticket));
  }

  function openProgressSheet(ticket) {
    const p = derivedProgress(ticket) || { stage: "submitted", note: "" };
    openSheet("更新退款进度", `
      <form id="progressForm">
        <label class="field"><span>当前阶段</span>
          <select id="pStage">${PROGRESS_STAGES.map((s) => `<option value="${s.key}" ${p.stage === s.key ? "selected" : ""}>${s.label}</option>`).join("")}<option value="rejected" ${p.stage === "rejected" ? "selected" : ""}>被拒</option></select>
        </label>
        <label class="field"><span>物流/备注（可选）</span><input id="pNote" value="${escapeHtml(p.note || "")}" placeholder="例如：顺丰 SF123；商家说 3 天到账" /></label>
        <div class="sheet-actions"><button class="btn primary" id="pSave" type="button">保存进度</button><button class="btn ghost" id="pCancel" type="button">取消</button></div>
      </form>`, () => {
      $("#pSave").addEventListener("click", () => {
        ticket.progress = {
          stage: $("#pStage").value,
          note: $("#pNote").value.trim(),
          updatedAt: new Date().toISOString()
        };
        save();
        closeSheet();
        renderResult(ticket);
        toast("进度已更新");
      });
      $("#pCancel").addEventListener("click", closeSheet);
    });
  }

  function renderTimeline(ticket) {
    const host = $("#ticketTimeline");
    if (!host) return;
    const fmtDate = (v) => {
      const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? `${m[2]}.${m[3]}` : "";
    };
    const events = [];
    if (ticket.date) events.push({ d: ticket.date, t: "购买", s: `${ticket.merchant || "商家"} · ${money(ticket.amount)}` });
    if ((ticket.evidence || []).length) events.push({ d: "", t: "收集证据", s: `${ticket.evidence.length} 件` });
    const open = (ticket.windows || []).filter((w) => w.daysLeft !== null && w.daysLeft >= 0);
    if ((ticket.windows || []).length) events.push({ d: "", t: "算出还能做什么", s: `${open.length} 件有截止日` });
    const acts = (ticket.actions || []).slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    for (const a of acts) {
      const label = a.status === "acknowledged" ? "已受理 / 待到账"
        : a.status === "refunded" ? "已到账 / 已退款"
        : a.status === "repaired" ? "已修好 / 已换货"
        : a.status === "promise" ? "承诺已兑现"
        : a.status === "rejected" ? "被拒"
        : "今天不办";
      const bits = [a.label || "", a.amount ? money(a.amount) : "", a.note || ""].filter(Boolean);
      events.push({ d: String(a.createdAt || "").slice(0, 10), t: label, s: bits.join(" · ") });
    }
    host.innerHTML = `<h2>这张票的经历</h2><ol class="tl">` + events.map((e) => `
      <li><span class="tl-date">${escapeHtml(fmtDate(e.d))}</span>
        <div class="tl-body"><b>${escapeHtml(e.t)}</b><p>${escapeHtml(e.s)}</p></div></li>`).join("") + `</ol>`;
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

  function openHelperSheet(ticket, onSaved) {
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
      renderToday();
      toast(forWhom ? `已记为帮 ${forWhom} 办` : "已清除代办");
      if (typeof onSaved === "function") onSaved();
    });
  }

  function renderEmptyReason(ticket, actionable) {
    const host = $("#resultHelper");
    if (!host) return;
    if (actionable.length) return;
    const unknown = (ticket.windows || []).filter((w) => w.applicability === "unknown");
    if (unknown.length) {
      host.innerHTML = `<div class="empty-reason">
        <b>还有 ${unknown.length} 件待确认</b>
        <p>${unknown.map((w) => escapeHtml(w.label)).join("、")} 还缺资格或证据。先补上，再算天数。</p>
        <button class="link-btn" id="fixEligibilityInline" type="button">补资格 / 改条件</button>
      </div>`;
      $("#fixEligibilityInline").addEventListener("click", () => openEligibilitySheet(ticket));
      return;
    }
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
    if (!win) {
      toast("先补资格或证据，再生成办理步骤");
      openEligibilitySheet(ticket);
      return;
    }
    state.current = ticket;
    state.currentWindow = win;
    $("#actionTitle").textContent = `${win.label} · 三步办`;
    $("#actionSteps").innerHTML = `<div class="step on"><i></i><span>1 看规则</span></div><div class="step"><i></i><span>2 备材料</span></div><div class="step"><i></i><span>3 去办理</span></div>`;
    $("#actionChecklist").innerHTML = PG.checklistFor(win, ticket).map((item) => `<label class="check-item"><input type="checkbox" /><span>${escapeHtml(item)}</span></label>`).join("");
    $("#actionScript").textContent = PG.scriptFor(ticket, win);
    $("#actionObjections").innerHTML = `<h2>对方可能会说</h2>` + PG.objectionsFor(win).map((pair) => `
      <div class="obj"><b>「${escapeHtml(pair[0])}」</b><p>${escapeHtml(pair[1])}</p></div>`).join("");
    const portal = PG.portalFor(win, ticket);
    $("#actionPortal").innerHTML = `<div class="portal-steps">
      <b>${escapeHtml(portal.label)}</b>
      <ol>${(portal.path || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      ${portal.url ? `<a href="${escapeHtml(portal.url)}" target="_blank" rel="noopener noreferrer">打开官方页面<span>↗</span></a>` : ""}
      <p class="portal-hint">${escapeHtml(portal.fallback || "找不到入口时，复制订单号联系官方客服。")}</p>
      <small>${escapeHtml(portal.source || "")}${portal.confidence ? ` · ${escapeHtml(portal.confidence)}` : ""}</small>
    </div>`;
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
      merchantReply: outcome.merchantReply || "",
      confirmed: outcome.confirmed === true,
      createdAt: new Date().toISOString()
    };
    ticket.actions = (ticket.actions || []).concat(action);
    ticket.progress = {
      stage: outcome.status === "acknowledged" ? "accepted"
        : ["refunded", "repaired", "promise"].includes(outcome.status) ? "refunded"
        : outcome.status === "rejected" ? "rejected"
        : outcome.status === "abandoned" ? "abandoned"
        : "submitted",
      note: outcome.note || "",
      updatedAt: new Date().toISOString()
    };
    if (outcome.replyImage) {
      ticket.evidence = (ticket.evidence || []).concat([{
        id: uid(),
        type: "商家回复",
        label: "回复截图",
        detail: String(outcome.merchantReply || outcome.replyText || "").slice(0, 120),
        confidence: 90,
        status: "active",
        dataUrl: outcome.replyImage
      }]);
    }
    if (outcome.proofImage) {
      ticket.evidence = (ticket.evidence || []).concat([{
        id: uid(),
        type: "到账凭证",
        label: "到账截图",
        detail: outcome.amount ? `¥${Number(outcome.amount).toFixed(2)}` : "已上传",
        confidence: 90,
        status: "active",
        dataUrl: outcome.proofImage
      }]);
    }
    if (outcome.confirmed === true && (outcome.status === "refunded" || outcome.status === "repaired" || outcome.status === "promise")) {
      win.status = "closed";
    }
    save();
    renderDone(ticket, win, outcome);
    show("done");
  }

  function renderDone(ticket, win, outcome) {
    const statusLabel = outcome.status === "acknowledged" ? "已受理 / 待到账" : outcome.status === "refunded" ? "已到账/已退款" : outcome.status === "repaired" ? "已修好/已换货" : outcome.status === "promise" ? "承诺已兑现" : outcome.status === "rejected" ? "被拒了" : "今天不办了";
    const confirmText = outcome.status === "refunded" ? "已确认到账，凭证已写入回执。" : "已确认完成，凭证已写入回执。";
    $("#doneTitle").textContent = outcome.status === "acknowledged" ? "已受理，等到账。" : outcome.status === "rejected" ? "被拒了，记录还在。" : outcome.status === "abandoned" ? "先放着，记录还在。" : "办完了。";
    $("#doneSub").textContent = outcome.status === "acknowledged" ? "提交不是结果；到账后回来确认，才盖“已到账”章。" : outcome.status === "rejected" ? "原记录保留；可以换一条路，或今天先不办。" : "结果已写进这张票。";
    $("#doneCard").innerHTML = `
      <div class="receipt-overline"><span>办理回执</span><span></span></div>
      <div class="row"><span>${escapeHtml(win.label)}</span><b class="${outcome.confirmed ? "status-confirmed" : ""}">${escapeHtml(statusLabel)}</b></div>
      <div class="row"><span>${outcome.confirmed ? "确认金额" : "待到账金额"}</span><b>${outcome.amount ? money(outcome.amount) : "未填"}</b></div>
      <div class="row"><span>商家</span><b>${escapeHtml(ticket.merchant)}</b></div>
      ${outcome.merchantReply ? `<div class="row"><span>商家回复</span><b>${escapeHtml(outcome.merchantReply)}</b></div>` : ""}
      ${outcome.note ? `<div class="row"><span>备注</span><b>${escapeHtml(outcome.note)}</b></div>` : ""}
      ${outcome.confirmed ? `<div class="done-confirm">${confirmText}</div>` : ""}`;
    const remaining = (ticket.windows || []).filter((w) => w.applicability === "applicable" && w.status !== "closed" && w.daysLeft !== null && w.daysLeft >= 0);
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
    $("#doneExport").onclick = () => {
      const card = $("#doneCard");
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!card || reduce) return exportReceipt(ticket, win, outcome);
      card.classList.add("tearing");
      setTimeout(() => {
        card.classList.remove("tearing");
        exportReceipt(ticket, win, outcome);
      }, 260);
    };
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
    const order = ["window", "pending", "flow", "dup"];
    if (!(groups[state.tab] || []).length) {
      state.tab = order.find((key) => (groups[key] || []).length) || "window";
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
      const chips = (ticket.windows || []).slice(0, 3).map((w) => `<span class="chip ${w.status === "expiring" ? "warn" : w.status === "unknown" ? "pending" : "ok"}">${escapeHtml(w.label)} ${w.daysLeft === null ? "待确认" : `${w.daysLeft} 天`}</span>`).join("") + (ticket.ocrError ? `<span class="chip pending">识别失败 · 手动填</span>` : ticket.review ? `<span class="chip pending">OCR 需复核</span>` : "");
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

  function exportReceipt(ticket, win, outcome) {
    const receiptId = "PG-" + Date.now().toString(36).toUpperCase();
    const lines = [
      "票根 · 办理回执",
      `回执编号：${receiptId}`,
      `生成时间：${new Date().toLocaleString("zh-CN")}`,
      "",
      `商家：${ticket.merchant || "待确认"}`,
      `商品：${ticket.product || "待确认"}`,
      `事项：${win && win.label || "售后"}`,
      `状态：${outcomeLabel(outcome.status)}`,
      `金额：${outcome.amount ? money(outcome.amount) : "未填"}`,
      `用户确认：${outcome.confirmed ? "已确认到账/完成" : "未确认，仅为受理记录"}`,
      "",
      `商家回复：${outcome.merchantReply || outcome.note || "未记录"}`,
      `证据：${(ticket.evidence || []).length} 件`,
      "",
      "说明：本回执只记录用户提供的凭证与确认，不代替商家/平台结论。"
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `piaogen-receipt-${receiptId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast("回执已导出");
  }

  function calendarDay(value) {
    const d = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function parseReportDate(value) {
    const text = String(value || "").trim();
    const dateOnly = text.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})/);
    if (dateOnly) {
      const d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function addCalendarDays(value, days) {
    const d = new Date(value);
    d.setDate(d.getDate() + days);
    return d;
  }

  function shortDate(d) {
    return `${d.getMonth() + 1}.${d.getDate()}`;
  }

  function periodInfo(period, ref = new Date()) {
    const now = new Date(ref);
    if (period === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return {
        key: "month", start, end,
        rangeLabel: `${now.getFullYear()}.${now.getMonth() + 1}`,
        word: "本月",
        title: `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`
      };
    }
    if (period === "year") {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear() + 1, 0, 1);
      return {
        key: "year", start, end,
        rangeLabel: `${now.getFullYear()}`,
        word: "今年",
        title: `${now.getFullYear()} 年`
      };
    }
    const start = new Date(now);
    const offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);
    start.setHours(0, 0, 0, 0);
    const end = addCalendarDays(start, 7);
    return {
      key: "week", start, end,
      rangeLabel: `${shortDate(start)}—${shortDate(addCalendarDays(end, -1))}`,
      word: "本周",
      title: `${shortDate(start)}—${shortDate(addCalendarDays(end, -1))}`
    };
  }

  function inPeriod(value, info) {
    const d = parseReportDate(value);
    return !!d && d >= info.start && d < info.end;
  }

  function reportBarSetup(period, info) {
    const length = period === "week" ? 7 : period === "month" ? 5 : 12;
    return Array.from({ length }, (_, index) => {
      if (period === "week") {
        const d = addCalendarDays(info.start, index);
        return { label: String(d.getDate()), start: d, end: addCalendarDays(d, 1) };
      }
      if (period === "month") {
        const start = new Date(info.start.getFullYear(), info.start.getMonth(), index * 7 + 1);
        const last = new Date(info.start.getFullYear(), info.start.getMonth() + 1, 0);
        const endDay = Math.min(last.getDate(), index * 7 + 7);
        return { label: `${index * 7 + 1}`, start, end: new Date(info.start.getFullYear(), info.start.getMonth(), endDay + 1) };
      }
      const start = new Date(info.start.getFullYear(), index, 1);
      return { label: String(index + 1), start, end: new Date(info.start.getFullYear(), index + 1, 1) };
    });
  }

  function reportData(period, tickets = caseTickets()) {
    const info = periodInfo(period);
    const dueWindows = [];
    const actions = [];
    const newTickets = [];
    const familyMap = new Map();
    let missing = 0;
    const ensureFamily = (label) => {
      if (!familyMap.has(label)) familyMap.set(label, { label, due: new Map(), recovered: 0, completed: 0 });
      return familyMap.get(label);
    };
    for (const ticket of tickets) {
      const label = memberNameOf(ticket) || "我";
      const family = ensureFamily(label);
      missing += (ticket.missing || []).length;
      const created = ticket.createdAt || `${ticket.date || ""}T00:00:00`;
      if (inPeriod(created, info)) newTickets.push(ticket);
      for (const win of (ticket.windows || [])) {
        if (win.applicability !== "applicable" || win.status === "closed" || win.daysLeft === null || win.daysLeft < 0) continue;
        if (!win.end || !inPeriod(win.end, info)) continue;
        const row = { ticket, win, member: label, end: parseReportDate(win.end) };
        dueWindows.push(row);
        family.due.set(ticket.id, expectedAmountOf(ticket));
      }
      for (const action of (ticket.actions || [])) {
        const d = parseReportDate(action.createdAt || ticket.date);
        if (!d || d < info.start || d >= info.end) continue;
        const confirmedStatus = action.confirmed !== false && ["refunded", "repaired", "promise"].includes(action.status);
        if (!confirmedStatus) continue;
        const recovered = ["refunded", "promise"].includes(action.status) ? (Number(action.amount) || 0) : 0;
        actions.push({ action, ticket, member: label, recovered, date: d });
        family.completed += 1;
        family.recovered += recovered;
      }
    }
    const dueTicketIds = new Set(dueWindows.map((row) => row.ticket.id));
    const dueAmount = Array.from(dueTicketIds).reduce((sum, id) => {
      const ticket = tickets.find((item) => item.id === id);
      return sum + (ticket ? expectedAmountOf(ticket) : 0);
    }, 0);
    const confirmedTotal = actions.reduce((sum, row) => sum + row.recovered, 0);
    const completedCount = actions.filter((row) => ["refunded", "repaired", "promise"].includes(row.action.status)).length;
    const buckets = reportBarSetup(period, info);
    const recoveredBars = buckets.map(() => 0);
    const dueBars = buckets.map(() => 0);
    const bucketIndex = (date) => {
      for (let i = 0; i < buckets.length; i += 1) {
        if (date >= buckets[i].start && date < buckets[i].end) return i;
      }
      return -1;
    };
    for (const row of actions) {
      if (!row.recovered) continue;
      const index = bucketIndex(calendarDay(row.date));
      if (index >= 0) recoveredBars[index] += row.recovered;
    }
    for (const row of dueWindows) {
      const index = bucketIndex(calendarDay(row.end));
      if (index >= 0) dueBars[index] += 1;
    }
    let subscriptions = [];
    try { subscriptions = PG.detectSubscriptions(tickets) || []; } catch {}
    return {
      info,
      period,
      dueWindows: dueWindows.sort((a, b) => a.win.daysLeft - b.win.daysLeft),
      dueAmount,
      actions,
      confirmedTotal,
      completedCount,
      newTickets,
      missing,
      subscriptions,
      buckets,
      recoveredBars,
      dueBars,
      family: Array.from(familyMap.values())
        .map((row) => ({ ...row, dueAmount: Array.from(row.due.values()).reduce((sum, value) => sum + value, 0) }))
        .sort((a, b) => (b.recovered + b.dueAmount) - (a.recovered + a.dueAmount))
    };
  }

  function openReport(period) {
    state.reportPeriod = period || state.reportPeriod || "week";
    $("#toast").classList.remove("show");
    renderAnnual();
    show("annual");
  }

  function renderAnnual() {
    const period = ["week", "month", "year"].includes(state.reportPeriod) ? state.reportPeriod : "week";
    state.reportPeriod = period;
    const report = reportData(period, caseTickets());
    const info = report.info;
    const body = $("#annualBody");
    const tabs = [["week", "本周"], ["month", "本月"], ["year", "今年"]]
      .map(([key, label]) => `<button type="button" class="${key === period ? "on" : ""}" data-report-period="${key}" role="tab" aria-selected="${key === period}">${label}</button>`).join("");
    const hasFinished = report.confirmedTotal > 0;
    const headline = hasFinished
      ? `替家里守住 ${money(report.confirmedTotal)}`
      : report.dueWindows.length
        ? `还有 <b>${report.dueWindows.length}</b> 件权利要办`
        : report.newTickets.length
          ? `${info.word}新进 <b>${report.newTickets.length}</b> 张票`
          : `${info.word}没有到期窗口`;
    const bigNumber = hasFinished ? report.confirmedTotal : report.dueAmount;
    const bigLabel = hasFinished ? "已确认" : report.dueAmount ? "可争取 · 估算" : "尚未产生金额";
    const summary = hasFinished && report.dueWindows.length
      ? `${info.word}已确认 ${money(report.confirmedTotal)}；另有 ${report.dueWindows.length} 件可争取，预计 ${money(report.dueAmount)}。预计与到账分开记。`
      : hasFinished
        ? `${info.word}办结 ${report.completedCount} 件；只统计你确认过的到账/兑现，不把“已受理”算成结果。`
        : report.dueWindows.length
          ? `${info.word}有 ${report.dueWindows.length} 件临近截止，先办最急一件；这里展示的是估算，不是已到账。`
          : `没有临近截止，也没有确认到账记录。可以补一张票，或先做 3 分钟家庭损失体检。`;

    const familyMax = Math.max(1, ...report.family.map((row) => row.recovered + row.dueAmount));
    const familyRows = report.family.filter((row) => row.recovered || row.dueAmount || row.completed).map((row) => {
      const value = row.recovered || row.dueAmount;
      const width = Math.min(100, Math.round(((row.recovered + row.dueAmount) / familyMax) * 100));
      return `<div class="report-family-row">
        <span>${escapeHtml(row.label)}</span>
        <i><b style="--w:${width / 100}"></b></i>
        <em>${money(value)}<small>${row.recovered ? "已守住" : "可争取"}</small></em>
      </div>`;
    }).join("");
    const dueRows = report.dueWindows.slice(0, 3).map((row) => `<button class="report-due-row" type="button" data-report-ticket="${row.ticket.id}" data-report-win="${row.win.id || ""}">
      <b>${escapeHtml(row.ticket.merchant)} · ${escapeHtml(row.win.label)}</b>
      <span>${escapeHtml(row.member)} · ${escapeHtml(row.win.end || "截止日待确认")}</span>
      <em>${row.win.daysLeft} 天</em>
    </button>`).join("");
    const useRecovered = report.confirmedTotal > 0;
    const barValues = useRecovered ? report.recoveredBars : report.dueBars;
    const barMax = Math.max(1, ...barValues);
    const bars = report.buckets.map((bucket, index) => {
      const value = barValues[index] || 0;
      const height = value ? Math.max(0.07, value / barMax) : 0;
      return `<div class="report-bar ${value ? "" : "zero"}"><i style="--bar-h:${(height * 76).toFixed(0)}px"></i><span>${escapeHtml(bucket.label)}</span></div>`;
    }).join("");
    const advice = [];
    if (report.dueWindows[0]) {
      advice.push(`先办最急一件：<b>${escapeHtml(report.dueWindows[0].win.label)}</b>，${report.dueWindows[0].win.daysLeft} 天后关闭。`);
    }
    if (report.missing) {
      advice.push(`有 <b>${report.missing} 项</b>证据待补；先补齐，再和商家谈。`);
    }
    if (report.subscriptions.length) {
      advice.push(`检测到 <b>${report.subscriptions.length} 个</b>疑似自动续费；去账单体检确认后再关闭。`);
    }
    if (advice.length < 3 && report.completedCount && !report.confirmedTotal) {
      advice.push("已经办结但还没确认到账；到账后回来记一笔，报告只算确认金额。");
    }
    if (advice.length < 3 && !report.dueWindows.length && !report.confirmedTotal) {
      advice.push("这周没有临近截止；补一张新票或做体检，别等过期才发现。");
    }
    if (advice.length < 3) {
      advice.push("下一次争议前，把订单、聊天和到账截图留在同一张票里。");
    }
    const adviceRows = advice.slice(0, 3).map((text, index) => `<div><span>0${index + 1}</span><p>${text}</p></div>`).join("");
    const allFinance = state.finance || [];
    const financeActive = allFinance.filter((c) => !["resolved", "closed"].includes(c.status));
    const financeResolved = allFinance.filter((c) => c.status === "resolved" && inPeriod(c.resolvedAt || c.updatedAt || c.createdAt, info));
    const financeRecoveredTotal = financeResolved.reduce((sum, c) => sum + financeRecovered(c), 0);
    const financeDisputed = financeActive.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const financeNear = financeActive
      .map((c) => ({ c, due: financeDeadline(c) }))
      .filter((row) => row.due.has && row.due.days >= 0 && row.due.days <= 7)
      .sort((a, b) => a.due.days - b.due.days);
    const financeDays = financeResolved.map((c) => {
      const start = parseReportDate(c.createdAt);
      const end = parseReportDate(c.resolvedAt || c.updatedAt || c.createdAt);
      if (!start || !end) return null;
      return Math.max(0, Math.round((end - start) / 86400000));
    }).filter((value) => value !== null);
    const financeAvg = financeDays.length ? Math.round(financeDays.reduce((sum, value) => sum + value, 0) / financeDays.length) : null;
    const financeDuration = financeDays.length === 0 ? "—" : financeDays.length === 1 ? `1 宗 · ${financeDays[0]} 天` : `平均 ${financeAvg} 天（${financeDays.length} 宗）`;
    const financeMemberMap = new Map();
    allFinance.forEach((c) => {
      const name = financeMemberName(c) || "我";
      if (!financeMemberMap.has(name)) financeMemberMap.set(name, { name, active: 0, recovered: 0, count: 0 });
      const row = financeMemberMap.get(name);
      row.count += 1;
      if (!["resolved", "closed"].includes(c.status)) row.active += Number(c.amount) || 0;
      if (c.status === "resolved") row.recovered += financeRecovered(c);
    });
    const financeMemberRows = Array.from(financeMemberMap.values())
      .sort((a, b) => (b.active + b.recovered) - (a.active + a.recovered) || b.count - a.count)
      .map((row) => `<div class="finance-member-report-row"><b>${escapeHtml(row.name)}</b><span>在途 ${money(row.active)} · 已确认 ${money(row.recovered)} · ${row.count} 宗</span></div>`)
      .join("");
    const financeRows = financeActive.slice().sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))).slice(0, 3).map((c) => {
      const def = FINANCE_TYPES[c.type] || FINANCE_TYPES.payment;
      return `<button class="report-due-row" type="button" data-finance-report="${c.id}">
        <b>${escapeHtml(c.merchant || "待确认")} · ${escapeHtml(def.short)}</b>
        <span>${escapeHtml(financeStatusLabel(c.status))} · ${escapeHtml(c.deadline || "未填截止日")}</span>
        <em>${money(c.amount)}</em>
      </button>`;
    }).join("");

    body.innerHTML = `
      <div class="report-tabs" role="tablist" aria-label="报告周期">${tabs}</div>
      <div class="report-hero">
        <div class="rh-top"><span>${escapeHtml(info.title)} · 家庭权利</span><span>${hasFinished ? "只算已确认" : "估算不是到账"}</span></div>
        <h2>${headline}</h2>
        <div class="report-big"><strong>${bigNumber ? money(bigNumber) : "¥—"}</strong><span>${escapeHtml(bigLabel)}</span></div>
        <p>${escapeHtml(summary)}</p>
      </div>
      <div class="report-kpis">
        <div class="report-kpi"><span>到期窗口</span><b>${report.dueWindows.length}</b></div>
        <div class="report-kpi ok"><span>确认办结</span><b>${report.completedCount}</b></div>
        <div class="report-kpi"><span>新增票据</span><b>${report.newTickets.length}</b></div>
        <div class="report-kpi hot"><span>待补证据</span><b>${report.missing}</b></div>
      </div>
      <div class="report-section">
        <div class="report-section-head"><h2>${escapeHtml(info.word)}最急</h2><span>点一行去办</span></div>
        <div class="report-due">${dueRows || `<p class="annual-note" style="margin:0">${escapeHtml(info.word)}没有临近截止的窗口。</p>`}</div>
      </div>
      ${familyRows ? `<div class="report-section report-family">
        <div class="report-section-head"><h2>谁在守</h2><span>一家人的权利，分开算</span></div>
        ${familyRows}
      </div>` : ""}
      ${allFinance.length ? `<div class="report-section">
        <div class="report-section-head"><h2>资金售后</h2><span>在途与已解决分开</span></div>
        <div class="finance-report-grid">
          <div><span>在途争议</span><b>${money(financeDisputed)}</b><em>当前在途 · 不是可追回</em></div>
          <div class="${financeRecoveredTotal ? "ok" : ""}"><span>确认解决</span><b>${money(financeRecoveredTotal)}</b></div>
          <div class="${financeNear.length ? "hot" : ""}"><span>7 天内时限</span><b>${financeNear.length}</b></div>
          <div><span>已解决用时</span><b>${escapeHtml(financeDuration)}</b></div>
        </div>
        ${financeMemberRows ? `<div class="finance-member-report"><div class="report-section-head"><h2>帮谁办</h2><span>在途与已确认分开</span></div>${financeMemberRows}</div>` : ""}
        <div class="report-due">${financeRows || `<p class="annual-note" style="margin:0">本期没有新的资金案卷。</p>`}</div>
      </div>` : ""}
      <div class="report-section report-chart-block">
        <div class="report-section-head"><h2>${useRecovered ? "已确认趋势" : "到期窗口分布"}</h2><span>${useRecovered ? "只算到账/兑现" : "按截止日"}</span></div>
        <div class="report-chart" style="--cols:${report.buckets.length}">${bars}</div>
        <p class="report-note">${useRecovered ? "柱子是你在本机确认过的到账/兑现金额；受理、提交与预计都不算。" : "还没有确认到账记录，所以这里先看到期窗口；办成并确认后自动切换为金额。"}</p>
      </div>
      <div class="report-section">
        <div class="report-section-head"><h2>下一步</h2><span>最多三条</span></div>
        <div class="report-advice">${adviceRows}</div>
      </div>
      <div class="report-actions">
        <button class="btn primary" id="shareReport" type="button">生成${escapeHtml(info.word)}报告卡</button>
        <button class="btn ghost" id="reportBack" type="button">回到今天</button>
        <button class="btn ghost" id="reportRules" type="button">看规则库</button>
      </div>
      <p class="report-note">报告只在本机生成；分享卡不含订单号、电话、地址和商品链接。预计金额是估算，不承诺一定能拿回。</p>`;

    $$("#annualBody [data-report-period]").forEach((button) => button.addEventListener("click", () => {
      state.reportPeriod = button.dataset.reportPeriod;
      renderAnnual();
    }));
    $$("#annualBody [data-report-ticket]").forEach((button) => button.addEventListener("click", () => {
      const ticket = state.tickets.find((item) => item.id === button.dataset.reportTicket);
      if (!ticket) return;
      const win = (ticket.windows || []).find((item) => item.id === button.dataset.reportWin) || PG.priority(ticket);
      openResult(ticket, win);
    }));
    $$("#annualBody [data-finance-report]").forEach((button) => button.addEventListener("click", () => {
      const c = state.finance.find((item) => item.id === button.dataset.financeReport);
      if (c) openFinanceCase(c);
    }));
    $("#shareReport").addEventListener("click", () => shareReport(period, report));
    $("#reportBack").addEventListener("click", () => show("today"));
    $("#reportRules").addEventListener("click", openRulesSheet);
  }

  function shareReport(period, report) {
    const data = report || reportData(period, caseTickets());
    const W = 1080, H = 1440;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = "#0A0E0F"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#9DF0C2"; g.fillRect(0, 0, W, 12);
    g.fillStyle = "#9DF0C2"; g.beginPath(); g.arc(110, 116, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#06110C"; g.font = '700 30px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("票", 96, 128);
    g.fillStyle = "#F1F7F4"; g.font = '700 38px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("票根", 162, 126);
    g.fillStyle = "#82918D"; g.font = '400 20px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("家庭权利报告", 162, 156);
    g.textAlign = "right";
    g.fillStyle = "#82918D"; g.font = '400 20px "Space Grotesk","Consolas",monospace';
    g.fillText(data.info.title, W - 88, 126);
    g.textAlign = "left";
    g.strokeStyle = "#273234"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(88, 204); g.lineTo(W - 88, 204); g.stroke();

    const hasFinished = data.confirmedTotal > 0;
    g.fillStyle = "#B6C4C0"; g.font = '400 22px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText(hasFinished ? "已确认守住" : "还可争取（估算）", 88, 266);
    g.fillStyle = hasFinished ? "#9DF0C2" : "#FF715B"; g.font = '600 92px "Space Grotesk","Consolas",monospace';
    g.fillText(money(hasFinished ? data.confirmedTotal : data.dueAmount), 88, 374);
    g.fillStyle = "#B6C4C0"; g.font = '400 24px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText(hasFinished ? `${data.completedCount} 件确认办结 · 只算到账/兑现` : `${data.dueWindows.length} 件临近截止 · 预计不是到账`, 88, 424);

    g.strokeStyle = "#273234"; g.beginPath(); g.moveTo(88, 484); g.lineTo(W - 88, 484); g.stroke();
    const metrics = [
      ["到期窗口", String(data.dueWindows.length)],
      ["确认办结", String(data.completedCount)],
      ["待补证据", String(data.missing)],
      ["家庭成员", String(data.family.length)]
    ];
    metrics.forEach(([label, value], index) => {
      const x = 88 + index * 236;
      g.fillStyle = "#82918D"; g.font = '400 18px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
      g.fillText(label, x, 542);
      g.fillStyle = "#F1F7F4"; g.font = '600 36px "Space Grotesk","Consolas",monospace';
      g.fillText(value, x, 592);
    });

    g.strokeStyle = "#273234"; g.beginPath(); g.moveTo(88, 650); g.lineTo(W - 88, 650); g.stroke();
    g.fillStyle = "#F1F7F4"; g.font = '600 30px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("最急的几件", 88, 710);
    const due = data.dueWindows.slice(0, 3);
    due.forEach((row, index) => {
      const y = 780 + index * 92;
      g.fillStyle = "#B6C4C0"; g.font = '400 22px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
      g.fillText(`${row.member} · ${row.win.label}`, 88, y);
      g.textAlign = "right";
      g.fillStyle = row.win.daysLeft <= 3 ? "#FF715B" : "#9DF0C2";
      g.font = '600 24px "Space Grotesk","Consolas",monospace';
      g.fillText(`${row.win.daysLeft} 天`, W - 88, y);
      g.textAlign = "left";
      g.strokeStyle = "#1D2729"; g.beginPath(); g.moveTo(88, y + 28); g.lineTo(W - 88, y + 28); g.stroke();
    });
    if (!due.length) {
      g.fillStyle = "#82918D"; g.font = '400 24px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
      g.fillText("这一期没有临近截止的窗口。", 88, 790);
    }

    g.strokeStyle = "#273234"; g.beginPath(); g.moveTo(88, H - 210); g.lineTo(W - 88, H - 210); g.stroke();
    g.fillStyle = "#9DF0C2"; g.font = '600 26px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("先办最急的一件，再记到账。", 88, H - 150);
    g.fillStyle = "#82918D"; g.font = '400 20px "Noto Sans SC","Microsoft YaHei UI",sans-serif';
    g.fillText("不暴露订单号 / 电话 / 地址 · 预计金额不是到账", 88, H - 112);
    cv.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `piaogen-report-${data.period}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast("已生成报告卡");
    }, "image/png");
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

  function openAiConsentSheet() {
    openSheet("开启前，先说清楚", `
      <p class="sheet-hint">会发送：商家名、问题类型、你勾选的证据名称、你填写的备注文字。</p>
      <p class="sheet-hint">不会发送：图片、完整卡号、卡尾号、订单号、手机号、地址、验证码。</p>
      <p class="sheet-hint">金额与日期默认不发送；需要时由你逐次勾选。</p>
      <p class="sheet-hint">模型由你自己选择并填写 Key。Key 只存在本机，不进入备份、不进入分享卡，不上传到票根。</p>
      <p class="sheet-hint">AI 建议不会修改金额、日期、状态或证据。</p>
      <div class="sheet-actions">
        <button class="btn ghost" id="aiConsentNo" type="button">暂不开启</button>
        <button class="btn primary" id="aiConsentYes" type="button">我已了解，开启</button>
      </div>`, () => {
      $("#aiConsentNo").onclick = closeSheet;
      $("#aiConsentYes").onclick = () => {
        saveAiConfig({ enabled: true });
        closeSheet();
        renderSettings();
        openAiConfigSheet();
      };
    });
  }

  function openAiConfigSheet() {
    const cfg = aiConfig();
    openSheet("模型与隐私", `
      <p class="sheet-hint">任意 OpenAI 兼容的 /chat/completions 端点。Key 只存本机，不进入备份。</p>
      ${field("端点", "aiEndpoint", cfg.endpoint, "text", "http://127.0.0.1:11434/v1/chat/completions")}
      ${field("模型", "aiModel", cfg.model, "text", "例如 qwen2.5:7b / gpt-4o-mini")}
      ${field("Key（可留空）", "aiKey", cfg.key, "password", "只存本机，不进入备份")}
      <p class="annual-note">本地 Ollama 需设置 OLLAMA_ORIGINS 允许浏览器访问；云端端点若不允许跨域，会显示失败，规则结论仍可用。</p>
      <div class="sheet-actions">
        <button class="btn primary" id="aiCfgSave" type="button">保存</button>
        <button class="btn ghost" id="aiCfgClear" type="button">清除 Key</button>
        <button class="btn ghost" id="aiCfgOff" type="button">关闭 AI 建议</button>
      </div>`, () => {
      $("#aiCfgSave").onclick = () => {
        saveAiConfig({
          endpoint: $("#f-aiEndpoint").value.trim(),
          model: $("#f-aiModel").value.trim(),
          key: $("#f-aiKey").value
        });
        closeSheet();
        renderSettings();
        toast("模型设置已保存");
      };
      $("#aiCfgClear").onclick = () => {
        saveAiConfig({ key: "" });
        $("#f-aiKey").value = "";
        toast("Key 已清除");
      };
      $("#aiCfgOff").onclick = () => {
        saveAiConfig({ enabled: false });
        closeSheet();
        renderSettings();
        toast("AI 建议已关闭");
      };
    });
  }

  function openEvidenceSheet() {
    const real = PG.REAL || {};
    const meta = PG.RULES_META || {};
    const sanbao = real.sanbao && Array.isArray(real.sanbao.items) ? real.sanbao.items.length : 0;
    const paths = Array.isArray(real.paths) ? real.paths.length : 0;
    const platforms = real.priceRules && Array.isArray(real.priceRules.platforms) ? real.priceRules.platforms.length : 0;
    const rules = Object.keys(PG.BASIS || {}).length;
    const row = (label, value, note, warn) => `<div class="evidence-row">
      <div><b>${escapeHtml(label)}</b>${note ? `<small>${escapeHtml(note)}</small>` : ""}</div>
      <span class="${warn ? "warn" : ""}">${escapeHtml(value)}</span>
    </div>`;
    const sec = (title, rows) => `<div class="evidence-sec"><h3>${escapeHtml(title)}</h3>${rows.join("")}</div>`;
    const body = `
      <p class="sheet-hint">这一页只放能复现的事实：规则来自哪、测试跑过什么、哪些还没做。数字核对于 2026-11-23。</p>
      ${sec("参赛方向与公开愿望", [
        row("参赛方向", "生活好帮手", "个人开发者 / 创作者；官方赛道含生活记账"),
        row("揪出悄悄扣钱的自动续费", "可用", "自动续费体检、扣费日历、关闭路径"),
        row("帮我写投诉", "可用", "12315 / 12345 / 平台介入 / 黑猫模板")
      ])}
      ${sec("规则依据", [
        row("公开依据", `${rules} 条`, `核对于 ${meta.checkedAt || "—"}；条款号与施行日期可在规则库查看`),
        row("三包类目", `${sanbao} 类`, "法定目录内；目录外适用《消保法》第二十四条"),
        row("官方办理路径", `${paths} 条`, "平台、监管与行业渠道，不代提交"),
        row("资金售后", `${Object.keys(FINANCE_TYPES).length} 类`, "支付、拒付、续费、预付卡、分期、保险"),
        platforms ? row("价保规则", `${platforms} 个平台`, "平台承诺，不是法定权利；以订单页为准") : ""
      ])}
      ${sec("测试基线", [
        row("用户主流程", "118/118", "浏览器内点击、建案、导出与回执"),
        row("主流程冒烟", "OK", "首屏、六栏、导入、案卷、报告"),
        row("真实订单样例", "40/40", "结构已脱敏，只验证字段与规则"),
        row("订单样本", "19/19", "订单页字段与分拣"),
        row("MCP", "8/8", "initialize / tools/list / tools/call"),
        row("本地线上同构", "35/35", "以 PIAOGEN_URL 指向本地运行"),
        row("文档一致性", "通过", "版本、哈希、入口与交接文档")
      ])}
      ${sec("数据与 AI", [
        row("数据位置", "本机", "localStorage；换设备需手动导出导入"),
        row("上传", "无", "OCR、PDF、规则与金额计算都在本机完成"),
        row("大模型调用", "可选", "默认关闭；端点与 Key 由你填写，发送前预览内容"),
        row("AI 建议", "仅建议", "不改金额、日期、状态、证据；与规则结论分开标注")
      ])}
      ${sec("已知局限", [
        row("真人可用性测试", "未执行", "当前测试用户是合成夹具，不是访谈样本", true),
        row("天数的性质", "规则计算", "不等于机构最终认定；以合同与机构告知为准"),
        row("平台登录", "不代登录", "不索取账号、密码、验证码"),
        row("代为提交", "不代提交", "只生成材料包、路径与回执记录"),
        row("扣费提醒", "依赖日历", "预计日期按历史间隔推算，以平台账单为准")
      ])}
      <p class="annual-note">金额三口径分开：争议金额、预计可追回、确认解决。只有你确认到账或解决，才计入“已确认解决”；不承诺保证退回或拒付成功。</p>
      <div class="sheet-actions">
        <button class="btn ghost" id="evidenceRules" type="button">打开规则库</button>
        <button class="btn ghost" id="evidenceClose" type="button">关闭</button>
      </div>`;
    openSheet("核验与边界", body, () => {
      $("#evidenceClose").addEventListener("click", closeSheet);
      $("#evidenceRules").addEventListener("click", () => { closeSheet(); openRulesSheet(); });
    });
  }

  function openDevCallSheet() {
    const config = `{
  "mcpServers": {
    "piaogen": {
      "command": "node",
      "args": ["<解压目录>/v0/mcp/server.js"]
    }
  }
}`;
    const tools = [
      ["rights.lookup", "按商品 / 问题查消费权利窗口"],
      ["rights.plan", "生成消费权利办理路径"],
      ["rights.record", "写入示例案卷（仅进程内）"],
      ["finance.lookup", "按资金问题查六类售后规则"],
      ["finance.plan", "生成资金售后路径与材料"],
      ["finance.record", "写入示例资金案卷（仅进程内）"]
    ];
    openSheet("开发者调用", `<p class="sheet-hint">票根同时是一个可被外部 Agent 调用的 stdio MCP server。演示数据只读，不接触你本机的票据。</p>
      <pre class="finance-script">${escapeHtml(config)}</pre>
      <div class="settings-list" style="margin-top:10px">
        ${tools.map(([name, desc]) => `<div class="setting-row"><div><b>${escapeHtml(name)}</b><small>${escapeHtml(desc)}</small></div><span>›</span></div>`).join("")}
      </div>
      <div class="evidence-sec"><h3>典型意图</h3>
        ${[
          ["这单空气炸锅还能退吗？", "rights.lookup"],
          ["我妈的会员自动续费能退吗？", "finance.lookup"],
          ["帮我把退款案卷推进下一步", "finance.plan"]
        ].map(([intent, tool]) => `<div class="setting-row"><div><b>${escapeHtml(intent)}</b><small>${escapeHtml(tool)}</small></div><span>›</span></div>`).join("")}
      </div>
      <p class="annual-note">验证：python mcp_smoke.py 应 8/8；MCP Inspector 选 STDIO，tools/list 应出现 6 个工具。远程 MCP 尚未部署，当前是本地 stdio 调用。演示数据不是线上实时用户数据；不代提交、不收款、不访问 shell / 文件系统 / 任意 HTTP。</p>
      <div class="sheet-actions">
        <button class="btn primary" id="devCallCopy" type="button">复制配置</button>
        <button class="btn ghost" id="devCallClose" type="button">关闭</button>
      </div>`, () => {
      $("#devCallClose").addEventListener("click", closeSheet);
      $("#devCallCopy").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(config); toast("MCP 配置已复制"); }
        catch { toast("浏览器不允许复制，请手动选中"); }
      });
    });
  }

  function renderSettings() {
    $("#settingCount").textContent = String(state.tickets.length);
    const open = $("#openAnnual");
    if (open) open.onclick = () => openReport("week");
    const rules = $("#openRules");
    if (rules) rules.onclick = openRulesSheet;
    const toggleAi = $("#toggleAi");
    if (toggleAi) toggleAi.onclick = () => { if (aiConfig().enabled) openAiConfigSheet(); else openAiConsentSheet(); };
    const aiConfigBtn = $("#openAiConfig");
    if (aiConfigBtn) aiConfigBtn.onclick = openAiConfigSheet;
    const evidence = $("#openEvidence");
    if (evidence) evidence.onclick = openEvidenceSheet;
    const devCall = $("#openDevCall");
    if (devCall) devCall.onclick = openDevCallSheet;
    const subs = $("#openSubs");
    if (subs) subs.onclick = openSubsSheet;
    const coupons = $("#openCoupons");
    if (coupons) coupons.onclick = openCouponSheet;
    const pts = $("#openPoints");
    if (pts) pts.onclick = openPointsSheet;
    const fam = $("#openFamily");
    if (fam) fam.onclick = openFamilySheet;
    const fin = $("#openFinance");
    if (fin) fin.onclick = () => show("finance");
    const finCount = $("#financeCount");
    if (finCount) finCount.textContent = String(financeSummaryData().active.length);
    const fc = $("#familyCount");
    if (fc) fc.textContent = String((state.tickets || []).filter((t) => t.helper && t.helper.forWhom).length);
    const pt = $("#pointTotal");
    if (pt) pt.textContent = String((state.points || []).reduce((s, p) => s + (Number(p.balance) || 0), 0));
    const ov = $("#assetOverview");
    if (ov) {
      const subs = PG.detectSubscriptions(state.tickets || []).length;
      ov.innerHTML = `<div><b>${(state.tickets || []).length}</b><span>票据</span></div>
        <div><b>${(state.coupons || []).length}</b><span>券</span></div>
        <div><b>${subs}</b><span>订阅</span></div>
        <div><b>${(state.points || []).length}</b><span>积分</span></div>`;
    }
    const cc = $("#couponCount");
    if (cc) cc.textContent = String((state.coupons || []).length);
    applySettings();
  }

  function exportAll() {
    const blob = new Blob([JSON.stringify({
      version: 2,
      exportedAt: new Date().toISOString(),
      tickets: state.tickets,
      finance: state.finance,
      coupons: state.coupons,
      points: state.points
    }, null, 2)], { type: "application/json" });
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
        if (Array.isArray(data.finance)) {
          const existing = new Set((state.finance || []).map((item) => item.id));
          state.finance = data.finance.filter((item) => !existing.has(item.id)).concat(state.finance || []);
          saveFinance();
        }
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
    if ($("#financeAdd")) $("#financeAdd").addEventListener("click", openFinanceTypeSheet);
    if ($("#emptyAudit")) $("#emptyAudit").addEventListener("click", () => startAudit(true));
    if ($("#openAudit")) $("#openAudit").addEventListener("click", () => startAudit(true));
    if ($("#installApp")) $("#installApp").addEventListener("click", async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice.catch(() => null);
        deferredInstallPrompt = null;
        if (choice && choice.outcome === "accepted") toast("已安装到桌面");
        return;
      }
      openSheet("安装到桌面", `
        <p class="sheet-hint">安装后可以像 App 一样打开，核心页面离线可用。</p>
        <div class="install-steps">
          <div><b>iPhone / Safari</b><span>点底部「分享」→「添加到主屏幕」</span></div>
          <div><b>Android / Chrome</b><span>点右上角菜单 →「安装应用」或「添加到主屏幕」</span></div>
          <div><b>电脑 Chrome / Edge</b><span>点地址栏右侧的安装图标，或菜单 →「安装票根」</span></div>
        </div>
        <p class="fine">如果浏览器没有安装入口，先确认是通过 https 或 localhost 打开。</p>`);
    });
    if ($("#toggleElder")) $("#toggleElder").addEventListener("click", () => {
      state.settings.elder = !state.settings.elder;
      saveSettings();
      applySettings();
      renderSettings();
      toast(state.settings.elder ? "长辈模式已开" : "长辈模式已关");
    });
    if ($("#readToday")) $("#readToday").addEventListener("click", () => {
      if (!("speechSynthesis" in window)) { toast("这台浏览器不支持朗读"); return; }
      const host = $("#todayContent").classList.contains("hidden") ? $("#todayEmpty") : $("#todayContent");
      const text = host.innerText.replace(/\s+/g, " ").slice(0, 600);
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = 0.92;
      speechSynthesis.speak(u);
      toast("开始朗读今天");
    });
    $("#emptyBill").addEventListener("click", openBill);
    if ($("#todayBill")) $("#todayBill").addEventListener("click", openBill);
    $("#emptyCamera").addEventListener("click", () => $("#fileCamera").click());
    $("#emptyImport").addEventListener("click", () => show("import"));
    if ($("#emptyFinance")) $("#emptyFinance").addEventListener("click", () => show("finance"));
    $("#emptyIntake").addEventListener("click", intakeSheet);
    $("#emptyDemo").addEventListener("click", addDemo);
    $("#addBtn").addEventListener("click", () => show("import"));
    $("#intakeForm").addEventListener("submit", (event) => {
      event.preventDefault();
      runIntake($("#intakeText").value);
    });
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
      if (state.current && state.currentWindow) outcomeSheet(state.current, state.currentWindow, "acknowledged", (outcome) => recordOutcome(state.current, state.currentWindow, outcome));
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
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
    });
    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      toast("已安装到桌面");
    });
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
    }
    load();
    loadAudit();
    loadSettings();
    loadCoupons();
    loadPoints();
    loadFinance();
    bind();
    if (/[?&]demo=1/.test(location.search) && !state.tickets.length) {
      addDemo();
    }
    renderToday();
    renderImport();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

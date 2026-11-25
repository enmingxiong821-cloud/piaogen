/* 票根 · 健康账本：只记支出、保障、提醒与办事路径。
   本机存储，不做诊断、不推荐药品/保险/治疗，不替代医生与医保机构。 */
(function () {
  const KEY = "piaogen.health.v1";
  const TYPES = [
    ["clinic", "门诊/住院"], ["medicine", "药品"], ["checkup", "体检"], ["dental", "口腔"],
    ["fitness", "健身"], ["supplement", "保健"], ["mental", "心理"], ["other", "其他"]
  ];
  const KINDS = [["medical", "医保"], ["commercial", "商业保险"], ["huimin", "惠民保"], ["other", "其他"]];
  let db = load();
  let view = "records";

  const esc = (v) => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const money = (n) => "¥" + (Number(n) || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  const uid = () => Math.random().toString(36).slice(2, 10);
  const today = () => new Date().toISOString().slice(0, 10);
  const daysFrom = (date) => {
    if (!date) return null;
    const d = new Date(date + "T00:00:00");
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((d - now) / 86400000);
  };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      return {
        records: Array.isArray(raw.records) ? raw.records : [],
        reminders: Array.isArray(raw.reminders) ? raw.reminders : [],
        coverage: Array.isArray(raw.coverage) ? raw.coverage : []
      };
    } catch (e) {
      return { records: [], reminders: [], coverage: [] };
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
  }

  function typeLabel(key) {
    const hit = TYPES.find((t) => t[0] === key);
    return hit ? hit[1] : "其他";
  }

  function kindLabel(key) {
    const hit = KINDS.find((t) => t[0] === key);
    return hit ? hit[1] : "其他";
  }

  function summary() {
    const month = today().slice(0, 7);
    const monthRecords = db.records.filter((r) => String(r.date || "").slice(0, 7) === month);
    const monthTotal = monthRecords.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const pendingClaim = db.records.filter((r) => r.claim === "pending").reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const dueReminders = db.reminders
      .map((r) => ({ ...r, days: daysFrom(r.date) }))
      .filter((r) => r.days !== null && r.days <= 30)
      .sort((a, b) => a.days - b.days);
    const byType = {};
    monthRecords.forEach((r) => { byType[r.type || "other"] = (byType[r.type || "other"] || 0) + (Number(r.amount) || 0); });
    const topType = Object.keys(byType).sort((a, b) => byType[b] - byType[a])[0] || "";
    return { monthTotal, pendingClaim, dueReminders, topType, topTypeAmount: topType ? byType[topType] : 0, byType, count: monthRecords.length };
  }

  function statsHtml() {
    const s = summary();
    return `<div class="health-stats">
      <div class="hstat"><b>${money(s.monthTotal)}</b><span>本月健康支出</span></div>
      <div class="hstat ${s.dueReminders.length ? "warn" : ""}"><b>${s.dueReminders.length}</b><span>30 天内提醒</span></div>
      <div class="hstat"><b>${money(s.pendingClaim)}</b><span>待报销</span></div>
    </div>`;
  }

  function viewChips() {
    const views = [["records", "支出"], ["reminders", "提醒"], ["coverage", "保障"], ["paths", "怎么办"]];
    return `<div class="health-tabs" role="tablist" aria-label="健康账本">${views.map(([id, label]) =>
      `<button type="button" class="health-tab ${view === id ? "on" : ""}" data-health-view="${id}" role="tab" aria-selected="${view === id}">${label}</button>`).join("")}</div>`;
  }

  function recordForm() {
    return `<form class="health-form" id="healthRecordForm">
      <div class="hf-row">
        <label class="field"><span>日期</span><input type="date" id="hrDate" value="${today()}" required /></label>
        <label class="field"><span>金额</span><input type="number" id="hrAmount" min="0" step="0.01" inputmode="decimal" placeholder="0.00" required /></label>
      </div>
      <div class="hf-row">
        <label class="field"><span>类型</span><select id="hrType">${TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
        <label class="field"><span>给谁</span><input id="hrWho" placeholder="我 / 爸爸 / 孩子" maxlength="12" /></label>
      </div>
      <label class="field"><span>备注（可选）</span><input id="hrNote" placeholder="医院 / 药店 / 项目" maxlength="40" /></label>
      <label class="hf-check"><input type="checkbox" id="hrClaim" /> 这笔要报销 / 理赔</label>
      <div class="health-form-actions">
        <button class="btn primary" type="submit">记下</button>
        <button class="btn ghost" type="button" data-health-cancel>取消</button>
      </div>
    </form>`;
  }

  function recordsHtml() {
    const rows = db.records.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const s = summary();
    const bars = Object.keys(s.byType).sort((a, b) => s.byType[b] - s.byType[a]).slice(0, 4).map((k) => {
      const pct = s.monthTotal ? Math.round((s.byType[k] / s.monthTotal) * 100) : 0;
      return `<div class="hbar"><span>${esc(typeLabel(k))}</span><i style="width:${pct}%"></i><b>${money(s.byType[k])}</b></div>`;
    }).join("");
    return `${recordForm()}
      ${s.count ? `<div class="health-insight"><p><b>本月 ${s.count} 笔</b>，${s.topType ? `最多是${esc(typeLabel(s.topType))} ${money(s.topTypeAmount)}` : ""}。只做记录，不做健康判断。</p>${bars}</div>` : ""}
      <div class="health-list">${rows.length ? rows.map((r) => `<div class="health-row">
        <div class="hrow-main"><b>${esc(typeLabel(r.type))}</b><small>${esc(r.date || "")}${r.who ? " · " + esc(r.who) : ""}${r.note ? " · " + esc(r.note) : ""}</small></div>
        <div class="hrow-side"><b>${money(r.amount)}</b>${r.claim === "pending" ? `<span class="hbadge">待报销</span>` : ""}</div>
        <button class="icon-btn small" type="button" data-health-del-record="${esc(r.id)}" aria-label="删除这笔">×</button>
      </div>`).join("") : `<div class="health-empty"><b>还没有记录</b><p>记下第一笔门诊、药品或体检支出，就能按月看健康花了多少。</p></div>`}</div>`;
  }

  function remindersHtml() {
    const rows = db.reminders.map((r) => ({ ...r, days: daysFrom(r.date) })).sort((a, b) => (a.days == null ? 9999 : a.days) - (b.days == null ? 9999 : b.days));
    return `<form class="health-form compact" id="healthRemindForm">
      <div class="hf-row">
        <label class="field"><span>提醒什么</span><input id="hmTitle" placeholder="体检 / 复诊 / 拿药 / 疫苗" maxlength="24" required /></label>
        <label class="field"><span>日期</span><input type="date" id="hmDate" value="${today()}" required /></label>
      </div>
      <div class="hf-row">
        <label class="field"><span>给谁</span><input id="hmWho" placeholder="我 / 妈妈" maxlength="12" /></label>
        <button class="btn primary" type="submit">加提醒</button>
      </div>
    </form>
    <div class="health-list">${rows.length ? rows.map((r) => {
      const d = r.days;
      const when = d == null ? "未填日期" : d < 0 ? `已过 ${-d} 天` : d === 0 ? "今天" : `还剩 ${d} 天`;
      return `<div class="health-row">
        <div class="hrow-main"><b>${esc(r.title)}</b><small>${esc(r.date || "")}${r.who ? " · " + esc(r.who) : ""} · ${when}</small></div>
        <button class="text-btn" type="button" data-health-ics="${esc(r.id)}">加到日历</button>
        <button class="icon-btn small" type="button" data-health-del-remind="${esc(r.id)}" aria-label="删除提醒">×</button>
      </div>`;
    }).join("") : `<div class="health-empty"><b>没有提醒</b><p>体检、复诊、拿药、疫苗都可以记；只在本机，可导出到日历。</p></div>`}</div>`;
  }

  function coverageHtml() {
    const rows = db.coverage.map((c) => {
      const d = daysFrom(c.expires);
      return `<div class="health-row">
        <div class="hrow-main"><b>${esc(c.name)}</b><small>${esc(kindLabel(c.kind))}${c.note ? " · " + esc(c.note) : ""}${c.expires ? " · " + (d != null && d < 0 ? "已过期" : "有效期至 " + esc(c.expires)) : ""}</small></div>
        <button class="icon-btn small" type="button" data-health-del-cover="${esc(c.id)}" aria-label="删除保障">×</button>
      </div>`;
    }).join("");
    return `<form class="health-form compact" id="healthCoverForm">
      <div class="hf-row">
        <label class="field"><span>保障名称</span><input id="hcName" placeholder="医保 / 百万医疗 / 惠民保" maxlength="24" required /></label>
        <label class="field"><span>类型</span><select id="hcKind">${KINDS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
      </div>
      <div class="hf-row">
        <label class="field"><span>说明（起付线/报销比例，照合同填）</span><input id="hcNote" placeholder="以合同为准" maxlength="40" /></label>
        <label class="field"><span>有效期</span><input type="date" id="hcExp" /></label>
      </div>
      <div class="health-form-actions">
        <button class="btn primary" type="submit">记下保障</button>
        <button class="btn ghost" type="button" id="healthPolicy">拍保单，读犹豫期</button>
      </div>
    </form>
    <div class="health-list">${rows || `<div class="health-empty"><b>还没有保障记录</b><p>医保、商业保险、惠民保都可以记；不做推荐，只帮你在要理赔时找得到。</p></div>`}</div>
    <p class="health-note">保障责任、起付线、报销比例以保险合同与当地医保政策为准；这里不判断能不能赔。</p>`;
  }

  function pathsHtml() {
    const paths = [
      {
        title: "门诊 / 住院医保报销",
        who: "定点医院医保窗口，或国家医保服务平台",
        bring: "医保码或医保卡、发票、费用清单、病历/出院小结",
        note: "起付线、比例、目录以参保地政策为准；先结算再补材料。",
        link: "https://fuwu.nhsa.gov.cn/", label: "国家医保服务平台"
      },
      {
        title: "商业保险理赔",
        who: "保险公司 App / 客服 / 代理人",
        bring: "保单、发票原件、费用清单、出院小结、银行卡",
        note: "以合同约定的医院范围、免赔额与时限为准，不承诺赔付。",
        link: "", label: ""
      },
      {
        title: "异地就医备案",
        who: "国家医保服务平台 App → 异地备案",
        bring: "身份信息、就医地、备案类型",
        note: "备案要求与有效期以参保地医保局为准。",
        link: "https://fuwu.nhsa.gov.cn/", label: "国家医保服务平台"
      },
      {
        title: "保险犹豫期",
        who: "承保机构客服，书面提出解除合同",
        bring: "保单号、签收日期、解除申请",
        note: "长期健康险犹豫期不少于 15 日（《健康保险管理办法》第十五条）；其他险种以合同为准。",
        link: "https://www.gov.cn/gongbao/content/2019/content_5468924.htm", label: "《健康保险管理办法》"
      }
    ];
    return `<div class="health-paths">${paths.map((p) => `<div class="health-path">
      <b>${esc(p.title)}</b>
      <p><span>找谁</span>${esc(p.who)}</p>
      <p><span>带什么</span>${esc(p.bring)}</p>
      <p class="hp-note">${esc(p.note)}</p>
      ${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.label)} ↗</a>` : ""}
    </div>`).join("")}</div>
    <p class="health-note">这里只给方向与材料清单，不代办、不代提交、不判断能不能赔。</p>`;
  }

  function render() {
    const host = document.getElementById("healthBody");
    if (!host) return;
    const body = view === "records" ? recordsHtml() : view === "reminders" ? remindersHtml() : view === "coverage" ? coverageHtml() : pathsHtml();
    host.innerHTML = statsHtml() + viewChips() + body;
    const badge = document.getElementById("healthTabCount");
    if (badge) {
      const n = summary().dueReminders.length;
      badge.textContent = String(n);
      badge.hidden = !n;
    }
  }

  function download(name, text) {
    const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  function icsFor(reminder) {
    const date = String(reminder.date || "").replace(/-/g, "");
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Piaogen//Health//CN", "BEGIN:VEVENT",
      `UID:${reminder.id}@piaogen`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART;VALUE=DATE:${date}`, `SUMMARY:${reminder.title}${reminder.who ? " · " + reminder.who : ""}`,
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  }

  function bind() {
    document.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-health-view]");
      if (tab) { view = tab.dataset.healthView; render(); return; }
      const cancel = event.target.closest("[data-health-cancel]");
      if (cancel) { const form = document.getElementById("healthRecordForm"); if (form) form.reset(); return; }
      const delR = event.target.closest("[data-health-del-record]");
      if (delR) { db.records = db.records.filter((r) => r.id !== delR.dataset.healthDelRecord); save(); render(); return; }
      const delM = event.target.closest("[data-health-del-remind]");
      if (delM) { db.reminders = db.reminders.filter((r) => r.id !== delM.dataset.healthDelRemind); save(); render(); return; }
      const delC = event.target.closest("[data-health-del-cover]");
      if (delC) { db.coverage = db.coverage.filter((r) => r.id !== delC.dataset.healthDelCover); save(); render(); return; }
      const ics = event.target.closest("[data-health-ics]");
      if (ics) {
        const item = db.reminders.find((r) => r.id === ics.dataset.healthIcs);
        if (item) download(`票根-${item.title}.ics`, icsFor(item));
        return;
      }
      const add = event.target.closest("#healthAdd");
      if (add) {
        view = "records"; render();
        const form = document.getElementById("healthRecordForm");
        if (form) { form.scrollIntoView({ block: "center", behavior: "smooth" }); const first = form.querySelector("input"); if (first) first.focus({ preventScroll: true }); }
        return;
      }
      const policy = event.target.closest("#healthPolicy");
      if (policy) {
        if (window.PGApp && window.PGApp.show) window.PGApp.show("import");
        return;
      }
    });

    document.addEventListener("submit", (event) => {
      const form = event.target;
      if (form.id === "healthRecordForm") {
        event.preventDefault();
        const amount = Number(document.getElementById("hrAmount").value);
        if (!(amount > 0)) return;
        db.records.push({
          id: uid(), date: document.getElementById("hrDate").value || today(),
          type: document.getElementById("hrType").value,
          amount, who: document.getElementById("hrWho").value.trim(),
          note: document.getElementById("hrNote").value.trim(),
          claim: document.getElementById("hrClaim").checked ? "pending" : ""
        });
        save(); render();
      }
      if (form.id === "healthRemindForm") {
        event.preventDefault();
        const title = document.getElementById("hmTitle").value.trim();
        if (!title) return;
        db.reminders.push({ id: uid(), title, date: document.getElementById("hmDate").value || today(), who: document.getElementById("hmWho").value.trim() });
        save(); render();
      }
      if (form.id === "healthCoverForm") {
        event.preventDefault();
        const name = document.getElementById("hcName").value.trim();
        if (!name) return;
        db.coverage.push({ id: uid(), name, kind: document.getElementById("hcKind").value, note: document.getElementById("hcNote").value.trim(), expires: document.getElementById("hcExp").value || "" });
        save(); render();
      }
    });
  }

  function importData(incoming) {
    if (!incoming || typeof incoming !== "object") return;
    ["records", "reminders", "coverage"].forEach((name) => {
      const seen = new Set(db[name].map((item) => item && item.id));
      (Array.isArray(incoming[name]) ? incoming[name] : []).forEach((item) => {
        if (item && item.id && !seen.has(item.id)) db[name].push(item);
      });
    });
    save();
    render();
  }

  bind();
  window.PGHealth = {
    render, summary, importData,
    exportData: () => JSON.parse(JSON.stringify(db)),
    count: () => summary().dueReminders.length
  };
})();
/* 票根 · 真实用户测试台
   只做一件事：让 3–5 位真实用户按 5 个任务走一遍，记录完成率、用时、卡点。
   不收集姓名、手机号、地址；数据只存本机 localStorage，可导出、可删除。 */
(() => {
  "use strict";

  const KEY = "piaogen.v0.testkit";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const now = () => Date.now();
  const fmt = (ms) => {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
  };

  const TASKS = [
    {
      id: "t1", title: "用示例走一遍", target: "今天 → 用示例走一遍（30 秒）",
      desc: "从今天页点“用示例走一遍”，看到今天出现示例案卷、到期项和回执。",
      go: () => { const app = window.PGApp; if (app) app.show("today"); const b = $("#emptyDemo"); if (b) b.click(); },
      check: () => {
        const c = $("#todayContent");
        const list = $("#ticketList");
        return c && !c.classList.contains("hidden") && list && list.children.length > 0;
      }
    },
    {
      id: "t2", title: "导一份账单", target: "今天 → 粘一段账单 / 导入",
      desc: "把一份支付宝账单放进“账单月报”，看到这个月的支出和可疑续费。",
      go: () => { seedBillOnce(); if (window.PGToolbox) window.PGToolbox.open("bill", "today"); },
      check: () => bills().length > 0 && window.PGToolbox && window.PGToolbox.views().view === "bill"
    },
    {
      id: "t3", title: "找到最近到期的一项", target: "办事台 → 还能退",
      desc: "打开“还能退”，找到 7 天内到期的一项，并说出它是什么。",
      go: () => { if (window.PGToolbox) window.PGToolbox.open("deadline", "today"); },
      check: () => window.PGToolbox && window.PGToolbox.views().view === "deadline"
    },
    {
      id: "t4", title: "写一份诉求", target: "办事台 → 诉求助手",
      desc: "在“诉求助手”里填四格，生成一份能直接复制给客服的诉求。",
      go: () => { if (window.PGToolbox) window.PGToolbox.open("complaint", "today"); },
      check: () => {
        const out = $("#tbComplaintOut");
        const story = $('[data-cf="story"]');
        return window.PGToolbox && window.PGToolbox.views().view === "complaint" && out &&
          story && story.value.trim().length > 10 && (out.textContent || "").trim().length > 80;
      }
    },
    {
      id: "t5", title: "给爸妈做一张单", target: "办事台 → 家庭体检单",
      desc: "打开“家庭体检单”，看到一张能打印、能转发的单子。",
      go: () => { if (window.PGToolbox) window.PGToolbox.open("family", "today"); },
      check: () => window.PGToolbox && window.PGToolbox.views().view === "family" && /家庭体检|打印|转发/.test(($("#toolboxBody") || {}).textContent || "")
    }
  ];

  let db = load();
  let tick = null;
  let errors = 0;
  let errorBound = false;

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && Array.isArray(raw.sessions)) return raw;
    } catch (e) {}
    return { version: 1, sessions: [] };
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
  }

  function bills() {
    try {
      const t = JSON.parse(localStorage.getItem("piaogen.v0.toolbox") || "{}");
      return Array.isArray(t.bills) ? t.bills : [];
    } catch (e) { return []; }
  }

  function seedBillOnce() {
    if (bills().length) return;
    const today = new Date();
    const d = (n) => {
      const x = new Date(today.getTime() - n * 86400000);
      return x.toISOString().slice(0, 10);
    };
    const rows = [
      { id: "tk1", date: d(1), merchant: "某视频会员", desc: "连续包月", category: "娱乐", source: "支付宝", person: "本人", direction: "expense", amount: 25 },
      { id: "tk2", date: d(3), merchant: "某外卖", desc: "午餐", category: "餐饮", source: "支付宝", person: "本人", direction: "expense", amount: 38.5 },
      { id: "tk3", date: d(5), merchant: "某电商", desc: "日用品", category: "购物", source: "支付宝", person: "本人", direction: "expense", amount: 126 },
      { id: "tk4", date: d(2), merchant: "某电商退款", desc: "退款", category: "购物", source: "支付宝", person: "本人", direction: "income", amount: 46 }
    ];
    try {
      const t = JSON.parse(localStorage.getItem("piaogen.v0.toolbox") || "{}");
      t.version = t.version || 1;
      t.bills = rows;
      t.imports = [{ id: "tk-import", name: "测试示例账单.csv", at: new Date().toISOString(), count: rows.length, dupes: 0 }];
      localStorage.setItem("piaogen.v0.toolbox", JSON.stringify(t));
      if (window.PGToolbox && window.PGToolbox.reload) window.PGToolbox.reload();
    } catch (e) {}
  }

  function current() {
    return db.sessions[db.sessions.length - 1] || null;
  }

  function newSession(code) {
    const s = {
      id: "S" + now().toString(36),
      code: code || "T" + (db.sessions.length + 1),
      startedAt: now(), endedAt: null,
      viewport: { w: window.innerWidth, h: window.innerHeight, mobile: window.innerWidth < 600 },
      tasks: TASKS.map((t) => ({ id: t.id, title: t.title, startedAt: null, endedAt: null, completed: null, hints: 0 })),
      ratings: null, note: "", errors: 0
    };
    db.sessions.push(s);
    save();
    bindErrors();
    startTick();
    return s;
  }

  function bindErrors() {
    if (errorBound) return;
    errorBound = true;
    window.addEventListener("error", () => {
      errors += 1;
      const s = current();
      if (s && !s.endedAt) { s.errors = errors; save(); }
    });
  }

  function startTick() {
    if (tick) return;
    tick = setInterval(() => {
      const s = current();
      if (!s || s.endedAt) return;
      let dirty = false;
      s.tasks.forEach((rec) => {
        if (rec.startedAt && rec.completed === null) {
          const def = TASKS.find((t) => t.id === rec.id);
          if (def && def.check()) {
            rec.completed = true;
            rec.endedAt = now();
            dirty = true;
            if (window.PGApp) window.PGApp.toast(`任务完成：${def.title} · ${fmt(rec.endedAt - rec.startedAt)}`);
          }
        }
      });
      if (dirty) { save(); render(); }
    }, 450);
  }

  function stopTick() {
    if (tick) { clearInterval(tick); tick = null; }
  }

  function startTask(id) {
    const s = current() || newSession();
    const rec = s.tasks.find((t) => t.id === id);
    const def = TASKS.find((t) => t.id === id);
    if (!rec || !def) return;
    rec.startedAt = now();
    rec.endedAt = null;
    rec.completed = null;
    save();
    def.go();
    render();
  }

  function failTask(id) {
    const s = current();
    if (!s) return;
    const rec = s.tasks.find((t) => t.id === id);
    if (!rec) return;
    if (!rec.startedAt) rec.startedAt = now();
    rec.completed = false;
    rec.endedAt = now();
    save();
    render();
  }

  function hint(id) {
    const s = current();
    if (!s) return;
    const rec = s.tasks.find((t) => t.id === id);
    if (!rec) return;
    rec.hints += 1;
    save();
    if (window.PGApp) window.PGApp.toast("已记一次提示");
    render();
  }

  function finish() {
    const s = current();
    if (!s) return;
    s.endedAt = now();
    const clear = Number(($("#tkRateClear") || {}).value || 0);
    const useful = Number(($("#tkRateUseful") || {}).value || 0);
    const again = Number(($("#tkRateAgain") || {}).value || 0);
    s.ratings = { clear, useful, again };
    s.note = (($("#tkNote") || {}).value || "").slice(0, 300);
    save();
    stopTick();
    render();
    if (window.PGApp) window.PGApp.toast("本轮已结束，可以导出");
  }

  function summary(s) {
    const done = s.tasks.filter((t) => t.completed === true).length;
    const times = s.tasks.filter((t) => t.completed && t.endedAt).map((t) => t.endedAt - t.startedAt);
    const med = times.length ? times.slice().sort((a, b) => a - b)[Math.floor(times.length / 2)] : null;
    return { done, total: s.tasks.length, rate: Math.round(done / s.tasks.length * 100), med };
  }

  function ensureFab() {
    let fab = $("#tkFab");
    if (!fab) {
      fab = document.createElement("button");
      fab.id = "tkFab";
      fab.type = "button";
      fab.className = "tk-fab";
      fab.onclick = open;
      document.body.appendChild(fab);
    }
    const s = current();
    const active = s && !s.endedAt && !$('[data-screen="testkit"].on');
    fab.hidden = !active;
    if (active) fab.textContent = `测试台 · ${s.code}`;
    return fab;
  }

  function render() {
    const host = $("#testkitBody");
    if (!host) return;
    const s = current();
    setTimeout(ensureFab, 0);
    const has = !!s;
    host.innerHTML = `
      <div class="tk-intro">
        <p class="tk-kicker">真实用户测试 · 只记编号</p>
        <h2>5 个任务，看看别人能不能自己走完。</h2>
        <p>这不是产品功能，是给你找来的 3–5 位真实用户用的。测试者只填一个编号，不填姓名、手机号、地址；数据只存这台设备，导出后由你自己保管。</p>
        <div class="tk-consent">
          <label><input type="checkbox" id="tkConsent" /> 我知道这是测试；数据只存本机，可随时导出或删除。</label>
        </div>
        <div class="tk-row">
          <label class="tk-field"><span>测试者编号</span><input id="tkCode" value="${esc(has ? s.code : "T" + (db.sessions.length + 1))}" maxlength="12" /></label>
          <button class="btn primary" id="tkStart" type="button">${has && !s.endedAt ? "重新开始一轮" : "开始一轮"}</button>
        </div>
        <details class="tk-script">
          <summary>测试主持脚本（照着念）</summary>
          <ol>
            <li>“这是一个帮你处理付款后问题的工具。我先请你完成 5 个小任务，过程中我不提示，卡住了就说卡住了。”</li>
            <li>“请边做边说出你在找什么。做完或放弃都告诉我。”</li>
            <li>每轮结束问三句：哪里最不清楚？哪个最有用？你还会再用吗？</li>
            <li>不要替测试者点；不要解释功能；只记录卡点。</li>
          </ol>
        </details>
      </div>
      ${has ? renderSession(s) : `<p class="tk-empty">还没有测试记录。勾选同意后开始第一轮。</p>`}
      ${db.sessions.length ? renderHistory() : ""}
      <p class="tk-foot">不收集姓名、手机号、地址、订单号；导出文件只含任务用时、完成情况、评分与一句备注。</p>`;
    bind();
  }

  function renderSession(s) {
    const sum = summary(s);
    const ended = !!s.endedAt;
    return `
      <section class="tk-session">
        <div class="tk-session-head">
          <div><b>${esc(s.code)}</b><small>开始 ${new Date(s.startedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</small></div>
          <div class="tk-score"><b>${sum.done}/${sum.total}</b><span>完成 · 中位 ${fmt(sum.med)}</span></div>
        </div>
        <div class="tk-tasks">
          ${s.tasks.map((rec, i) => {
            const def = TASKS.find((t) => t.id === rec.id);
            const state = rec.completed === true ? "done" : rec.completed === false ? "fail" : rec.startedAt ? "run" : "";
            return `<div class="tk-task ${state}">
              <div class="tk-task-main">
                <span class="tk-num">${i + 1}</span>
                <div><b>${esc(def.title)}</b><small>${esc(def.desc)}</small><em>${esc(def.target)}</em></div>
              </div>
              <div class="tk-task-side">
                <span class="tk-time">${rec.startedAt ? fmt((rec.endedAt || now()) - rec.startedAt) : "未开始"}</span>
                ${rec.completed === null ? `<button class="btn ghost" type="button" data-tk="go" data-id="${rec.id}">${rec.startedAt ? "继续" : "开始"}</button>
                  <button class="text-btn" type="button" data-tk="hint" data-id="${rec.id}">提示 ${rec.hints || ""}</button>
                  ${rec.startedAt ? `<button class="text-btn" type="button" data-tk="fail" data-id="${rec.id}">没完成</button>` : ""}` :
                  `<b class="tk-verdict">${rec.completed ? "完成" : "没完成"}</b>`}
              </div>
            </div>`;
          }).join("")}
        </div>
        ${ended ? renderRatings(s) : `<div class="tk-actions"><button class="btn primary" type="button" data-tk="finish">结束本轮并评分</button></div>`}
      </section>`;
  }

  function renderRatings(s) {
    const r = s.ratings || {};
    const scale = (id, val) => `<select id="${id}" class="tk-select">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(val) === n ? "selected" : ""}>${n === 0 ? "未填" : n}</option>`).join("")}</select>`;
    return `<div class="tk-ratings">
      <h3>最后三句</h3>
      <label class="tk-field"><span>看得懂吗（1–5）</span>${scale("tkRateClear", r.clear)}</label>
      <label class="tk-field"><span>有用吗（1–5）</span>${scale("tkRateUseful", r.useful)}</label>
      <label class="tk-field"><span>还会再用吗（1–5）</span>${scale("tkRateAgain", r.again)}</label>
      <label class="tk-field"><span>最卡的地方（一句就够）</span><input id="tkNote" maxlength="300" value="${esc(s.note || "")}" placeholder="例如：不知道“回执”在哪" /></label>
      <div class="tk-actions">
        <button class="btn primary" type="button" data-tk="saveRate">保存评分</button>
        <button class="btn ghost" type="button" data-tk="exportOne">导出这一轮</button>
        <button class="btn ghost" type="button" data-tk="new">下一轮</button>
      </div>
    </div>`;
  }

  function renderHistory() {
    const rows = db.sessions.slice().reverse();
    const rates = rows.map((s) => summary(s).rate);
    const avg = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
    return `<section class="tk-history">
      <div class="tk-history-head"><h3>本机记录</h3><span>${rows.length} 轮 · 平均完成 ${avg}%</span></div>
      ${rows.map((s) => {
        const sum = summary(s);
        return `<div class="tk-hrow"><b>${esc(s.code)}</b><span>${sum.done}/${sum.total}</span><span>${fmt(sum.med)}</span><span>${s.ratings ? `懂 ${s.ratings.clear} · 用 ${s.ratings.useful} · 再 ${s.ratings.again}` : "未评分"}</span></div>`;
      }).join("")}
      <div class="tk-actions">
        <button class="btn ghost" type="button" data-tk="exportAll">导出全部 JSON</button>
        <button class="btn ghost" type="button" data-tk="copy">复制汇总</button>
        <button class="btn ghost" type="button" data-tk="purge">换下一位（保留记录）</button>
        <button class="text-btn" type="button" data-tk="clear">清空测试记录</button>
      </div>
    </section>`;
  }

  function download(name, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function exportOne() {
    const s = current();
    if (!s) return;
    download(`piaogen-test-${s.code}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "piaogen", kind: "usability", session: s }, null, 1));
    if (window.PGApp) window.PGApp.toast("已导出这一轮");
  }

  function exportAll() {
    download(`piaogen-tests-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "piaogen", kind: "usability", exportedAt: new Date().toISOString(), sessions: db.sessions }, null, 1));
    if (window.PGApp) window.PGApp.toast("已导出全部");
  }

  function purgeAppData() {
    if (!confirm("清空票根的票据、账单、卡券与设置，保留测试记录？下一位测试者会看到全新的空状态。")) return;
    ["tickets", "toolbox", "coupons", "points", "finance", "settings", "lossAudit"].forEach((k) => {
      try { localStorage.removeItem("piaogen.v0." + k); } catch (e) {}
    });
    location.reload();
  }

  function copySummary() {
    const lines = db.sessions.map((s) => {
      const sum = summary(s);
      return `${s.code}\t${sum.done}/${sum.total}\t中位 ${fmt(sum.med)}\t${s.ratings ? `懂${s.ratings.clear}/用${s.ratings.useful}/再${s.ratings.again}` : "未评分"}\t${s.note || ""}`;
    });
    const text = ["编号\t完成\t中位用时\t评分\t备注", ...lines].join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => { if (window.PGApp) window.PGApp.toast("汇总已复制"); }, () => {});
    }
  }

  function bind() {
    const start = $("#tkStart");
    if (start) start.onclick = () => {
      const ok = $("#tkConsent");
      if (ok && !ok.checked) { if (window.PGApp) window.PGApp.toast("先勾选同意再开始"); return; }
      const code = (($("#tkCode") || {}).value || "").trim().slice(0, 12) || "T" + (db.sessions.length + 1);
      newSession(code);
      render();
    };
    $$("[data-tk]").forEach((btn) => {
      btn.onclick = () => {
        const act = btn.dataset.tk;
        const id = btn.dataset.id;
        if (act === "go") startTask(id);
        else if (act === "fail") failTask(id);
        else if (act === "hint") hint(id);
        else if (act === "finish") finish();
        else if (act === "saveRate") finish();
        else if (act === "exportOne") exportOne();
        else if (act === "new") { render(); }
        else if (act === "exportAll") exportAll();
        else if (act === "copy") copySummary();
        else if (act === "purge") purgeAppData();
        else if (act === "clear") {
          if (confirm("清空本机全部测试记录？导出过的文件不受影响。")) { db = { version: 1, sessions: [] }; save(); stopTick(); render(); }
        }
      };
    });
  }

  function open() {
    if (window.PGApp) window.PGApp.show("testkit");
    else render();
    ensureFab();
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }

  window.PGTestkit = { open, render, exportAll, _sessions: () => db.sessions, _tasks: TASKS };

  document.addEventListener("DOMContentLoaded", () => {
    if (new URLSearchParams(location.search).get("test") === "1") setTimeout(open, 300);
  });
})();
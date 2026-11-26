/* 票根 · 权利库：把规则库、三包目录、平台路径、解约指引、证据清单与价保整理成可搜索的条目。
   只做检索与出处展示，不替用户下法律结论。 */
(function () {
  const GROUPS = [
    { id: "all", label: "全部" },
    { id: "law", label: "法定依据" },
    { id: "sanbao", label: "三包目录" },
    { id: "path", label: "平台路径" },
    { id: "cancel", label: "解约指引" },
    { id: "evidence", label: "证据清单" },
    { id: "price", label: "价保" }
  ];
  let group = "all";
  let query = "";
  let built = null;

  const esc = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function sourceLink(url, label) {
    if (!url) return "";
    return `<a class="rc-src" href="${esc(url)}" target="_blank" rel="noopener">${esc(label || "官方原文")} ↗</a>`;
  }

  function build() {
    if (built) return built;
    const PG = window.PG || {};
    const REAL = PG.REAL || {};
    const out = [];

    Object.keys(PG.BASIS || {}).forEach((id) => {
      const b = PG.BASIS[id] || {};
      if (!b.law) return;
      out.push({
        id: "law:" + id,
        group: "law",
        groupLabel: "法定依据",
        title: `${b.law} · ${b.article || ""}`,
        summary: b.short || "",
        when: (PG.EFFECTIVE || {})[id] || "",
        body: `<p>${esc(b.short || "")}</p><dl class="rc-dl"><dt>依据</dt><dd>${esc(b.law)}${b.article ? " " + esc(b.article) : ""}</dd><dt>生效</dt><dd>${esc((PG.EFFECTIVE || {})[id] || "以官方原文为准")}</dd></dl>`,
        url: b.url || "",
        tags: [b.law, b.article, b.short].join(" ")
      });
    });

    const sanbao = REAL.sanbao || {};
    (sanbao.items || []).forEach((it, index) => {
      if (!it || !it.name) return;
      const parts = (it.mainParts || []).slice(0, 12).join("、");
      out.push({
        id: "sanbao:" + index,
        group: "sanbao",
        groupLabel: "三包目录",
        title: it.name,
        summary: `整机 ${it.wholeYears ? it.wholeYears + " 年" : "—"} · 主要部件 ${it.mainYears ? it.mainYears + " 年" : "—"}`,
        when: sanbao.checkedAt || "",
        body: `<p>${parts ? "主要部件：" + esc(parts) : "目录期限以官方附件为准。"}</p><p class="rc-note">${esc(sanbao.note || "目录外商品不适用法定三包，但仍适用《消保法》第二十四条及商家/品牌承诺。")}</p><a class="rc-src" href="https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zlfzs/art/2023/art_b05a6da5edd74778bf7d899f0cbcc728.html" target="_blank" rel="noopener">目录原文 ↗</a>`,
        url: sanbao.sourceUrl || "",
        tags: [it.name, parts].join(" ")
      });
    });

    (REAL.paths || []).forEach((p) => {
      if (!p || !p.label) return;
      const steps = (p.path || []).join(" › ");
      out.push({
        id: "path:" + (p.id || p.label),
        group: "path",
        groupLabel: "平台路径",
        title: `${p.platform || "平台"} · ${p.label}`,
        summary: steps,
        when: "",
        body: `<p><b>怎么走：</b>${esc(steps)}</p>${p.fallback ? `<p><b>找不到入口：</b>${esc(p.fallback)}</p>` : ""}<p class="rc-note">路径会随版本变化；找不到时以平台客服页面为准。</p>${sourceLink(p.url, p.source || "平台帮助")}`,
        url: p.url || "",
        tags: [p.platform, p.label, p.action, steps].join(" ")
      });
    });

    (PG.CANCEL_GUIDE || []).forEach((c) => {
      if (!c || !c.name) return;
      const steps = (c.steps || []).join(" › ");
      out.push({
        id: "cancel:" + (c.id || c.name),
        group: "cancel",
        groupLabel: "解约指引",
        title: `${c.group ? c.group + " · " : ""}${c.name}`,
        summary: steps,
        when: "",
        body: `<p><b>怎么关：</b>${esc(steps)}</p>${c.note ? `<p>${esc(c.note)}</p>` : ""}<p class="rc-note">扣款方是商户时，渠道只停代扣，合同可能仍在续期，需要另外解约。</p>${c.source ? `<p class="rc-note">来源：${esc(c.source)}</p>` : ""}`,
        url: "",
        tags: [c.name, c.group, steps].join(" ")
      });
    });

    const ev = (REAL.evidence || {}).categories || {};
    Object.keys(ev).forEach((key) => {
      const c = ev[key] || {};
      if (!c.label) return;
      out.push({
        id: "evidence:" + key,
        group: "evidence",
        groupLabel: "证据清单",
        title: `${c.label} · 证据清单`,
        summary: `先备：${(c.must || []).join("、")}`,
        when: (REAL.evidence || {}).checkedAt || "",
        body: `<p><b>最影响判定：</b>${esc((c.must || []).join("、"))}</p>${(c.helpful || []).length ? `<p><b>有更好：</b>${esc((c.helpful || []).join("、"))}</p>` : ""}${c.note ? `<p class="rc-note">${esc(c.note)}</p>` : ""}`,
        url: "",
        tags: [c.label, (c.must || []).join(" "), (c.helpful || []).join(" ")].join(" ")
      });
    });

    const platforms = (REAL.priceRules || {}).platforms || {};
    Object.keys(platforms).forEach((key) => {
      const p = platforms[key] || {};
      if (!p.label) return;
      const windows = (p.windows || []).map((w) => `${w.days} 天`).join(" / ");
      out.push({
        id: "price:" + key,
        group: "price",
        groupLabel: "价保",
        title: `${p.label} · 价保`,
        summary: windows ? `可选时限：${windows}` : (p.start || "以订单页为准"),
        when: (REAL.priceRules || {}).checkedAt || "",
        body: `<p><b>起算：</b>${esc(p.start || "以订单页为准")}</p>${windows ? `<p><b>可选时限：</b>${esc(windows)}（是否适用还看品类与订单页标识）</p>` : ""}<p class="rc-note">价保是平台或商家的服务承诺，不是法定权利；没有价保标识就不能承诺，倒计时只从订单页来。</p>${sourceLink(p.source, "平台规则")}`,
        url: p.source || "",
        tags: [p.label, p.start, windows].join(" ")
      });
    });

    built = out;
    return out;
  }

  function filtered() {
    const q = query.trim().toLowerCase();
    return build().filter((item) => {
      if (group !== "all" && item.group !== group) return false;
      if (!q) return true;
      return (item.title + " " + item.summary + " " + (item.tags || "")).toLowerCase().includes(q);
    });
  }

  /* 三层解读：原文 / 白话 / 能主张什么。按类别给通用解释，不下个案结论。 */
  function layers(item) {
    const t = `${item.title} ${item.summary}`;
    if (item.group === "law") {
      if (/七日|无理由/.test(t)) return { plain: "网购、电视购物等远程购物，收到货 7 天内可以不说明理由退货（定作、鲜活易腐、拆封音像制品等除外）。", claim: "可要求无理由退货退款；商家以“已拆封”拒绝时，拆封查验本身不影响。" };
      if (/三包|修理|更换|退货/.test(t)) return { plain: "三包期内商品出问题，按“先修、修不好换、换不了退”的顺序处理。", claim: "可要求免费修理；两次修不好可要求换货；换货仍不行可要求退货。" };
      if (/价保|价格/.test(t)) return { plain: "买完降价了，可找商家补回差价，前提是同一商品、在价保期内。", claim: "符合条件可要求补差价。" };
      if (/定金/.test(t)) return { plain: "定金与订金不同：定金有担保效力，对方违约要双倍返还。", claim: "对方不履约时，可要求双倍返还定金。" };
      if (/欺诈|三倍|赔偿/.test(t)) return { plain: "商家有欺诈行为的，可要求退一赔三，不足 500 元按 500 元算。", claim: "可主张退款并加三倍赔偿（最低 500 元）。" };
      if (/个人信息|隐私/.test(t)) return { plain: "商家收集、使用你的信息要合法、必要、经你同意。", claim: "可要求删除、更正，并可向监管部门投诉。" };
      return { plain: item.summary || "以条文原文为准。", claim: "按条文主张你的权利；能否成立以证据和受理机构判断为准。" };
    }
    if (item.group === "sanbao") return { plain: "这类商品有法定三包期限，期限内出故障可要求修、换、退。", claim: "期限内可要求免费修理；符合条件可换货或退货。" };
    if (item.group === "path") return { plain: "这是投诉/办事的官方入口与顺序。", claim: "按这个顺序找少走弯路；上一层不受理再往上一层。" };
    if (item.group === "cancel") return { plain: "这是关闭自动续费/解约的官方路径。", claim: "照着关，关完截图留证；还扣费就按“关了还在扣”维权。" };
    if (item.group === "evidence") return { plain: "这是这类纠纷建议准备的证据。", claim: "按清单备齐，谈判和投诉都用得上。" };
    if (item.group === "price") return { plain: "这是价保的适用条件。", claim: "符合条件可要求补差价。" };
    return { plain: item.summary || "", claim: "" };
  }

  function cardHtml(item) {
    const L = layers(item);
    const searchTerm = item.group === "law" ? item.title.replace("·", "") : "";
    return `<details class="right-card" data-group="${esc(item.group)}">
      <summary>
        <span class="rc-group">${esc(item.groupLabel)}</span>
        <b>${esc(item.title)}</b>
        <small>${esc(item.summary)}</small>
        <span class="rc-chev" aria-hidden="true">›</span>
      </summary>
      <div class="rc-body">
        <div class="rc-layers">
          <dl class="rc-layer"><dt>原文</dt><dd>${esc(item.title)}${item.summary ? "：" + esc(item.summary) : ""}</dd></dl>
          <dl class="rc-layer"><dt>白话</dt><dd>${esc(L.plain)}</dd></dl>
          <dl class="rc-layer claim"><dt>能帮你主张什么</dt><dd>${esc(L.claim)}</dd></dl>
        </div>
        ${searchTerm ? `<button class="rc-copy" type="button" data-copy-term="${esc(searchTerm)}">复制检索式</button>` : ""}
        ${item.body || ""}
        <div class="rc-actions">
          <button class="btn ghost" type="button" data-rights-case="${esc(item.title)}">照这条建案</button>
          ${item.when ? `<span class="rc-when">核对：${esc(item.when)}</span>` : ""}
        </div>
      </div>
    </details>`;
  }

  function renderChips() {
    const host = document.getElementById("rightsChips");
    if (!host) return;
    host.innerHTML = GROUPS.map((g) => `<button type="button" class="rights-chip ${group === g.id ? "on" : ""}" data-rights-group="${g.id}" role="tab" aria-selected="${group === g.id}">${g.label}</button>`).join("");
  }

  function render() {
    const host = document.getElementById("rightsBody");
    if (!host) return;
    renderChips();
    const list = filtered();
    host.innerHTML = list.length
      ? list.map(cardHtml).join("")
      : `<div class="rights-empty"><b>没有匹配的条目</b><p>换个词试试；查不到就不下结论，以合同与官方页面为准。</p></div>`;
    const count = document.getElementById("rightsCount");
    if (count) count.textContent = `共 ${build().length} 条 · 当前 ${list.length} 条`;
    const hero = document.getElementById("heroBasisCount");
    if (hero) hero.textContent = String(build().length);
    const badge = document.getElementById("rightsNavCount");
    if (badge) badge.textContent = String(build().length);
  }

  function bind() {
    document.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-rights-group]");
      if (chip) {
        group = chip.dataset.rightsGroup;
        render();
        return;
      }
      const open = event.target.closest("[data-open-rights]");
      if (open) {
        if (window.PGApp && window.PGApp.show) window.PGApp.show("rights");
        else window.location.href = "index.html";
        return;
      }
      const copyTerm = event.target.closest("[data-copy-term]");
      if (copyTerm) {
        const term = copyTerm.dataset.copyTerm || "";
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(term).then(() => {
            copyTerm.textContent = "已复制，去国家法规库粘贴";
            setTimeout(() => { copyTerm.textContent = "复制检索式"; }, 1800);
          }).catch(() => { copyTerm.textContent = "复制失败，请手动选中"; });
        } else {
          copyTerm.textContent = "浏览器不允许复制，请手动选中";
        }
        return;
      }
      const buildBtn = event.target.closest("[data-rights-case]");
      if (buildBtn) {
        const text = `我要办：${buildBtn.dataset.rightsCase}`;
        if (window.PGApp && window.PGApp.openIntake) window.PGApp.openIntake(text);
        else window.location.href = "index.html";
      }
    });
    const search = document.getElementById("rightsSearch");
    if (search) {
      let timer = null;
      search.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          query = search.value || "";
          render();
        }, 120);
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { bind(); if (document.getElementById("rightsBody")) render(); });
  else { bind(); if (document.getElementById("rightsBody")) render(); }

  window.PGLibrary = { render, count: () => build().length, items: () => build().slice() };
})();
/* 票根 · 暗色日期选择器：接管原生白色日历，保持 YYYY-MM-DD 值不变。 */
(function () {
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const parse = (value) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  };
  let active = null;
  let pop = null;
  let view = new Date();

  function enhance(input) {
    if (!input || input.dataset.pgDate === "1") return;
    input.dataset.pgDate = "1";
    if (input.type === "date") input.type = "text";
    input.autocomplete = "off";
    input.inputMode = "numeric";
    input.placeholder = "YYYY-MM-DD";
    input.pattern = "\\d{4}-\\d{2}-\\d{2}";
    input.classList.add("pg-date");
    input.addEventListener("blur", () => {
      const value = input.value.trim();
      if (!value) return;
      const dt = parse(value);
      if (dt) input.value = fmt(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    });
  }

  function enhanceAll(root) {
    (root || document).querySelectorAll("input[type=date]").forEach(enhance);
  }

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.className = "pg-dp";
    pop.hidden = true;
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "选择日期");
    pop.innerHTML = `
      <div class="pg-dp-head">
        <button type="button" class="pg-dp-nav" data-dp="prev" aria-label="上个月">‹</button>
        <b id="pgDpTitle"></b>
        <button type="button" class="pg-dp-nav" data-dp="next" aria-label="下个月">›</button>
      </div>
      <div class="pg-dp-grid" id="pgDpGrid"></div>
      <div class="pg-dp-foot">
        <button type="button" data-dp="clear">清除</button>
        <button type="button" data-dp="today">今天</button>
      </div>`;
    document.body.appendChild(pop);
    pop.addEventListener("mousedown", (event) => event.preventDefault());
    pop.addEventListener("click", (event) => {
      const nav = event.target.closest("[data-dp]");
      if (!nav) return;
      const action = nav.dataset.dp;
      if (action === "prev") { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); }
      else if (action === "next") { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); }
      else if (action === "clear") { commit(""); close(); }
      else if (action === "today") { const now = new Date(); commit(fmt(now.getFullYear(), now.getMonth() + 1, now.getDate())); close(); }
      else if (action === "pick") {
        const y = Number(nav.dataset.y), m = Number(nav.dataset.m), d = Number(nav.dataset.d);
        commit(fmt(y, m, d));
        close();
      }
    });
    return pop;
  }

  function commit(value) {
    if (!active) return;
    active.value = value;
    active.dispatchEvent(new Event("input", { bubbles: true }));
    active.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function render() {
    const y = view.getFullYear();
    const m = view.getMonth();
    const title = document.getElementById("pgDpTitle");
    if (title) title.textContent = `${y} 年 ${m + 1} 月`;
    const grid = document.getElementById("pgDpGrid");
    if (!grid) return;
    const selected = active ? parse(active.value) : null;
    const today = new Date();
    const first = new Date(y, m, 1);
    const start = new Date(y, m, 1 - first.getDay());
    const cells = [];
    ["日", "一", "二", "三", "四", "五", "六"].forEach((w) => cells.push(`<span class="pg-dp-w">${w}</span>`));
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const out = d.getMonth() !== m;
      const isToday = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
      const isSel = selected && d.getFullYear() === selected.getFullYear() && d.getMonth() === selected.getMonth() && d.getDate() === selected.getDate();
      cells.push(`<button type="button" class="pg-dp-d${out ? " out" : ""}${isToday ? " today" : ""}${isSel ? " sel" : ""}" data-dp="pick" data-y="${d.getFullYear()}" data-m="${d.getMonth() + 1}" data-d="${d.getDate()}" aria-label="${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日">${d.getDate()}</button>`);
    }
    grid.innerHTML = cells.join("");
  }

  function place(input) {
    const box = input.getBoundingClientRect();
    const width = 280;
    const height = 334;
    let left = box.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    let top = box.bottom + 6;
    if (top + height > window.innerHeight - 8) top = Math.max(8, box.top - height - 6);
    pop.style.left = Math.max(8, left) + "px";
    pop.style.top = top + "px";
  }

  function open(input) {
    enhance(input);
    active = input;
    const dt = parse(input.value) || new Date();
    view = new Date(dt.getFullYear(), dt.getMonth(), 1);
    const el = ensurePop();
    el.hidden = false;
    render();
    place(input);
    input.setAttribute("aria-expanded", "true");
  }

  function close() {
    if (!pop) return;
    pop.hidden = true;
    if (active) active.removeAttribute("aria-expanded");
    active = null;
  }

  document.addEventListener("focusin", (event) => {
    const input = event.target.closest("input[type=date]");
    if (input) { enhance(input); open(input); }
  });
  document.addEventListener("click", (event) => {
    const input = event.target.closest("input.pg-date");
    if (input) { open(input); return; }
    if (pop && !event.target.closest(".pg-dp")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  window.addEventListener("resize", close);
  window.addEventListener("scroll", close, true);

  function boot() {
    enhanceAll(document);
    new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          if (node.matches && node.matches("input[type=date]")) enhance(node);
          if (node.querySelectorAll) enhanceAll(node);
        }
      }));
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.PGDatePicker = { open, close, enhanceAll };
})();
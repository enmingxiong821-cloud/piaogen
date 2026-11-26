/* V14.0 · motion.js —— 130 条视频动效的落地层
   职责：标题逐字浮现 / 图片模糊进场 / 图表数值浮层 / 按钮加载态 / 共享元素转场。
   不读取任何现有模块内部状态；全部通过 DOM 与 dataset 工作。
   reduced-motion 由 CSS 归零，JS 侧只判断一次避免无效轮询。 */
(function (w, d) {
  "use strict";
  var reduced = false;
  try { reduced = w.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  /* ---------- 1. 标题逐字浮现（视频30） ----------
     用法：PGX.charReveal(el)。中文按字拆，保留 <em>/<b> 内层。 */
  function charReveal(el) {
    if (!el || reduced || el.dataset.chDone) return;
    el.dataset.chDone = "1";
    var walker = d.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    var delay = 0;
    texts.forEach(function (node) {
      var frag = d.createDocumentFragment();
      var parts = node.textContent.split("");
      for (var i = 0; i < parts.length; i++) {
        var ch = parts[i];
        if (ch.trim() === "") { frag.appendChild(d.createTextNode(ch)); continue; }
        var span = d.createElement("span");
        span.className = "ch";
        span.textContent = ch;
        span.style.animationDelay = delay + "ms";
        delay += 36;
        frag.appendChild(span);
      }
      node.parentNode.replaceChild(frag, node);
    });
  }

  /* ---------- 2. 图片模糊进场（视频33） ---------- */
  function blurIn(scope) {
    var root = scope || d;
    var imgs = root.querySelectorAll("img[data-blur]:not(.blur-done)");
    for (var i = 0; i < imgs.length; i++) {
      (function (img) {
        if (reduced) { img.classList.add("blur-done"); return; }
        if (img.complete) { img.classList.add("blur-done"); return; }
        img.addEventListener("load", function () {
          w.requestAnimationFrame(function () { img.classList.add("blur-done"); });
        });
        img.addEventListener("error", function () { img.classList.add("blur-done"); });
      })(imgs[i]);
    }
  }

  /* ---------- 3. 图表数值浮层（视频21）：给 .report-bar 补 data-v ---------- */
  function chartTips(scope) {
    var root = scope || d;
    var bars = root.querySelectorAll(".report-bar:not([data-v])");
    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      var em = bar.querySelector("em") || bar.parentElement && bar.parentElement.querySelector(".report-bar-v");
      var val = bar.getAttribute("data-vv") || (bar.querySelector("i") && bar.querySelector("i").getAttribute("data-v")) || "";
      if (val) bar.setAttribute("data-v", val);
    }
  }

  /* ---------- 4. 按钮加载态 ---------- */
  function loading(btn, on) {
    if (!btn) return;
    if (on) {
      if (!btn.dataset.loading) btn.dataset.w = btn.offsetWidth + "px";
      btn.dataset.loading = "true";
      btn.setAttribute("aria-busy", "true");
      btn.style.minWidth = btn.dataset.w;
    } else {
      delete btn.dataset.loading;
      btn.removeAttribute("aria-busy");
      btn.style.minWidth = "";
    }
  }

  /* ---------- 5. 共享元素转场：卡片 → 整页（视频27） ----------
     PGX.zoomTo(el, screenName)：给源卡片加 pg-zoom-origin，
     切屏后给目标 screen 加 pg-enter，380ms 后清理。 */
  function zoomTo(el, goFn) {
    if (!el || reduced) { if (goFn) goFn(); return; }
    el.classList.add("pg-zoom-origin");
    d.body.classList.add("pg-zooming");
    setTimeout(function () {
      if (goFn) goFn();
      var screen = d.querySelector(".screen.on");
      if (screen) screen.classList.add("pg-enter");
      setTimeout(function () {
        el.classList.remove("pg-zoom-origin");
        d.body.classList.remove("pg-zooming");
        if (screen) screen.classList.remove("pg-enter");
      }, 420);
    }, 190);
  }

  /* ---------- 6. 轻提示（备用，不覆盖现有 #toast） ---------- */
  function ensureWrap() {
    var wrap = d.getElementById("pgx-toast-wrap");
    if (!wrap) {
      wrap = d.createElement("div");
      wrap.id = "pgx-toast-wrap";
      wrap.setAttribute("role", "status");
      wrap.setAttribute("aria-live", "polite");
      wrap.style.cssText = "position:fixed;left:0;right:0;bottom:calc(80px + env(safe-area-inset-bottom));display:flex;justify-content:center;pointer-events:none;z-index:60";
      d.body.appendChild(wrap);
    }
    return wrap;
  }
  function toast(text, kind) {
    if (!text) return null;
    var box = d.createElement("div");
    box.className = "pgx-toast" + (kind ? " " + kind : "");
    box.textContent = text;
    box.style.cssText = "max-width:min(420px,calc(100vw - 32px));padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:rgba(20,27,29,.96);color:var(--ink);font-size:12.5px;line-height:1.5;pointer-events:auto;opacity:0;transform:translateY(8px);transition:opacity 240ms var(--ease-out),transform 240ms var(--ease-out)";
    if (kind === "ok") box.style.borderColor = "rgba(157,240,194,.45)";
    if (kind === "err") box.style.borderColor = "rgba(255,113,91,.45)";
    ensureWrap().appendChild(box);
    w.requestAnimationFrame(function () { box.style.opacity = "1"; box.style.transform = "none"; });
    var ttl = kind === "err" ? 3600 : 2400;
    var timer = w.setTimeout(function () {
      box.style.opacity = "0"; box.style.transform = "translateY(8px)";
      w.setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 260);
    }, ttl);
    box.addEventListener("click", function () { w.clearTimeout(timer); box.style.opacity = "0"; });
    return box;
  }

  w.PGX = { charReveal: charReveal, blurIn: blurIn, chartTips: chartTips, loading: loading, zoomTo: zoomTo, toast: toast, reduced: reduced };

  /* ---------- 自动挂接（DOM ready 后） ---------- */
  function boot() {
    blurIn(d);
    chartTips(d);
    var h1 = d.querySelector("#todayEmpty h1");
    if (h1) charReveal(h1);
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window, document);

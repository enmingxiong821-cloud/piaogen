/* V15.0 · motion15.js —— 滚动叙事 / 3D 倾斜 / 卡片翻面 / 滑动确认 / 半屏拖拽关闭
   原则：只增强，不改写；元素不存在就跳过；点击路径一律保留（滑动只是额外通路）；
        prefers-reduced-motion 时整个模块不启动。 */
(function (w, d) {
  "use strict";

  var reduced = false;
  try { reduced = w.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  if (reduced) { w.PG15 = { refresh: function () {} }; return; }

  var fine = false;
  try { fine = w.matchMedia("(hover:hover) and (pointer:fine)").matches; } catch (e) {}

  /* ---------- 1. 滚动叙事：进入视口逐层显影 ---------- */
  var io = null;
  if ("IntersectionObserver" in w) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
  }

  var REVEAL_SEL = [
    "section", ".card", ".panel", ".case-card", ".asset-card", ".tool-card",
    ".right-card", ".verdict", ".receipt-hero", ".focus-card", ".stagger-chip",
    ".report-section", ".clock-row", ".empty", ".list-row"
  ].join(",");

  function scanReveal(scope) {
    if (!io || !scope) return;
    var nodes = scope.querySelectorAll(REVEAL_SEL);
    var i = 0;
    for (var k = 0; k < nodes.length; k++) {
      var el = nodes[k];
      if (el.dataset.rvDone) continue;
      if (el.closest(".sheet")) continue;          /* 弹层里不做，避免与拖拽冲突 */
      el.dataset.rvDone = "1";
      el.classList.add("rv");
      el.style.setProperty("--rv-i", String(Math.min(i, 9)));
      i++;
      if (io) io.observe(el);
      else el.classList.add("in");
    }
  }

  /* ---------- 2. 3D 倾斜 + 光斑（仅精确指针设备） ---------- */
  var TILT_SEL = ".verdict,.receipt-hero,.focus-card";
  function bindTilt(scope) {
    if (!fine || !scope) return;
    var nodes = scope.querySelectorAll(TILT_SEL);
    for (var k = 0; k < nodes.length; k++) {
      (function (el) {
        if (el.dataset.tiltBound) return;
        el.dataset.tiltBound = "1";
        el.classList.add("tilt", "glare");
        var raf = 0;
        function move(ev) {
          if (raf) return;
          raf = w.requestAnimationFrame(function () {
            raf = 0;
            var r = el.getBoundingClientRect();
            if (!r.width || !r.height) return;
            var px = (ev.clientX - r.left) / r.width;
            var py = (ev.clientY - r.top) / r.height;
            el.style.setProperty("--ry", ((px - 0.5) * 7).toFixed(2) + "deg");
            el.style.setProperty("--rx", ((0.5 - py) * 7).toFixed(2) + "deg");
            el.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
            el.style.setProperty("--my", (py * 100).toFixed(1) + "%");
          });
        }
        function reset() {
          el.style.setProperty("--ry", "0deg");
          el.style.setProperty("--rx", "0deg");
        }
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerleave", reset);
        el.addEventListener("blur", reset, true);
      })(nodes[k]);
    }
  }

  /* ---------- 4. 滑动确认（保留点击，滑动是额外通路） ---------- */
  var SWIPE_SEL = "#financeStatusSave,.danger-confirm,[data-swipe-confirm]";
  function bindSwipe(scope) {
    if (!scope) return;
    var nodes = scope.querySelectorAll(SWIPE_SEL);
    for (var k = 0; k < nodes.length; k++) {
      (function (btn) {
        if (btn.dataset.swipeBound) return;
        btn.dataset.swipeBound = "1";
        btn.classList.add("swipe-btn");
        var startX = null, width = 1, fired = false;

        btn.addEventListener("pointerdown", function (ev) {
          if (ev.button !== 0 && ev.pointerType === "mouse") return;
          startX = ev.clientX;
          width = btn.offsetWidth || 1;
          fired = false;
          btn.classList.add("swiping");
          try { btn.setPointerCapture(ev.pointerId); } catch (e) {}
        });
        btn.addEventListener("pointermove", function (ev) {
          if (startX === null) return;
          var dx = Math.max(0, Math.min(width, ev.clientX - startX));
          btn.style.setProperty("--sw", (dx / width * 100).toFixed(1) + "%");
          if (dx > width * 0.6) btn.classList.add("ready");
          else btn.classList.remove("ready");
        });
        function end(ev) {
          if (startX === null) return;
          var dx = Math.max(0, Math.min(width, ev.clientX - startX));
          startX = null;
          btn.classList.remove("swiping", "ready");
          btn.style.setProperty("--sw", "0%");
          if (dx > width * 0.6) {
            fired = true;
            btn.classList.add("swipe-done");
            w.setTimeout(function () { btn.classList.remove("swipe-done"); }, 420);
            btn.click();
          }
        }
        btn.addEventListener("pointerup", end);
        btn.addEventListener("pointercancel", function () {
          startX = null;
          btn.classList.remove("swiping", "ready");
          btn.style.setProperty("--sw", "0%");
        });
        /* 滑动已触发时，阻止随后那次原生 click 造成二次提交 */
        btn.addEventListener("click", function (ev) {
          if (fired) { ev.stopImmediatePropagation(); ev.preventDefault(); fired = false; }
        }, true);
      })(nodes[k]);
    }
  }

  /* ---------- 5. 半屏弹层：下拉关闭 ---------- */
  var sheetBound = false;
  function bindSheetDrag() {
    if (sheetBound) return;
    var overlay = d.getElementById("sheetOverlay");
    if (!overlay) return;
    var sheet = overlay.querySelector(".sheet");
    var handle = overlay.querySelector(".sheet-handle");
    if (!sheet || !handle) return;
    sheetBound = true;

    var startY = null, dy = 0, t0 = 0;
    handle.addEventListener("pointerdown", function (ev) {
      startY = ev.clientY; dy = 0; t0 = Date.now();
      sheet.classList.add("dragging");
      try { handle.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    handle.addEventListener("pointermove", function (ev) {
      if (startY === null) return;
      dy = Math.max(0, ev.clientY - startY);
      sheet.style.transform = "translate3d(0," + dy + "px,0)";
    });
    function release() {
      if (startY === null) return;
      var fast = (Date.now() - t0) < 320 && dy > 40;
      startY = null;
      sheet.classList.remove("dragging");
      if (dy > 130 || fast) {
        sheet.style.transform = "translate3d(0," + (sheet.offsetHeight + 40) + "px,0)";
        overlay.classList.add("closing");
        w.setTimeout(function () {
          var close = d.getElementById("sheetClose");
          if (close) close.click();
          sheet.style.transform = "";
          overlay.classList.remove("closing");
        }, 260);
      } else {
        sheet.style.transform = "translate3d(0,0,0)";
      }
      dy = 0;
    }
    handle.addEventListener("pointerup", release);
    handle.addEventListener("pointercancel", release);
  }

  /* ---------- 6. 拖拽形变 + 吸附 + 回弹（长按 220ms 后水平拖动） ---------- */
  var DRAG_SEL = ".case-card,.asset-card,.stagger-chip";
  function bindDragMorph(scope) {
    if (!scope) return;
    var nodes = scope.querySelectorAll(DRAG_SEL);
    for (var k = 0; k < nodes.length; k++) {
      (function (el) {
        if (el.dataset.dragBound) return;
        el.dataset.dragBound = "1";
        var holdTimer = 0, armed = false, sx = 0, sy = 0, moved = false;

        el.addEventListener("pointerdown", function (ev) {
          if (ev.pointerType === "mouse" && ev.button !== 0) return;
          if (ev.target.closest("a,button,input,select,textarea")) return;
          sx = ev.clientX; sy = ev.clientY; moved = false;
          holdTimer = w.setTimeout(function () {
            armed = true;
            el.classList.add("dragging-card", "snap-back");
            el.style.setProperty("--rot", "0deg");
            if (w.navigator.vibrate) { try { w.navigator.vibrate(8); } catch (e) {} }
          }, 220);
        });
        el.addEventListener("pointermove", function (ev) {
          if (!armed) {
            if (Math.abs(ev.clientX - sx) > 8 || Math.abs(ev.clientY - sy) > 8) {
              w.clearTimeout(holdTimer);
            }
            return;
          }
          moved = true;
          var dx = ev.clientX - sx;
          el.style.transform = "translate3d(" + dx + "px," + (ev.clientY - sy) * 0.2 + "px,0) scale(1.035) rotate(" + (dx * 0.04).toFixed(2) + "deg)";
          var zone = d.elementFromPoint(ev.clientX, ev.clientY);
          var target = zone && zone.closest ? zone.closest("[data-drop]") : null;
          var targets = scope.querySelectorAll(".dropzone");
          for (var t = 0; t < targets.length; t++) targets[t].classList.remove("dropzone");
          if (target) target.classList.add("dropzone");
        });
        function finish(ev) {
          w.clearTimeout(holdTimer);
          if (!armed) return;
          armed = false;
          el.classList.remove("dragging-card");
          el.style.transform = "";
          var targets = scope.querySelectorAll(".dropzone");
          for (var t = 0; t < targets.length; t++) targets[t].classList.remove("dropzone");
          if (moved) {
            var zone = d.elementFromPoint(ev.clientX, ev.clientY);
            var target = zone && zone.closest ? zone.closest("[data-drop]") : null;
            if (target) {
              el.classList.add("snapped");
              w.setTimeout(function () { el.classList.remove("snapped"); }, 420);
            }
          }
          w.setTimeout(function () { el.classList.remove("snap-back"); }, 520);
        }
        el.addEventListener("pointerup", finish);
        el.addEventListener("pointercancel", function () {
          w.clearTimeout(holdTimer);
          if (!armed) return;
          armed = false;
          el.classList.remove("dragging-card");
          el.style.transform = "";
          w.setTimeout(function () { el.classList.remove("snap-back"); }, 520);
        });
        /* 长按拖起来后，抑制这次点击 */
        el.addEventListener("click", function (ev) {
          if (moved) { ev.stopImmediatePropagation(); ev.preventDefault(); moved = false; }
        }, true);
      })(nodes[k]);
    }
  }

  /* ---------- 7. 调度：screen 变化后重扫 ---------- */
  function currentScope() {
    var on = d.querySelector(".screen.on");
    return on || d.getElementById("main") || d.body;
  }

  function enhance() {
    var scope = currentScope();
    scanReveal(scope);
    bindTilt(scope);
    bindSwipe(d.getElementById("sheetBody") || d);
    bindDragMorph(scope);
  }

  function refresh() {
    w.requestAnimationFrame(enhance);
  }

  /* 监听 screen 切换与弹层内容注入 */
  var mo = null;
  function watch() {
    if (!("MutationObserver" in w)) return;
    mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "attributes" && m.attributeName === "class") { refresh(); return; }
        if (m.type === "childList" && m.target) {
          if (m.target.id === "sheetBody" || (m.target.closest && m.target.closest("#sheetBody"))) {
            refresh(); return;
          }
        }
      }
      refresh();
    });
    var main = d.getElementById("main");
    if (main) mo.observe(main, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    var sheetBody = d.getElementById("sheetBody");
    if (sheetBody) mo.observe(sheetBody, { subtree: true, childList: true });
  }

  function boot() {
    bindSheetDrag();
    refresh();
    watch();
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot);
  else boot();

  w.PG15 = { refresh: refresh, reveal: scanReveal };
})(window, document);
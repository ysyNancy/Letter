(function () {
  "use strict";

  var LETTERS = window.LETTERS;
  var NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  var DAYS = ["一", "二", "三", "四", "五", "六", "日"];
  var MOOD_WORDS = ["", "低落", "发闷", "平静", "松快", "舒展"];
  var MOBILE = window.matchMedia("(max-width: 880px)");
  var root = document.documentElement;

  var $ = function (name) { return document.querySelector('[data-bind="' + name + '"]'); };
  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("xinzha:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("xinzha:" + k, JSON.stringify(v)); } catch (e) { /* 无痕模式等情况下忽略 */ } }
  };
  var cn = function (n) { return NUM[n] || String(n); };
  var moodWord = function (v) { return MOOD_WORDS[Math.max(1, Math.min(5, Math.round(v)))]; };

  var state = { letter: null, keyword: null, day: null, section: "letter" };

  /* ———————————— 设置（页脚） ———————————— */
  var settings = Object.assign({ size: "m", paper: "cream", leading: "loose" }, store.get("settings", {}));
  function applySettings() {
    root.dataset.size = settings.size;
    root.dataset.paper = settings.paper;
    root.dataset.leading = settings.leading;
    var form = $("settings");
    Object.keys(settings).forEach(function (k) {
      var input = form.querySelector('input[name="' + k + '"][value="' + settings[k] + '"]');
      if (input) input.checked = true;
    });
  }
  $("settings").addEventListener("change", function (e) {
    settings[e.target.name] = e.target.value;
    store.set("settings", settings);
    applySettings();
    updateProgress();
  });
  applySettings();

  /* ———————————— 往期 ———————————— */
  function renderArchive() {
    var list = $("archive");
    list.textContent = "";
    LETTERS.forEach(function (l) {
      var li = el("li");
      var b = el("button");
      b.type = "button";
      b.dataset.no = l.no;
      b.append(
        el("span", "archive__no", "第" + cn(l.no) + "封"),
        el("span", "archive__date", l.short),
        el("span", "archive__title", (l.no === LETTERS[0].no ? "本周 · " : "") + "「" + l.title + "」")
      );
      b.addEventListener("click", function () {
        if (state.letter.no === l.no) return;
        openLetter(l.no, true);
        if (MOBILE.matches) document.getElementById("letter").scrollIntoView();
      });
      li.append(b);
      list.append(li);
    });
  }

  /* ———————————— 信件 ———————————— */
  // 关键词在句中用记号笔标出；没有关键词的“日段”整句标出。
  function markText(text, words) {
    var frag = document.createDocumentFragment();
    if (!words || !words.length) { frag.append(text); return frag; }
    var re = new RegExp("(" + words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")", "g");
    text.split(re).forEach(function (part, i) {
      if (!part) return;
      if (i % 2) { var m = el("span", "mark", part); m.dataset.kw = part; frag.append(m); }
      else frag.append(part);
    });
    return frag;
  }

  function renderLetter(l) {
    $("no").textContent = "第" + cn(l.no) + "封";
    $("range").textContent = l.range;
    $("to").textContent = l.to;
    $("sent").textContent = l.sent;
    $("wish").textContent = l.wish.text;
    $("wishFrom").textContent = "承接第" + cn(l.wish.from) + "封的心愿";
    $("question").textContent = l.question;

    var body = $("body");
    body.textContent = "";
    body.classList.remove("has-focus");
    l.paragraphs.forEach(function (p, i) {
      var para = el("p", "para");
      para.dataset.index = i;
      if (p.day != null) para.dataset.day = p.day;
      para.dataset.kw = (p.kw || []).join(" ");
      var no = el("span", "para__no", cn(i + 1));
      no.setAttribute("aria-hidden", "true");
      para.append(no, markText(p.t, p.kw));
      body.append(para);
    });

    var closing = $("closing");
    closing.textContent = "";
    closing.dataset.kw = (l.closing.kw || []).join(" ");
    closing.append(markText(l.closing.t, l.closing.kw));

    document.title = "第" + cn(l.no) + "封 · " + l.range + " — 信札";
    $("locNo").textContent = "第" + cn(l.no) + "封";
  }

  /* ———————————— 回顾：七日话题 ———————————— */
  function renderTopics(l) {
    var list = $("topics");
    list.textContent = "";
    var linked = l.paragraphs.map(function (p) { return p.day; });
    l.topics.forEach(function (t, d) {
      var li = el("li");
      var b = el("button");
      b.type = "button";
      b.dataset.day = d;
      b.append(el("span", "topics__day", "周" + DAYS[d]), el("span", "topics__name", t[0]), el("span", "topics__note", t[1]));
      if (linked.indexOf(d) < 0) {
        b.classList.add("is-quiet");
        b.title = "这一天没有写进信里";
      }
      b.addEventListener("mouseenter", function () { focusDay(d); });
      b.addEventListener("focus", function () { focusDay(d); });
      b.addEventListener("mouseleave", function () { focusDay(null); });
      b.addEventListener("blur", function () { focusDay(null); });
      b.addEventListener("click", function () { scrollToDay(d); });
      li.append(b);
      list.append(li);
    });
  }

  function scrollToDay(d) {
    var p = $("body").querySelector('.para[data-day="' + d + '"]');
    if (p) p.scrollIntoView({ block: "center" });
  }

  /* ———————————— 回顾：情绪折线 ———————————— */
  var chart = {};
  function renderChart(l) {
    var W = 224, H = 132, pl = 10, pr = 10, pt = 22, pb = 24;
    var x = function (i) { return pl + i * (W - pl - pr) / 6; };
    var y = function (v) { return pt + (5 - v) / 4 * (H - pt - pb); };
    var NS = "http://www.w3.org/2000/svg";
    var s = function (tag, attrs, text) {
      var n = document.createElementNS(NS, tag);
      for (var k in attrs) n.setAttribute(k, attrs[k]);
      if (text != null) n.textContent = text;
      return n;
    };

    var box = $("chart");
    box.textContent = "";
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "本周情绪折线，周一至周日：" + l.moods.map(function (v, i) { return "周" + DAYS[i] + " " + v; }).join("，") });

    [1, 3, 5].forEach(function (v) { svg.append(s("line", { class: "grid", x1: 0, x2: W, y1: Math.round(y(v)) + .5, y2: Math.round(y(v)) + .5 })); });

    var pts = l.moods.map(function (v, i) { return [x(i), y(v)]; });
    // 轻微平滑，像铅笔顺手带过
    var d = "M" + pts[0][0] + " " + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, t = 0.16;
      d += " C" + (p1[0] + (p2[0] - p0[0]) * t) + " " + (p1[1] + (p2[1] - p0[1]) * t) + " " +
        (p2[0] - (p3[0] - p1[0]) * t) + " " + (p2[1] - (p3[1] - p1[1]) * t) + " " + p2[0] + " " + p2[1];
    }
    svg.append(s("path", { class: "area", d: d + " L" + x(6) + " " + y(1) + " L" + x(0) + " " + y(1) + " Z" }));
    svg.append(s("path", { class: "line", d: d }));

    var cross = s("line", { class: "cross", x1: 0, x2: 0, y1: pt - 8, y2: H - pb });
    svg.append(cross);

    var peak = l.moods.indexOf(Math.max.apply(null, l.moods));
    svg.append(s("text", { class: "peak", x: x(peak), y: y(l.moods[peak]) - 10 }, "最高 " + l.moods[peak]));

    var dots = [], labels = [], step = (W - pl - pr) / 6;
    pts.forEach(function (p, i) {
      dots.push(svg.appendChild(s("circle", { class: "dot", cx: p[0], cy: p[1], r: 4 })));
      labels.push(svg.appendChild(s("text", { class: "xlab", x: p[0], y: H - 6 }, DAYS[i])));
    });
    // 命中区比标记大：每天一整列
    pts.forEach(function (p, i) {
      var hit = s("rect", { class: "hit", x: p[0] - step / 2, y: 0, width: step, height: H, tabindex: i === 0 ? 0 : -1, "aria-label": "周" + DAYS[i] + " 情绪 " + l.moods[i] });
      hit.addEventListener("mouseenter", function () { focusDay(i); });
      hit.addEventListener("focus", function () { focusDay(i); });
      hit.addEventListener("mouseleave", function () { focusDay(null); });
      hit.addEventListener("blur", function () { focusDay(null); });
      hit.addEventListener("click", function () { scrollToDay(i); });
      hit.addEventListener("keydown", function (e) {
        var n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
        if (e.key === "Enter") scrollToDay(i);
        if (n == null || n < 0 || n > 6) return;
        e.preventDefault();
        chart.hits[n].focus();
      });
      svg.append(hit);
    });
    chart.hits = Array.prototype.slice.call(svg.querySelectorAll(".hit"));

    var tip = el("div", "tip");
    tip.setAttribute("aria-hidden", "true");
    box.append(svg, tip);

    // 屏幕阅读器的表格视图
    var table = el("table", "sr-only");
    var cap = el("caption", null, "本周情绪（1 低落 — 5 舒展）");
    table.append(cap);
    l.moods.forEach(function (v, i) {
      var tr = el("tr");
      tr.append(el("th", null, "周" + DAYS[i] + " " + l.topics[i][0]), el("td", null, v + " " + moodWord(v)));
      table.append(tr);
    });
    box.append(table);

    chart = { svg: svg, tip: tip, cross: cross, dots: dots, labels: labels, hits: chart.hits, x: x, y: y, W: W, l: l };
  }

  function showChartDay(d) {
    chart.dots.forEach(function (n, i) { n.classList.toggle("is-active", i === d); n.setAttribute("r", i === d ? 5 : 4); });
    chart.labels.forEach(function (n, i) { n.classList.toggle("is-active", i === d); });
    if (d == null) { chart.cross.classList.remove("is-on"); chart.tip.classList.remove("is-on"); return; }
    var cx = chart.x(d), scale = chart.svg.getBoundingClientRect().width / chart.W;
    chart.cross.setAttribute("x1", cx);
    chart.cross.setAttribute("x2", cx);
    chart.cross.classList.add("is-on");
    var v = chart.l.moods[d];
    chart.tip.textContent = "";
    chart.tip.append(el("b", null, "周" + DAYS[d] + " · " + chart.l.topics[d][0]), el("br"), "情绪 " + v + " · " + moodWord(v));
    var left = Math.max(56, Math.min(cx * scale, chart.svg.getBoundingClientRect().width - 56));
    chart.tip.style.left = left + "px";
    chart.tip.style.top = (chart.y(v) * scale - 6) + "px";
    chart.tip.classList.add("is-on");
  }

  /* ———————————— 联动：某一天 ———————————— */
  function focusDay(d) {
    state.day = d;
    showChartDay(d);
    document.querySelectorAll(".topics button").forEach(function (b) { b.classList.toggle("is-active", +b.dataset.day === d); });
    paintFocus();
  }

  /* ———————————— 回顾：关键词 ———————————— */
  function renderKeywords(l) {
    var list = $("keywords");
    list.textContent = "";
    l.keywords.forEach(function (w) {
      var count = l.paragraphs.concat([l.closing]).filter(function (p) { return (p.kw || []).indexOf(w) > -1; }).length;
      var li = el("li");
      var b = el("button");
      b.type = "button";
      b.setAttribute("aria-pressed", "false");
      b.append(el("span", "keywords__word", w), el("span", "keywords__count", count + " 处"));
      b.addEventListener("click", function () {
        state.keyword = state.keyword === w ? null : w;
        list.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b && state.keyword === w)); });
        paintFocus();
        if (state.keyword) {
          var first = document.querySelector('.para[data-kw~="' + w + '"], .closing__text[data-kw~="' + w + '"]');
          if (first && !inView(first)) first.scrollIntoView({ block: "center" });
        }
      });
      li.append(b);
      list.append(li);
    });
  }

  function inView(n) {
    var r = n.getBoundingClientRect();
    return r.top > 80 && r.bottom < window.innerHeight - 20;
  }

  // 日（悬停）与关键词（点选）共用一个“聚焦”层：命中段落标出，其余淡出
  function paintFocus() {
    var body = $("body");
    var any = false;
    var targets = Array.prototype.slice.call(body.querySelectorAll(".para")).concat([$("closing")]);
    targets.forEach(function (p) {
      var isDay = state.day != null && p.dataset.day === String(state.day);
      var isKw = !!state.keyword && p.dataset.kw.split(" ").indexOf(state.keyword) > -1;
      p.classList.toggle("is-day", isDay);
      p.classList.toggle("is-kw", isKw);
      if (isDay || isKw) any = true;
      p.querySelectorAll(".mark").forEach(function (m) { m.classList.toggle("is-on", isKw && m.dataset.kw === state.keyword); });
    });
    body.classList.toggle("has-focus", any);
  }

  /* ———————————— 附问回复 ———————————— */
  var form = $("replyForm"), ta = form.querySelector("textarea");
  function renderReply(l) {
    var sent = store.get("reply:" + l.no, null);
    ta.value = store.get("draft:" + l.no, "");
    $("sealed").hidden = !sent;
    form.hidden = !!sent;
    if (sent) {
      $("sealedText").textContent = sent.text;
      $("sealedDate").textContent = sent.date + " ";
    }
    syncCount();
    $("replyHint").textContent = "草稿会自动留在这里";
  }
  function syncCount() {
    var n = ta.value.trim().length;
    $("replyCount").textContent = ta.value.length;
    $("replyCount").parentNode.classList.toggle("is-near", ta.value.length >= 180);
    $("replySend").disabled = n === 0;
  }
  var draftTimer;
  ta.addEventListener("input", function () {
    syncCount();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      store.set("draft:" + state.letter.no, ta.value);
      $("replyHint").textContent = ta.value ? "草稿已存 · " + new Date().toTimeString().slice(0, 5) : "草稿会自动留在这里";
    }, 400);
  });
  ta.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !$("replySend").disabled) form.requestSubmit();
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = ta.value.trim();
    if (!text) return;
    var now = new Date();
    store.set("reply:" + state.letter.no, { text: text, date: (now.getMonth() + 1) + "月" + now.getDate() + "日" });
    store.set("draft:" + state.letter.no, "");
    renderReply(state.letter);
  });
  $("replyEdit").addEventListener("click", function () {
    var sent = store.get("reply:" + state.letter.no, null);
    store.set("reply:" + state.letter.no, null);
    if (sent) store.set("draft:" + state.letter.no, sent.text);
    renderReply(state.letter);
    ta.focus();
  });

  /* ———————————— 定位：导航、段落进度 ———————————— */
  var SECTION_NAME = { letter: "读信", review: "回顾", archive: "档案" };
  function setSection(name) {
    if (state.section === name) return;
    state.section = name;
    document.querySelectorAll("[data-nav]").forEach(function (a) {
      if (a.dataset.nav === name) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
    $("locSection").textContent = SECTION_NAME[name];
  }

  document.querySelectorAll("[data-nav]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var name = a.dataset.nav, target = document.getElementById(name);
      e.preventDefault();
      if (!MOBILE.matches && name !== "letter") {
        // 桌面端侧栏常驻：不滚动，轻点一下提示位置
        target.classList.remove("is-pinged");
        void target.offsetWidth;
        target.classList.add("is-pinged");
        target.focus({ preventScroll: true });
        setSection(name);
        return;
      }
      target.scrollIntoView();
      target.focus({ preventScroll: true });
      history.replaceState(null, "", "#" + name);
    });
  });
  ["letter", "review", "archive"].forEach(function (name) {
    var col = document.getElementById(name);
    col.addEventListener("mouseenter", function () { if (!MOBILE.matches) setSection(name); });
  });

  function updateProgress() {
    var sheet = $("sheet").getBoundingClientRect();
    var probe = Math.min(260, window.innerHeight * 0.4); // 读到顶栏下方这一行即算“当前段”
    var paras = $("body").querySelectorAll(".para");
    var cur = 0;
    paras.forEach(function (p, i) { if (p.getBoundingClientRect().top < probe) cur = i; });
    paras.forEach(function (p, i) { p.classList.toggle("is-current", i === cur); });
    $("locPara").textContent = "第" + cn(cur + 1) + "段 · 共" + cn(paras.length) + "段";

    var total = sheet.height - window.innerHeight + 120;
    var done = Math.min(1, Math.max(0, (120 - sheet.top) / Math.max(1, total)));
    $("progress").style.width = (done * 100).toFixed(1) + "%";

    if (MOBILE.matches) {
      var line = window.innerHeight * 0.35, sec = "letter";
      ["letter", "review", "archive"].forEach(function (name) {
        if (document.getElementById(name).getBoundingClientRect().top < line) sec = name;
      });
      if ((window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - 4) sec = "archive";
      setSection(sec);
    }
  }
  var ticking = false;
  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; updateProgress(); });
  }, { passive: true });
  window.addEventListener("resize", updateProgress);

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !state.keyword) return;
    state.keyword = null;
    document.querySelectorAll(".keywords button").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
    paintFocus();
  });

  /* ———————————— 打开一封信 ———————————— */
  function openLetter(no, animate) {
    var l = LETTERS.filter(function (x) { return x.no === no; })[0] || LETTERS[0];
    var apply = function () {
      state.letter = l;
      state.keyword = null;
      state.day = null;
      renderLetter(l);
      renderTopics(l);
      renderChart(l);
      renderKeywords(l);
      renderReply(l);
      document.querySelectorAll(".archive button").forEach(function (b) {
        if (+b.dataset.no === l.no) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
      });
      store.set("last", l.no);
      if (location.hash.indexOf("#letter-") === 0 || l.no !== LETTERS[0].no) history.replaceState(null, "", "#letter-" + l.no);
      updateProgress();
    };
    if (!animate) return apply();
    var sheet = $("sheet");
    sheet.classList.add("is-leaving");
    setTimeout(function () {
      apply();
      if (!MOBILE.matches) window.scrollTo({ top: 0 });
      sheet.classList.remove("is-leaving");
    }, 220);
  }

  renderArchive();
  var fromHash = /^#letter-(\d+)$/.exec(location.hash);
  openLetter(fromHash ? +fromHash[1] : LETTERS[0].no, false);
})();

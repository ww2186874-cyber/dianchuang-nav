/* A/B 融合 · 命令面板 + 三栏资料工作台 —— 交互逻辑
 * 数据来自 links-data.js（复制自站点 data/links.js，未改动内容）。
 * 工作台状态：{ cat: 分类 id | ""(全部), q: 查询词, sel: 选中条目 id | null }
 * 命令面板是全局搜索入口：Enter/点选 → 关闭面板并把 {cat,q,sel} 回写工作台；
 *   Ctrl/Cmd+Enter → 直接新标签打开主链接（不改工作台状态）；
 *   Esc → 取消面板，工作台状态与焦点原样恢复。
 * hash 路由：#/ 全部；#/c/<cat> 分类；#/i/<id> 条目（含资料包 id）；?q=<查询> 快照。
 */
(function () {
  "use strict";

  var data = window.NAV_DATA;
  if (!data) {
    document.getElementById("result-list").innerHTML =
      '<li class="empty-block"><h2>没有读到数据</h2><p>请确认 links-data.js 与本页面在同一目录。</p></li>';
    return;
  }

  var site = data.site || {};
  var categories = Array.isArray(data.categories) ? data.categories : [];

  /* ── DOM 引用 ── */
  function $(id) { return document.getElementById(id); }
  var body = document.body;
  var triggerEl = $("open-palette"), triggerLabel = $("trigger-label"), qClear = $("q-clear");
  var catListEl = $("cat-list");
  var outlineKicker = $("outline-kicker"), outlineBody = $("outline-body");
  var resultsKicker = $("results-kicker"), resultsTitle = $("results-title");
  var resultsCount = $("results-count");
  var searchStatus = $("search-status");
  var resultListEl = $("result-list"), resultsEmpty = $("results-empty");
  var resultsScroll = $("results-scroll");
  var detailBody = $("detail-body"), detailScroll = $("detail-scroll");
  var detailKicker = $("detail-kicker");
  var prevBtn = $("prev-item"), nextBtn = $("next-item"), stepPos = $("step-pos");
  var detailClose = $("detail-close"), detailBack = $("detail-back");
  var navToggle = $("nav-toggle"), sidebarClose = $("sidebar-close"), scrim = $("scrim");
  var sidebarEl = $("sidebar");
  var overlay = $("palette-overlay"), palette = $("palette");
  var pInput = $("palette-input"), pList = $("palette-list"), pEmpty = $("palette-empty");
  var pCount = $("palette-count"), pFilters = $("palette-filters"), pClose = $("palette-close");
  var toastEl = $("toast");

  var mqMobile = window.matchMedia("(max-width: 900px)");
  var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  function isMobile() { return mqMobile.matches; }

  /* ── 数据整理（与正式站同一套过滤规则） ── */
  function packItems(item) {
    return ((item && item.pack) || []).filter(function (p) { return p && p.title && p.url; });
  }
  function isCollection(item) { return !!(item && item.title && packItems(item).length); }
  function published(cat) {
    return (cat.items || []).filter(function (it) { return it && it.title && (it.url || isCollection(it)); });
  }
  function itemId(it, cat) {
    if (it && it.id) return String(it.id);
    return (cat ? cat.id + "-" : "") + String(it && it.title ? it.title : "");
  }
  function sortItems(items) {
    return items.map(function (it, i) { return { it: it, i: i }; })
      .sort(function (a, b) {
        var da = a.it.updated || "", db = b.it.updated || "";
        if (da !== db) return da < db ? 1 : -1;
        return b.i - a.i;
      }).map(function (r) { return r.it; });
  }
  function findCat(id) {
    for (var i = 0; i < categories.length; i++) if (categories[i].id === id) return categories[i];
    return null;
  }
  function findItem(id) {
    for (var i = 0; i < categories.length; i++) {
      var cat = categories[i], items = published(cat);
      for (var j = 0; j < items.length; j++) {
        if (itemId(items[j], cat) === id) return { item: items[j], cat: cat, partId: "" };
        var parts = packItems(items[j]);
        for (var k = 0; k < parts.length; k++) {
          if (itemId(parts[k], cat) === id) return { item: items[j], cat: cat, partId: id };
        }
      }
    }
    return null;
  }
  var allEntries = [];
  categories.forEach(function (cat) {
    published(cat).forEach(function (it) { allEntries.push({ item: it, cat: cat }); });
  });
  var totalItems = allEntries.length;
  var totalPacks = allEntries.reduce(function (n, e) { return n + packItems(e.item).length; }, 0);

  /* ── 工具 ── */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null && text !== "") n.textContent = text;
    return n;
  }
  function icon(name, cls) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", cls || "ic");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  }
  function norm(s) { return String(s || "").toLowerCase().trim(); }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function fmtDate(v) {
    if (!v) return "";
    var m = String(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    return m ? m[1] + "-" + pad2(m[2]) + "-" + pad2(m[3]) : String(v);
  }
  function tokenize(q) { return norm(q).split(/\s+/).filter(Boolean); }
  function haystack(entry) {
    var it = entry.item;
    var hay = [it.title, it.summary, it.source, (it.tags || []).join(" "), entry.cat.name];
    packItems(it).forEach(function (p) { hay.push(p.title, p.summary); });
    return norm(hay.join(" "));
  }
  /* 多词 AND：每个词都要命中（名称/说明/来源/标签/分类/资料包名与说明） */
  function matches(entry, query) {
    var tokens = tokenize(query);
    if (!tokens.length) return true;
    var hay = haystack(entry);
    return tokens.every(function (t) { return hay.indexOf(t) !== -1; });
  }
  function highlight(parent, text, query) {
    var raw = String(text == null ? "" : text);
    var needles = tokenize(query);
    var full = norm(query);
    if (full && needles.indexOf(full) === -1) needles.push(full);
    needles.sort(function (a, b) { return b.length - a.length; });
    if (!raw || !needles.length) { if (raw) parent.appendChild(document.createTextNode(raw)); return; }
    var lower = raw.toLowerCase(), ranges = [];
    needles.forEach(function (nd) {
      var from = 0, i;
      while ((i = lower.indexOf(nd, from)) !== -1) { ranges.push([i, i + nd.length]); from = i + nd.length; }
    });
    ranges.sort(function (a, b) { return a[0] - b[0] || (b[1] - b[0]) - (a[1] - a[0]); });
    var kept = [];
    ranges.forEach(function (r) { if (!kept.length || r[0] >= kept[kept.length - 1][1]) kept.push(r); });
    var pos = 0;
    kept.forEach(function (r) {
      if (r[0] > pos) parent.appendChild(document.createTextNode(raw.slice(pos, r[0])));
      parent.appendChild(el("mark", "", raw.slice(r[0], r[1])));
      pos = r[1];
    });
    if (pos < raw.length) parent.appendChild(document.createTextNode(raw.slice(pos)));
  }
  var KNOWN_EXT = ["zip", "rar", "7z", "tar", "gz", "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "exe", "msi", "apk", "hex", "bin"];
  function extOf(url) {
    try {
      var path = new URL(url, location.href).pathname;
      var m = path.match(/\.([a-z0-9]+)$/i);
      var ext = m ? m[1].toLowerCase() : "";
      return KNOWN_EXT.indexOf(ext) !== -1 ? ext : "";
    } catch (e) { return ""; }
  }
  function hostNote(url) {
    try {
      var host = new URL(url, location.href).hostname.replace(/^www\./, "");
      if (!host) return "本站页面";
      if (host.indexOf("pan.baidu.com") !== -1) return "百度网盘";
      if (host.indexOf("taobao.com") !== -1 || host.indexOf("tb.cn") !== -1) return "淘宝";
      if (host.indexOf("bilibili.com") !== -1) return "哔哩哔哩";
      return host;
    } catch (e) { return ""; }
  }
  function fileNote(obj) {
    var bits = [];
    if (obj.size) bits.push(String(obj.size));
    var fmt = obj.format || extOf(obj.url);
    if (fmt) bits.push(fmt);
    return bits.filter(Boolean).join(" · ");
  }
  /* 相对链接（如 tools/xxx.html）指向仓库根：从 previews/04-fused-workbench/ 回两级 */
  function resolveUrl(url) {
    if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return url;
    return "../../" + String(url).replace(/^\.?\//, "");
  }
  function extLink(label, url, note, primary, summary) {
    var a = el("a", "entry" + (primary ? " is-primary" : "") + (summary ? " pack-entry" : ""));
    a.href = resolveUrl(url);
    a.rel = "noopener noreferrer";
    a.target = "_blank";
    if (summary) {
      var bd = el("span", "pack-body");
      var lb = el("span", "entry-label", label);
      lb.appendChild(icon("ext"));
      bd.appendChild(lb);
      bd.appendChild(el("span", "pack-summary", summary));
      a.appendChild(bd);
    } else {
      var l = el("span", "entry-label", label);
      l.appendChild(icon("ext"));
      a.appendChild(l);
    }
    if (note) a.appendChild(el("span", "entry-note", note));
    return a;
  }
  function focusEl(node) {
    if (!node) return;
    try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); }
  }
  var toastTimer = 0;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2200);
  }

  /* ── 状态与路由 ── */
  var state = { cat: "", q: "", sel: null };

  function currentHash() {
    var base = state.sel ? "#/i/" + encodeURIComponent(state.sel)
      : state.cat ? "#/c/" + encodeURIComponent(state.cat)
      : "#/";
    if (state.q.trim()) base += "?q=" + encodeURIComponent(state.q.trim());
    return base;
  }
  /* hash 只作快照：replaceState 同步改地址、不产生历史条目、不触发 hashchange。
     file:// 下个别浏览器可能拒绝 replaceState，降级为 location.hash + 计数吞事件。 */
  var hashFallbackPending = 0;
  function writeHash() {
    var h = currentHash();
    if (location.hash === h || (!location.hash && h === "#/")) return;
    try {
      history.replaceState(null, "", h);
    } catch (e) {
      hashFallbackPending++;
      location.hash = h;
      setTimeout(function () {
        if (hashFallbackPending > 0 && location.hash === currentHash()) hashFallbackPending = 0;
      }, 0);
    }
  }
  function safeDecode(v) { try { return decodeURIComponent(v); } catch (e) { return v; } }
  function readHash() {
    var raw = location.hash.replace(/^#\/?/, "");
    var qi = raw.indexOf("?q=");
    state.q = qi >= 0 ? safeDecode(raw.slice(qi + 3)) : "";
    var h = qi >= 0 ? raw.slice(0, qi) : raw;
    var parts = h.split("/").filter(Boolean);
    if (parts[0] === "i" && parts[1]) {
      var found = findItem(safeDecode(parts[1]));
      if (found) {
        state.sel = itemId(found.item, found.cat);
        state.cat = found.cat.id;
        return;
      }
      state.sel = null;
      return;
    }
    if (parts[0] === "c" && parts[1]) {
      var cid = safeDecode(parts[1]);
      state.cat = findCat(cid) ? cid : "";
      state.sel = null;
      return;
    }
    state.cat = "";
    state.sel = null;
  }

  /* 当前结果集（中栏列表顺序，供 ↑↓ 与上一条/下一条共用） */
  function currentResults() {
    var pool = state.cat
      ? published(findCat(state.cat)).map(function (it) { return { item: it, cat: findCat(state.cat) }; })
      : allEntries;
    var filtered = pool.filter(function (e) { return matches(e, state.q); });
    if (state.cat) {
      var theCat = findCat(state.cat);
      return sortItems(filtered.map(function (e) { return e.item; }))
        .map(function (it) { return { item: it, cat: theCat }; });
    }
    /* 全部：按分类分组展示，组内 updated 倒序 */
    var out = [];
    categories.forEach(function (cat) {
      sortItems(filtered.filter(function (e) { return e.cat === cat; }).map(function (e) { return e.item; }))
        .forEach(function (it) { out.push({ item: it, cat: cat }); });
    });
    return out;
  }

  /* ── 渲染：顶栏查询状态 ── */
  function renderTrigger() {
    var q = state.q.trim();
    triggerEl.classList.toggle("has-query", !!q);
    qClear.hidden = !q;
    if (q) {
      triggerLabel.textContent = "";
      triggerLabel.appendChild(document.createTextNode("查询「"));
      triggerLabel.appendChild(el("b", "", q));
      triggerLabel.appendChild(document.createTextNode("」 · 点击修改"));
    } else {
      triggerLabel.textContent = "搜索资料、打开工具…";
    }
  }

  /* ── 渲染：左栏分类 ── */
  function renderCats() {
    catListEl.innerHTML = "";
    var rows = [{ id: "", name: "全部资料", icon: "all", count: totalItems }].concat(
      categories.map(function (c) { return { id: c.id, name: c.name, icon: c.icon, count: published(c).length }; })
    );
    rows.forEach(function (row) {
      var li = el("li", "cat-item");
      var btn = el("button", "cat-btn" + (state.cat === row.id ? " is-active" : ""));
      btn.type = "button";
      btn.dataset.cat = row.id;
      if (state.cat === row.id) btn.setAttribute("aria-current", "true");
      btn.appendChild(icon(row.icon || "all"));
      btn.appendChild(el("span", "cat-name", row.name));
      btn.appendChild(el("span", "cat-count" + (row.count ? "" : " is-zero"), pad2(row.count)));
      btn.addEventListener("click", function () { selectCategory(row.id); });
      li.appendChild(btn);
      catListEl.appendChild(li);
    });
  }

  /* ── 渲染：左栏目录（当前结果的条目 + 合集子包） ── */
  function renderOutline() {
    outlineBody.innerHTML = "";
    var cat = state.cat ? findCat(state.cat) : null;
    outlineKicker.textContent = cat ? "OUTLINE / " + cat.name : "OUTLINE / 全部资料";
    var entries = currentResults();
    if (!entries.length) {
      outlineBody.appendChild(el("p", "outline-empty", norm(state.q) ? "当前搜索没有匹配条目。" : (cat && cat.empty) || "还没有条目，欢迎补充。"));
      return;
    }
    var ul = el("ul", "outline-list");
    entries.forEach(function (e, i) {
      var id = itemId(e.item, e.cat);
      var li = el("li");
      var btn = el("button", "outline-btn" + (state.sel === id ? " is-current" : ""));
      btn.type = "button";
      btn.dataset.item = id;
      btn.appendChild(el("span", "outline-num", pad2(i + 1)));
      var t = el("span", "outline-title");
      highlight(t, e.item.title, state.q);
      btn.appendChild(t);
      btn.addEventListener("click", function () { selectItem(id, { from: "outline" }); });
      li.appendChild(btn);
      var parts = packItems(e.item);
      /* 选中项展开子包；刚被目录定位过的父合集也保持展开（高亮可见） */
      if (parts.length && (state.sel === id || locateParent === id)) {
        var sub = el("ul", "outline-pack");
        parts.forEach(function (p) {
          var sli = el("li");
          /* 目录项只定位不下载：button 而非外链，Enter/Space 同样只定位 */
          var pb = el("button", "", p.title);
          pb.type = "button";
          pb.dataset.pack = itemId(p, e.cat);
          pb.title = "在详情中查看：" + p.title + (p.size ? "（" + p.size + "）" : "");
          if (locatedPack === itemId(p, e.cat)) pb.classList.add("is-located");
          pb.addEventListener("click", function () { locatePack(id, itemId(p, e.cat)); });
          sli.appendChild(pb);
          sub.appendChild(sli);
        });
        li.appendChild(sub);
      }
      ul.appendChild(li);
    });
    outlineBody.appendChild(ul);
  }

  /* ── 渲染：中栏列表 ── */
  function resultCard(e, index, query) {
    var it = e.item, id = itemId(it, e.cat);
    var li = el("li");
    var btn = el("button", "result-card" + (state.sel === id ? " is-selected" : ""));
    btn.type = "button";
    btn.dataset.item = id;
    btn.setAttribute("aria-pressed", state.sel === id ? "true" : "false");

    var top = el("span", "rc-top");
    top.appendChild(el("span", "rc-cat", e.cat.name));
    if (it.updated) top.appendChild(el("span", "rc-date", fmtDate(it.updated)));
    btn.appendChild(top);

    var title = el("span", "rc-title");
    highlight(title, it.title, query);
    btn.appendChild(title);

    if (it.summary) {
      var sum = el("span", "rc-summary");
      highlight(sum, it.summary, query);
      btn.appendChild(sum);
    }

    var meta = el("span", "rc-meta");
    if (it.tags && it.tags.length) {
      var tags = el("span", "rc-tags");
      it.tags.slice(0, 3).forEach(function (tag) {
        var s = el("span");
        highlight(s, tag, query);
        tags.appendChild(s);
      });
      meta.appendChild(tags);
    }
    var packs = packItems(it);
    var kind = packs.length ? packs.length + " 个资料包" : (it.format || extOf(it.url) || (it.url ? "链接" : ""));
    if (kind) meta.appendChild(el("span", "rc-kind", kind));
    if (meta.children.length) btn.appendChild(meta);

    btn.addEventListener("click", function () { selectItem(id, { from: "list" }); });
    li.appendChild(btn);
    return li;
  }

  function renderResults() {
    var query = norm(state.q);
    var cat = state.cat ? findCat(state.cat) : null;
    var entries = currentResults();

    resultsKicker.textContent = cat
      ? "INDEX " + pad2(categories.indexOf(cat) + 1) + " / " + String(cat.id).toUpperCase()
      : "ALL / 全部资料";
    resultsTitle.textContent = query ? "搜索结果" : (cat ? cat.name : "全部资料");
    resultsCount.textContent = pad2(entries.length) + " 条";

    /* 搜索状态行 */
    searchStatus.innerHTML = "";
    if (query) {
      searchStatus.hidden = false;
      var txt = el("span");
      txt.appendChild(document.createTextNode("「"));
      txt.appendChild(el("b", "", state.q.trim()));
      txt.appendChild(document.createTextNode("」 · " + entries.length + " 条匹配"));
      searchStatus.appendChild(txt);
      var clear = el("button", "", "清除");
      clear.type = "button";
      clear.addEventListener("click", function () { clearQuery(); });
      searchStatus.appendChild(clear);
    } else {
      searchStatus.hidden = true;
    }

    resultListEl.innerHTML = "";
    resultsEmpty.innerHTML = "";
    entries.forEach(function (e, i) { resultListEl.appendChild(resultCard(e, i, state.q)); });

    if (!entries.length) {
      var block = el("div", "empty-block");
      if (query) {
        block.appendChild(el("h2", "", "没有匹配的条目"));
        block.appendChild(el("p", "", "换一个更短的关键词，或清除搜索看看全部资料。"));
        var b = el("button", "btn-solid", "清除搜索");
        b.type = "button";
        b.addEventListener("click", function () { clearQuery(); });
        block.appendChild(b);
      } else {
        block.appendChild(el("h2", "", (cat && cat.empty) || "还没有条目"));
        block.appendChild(el("p", "", "这个分类还在等第一份资料；先看看其他分类吧。"));
        var b2 = el("button", "btn-solid", "查看全部资料");
        b2.type = "button";
        b2.addEventListener("click", function () { selectCategory(""); });
        block.appendChild(b2);
      }
      resultsEmpty.appendChild(block);
    }
  }

  /* ── 渲染：右栏详情 ── */
  function keyRow(caps, label) {
    var row = el("div", "ph-key");
    var capsBox = el("span", "ph-key-caps");
    caps.forEach(function (c, i) {
      if (c === "|") { capsBox.appendChild(el("span", "or", "或")); return; }
      if (i > 0 && caps[i - 1] !== "|" && c !== "+") capsBox.appendChild(document.createTextNode(" "));
      if (c === "+") { capsBox.appendChild(el("span", "or", "+")); return; }
      capsBox.appendChild(el("kbd", "", c));
    });
    row.appendChild(capsBox);
    row.appendChild(el("span", "ph-key-label", label));
    return row;
  }
  function placeholder(kind) {
    var box = el("div", "detail-placeholder");
    box.appendChild(icon(kind === "noresult" ? "search" : (kind === "emptycat" ? "archive" : "book"), "ic ph-glyph"));
    if (kind === "noresult") {
      box.appendChild(el("h2", "", "没有匹配的资料"));
      box.appendChild(el("p", "", "当前查询在这个分类里没有命中，换个关键词或清除搜索看看。"));
      var b1 = el("button", "btn-solid", "清除搜索");
      b1.type = "button";
      b1.addEventListener("click", function () { clearQuery(); });
      box.appendChild(b1);
      var k1 = el("div", "ph-keys");
      k1.appendChild(keyRow(["/"], "重新搜索"));
      k1.appendChild(keyRow(["Esc"], "清除当前查询"));
      box.appendChild(k1);
    } else if (kind === "emptycat") {
      box.appendChild(el("h2", "", "这个分类还是空的"));
      box.appendChild(el("p", "", "还没有收录资料，先看看其他分类吧。"));
      var b2 = el("button", "btn-solid", "查看全部资料");
      b2.type = "button";
      b2.addEventListener("click", function () { selectCategory(""); });
      box.appendChild(b2);
      var k2 = el("div", "ph-keys");
      k2.appendChild(keyRow(["/"], "搜索全部资料"));
      k2.appendChild(keyRow(["Ctrl", "+", "K"], "打开命令面板"));
      box.appendChild(k2);
    } else {
      box.appendChild(el("h2", "", "从中间列表选一条资料"));
      box.appendChild(el("p", "", "说明、来源、下载与相关入口会显示在这里。"));
      var keys = el("div", "ph-keys");
      keys.appendChild(keyRow(["/", "|", "Ctrl", "+", "K"], "搜索与定位"));
      keys.appendChild(keyRow(["↑", "↓"], "切换资料"));
      keys.appendChild(keyRow(["Esc"], "关闭详情"));
      box.appendChild(keys);
    }
    return box;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }
  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("copy failed"));
    });
  }

  function metaRow(label, value) {
    var row = el("div");
    row.appendChild(el("i", "", label));
    row.appendChild(el("b", "", value));
    return row;
  }

  function renderDetail() {
    detailBody.innerHTML = "";
    var entries = currentResults();
    var found = state.sel ? findItem(state.sel) : null;

    /* 步进器状态 */
    var idx = -1;
    if (found) {
      var selId = itemId(found.item, found.cat);
      idx = entries.findIndex(function (e) { return itemId(e.item, e.cat) === selId; });
    }
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx === -1 || idx >= entries.length - 1;
    stepPos.textContent = idx >= 0 ? (idx + 1) + " / " + entries.length : "– / " + entries.length;

    if (!found) {
      detailKicker.textContent = "DETAIL / 详情";
      var kind = entries.length ? "idle" : (norm(state.q) ? "noresult" : "emptycat");
      detailBody.appendChild(placeholder(kind));
      detailScroll.classList.add("is-empty"); /* 空态在右栏可用区域内居中 */
      body.classList.remove("detail-open");
      return;
    }
    detailScroll.classList.remove("is-empty");

    var it = found.item, cat = found.cat;
    detailKicker.textContent = "DETAIL / " + String(cat.id).toUpperCase();

    var doc = el("article", "detail-doc");
    var packs = packItems(it);

    /* —— 页头：kicker + 标题 + 摘要 + 标签 ｜ 元信息（宽屏时右侧成区）—— */
    var head = el("header", "dc-head");
    var headMain = el("div", "dc-head-main");
    var kicker = el("p", "dc-kicker");
    kicker.appendChild(document.createTextNode(String(cat.id).toUpperCase() + " / "));
    var catBtn = el("button", "", cat.name);
    catBtn.type = "button";
    catBtn.title = "查看「" + cat.name + "」分类";
    catBtn.addEventListener("click", function () { selectCategory(cat.id); });
    kicker.appendChild(catBtn);
    if (packs.length) kicker.appendChild(document.createTextNode(" · 合集"));
    headMain.appendChild(kicker);

    var h2 = el("h2", "", it.title);
    h2.id = "detail-title";
    h2.tabIndex = -1;
    headMain.appendChild(h2);
    if (it.summary) headMain.appendChild(el("p", "dc-summary", it.summary));
    if (it.tags && it.tags.length) {
      var tags = el("ul", "dc-tags");
      it.tags.forEach(function (t) { tags.appendChild(el("li", "", t)); });
      headMain.appendChild(tags);
    }
    head.appendChild(headMain);

    /* 元信息只出现一次：合集放页头侧区；普通条目放下方「资料说明」区，避免重复 */
    if (packs.length) {
      var meta = el("div", "dc-meta");
      if (it.source) meta.appendChild(metaRow("来源", it.source));
      if (it.extractCode) meta.appendChild(metaRow("提取码", it.extractCode));
      if (it.expiry) meta.appendChild(metaRow("有效期", it.expiry));
      if (it.updated) meta.appendChild(metaRow("更新", fmtDate(it.updated)));
      meta.appendChild(metaRow("资料包", packs.length + " 个"));
      var headSide = el("div", "dc-head-side");
      headSide.appendChild(meta);
      head.appendChild(headSide);
    }
    doc.appendChild(head);

    /* —— 主体：合集 = 2×2 资料包网格；普通条目 = 说明区 + 操作区（宽屏分栏）—— */
    if (packs.length) {
      var sec = el("section", "dc-section dc-packs");
      var shead = el("div", "dc-section-head");
      shead.appendChild(el("h3", "", "选择下载 / " + packs.length + " 个资料包"));
      if (it.allUrl) {
        var all = el("a", "dc-all", "查看全部资料包 ↗");
        all.href = resolveUrl(it.allUrl);
        all.target = "_blank";
        all.rel = "noopener noreferrer";
        shead.appendChild(all);
      }
      sec.appendChild(shead);
      var grid = el("div", "pack-grid");
      packs.forEach(function (p) {
        var tile = el("a", "pack-tile" + (found.partId && itemId(p, cat) === found.partId ? " is-part" : ""));
        tile.href = resolveUrl(p.url);
        tile.target = "_blank";
        tile.rel = "noopener noreferrer";
        tile.dataset.pack = itemId(p, cat);
        var top = el("span", "pt-top");
        var pt = el("span", "pt-title", p.title);
        pt.appendChild(icon("ext"));
        top.appendChild(pt);
        top.appendChild(el("span", "pt-note", fileNote(p) || hostNote(p.url)));
        tile.appendChild(top);
        if (p.summary) tile.appendChild(el("p", "pt-summary", p.summary));
        var dl = el("span", "pt-dl");
        dl.appendChild(icon("download"));
        var pfmt = (p.format || extOf(p.url) || "").toLowerCase();
        dl.appendChild(document.createTextNode(pfmt ? "下载 " + pfmt.toUpperCase() : "下载"));
        tile.appendChild(dl);
        grid.appendChild(tile);
      });
      sec.appendChild(grid);
      doc.appendChild(sec);
    } else {
      var cols = el("div", "dc-cols");
      /* 说明区：元信息 + 标签（摘要只在页头出现一次，不重复目录、不虚构内容） */
      var info = el("section", "dc-section dc-col-info");
      info.appendChild(el("h3", "", "资料说明"));
      var infoMeta = el("div", "dc-meta");
      if (it.source) infoMeta.appendChild(metaRow("来源", it.source));
      if (it.updated) infoMeta.appendChild(metaRow("更新", fmtDate(it.updated)));
      if (it.size || it.format || extOf(it.url)) infoMeta.appendChild(metaRow("文件", fileNote(it)));
      if (it.extractCode) infoMeta.appendChild(metaRow("提取码", it.extractCode));
      if (it.expiry) infoMeta.appendChild(metaRow("有效期", it.expiry));
      if (infoMeta.children.length) info.appendChild(infoMeta);
      if (it.tags && it.tags.length) {
        var tags2 = el("ul", "dc-tags");
        it.tags.forEach(function (t) { tags2.appendChild(el("li", "", t)); });
        info.appendChild(tags2);
      }
      cols.appendChild(info);

      /* 操作区：主链接 + 附加入口 */
      var actions = el("div", "dc-col-actions");
      var hasEntry = false;
      var list = el("section", "dc-section");
      if (it.url) {
        list.appendChild(el("h3", "", it.urlLabel === "打开工具" ? "在线使用" : "主下载"));
        var bits = [];
        var note = fileNote(it) || hostNote(it.url);
        if (note) bits.push(note);
        if (it.extractCode) bits.push("提取码 " + it.extractCode);
        if (it.expiry) bits.push(it.expiry);
        list.appendChild(extLink(it.urlLabel || "资料下载", it.url, bits.join(" · "), true));
        hasEntry = true;
      }
      var extra = (it.links || []).filter(function (l) { return l && l.url && l.label; });
      if (extra.length) {
        var list2 = hasEntry ? el("section", "dc-section") : list;
        list2.appendChild(el("h3", "", "相关入口"));
        extra.forEach(function (link) {
          list2.appendChild(extLink(link.label, link.url, link.note || hostNote(link.url)));
        });
        if (hasEntry) { actions.appendChild(list); actions.appendChild(list2); }
        else actions.appendChild(list2);
        hasEntry = true;
      } else if (hasEntry) {
        actions.appendChild(list);
      }
      if (hasEntry) cols.appendChild(actions);
      doc.appendChild(cols);
    }

    /* —— 页脚：复制链接 + ID —— */
    var foot = el("div", "dc-foot");
    var copy = el("button", "copy-link", "复制本页链接");
    copy.type = "button";
    var timer = 0;
    copy.addEventListener("click", function () {
      copyText(location.href).then(function () {
        copy.textContent = "已复制";
        copy.classList.add("is-done");
      }, function () {
        copy.textContent = "复制失败，请手动复制地址栏";
      }).then(function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          copy.textContent = "复制本页链接";
          copy.classList.remove("is-done");
        }, 1800);
      });
    });
    foot.appendChild(copy);
    foot.appendChild(el("span", "dc-id", "ID / " + itemId(it, cat)));
    doc.appendChild(foot);

    detailBody.appendChild(doc);
    detailScroll.scrollTop = 0;
    /* 手机详情层的开合只由用户动作（selectItem/locate/hash 直达）控制，
       渲染本身不改层状态，避免步进/轻量更新时误关或误开。 */
  }

  /* ── 全量渲染 ── */
  function render(opts) {
    opts = opts || {};
    renderTrigger();
    renderCats();
    renderResults();
    renderOutline();
    renderDetail();
    document.title = (state.sel && findItem(state.sel) ? findItem(state.sel).item.title + " · " : "") +
      (site.title || "电创导航") + " · 融合工作台";
    if (!opts.keepHash) writeHash();
    syncDetailInert();
  }

  /* ── 行为 ── */
  function selectCategory(id) {
    state.cat = id;
    state.sel = null;
    var wasDrawer = drawerOpen;
    var wasDetail = body.classList.contains("detail-open");
    closeDrawer(false);
    body.classList.remove("detail-open");
    render();
    resultsScroll.scrollTop = 0;
    if (isMobile()) {
      var delay = (wasDrawer || wasDetail) && !mqReduce.matches ? 280 : 0;
      setTimeout(function () {
        if (wasDrawer || wasDetail) focusEl(resultsTitle);
        else focusEl(catListEl.querySelector('.cat-btn[data-cat="' + CSS.escape(id) + '"]') || resultsTitle);
      }, delay);
    }
  }

  function selectItem(id, opts) {
    opts = opts || {};
    var found = findItem(id);
    if (!found) return;
    state.sel = itemId(found.item, found.cat);
    if (opts.syncCat) state.cat = found.cat.id;
    var inList = resultListEl.querySelector('[data-item="' + CSS.escape(state.sel) + '"]');
    if (inList && !opts.syncCat && !opts.forceRender) {
      renderKeepListFocus(state.sel);
      if (opts.focus) focusEl(inList);
      if (opts.scrollIntoView) inList.scrollIntoView({ block: "nearest" });
    } else {
      render();
      var card = resultListEl.querySelector('[data-item="' + CSS.escape(state.sel) + '"]');
      if (card) {
        if (opts.focus) focusEl(card);
        if (opts.scrollIntoView) card.scrollIntoView({ block: "nearest" });
      }
    }
    if (isMobile() && !drawerOpen) {
      body.classList.add("detail-open");
      syncDetailInert();
      if (opts.from !== "step") lastListTrigger = state.sel;
      if (opts.from !== "step" && !keyboardNav) {
        setTimeout(function () {
          if (!drawerOpen && body.classList.contains("detail-open")) focusEl($("detail-title") || detailBack);
        }, mqReduce.matches ? 0 : 280);
      }
    }
  }

  /* ── 目录资料包定位：只查看不下载 ──
   * 点击/Enter/Space → 选中父合集（如未选中）→ 关移动抽屉（如开着）→
   * 右栏/手机详情滚动到对应资料包瓦片并短暂高亮。不触发任何外链/下载。 */
  var locatedPack = null;
  var locateParent = null;
  var locateTimer = 0;
  function locatePack(parentId, partId) {
    var found = findItem(parentId);
    if (!found) return;
    locatedPack = partId;
    locateParent = parentId;
    var wasDrawer = drawerOpen;
    if (wasDrawer) closeDrawer(false);
    /* 抽屉里点子包时父合集可能尚未选中：先静默选中（不抢焦点），
       让详情渲染出资料包瓦片，再由下面的定位逻辑滚动+聚焦。 */
    if (state.sel !== parentId) {
      state.sel = parentId;
      state.cat = found.cat.id;
      render();
    } else {
      renderKeepListFocus(parentId); /* 重绘目录以带上 is-located */
    }
    if (isMobile()) {
      body.classList.add("detail-open");
      syncDetailInert();
      lastListTrigger = parentId;
    }
    var delay = isMobile() && !mqReduce.matches ? 300 : 0;
    setTimeout(function () {
      var tile = detailBody.querySelector('.pack-tile[data-pack="' + CSS.escape(partId) + '"]');
      if (!tile) return;
      Array.prototype.forEach.call(detailBody.querySelectorAll(".pack-tile.is-located"), function (n) {
        n.classList.remove("is-located");
      });
      tile.classList.add("is-located");
      /* 只滚动详情自己的滚动容器，避免 scrollIntoView 连带滚动祖先 */
      var tr = tile.getBoundingClientRect();
      var sr = detailScroll.getBoundingClientRect();
      var target = detailScroll.scrollTop + (tr.top - sr.top) - (detailScroll.clientHeight - tr.height) / 2;
      detailScroll.scrollTo({ top: Math.max(0, target), behavior: mqReduce.matches ? "auto" : "smooth" });
      focusEl(tile);
      clearTimeout(locateTimer);
      locateTimer = setTimeout(function () {
        tile.classList.remove("is-located");
        locatedPack = null;
        locateParent = null;
        renderOutline();
      }, 2400);
    }, delay);
  }

  function closeDetail() {
    if (!state.sel) return;
    var id = state.sel;
    var wasMobile = isMobile();
    locatedPack = null;
    locateParent = null;
    if (wasMobile) {
      /* 手机「返回列表」：只收层、保留选中（卡片红边标示刚才看的位置），
         目录子包也随选中保持展开；桌面 × 才是取消选中回占位。 */
      body.classList.remove("detail-open");
      syncDetailInert();
    } else {
      state.sel = null;
      body.classList.remove("detail-open");
      render();
      syncDetailInert();
    }
    var targetId = (wasMobile && lastListTrigger) || id;
    lastListTrigger = null;
    /* 焦点归还等详情层滑出、底层列表恢复可见后再执行；
       期间抑制 focusin 联动，避免程序化聚焦触发意外行为。 */
    function restore() {
      var card = resultListEl.querySelector('[data-item="' + CSS.escape(targetId) + '"]') ||
        resultListEl.querySelector('[data-item="' + CSS.escape(id) + '"]');
      keyboardNav = true;
      if (card) {
        focusEl(card);
        card.scrollIntoView({ block: "nearest" });
      } else {
        focusEl(resultsTitle);
      }
      setTimeout(function () { keyboardNav = false; }, 80);
    }
    if (wasMobile && !mqReduce.matches) setTimeout(restore, 300);
    else restore();
  }
  var lastListTrigger = null;

  function step(delta) {
    var entries = currentResults();
    if (!entries.length) return;
    var idx = state.sel
      ? entries.findIndex(function (e) { return itemId(e.item, e.cat) === state.sel; })
      : -1;
    var next = idx === -1 ? (delta > 0 ? 0 : entries.length - 1) : idx + delta;
    if (next < 0 || next >= entries.length) return;
    selectItem(itemId(entries[next].item, entries[next].cat), { from: "step", focus: !isMobile(), scrollIntoView: true });
  }

  /* ── 查询 ── */
  function applyQuery(q) {
    state.q = q;
    if (state.sel) {
      var entries = currentResults();
      var still = entries.some(function (e) { return itemId(e.item, e.cat) === state.sel; });
      if (!still) {
        state.sel = null;
        body.classList.remove("detail-open");
      }
    }
    render();
    resultsScroll.scrollTop = 0;
  }
  function clearQuery() {
    if (!state.q) return;
    applyQuery("");
    focusEl(triggerEl);
  }
  qClear.addEventListener("click", clearQuery);

  /* ══════════ 命令面板 ══════════ */
  var paletteOpen = false;
  var pFilterCat = "";       // 面板内分类筛选（"" = 全部），独立于工作台分类
  var pResults = [];
  var pActiveIdx = -1;
  var paletteReturnFocus = null;

  function buildFilters() {
    pFilters.textContent = "";
    var defs = [{ id: "", name: "全部", n: totalItems }];
    categories.forEach(function (cat) {
      var n = published(cat).length;
      if (n > 0) defs.push({ id: cat.id, name: cat.name, n: n });
    });
    defs.forEach(function (d) {
      var chip = el("button", "filter-chip" + (pFilterCat === d.id ? " is-active" : ""));
      chip.type = "button";
      chip.setAttribute("aria-pressed", pFilterCat === d.id ? "true" : "false");
      chip.appendChild(document.createTextNode(d.name));
      chip.appendChild(el("span", "n", String(d.n)));
      chip.addEventListener("click", function () {
        pFilterCat = d.id;
        buildFilters();
        runPaletteSearch();
        focusEl(pInput);
      });
      pFilters.appendChild(chip);
    });
  }

  function matchScore(entry, tokens) {
    var score = 0;
    var title = norm(entry.item.title);
    var hay = haystack(entry);
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (hay.indexOf(t) === -1) return -1;
      score += title.indexOf(t) !== -1 ? 10 : 1;
    }
    return score;
  }
  function entryOrder(e) {
    return categories.indexOf(e.cat) * 1000 + published(e.cat).indexOf(e.item);
  }
  function runPaletteSearch() {
    var tokens = tokenize(pInput.value);
    var pool = pFilterCat ? allEntries.filter(function (e) { return e.cat.id === pFilterCat; }) : allEntries;
    if (!tokens.length) {
      pResults = pool.slice().sort(function (a, b) {
        var da = a.item.updated || "", db = b.item.updated || "";
        if (da !== db) return da < db ? 1 : -1;
        return entryOrder(b) - entryOrder(a);
      });
    } else {
      pResults = pool.map(function (e) { return { e: e, s: matchScore(e, tokens) }; })
        .filter(function (r) { return r.s >= 0; })
        .sort(function (a, b) { return b.s - a.s || entryOrder(b.e) - entryOrder(a.e); })
        .map(function (r) { return r.e; });
    }
    pActiveIdx = pResults.length ? 0 : -1;
    renderPaletteResults(tokens);
  }

  function renderPaletteResults(tokens) {
    /* 重建列表前显式清掉 aria-activedescendant：旧 opt-N 节点即将销毁，
       若残留指向已脱离 DOM 的 id，部分浏览器会把随后的鼠标点击判为无效。 */
    pInput.removeAttribute("aria-activedescendant");
    pList.textContent = "";
    pResults.forEach(function (e, i) {
      var li = el("li", "palette-option" + (i === pActiveIdx ? " is-active" : ""));
      li.id = "opt-" + i;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === pActiveIdx ? "true" : "false");
      var ic = el("span", "opt-icon");
      ic.appendChild(icon(e.cat.icon || "book"));
      var main = el("span", "opt-main");
      var title = el("span", "opt-title");
      highlight(title, e.item.title, pInput.value);
      main.appendChild(title);
      var packs = packItems(e.item);
      var subText = packs.length
        ? (packs.length + " 个资料包 · " + (e.item.summary || ""))
        : (e.item.summary || "");
      main.appendChild(el("span", "opt-sub", subText));
      li.appendChild(ic);
      li.appendChild(main);
      li.appendChild(el("span", "opt-cat", e.cat.name));
      /* 用闭包里的条目定位，不依赖下标：列表重建后旧节点上的事件仍指向正确条目 */
      li.addEventListener("mousemove", function () {
        var idx = pResults.indexOf(e);
        if (idx >= 0 && pActiveIdx !== idx) { pActiveIdx = idx; syncPaletteActive(false); }
      });
      li.addEventListener("click", function (ev) {
        var idx = pResults.indexOf(e);
        if (idx < 0) return;
        pActiveIdx = idx;
        syncPaletteActive(false);
        if (ev.ctrlKey || ev.metaKey) openActiveDirect();
        else locateActive();
      });
      pList.appendChild(li);
    });
    var has = pResults.length > 0;
    pList.hidden = !has;
    pEmpty.hidden = has;
    if (!has) {
      pEmpty.textContent = "";
      var line = el("span");
      line.appendChild(document.createTextNode("没有找到匹配「"));
      line.appendChild(el("b", null, pInput.value.trim() || "（当前分类）"));
      line.appendChild(document.createTextNode("」的资料。"));
      pEmpty.appendChild(line);
      pEmpty.appendChild(el("span", "empty-tip", "试试更短的关键词，或切换上方分类；也可以把想要的资料发给维护人补充。"));
      pInput.removeAttribute("aria-activedescendant");
    }
    pCount.textContent = pResults.length + " 条";
    syncPaletteActive(true);
  }

  function syncPaletteActive(scroll) {
    var opts = pList.children;
    for (var i = 0; i < opts.length; i++) {
      var on = i === pActiveIdx;
      opts[i].classList.toggle("is-active", on);
      opts[i].setAttribute("aria-selected", on ? "true" : "false");
    }
    if (pActiveIdx >= 0 && opts[pActiveIdx]) {
      pInput.setAttribute("aria-activedescendant", opts[pActiveIdx].id);
      if (scroll) {
        var o = opts[pActiveIdx].getBoundingClientRect();
        var l = pList.getBoundingClientRect();
        if (o.top < l.top) pList.scrollTop -= (l.top - o.top) + 4;
        else if (o.bottom > l.bottom) pList.scrollTop += (o.bottom - l.bottom) + 4;
      }
    } else {
      pInput.removeAttribute("aria-activedescendant");
    }
  }
  function movePaletteActive(delta) {
    if (!pResults.length) return;
    pActiveIdx = (pActiveIdx + delta + pResults.length) % pResults.length;
    syncPaletteActive(true);
  }

  function openPalette() {
    if (paletteOpen) { focusEl(pInput); pInput.select(); return; }
    if (drawerOpen) closeDrawer(false);
    paletteOpen = true;
    paletteReturnFocus = document.activeElement;
    /* 面板预填当前查询；分类筛选默认「全部」（全局搜索），当前分类作为可见 chip */
    pInput.value = state.q;
    pFilterCat = "";
    overlay.hidden = false;
    buildFilters();
    runPaletteSearch();
    setInert($("app"), true);
    focusEl(pInput);
    pInput.select();
  }
  function closePalette(restore) {
    if (!paletteOpen) return;
    paletteOpen = false;
    overlay.hidden = true;
    setInert($("app"), false);
    syncDetailInert();
    if (restore !== false) {
      var ret = paletteReturnFocus;
      var usable = ret && document.contains(ret) && ret.getClientRects().length &&
        getComputedStyle(ret).visibility !== "hidden";
      focusEl(usable ? ret : triggerEl);
    }
  }

  /* Enter / 鼠标点选：关闭面板 → 三栏定位到所选条目。
   * 查询上下文规则：面板输入词成为工作台查询；分类切到条目所属分类，
   * 保证「查询 + 分类」组合下该条目必然出现在中栏列表里（可理解、可复现）。 */
  function locateActive() {
    if (pActiveIdx < 0 || !pResults[pActiveIdx]) return;
    var e = pResults[pActiveIdx];
    var id = itemId(e.item, e.cat);
    var q = pInput.value.trim();
    closePalette(false);
    state.q = q;
    state.cat = e.cat.id;
    state.sel = id;
    render();
    resultsScroll.scrollTop = 0;
    var card = resultListEl.querySelector('[data-item="' + CSS.escape(id) + '"]');
    if (card) card.scrollIntoView({ block: "nearest" });
    if (isMobile()) {
      body.classList.add("detail-open");
      syncDetailInert();
      lastListTrigger = id;
      setTimeout(function () {
        if (body.classList.contains("detail-open")) focusEl($("detail-title") || detailBack);
      }, mqReduce.matches ? 0 : 280);
    } else {
      /* 桌面：焦点落在定位到的列表卡片上，↑↓ 可继续比较 */
      keyboardNav = true;
      if (card) focusEl(card);
      keyboardNav = false;
    }
    showToast("已定位：" + e.item.title + (q ? "（查询「" + q + "」）" : ""));
  }

  /* Ctrl/Cmd+Enter：直接打开真实主链接，不改工作台状态 */
  function primaryUrl(e) {
    if (e.item.url) return resolveUrl(e.item.url);
    if (e.item.allUrl) return resolveUrl(e.item.allUrl);
    var parts = packItems(e.item);
    return parts.length ? resolveUrl(parts[0].url) : "";
  }
  function openActiveDirect() {
    if (pActiveIdx < 0 || !pResults[pActiveIdx]) return;
    var e = pResults[pActiveIdx];
    var url = primaryUrl(e);
    if (!url) return;
    window.open(url, "_blank", "noopener");
    showToast("已在新标签页打开：" + e.item.title);
  }

  triggerEl.addEventListener("click", openPalette);
  pClose.addEventListener("click", function () { closePalette(true); });
  overlay.addEventListener("mousedown", function (e) {
    if (e.target === overlay) closePalette(true);
  });
  pInput.addEventListener("input", runPaletteSearch);

  /* 面板内 Tab 循环 */
  function visibleFocusables(container) {
    var nodes = container.querySelectorAll('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])');
    var vis = [];
    Array.prototype.forEach.call(nodes, function (n) {
      if (!n.getClientRects().length) return;
      if (getComputedStyle(n).visibility === "hidden") return;
      vis.push(n);
    });
    return vis;
  }
  function trapTab(e, container) {
    var vis = visibleFocusables(container);
    if (!vis.length) return;
    var cur = document.activeElement;
    var idx = vis.indexOf(cur);
    if (e.shiftKey) {
      if (idx <= 0) { e.preventDefault(); focusEl(vis[vis.length - 1]); }
    } else {
      if (idx === -1 || idx === vis.length - 1) { e.preventDefault(); focusEl(vis[0]); }
    }
  }

  /* ── 抽屉（手机） ── */
  var drawerOpen = false;
  var drawerReturnFocus = null;
  function openDrawer() {
    if (!isMobile() || drawerOpen) return;
    drawerOpen = true;
    drawerReturnFocus = document.activeElement;
    body.classList.add("drawer-open");
    scrim.hidden = false;
    navToggle.setAttribute("aria-expanded", "true");
    sidebarEl.setAttribute("role", "dialog");
    sidebarEl.setAttribute("aria-modal", "true");
    sidebarEl.setAttribute("aria-label", "分类与资料目录");
    sidebarEl.removeAttribute("aria-hidden");
    setInert($("results"), true);
    setInert($("detail"), true);
    setInert(document.querySelector(".topbar"), true);
    requestAnimationFrame(function () {
      var active = sidebarEl.querySelector(".cat-btn.is-active") || sidebarEl.querySelector(".cat-btn");
      focusEl(active || sidebarClose);
    });
    setTimeout(function () {
      if (drawerOpen && !sidebarEl.contains(document.activeElement)) {
        var active = sidebarEl.querySelector(".cat-btn.is-active") || sidebarEl.querySelector(".cat-btn");
        focusEl(active || sidebarClose);
      }
    }, mqReduce.matches ? 0 : 280);
  }
  function closeDrawer(restoreFocus) {
    if (!drawerOpen) return;
    drawerOpen = false;
    body.classList.remove("drawer-open");
    navToggle.setAttribute("aria-expanded", "false");
    sidebarEl.removeAttribute("role");
    sidebarEl.removeAttribute("aria-modal");
    setInert($("results"), false);
    setInert(document.querySelector(".topbar"), false);
    syncDetailInert();
    if (restoreFocus !== false) {
      var target = drawerReturnFocus || navToggle;
      setTimeout(function () { focusEl(target); }, 0);
    }
    setTimeout(function () { if (!drawerOpen) scrim.hidden = true; }, mqReduce.matches ? 0 : 260);
    syncSidebarVisibility();
  }
  function setInert(node, on) {
    if (!node) return;
    if (on) node.setAttribute("inert", "");
    else node.removeAttribute("inert");
  }
  function syncSidebarVisibility() {
    if (isMobile() && !drawerOpen) sidebarEl.setAttribute("aria-hidden", "true");
    else sidebarEl.removeAttribute("aria-hidden");
  }
  function syncDetailInert() {
    if (paletteOpen) return; /* 面板打开时整个 app 已 inert */
    if (isMobile()) {
      var open = body.classList.contains("detail-open");
      setInert($("results"), open || drawerOpen);
      setInert(document.querySelector(".topbar"), open || drawerOpen);
      setInert($("detail"), !open || drawerOpen);
    } else {
      setInert($("results"), false);
      setInert(document.querySelector(".topbar"), false);
      setInert($("detail"), false);
    }
    syncSidebarVisibility();
  }
  navToggle.addEventListener("click", openDrawer);
  sidebarClose.addEventListener("click", function () { closeDrawer(true); });
  scrim.addEventListener("click", function () { closeDrawer(true); });

  sidebarEl.addEventListener("keydown", function (e) {
    if (!drawerOpen || e.key !== "Tab") return;
    trapTab(e, sidebarEl);
  });

  /* ── 详情栏控件 ── */
  prevBtn.addEventListener("click", function () { step(-1); });
  nextBtn.addEventListener("click", function () { step(1); });
  detailClose.addEventListener("click", closeDetail);
  detailBack.addEventListener("click", closeDetail);

  /* ── 列表键盘导航：↑↓ 移动即切换详情 ── */
  var keyboardNav = false;
  function renderKeepListFocus(id) {
    Array.prototype.forEach.call(resultListEl.querySelectorAll(".result-card"), function (c) {
      var on = c.dataset.item === id;
      c.classList.toggle("is-selected", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    renderOutline();
    renderDetail();
    writeHash();
    syncDetailInert();
    document.title = (state.sel && findItem(state.sel) ? findItem(state.sel).item.title + " · " : "") +
      (site.title || "电创导航") + " · 融合工作台";
  }
  resultListEl.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    var cards = Array.prototype.slice.call(resultListEl.querySelectorAll(".result-card"));
    if (!cards.length) return;
    var i = cards.indexOf(document.activeElement);
    var next;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = cards.length - 1;
    else if (e.key === "ArrowDown") next = i === -1 ? 0 : Math.min(i + 1, cards.length - 1);
    else next = i === -1 ? cards.length - 1 : Math.max(i - 1, 0);
    e.preventDefault();
    var card = cards[next];
    var id = card.dataset.item;
    state.sel = id;
    keyboardNav = true;
    renderKeepListFocus(id);
    keyboardNav = false;
    focusEl(card);
    card.scrollIntoView({ block: "nearest" });
  });
  resultListEl.addEventListener("focusin", function (e) {
    if (keyboardNav || pointerHeld) return;
    var card = e.target.closest(".result-card");
    if (!card || card.dataset.item === state.sel) return;
    state.sel = card.dataset.item;
    keyboardNav = true;
    renderKeepListFocus(state.sel);
    keyboardNav = false;
    focusEl(card);
    if (isMobile() && !drawerOpen) {
      lastListTrigger = state.sel;
      body.classList.add("detail-open");
      syncDetailInert();
      setTimeout(function () {
        if (!drawerOpen && body.classList.contains("detail-open")) focusEl($("detail-title") || detailBack);
      }, mqReduce.matches ? 0 : 280);
    }
  });
  var pointerHeld = false;
  document.addEventListener("pointerdown", function () { pointerHeld = true; }, true);
  function releasePointer() { setTimeout(function () { pointerHeld = false; }, 60); }
  document.addEventListener("pointerup", releasePointer, true);
  document.addEventListener("pointercancel", releasePointer, true);

  /* ── 全局快捷键 ── */
  document.addEventListener("keydown", function (e) {
    var key = e.key;

    /* Ctrl/Cmd+K：开关命令面板 */
    if ((key === "k" || key === "K") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (paletteOpen) closePalette(true);
      else openPalette();
      return;
    }
    /* "/"：非输入态唤起面板 */
    if (key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && !paletteOpen) {
      var t = e.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      if (drawerOpen) return;
      e.preventDefault();
      openPalette();
      return;
    }

    /* 面板打开时：面板内按键 */
    if (paletteOpen) {
      if (key === "Escape") { e.preventDefault(); closePalette(true); return; }
      if (key === "ArrowDown") { e.preventDefault(); movePaletteActive(1); return; }
      if (key === "ArrowUp") { e.preventDefault(); movePaletteActive(-1); return; }
      if (key === "Home" && e.ctrlKey) { e.preventDefault(); pActiveIdx = 0; syncPaletteActive(true); return; }
      if (key === "End" && e.ctrlKey) { e.preventDefault(); pActiveIdx = pResults.length - 1; syncPaletteActive(true); return; }
      if (key === "Enter") {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) openActiveDirect();
        else locateActive();
        return;
      }
      if (key === "Tab") { trapTab(e, palette); return; }
      return;
    }

    if (key === "Escape") {
      if (drawerOpen) { e.preventDefault(); closeDrawer(true); return; }
      if (state.q && e.target !== pInput) { clearQuery(); return; }
      if (state.sel) { e.preventDefault(); closeDetail(); return; }
      return;
    }
    /* 焦点不在输入框/列表时的 ↑↓：直接步进条目 */
    if ((key === "ArrowDown" || key === "ArrowUp") && !drawerOpen) {
      var tt = e.target, tg = tt && tt.tagName;
      if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT" || (tt && tt.isContentEditable)) return;
      if (tt && tt.closest && tt.closest(".result-list")) return;
      if (tt && tt.closest && tt.closest(".sidebar")) return;
      e.preventDefault();
      step(key === "ArrowDown" ? 1 : -1);
    }
  });

  /* ── 跳过导航 / 品牌回首页 ── */
  $("skip-link").addEventListener("click", function (e) {
    e.preventDefault();
    focusEl(resultsTitle);
    resultsScroll.scrollTop = 0;
  });
  $("brand-home").addEventListener("click", function (e) {
    e.preventDefault();
    state.q = "";
    selectCategory("");
  });

  /* ── hash 与响应式 ── */
  window.addEventListener("hashchange", function () {
    if (hashFallbackPending > 0) { hashFallbackPending--; return; }
    readHash();
    render({ keepHash: true });
    resultsScroll.scrollTop = 0;
    if (state.sel) {
      var card = resultListEl.querySelector('[data-item="' + CSS.escape(state.sel) + '"]');
      if (card) card.scrollIntoView({ block: "nearest" });
      if (isMobile() && !drawerOpen) {
        body.classList.add("detail-open");
        syncDetailInert();
        setTimeout(function () { focusEl($("detail-title") || detailBack); }, mqReduce.matches ? 0 : 280);
      }
    } else {
      body.classList.remove("detail-open");
      syncDetailInert();
    }
  });
  function onBreakpoint() {
    if (!isMobile()) {
      if (drawerOpen) closeDrawer(false);
      body.classList.remove("drawer-open");
      scrim.hidden = true;
    }
    syncDetailInert();
  }
  if (mqMobile.addEventListener) mqMobile.addEventListener("change", onBreakpoint);
  else mqMobile.addListener(onBreakpoint);

  /* ── 初始化 ── */
  $("top-stats").innerHTML = "";
  var s1 = el("span"); s1.appendChild(document.createTextNode("条目 ")); s1.appendChild(el("b", "", pad2(totalItems)));
  var s2 = el("span"); s2.appendChild(document.createTextNode("资料包 ")); s2.appendChild(el("b", "", pad2(totalPacks)));
  var s3 = el("span"); s3.appendChild(document.createTextNode("分类 ")); s3.appendChild(el("b", "", pad2(categories.length)));
  $("top-stats").appendChild(s1); $("top-stats").appendChild(s2); $("top-stats").appendChild(s3);

  /* ══════════ 栏目分隔条：Pointer 拖拽 + 双击复位 ══════════
   * 宽度写入 .workbench 的 CSS 变量（--col-left / --col-mid），右栏 flex 自适应。
   * 只改 DOM 样式变量，不进 state/render，搜索/切换条目不会复位。
   * min/max 保证右栏至少保留 320px，不产生横向溢出。
   * 不支持键盘调宽：手柄不可 Tab 聚焦，无方向键/Home/End 逻辑；
   * aria-valuenow 等仅作为当前宽度的只读描述同步。 */
  var workbenchEl = document.querySelector(".workbench");
  var RESIZER_W = 7;
  var MIN_DETAIL = 320;
  var colDefs = {
    left: { el: $("resize-left"), varName: "--col-left", def: 264, min: 200, max: 420 },
    mid: { el: $("resize-mid"), varName: "--col-mid", def: 400, min: 280, max: 560 }
  };
  function colVal(key) {
    var v = parseFloat(workbenchEl.style.getPropertyValue(colDefs[key].varName));
    if (!isNaN(v)) return v;
    return parseFloat(getComputedStyle(workbenchEl).getPropertyValue(colDefs[key].varName)) || colDefs[key].def;
  }
  function colBounds(key) {
    var d = colDefs[key];
    var total = workbenchEl.getBoundingClientRect().width;
    var other = key === "left" ? colVal("mid") : colVal("left");
    /* 右栏保底 MIN_DETAIL：两条分隔条共占 2×RESIZER_W */
    var room = total - other - MIN_DETAIL - RESIZER_W * 2;
    return { min: d.min, max: Math.max(d.min, Math.min(d.max, Math.floor(room))) };
  }
  function setCol(key, px) {
    var b = colBounds(key);
    var v = Math.round(Math.min(b.max, Math.max(b.min, px)));
    workbenchEl.style.setProperty(colDefs[key].varName, v + "px");
    var h = colDefs[key].el;
    h.setAttribute("aria-valuemin", String(b.min));
    h.setAttribute("aria-valuemax", String(b.max));
    h.setAttribute("aria-valuenow", String(v));
    return v;
  }
  function syncResizerAria() {
    if (isMobile()) return;
    setCol("left", colVal("left"));
    setCol("mid", colVal("mid"));
  }
  Object.keys(colDefs).forEach(function (key) {
    var d = colDefs[key];
    var h = d.el;
    var dragging = false;
    var startX = 0, startW = 0;
    h.addEventListener("pointerdown", function (e) {
      if (isMobile()) return;
      dragging = true;
      startX = e.clientX;
      startW = colVal(key);
      h.classList.add("is-dragging");
      body.classList.add("is-resizing");
      try { h.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    h.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      setCol(key, startW + (e.clientX - startX));
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      h.classList.remove("is-dragging");
      body.classList.remove("is-resizing");
      try { h.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    h.addEventListener("pointerup", endDrag);
    h.addEventListener("pointercancel", endDrag);
    h.addEventListener("dblclick", function () {
      if (isMobile()) return;
      setCol(key, d.def);
    });
  });
  window.addEventListener("resize", syncResizerAria);

  readHash();
  var deepLink = !!state.sel;
  /* 默认：桌面自动选中第一条让右栏立即可读；手机落在列表页，不自动弹详情。 */
  if (!state.sel && !state.cat && !norm(state.q) && !location.hash.replace(/^#\/?$/, "") && !isMobile()) {
    var entries0 = currentResults();
    if (entries0.length) state.sel = itemId(entries0[0].item, entries0[0].cat);
  }
  render();
  onBreakpoint();
  syncResizerAria();
  if (deepLink && isMobile()) {
    body.classList.add("detail-open");
    syncDetailInert();
    focusEl($("detail-title") || detailBack);
  }
})();
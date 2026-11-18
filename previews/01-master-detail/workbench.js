/* 方案 A · 双侧栏资料工作台 —— 交互逻辑
 * 数据来自 links-data.js（复制自站点 data/links.js，未改动内容）。
 * 状态：{ cat: 分类 id | ""(全部), q: 搜索词, sel: 选中条目 id | null }
 * hash 路由：#/ 全部；#/c/<cat> 分类；#/i/<id> 条目（含资料包 id）。
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
  var $ = function (id) { return document.getElementById(id); };
  var body = document.body;
  var qEl = $("q"), qClear = $("q-clear");
  var catListEl = $("cat-list");
  var outlineKicker = $("outline-kicker"), outlineBody = $("outline-body");
  var resultsKicker = $("results-kicker"), resultsTitle = $("results-title");
  var resultsCount = $("results-count"), resultsDesc = $("results-desc");
  var searchStatus = $("search-status");
  var resultListEl = $("result-list"), resultsEmpty = $("results-empty");
  var resultsScroll = $("results-scroll");
  var detailBody = $("detail-body"), detailScroll = $("detail-scroll");
  var detailKicker = $("detail-kicker");
  var prevBtn = $("prev-item"), nextBtn = $("next-item"), stepPos = $("step-pos");
  var detailClose = $("detail-close"), detailBack = $("detail-back");
  var navToggle = $("nav-toggle"), sidebarClose = $("sidebar-close"), scrim = $("scrim");
  var sidebarEl = $("sidebar");

  var mqMobile = window.matchMedia("(max-width: 900px)");
  var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  function isMobile() { return mqMobile.matches; }
  function scrollBehavior() { return mqReduce.matches ? "auto" : "smooth"; }

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
  function matches(entry, query) {
    if (!query) return true;
    var it = entry.item;
    var hay = [it.title, it.summary, it.source, (it.tags || []).join(" "), entry.cat.name];
    packItems(it).forEach(function (p) { hay.push(p.title, p.summary); });
    return norm(hay.join(" ")).indexOf(query) !== -1;
  }
  function highlight(parent, text, query) {
    var raw = String(text == null ? "" : text);
    var needles = [];
    var full = String(query || "").trim();
    if (full) {
      needles.push(full);
      full.split(/\s+/).forEach(function (t) { if (t && needles.indexOf(t) === -1) needles.push(t); });
      needles.sort(function (a, b) { return b.length - a.length; });
    }
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
  /* 相对链接（如 tools/xxx.html）指向正式站目录：从 previews/01-master-detail/ 回到仓库根 */
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

  /* ── 状态与路由 ── */
  var state = { cat: "", q: "", sel: null };

  function currentHash() {
    return state.sel ? "#/i/" + encodeURIComponent(state.sel)
      : state.cat ? "#/c/" + encodeURIComponent(state.cat)
      : "#/";
  }
  /* hash 只作快照：replaceState 同步改地址、不产生历史条目、不触发 hashchange，
     从根上避免「自己写 hash → 异步事件回灌」把刚关闭的详情又打开。
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
  function readHash() {
    var h = location.hash.replace(/^#\/?/, "");
    var parts = h.split("/").filter(Boolean);
    if (parts[0] === "i" && parts[1]) {
      var id = safeDecode(parts[1]);
      var found = findItem(id);
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
  function safeDecode(v) { try { return decodeURIComponent(v); } catch (e) { return v; } }

  /* 当前结果集（中栏列表顺序，供 ↑↓ 与上一条/下一条共用） */
  function currentResults() {
    var query = norm(state.q);
    var pool = state.cat
      ? published(findCat(state.cat)).map(function (it) { return { item: it, cat: findCat(state.cat) }; })
      : allEntries;
    var filtered = pool.filter(function (e) { return matches(e, query); });
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

  /* ── 渲染：左栏目录（当前分类的条目 + 合集子包） ── */
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
      if (parts.length && state.sel === id) {
        var sub = el("ul", "outline-pack");
        parts.forEach(function (p) {
          var sli = el("li");
          var a = el("a", "", p.title);
          a.href = resolveUrl(p.url);
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.title = "下载：" + p.title + (p.size ? "（" + p.size + "）" : "");
          sli.appendChild(a);
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
    resultsDesc.textContent = query
      ? (cat ? "在「" + cat.name + "」内匹配名称、说明、标签与资料包。" : "在全部分类中匹配名称、说明、标签与资料包。")
      : (cat ? cat.description : site.subtitle || "");

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
      clear.addEventListener("click", function () { clearQuery(); qEl.focus(); });
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
        b.addEventListener("click", function () { clearQuery(); qEl.focus(); });
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
  function placeholder(kind) {
    var box = el("div", "detail-placeholder");
    box.appendChild(icon(kind === "noresult" ? "search" : "book", "ic ph-glyph"));
    if (kind === "noresult") {
      box.appendChild(el("h2", "", "没有可查看的资料"));
      box.appendChild(el("p", "", "当前分类或搜索没有匹配条目。调整左侧分类，或清除搜索后再选一条。"));
    } else if (kind === "emptycat") {
      box.appendChild(el("h2", "", "分类还是空的"));
      box.appendChild(el("p", "", "先在左侧换一个分类，或回到「全部资料」浏览已收录的内容。"));
    } else {
      box.appendChild(el("h2", "", "从中间列表选一条资料"));
      box.appendChild(el("p", "", "详情会显示在这里：说明、来源、下载与相关入口。切换条目时列表保持在原位，方便逐条比较。"));
      var keys = el("p", "ph-keys");
      keys.appendChild(document.createTextNode("键盘："));
      keys.appendChild(el("kbd", "", "/"));
      keys.appendChild(document.createTextNode(" 搜索 · "));
      keys.appendChild(el("kbd", "", "↑"));
      keys.appendChild(el("kbd", "", "↓"));
      keys.appendChild(document.createTextNode(" 在列表中移动即切换详情 · "));
      keys.appendChild(el("kbd", "", "Esc"));
      keys.appendChild(document.createTextNode(" 关闭详情"));
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
      body.classList.remove("detail-open");
      return;
    }

    var it = found.item, cat = found.cat;
    detailKicker.textContent = "DETAIL / " + String(cat.id).toUpperCase();

    var card = el("article", "detail-card");
    var kicker = el("p", "dc-kicker");
    kicker.appendChild(document.createTextNode(String(cat.id).toUpperCase() + " / "));
    var catBtn = el("button", "", cat.name);
    catBtn.type = "button";
    catBtn.title = "查看「" + cat.name + "」分类";
    catBtn.addEventListener("click", function () { selectCategory(cat.id); });
    kicker.appendChild(catBtn);
    card.appendChild(kicker);

    var h2 = el("h2", "", it.title);
    h2.id = "detail-title";
    h2.tabIndex = -1;
    card.appendChild(h2);
    if (it.summary) card.appendChild(el("p", "dc-summary", it.summary));
    if (it.tags && it.tags.length) {
      var tags = el("ul", "dc-tags");
      it.tags.forEach(function (t) { tags.appendChild(el("li", "", t)); });
      card.appendChild(tags);
    }

    var meta = el("div", "dc-meta");
    function metaRow(label, value) {
      var row = el("div");
      row.appendChild(el("i", "", label));
      row.appendChild(el("b", "", value));
      return row;
    }
    if (it.source) meta.appendChild(metaRow("来源", it.source));
    if (it.extractCode) meta.appendChild(metaRow("提取码", it.extractCode));
    if (it.expiry) meta.appendChild(metaRow("有效期", it.expiry));
    if (it.updated) meta.appendChild(metaRow("更新", fmtDate(it.updated)));
    var packs = packItems(it);
    if (packs.length) meta.appendChild(metaRow("资料包", packs.length + " 个"));
    if (meta.children.length) card.appendChild(meta);

    if (packs.length) {
      var sec = el("section", "dc-section");
      var head = el("div", "dc-section-head");
      head.appendChild(el("h3", "", "选择下载"));
      if (it.allUrl) {
        var all = el("a", "dc-all", "查看全部资料包 ↗");
        all.href = resolveUrl(it.allUrl);
        all.target = "_blank";
        all.rel = "noopener noreferrer";
        head.appendChild(all);
      }
      sec.appendChild(head);
      packs.forEach(function (p) {
        var a = extLink(p.title, p.url, fileNote(p) || hostNote(p.url), false, p.summary);
        if (found.partId && itemId(p, cat) === found.partId) {
          a.style.background = "var(--red-wash)";
          a.style.boxShadow = "inset 2px 0 0 var(--red)";
        }
        sec.appendChild(a);
      });
      card.appendChild(sec);
    }

    var hasEntry = false;
    var list = el("section", "dc-section");
    if (it.url) {
      list.appendChild(el("h3", "", it.urlLabel === "打开工具" ? "在线使用" : "相关入口"));
      var bits = [];
      var note = fileNote(it) || hostNote(it.url);
      if (note) bits.push(note);
      if (it.extractCode) bits.push("提取码 " + it.extractCode);
      if (it.expiry) bits.push(it.expiry);
      list.appendChild(extLink(it.urlLabel || "资料下载", it.url, bits.join(" · "), true));
      hasEntry = true;
    }
    (it.links || []).forEach(function (link) {
      if (!link || !link.url || !link.label) return;
      if (!hasEntry) list.appendChild(el("h3", "", "相关入口"));
      list.appendChild(extLink(link.label, link.url, link.note || hostNote(link.url)));
      hasEntry = true;
    });
    if (hasEntry) card.appendChild(list);

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
    card.appendChild(foot);

    detailBody.appendChild(card);
    detailScroll.scrollTop = 0;
    if (isMobile() && !drawerOpen) {
      body.classList.add("detail-open");
    }
  }

  /* ── 全量渲染 ── */
  function render(opts) {
    opts = opts || {};
    renderCats();
    renderResults();
    renderOutline();
    renderDetail();
    document.title = (state.sel && findItem(state.sel) ? findItem(state.sel).item.title + " · " : "") +
      (site.title || "电创导航") + " · 资料工作台";
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
      /* 抽屉/详情层退场有 visibility 延迟，稍后再把焦点交给可见区域 */
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
    /* 从目录/列表点选时保持当前分类；跨分类跳转（hash 直达）才切分类 */
    if (opts.syncCat) state.cat = found.cat.id;
    /* 手机：点选先把焦点记到对应列表卡片，关闭详情时归还给它 */
    if (isMobile() && !drawerOpen && opts.from !== "step") lastListTrigger = state.sel;
    /* 列表已展示该条目时走轻量更新，保住滚动位置与焦点（连续比较的关键） */
    var inList = resultListEl.querySelector('[data-item="' + CSS.escape(state.sel) + '"]');
    if (inList && !opts.syncCat) {
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
    /* 手机：列表/目录点选 → 打开详情页并移入焦点；步进按钮保持焦点在按钮上便于连点。
       详情层滑入有 visibility 延迟，等它可见后再聚焦。 */
    if (isMobile() && !drawerOpen && opts.from !== "step" && !keyboardNav) {
      setTimeout(function () {
        if (!drawerOpen && body.classList.contains("detail-open")) focusEl($("detail-title") || detailBack);
      }, mqReduce.matches ? 0 : 280);
    }
  }

  function closeDetail() {
    if (!state.sel) return;
    var id = state.sel;
    state.sel = null;
    body.classList.remove("detail-open");
    render();
    /* 归还焦点：优先回到打开详情的那张卡片，其次当前选中卡片。
       这是程序化焦点移动，不应触发 focusin 的“Tab 联动”把详情再打开。
       手机底层列表有 0.26s 的 visibility 延迟，等它可见后再聚焦。 */
    var targetId = (isMobile() && lastListTrigger) || id;
    lastListTrigger = null;
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
      keyboardNav = false;
    }
    if (isMobile() && !mqReduce.matches) setTimeout(restore, 280);
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

  function focusEl(node) {
    if (!node) return;
    try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); }
  }

  /* ── 搜索 ── */
  function syncSearch() {
    var has = !!qEl.value;
    qClear.hidden = !has;
    qEl.closest(".search").classList.toggle("has-query", has);
  }
  function onQuery() {
    syncSearch();
    state.q = qEl.value;
    /* 选中项不在新结果集里就取消选中，避免详情与列表脱节 */
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
    if (!qEl.value) return;
    qEl.value = "";
    onQuery();
  }
  qEl.addEventListener("input", onQuery);
  qEl.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (qEl.value) { e.preventDefault(); e.stopPropagation(); clearQuery(); }
      else qEl.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      var first = resultListEl.querySelector(".result-card");
      if (first) { focusEl(first); first.scrollIntoView({ block: "nearest" }); }
    } else if (e.key === "Enter") {
      e.preventDefault();
      var entries = currentResults();
      if (entries.length) selectItem(itemId(entries[0].item, entries[0].cat), { from: "list", focus: !isMobile(), scrollIntoView: true });
    }
  });
  qClear.addEventListener("click", function () { clearQuery(); qEl.focus(); });

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
    /* 兜底：滑入动画期间 visibility 可能尚未生效，稍后再试一次 */
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
    /* 归还焦点时顶栏可能仍处 inert（详情层还开着），等状态同步后再聚焦 */
    if (restoreFocus !== false) {
      var target = drawerReturnFocus || navToggle;
      setTimeout(function () { focusEl(target); }, 0);
    }
    /* 等过渡结束再藏遮罩，避免闪断 */
    setTimeout(function () { if (!drawerOpen) scrim.hidden = true; }, mqReduce.matches ? 0 : 260);
    syncSidebarVisibility();
  }
  function setInert(node, on) {
    if (!node) return;
    /* aria-hidden 只给侧栏/详情层用；results 含列表标题（焦点归还目标），不能 aria-hidden */
    if (on) node.setAttribute("inert", "");
    else node.removeAttribute("inert");
  }
  function syncSidebarVisibility() {
    if (isMobile() && !drawerOpen) sidebarEl.setAttribute("aria-hidden", "true");
    else sidebarEl.removeAttribute("aria-hidden");
  }
  function syncDetailInert() {
    /* 手机：详情层打开时锁住底下列表页；未打开时锁住详情层。桌面：三栏都可用 */
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

  /* 抽屉内 Tab 循环 */
  sidebarEl.addEventListener("keydown", function (e) {
    if (!drawerOpen || e.key !== "Tab") return;
    var focusables = sidebarEl.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])');
    var list = Array.prototype.filter.call(focusables, function (n) { return n.offsetParent !== null; });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); focusEl(last); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); focusEl(first); }
  });

  /* ── 详情栏控件 ── */
  prevBtn.addEventListener("click", function () { step(-1); });
  nextBtn.addEventListener("click", function () { step(1); });
  detailClose.addEventListener("click", closeDetail);
  detailBack.addEventListener("click", closeDetail);

  /* ── 列表键盘导航：↑↓ 移动即切换详情（连续浏览核心） ── */
  var keyboardNav = false; /* 仅键盘移动时让焦点跟随重渲染后的卡片 */
  function renderKeepListFocus(id) {
    /* 只更新选中态与详情/目录，不重建列表，焦点天然保留 */
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
      (site.title || "电创导航") + " · 资料工作台";
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
  /* Tab / 程序化焦点移入某张卡片时，详情也跟过去。
     鼠标点击与触摸不触发联动（由 click 处理），避免 mousedown 抢先把选中态切走、
     导致随后的 Esc/关闭按钮误判“没有选中”。 */
  resultListEl.addEventListener("focusin", function (e) {
    if (keyboardNav || pointerHeld) return;
    var card = e.target.closest(".result-card");
    if (!card || card.dataset.item === state.sel) return;
    state.sel = card.dataset.item;
    if (isMobile() && !drawerOpen) lastListTrigger = state.sel;
    keyboardNav = true;
    renderKeepListFocus(state.sel);
    keyboardNav = false;
    focusEl(card);
    if (isMobile() && !drawerOpen) {
      setTimeout(function () {
        if (!drawerOpen && body.classList.contains("detail-open")) focusEl($("detail-title") || detailBack);
      }, mqReduce.matches ? 0 : 280);
    }
  });
  /* 指针按住期间抑制 focusin 联动；抬起后延时复位，覆盖 click 之后的焦点事件 */
  var pointerHeld = false;
  document.addEventListener("pointerdown", function () { pointerHeld = true; }, true);
  function releasePointer() { setTimeout(function () { pointerHeld = false; }, 60); }
  document.addEventListener("pointerup", releasePointer, true);
  document.addEventListener("pointercancel", releasePointer, true);

  /* ── 全局快捷键 ── */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (drawerOpen) { e.preventDefault(); closeDrawer(true); return; }
      if (qEl.value && e.target !== qEl) { clearQuery(); return; }
      if (state.sel) { e.preventDefault(); closeDetail(); return; }
      return;
    }
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing) {
      var t = e.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      if (drawerOpen) return;
      e.preventDefault();
      qEl.focus();
      qEl.select();
      return;
    }
    /* 焦点不在输入框/列表时的 ↑↓：直接步进条目 */
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !drawerOpen) {
      var tt = e.target, tg = tt && tt.tagName;
      if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT" || (tt && tt.isContentEditable)) return;
      if (tt && tt.closest && tt.closest(".result-list")) return; /* 列表自己处理 */
      if (tt && tt.closest && tt.closest(".sidebar")) return;   /* 目录里保留默认滚动 */
      e.preventDefault();
      step(e.key === "ArrowDown" ? 1 : -1);
    }
  });

  /* ── 跳过导航 ── */
  $("skip-link").addEventListener("click", function (e) {
    e.preventDefault();
    focusEl(resultsTitle);
    resultsScroll.scrollTop = 0;
  });
  $("brand-home").addEventListener("click", function (e) {
    e.preventDefault();
    state.q = ""; qEl.value = ""; syncSearch();
    selectCategory("");
  });

  /* ── hash 与响应式 ── */
  window.addEventListener("hashchange", function () {
    /* 正常路径用 replaceState 写地址，不会进到这里；这里只处理外部导航
       （前进/后退、手动改地址、直达链接）以及降级路径的自写事件。 */
    if (hashFallbackPending > 0) { hashFallbackPending--; return; }
    readHash();
    render({ keepHash: true });
    resultsScroll.scrollTop = 0;
    /* 浏览器前进/后退或直达链接：把选中卡片滚进视野；手机直达条目时打开详情层并移入焦点 */
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
      /* 回到桌面：抽屉状态复位，详情栏常驻 */
      if (drawerOpen) closeDrawer(false);
      body.classList.remove("drawer-open");
      scrim.hidden = true;
    }
    /* 手机不自动弹详情层：只有点选条目 / hash 直达才打开 */
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
  $("site-note").textContent = site.notice || "";

  readHash();
  var deepLink = !!state.sel; /* 直达条目链接：手机也直接进详情页 */
  /* 默认首页：桌面自动选中第一条让右栏立即可读；
     手机默认落在列表页，不自动选中、不弹全屏详情层。 */
  if (!state.sel && !state.cat && !location.hash.replace(/^#\/?$/, "") && !isMobile()) {
    var entries = currentResults();
    if (entries.length) state.sel = itemId(entries[0].item, entries[0].cat);
  }
  render();
  onBreakpoint();
  if (deepLink && isMobile()) {
    body.classList.add("detail-open");
    syncDetailInert();
    focusEl($("detail-title") || detailBack);
  }
})();
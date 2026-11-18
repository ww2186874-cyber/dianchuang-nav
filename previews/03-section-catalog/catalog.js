/* 电创导航 · 方案 C「目录锚点 + 分区目录流」
 * 单页渲染全部分区；目录锚点 + 滚动定位；条目行内手风琴详情。
 * 状态（搜索词 / 展开集合 / 滚动位置）写入 sessionStorage，
 * 外链一律 target=_blank，返回或刷新都不丢浏览进度。
 */
(function () {
  "use strict";

  var data = window.NAV_DATA;
  var sectionsHost = document.getElementById("sections");
  if (!data || !Array.isArray(data.categories)) {
    sectionsHost.innerHTML = '<p class="empty-note">没有读到条目数据，请确认 links.js 与本页面在同一目录。</p>';
    return;
  }

  var site = data.site || {};
  var categories = data.categories;
  var STORE_KEY = "dc-catalog-c-v1";
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- 小工具 ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function icon(name, cls) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ic" + (cls ? " " + cls : ""));
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }

  function packItems(item) {
    return ((item && item.pack) || []).filter(function (p) { return p && p.title && p.url; });
  }
  function isCollection(item) { return !!(item && item.title && packItems(item).length); }
  function published(cat) {
    return (cat.items || []).filter(function (it) { return it && it.title && (it.url || isCollection(it)); });
  }
  function sortItems(items) {
    return items.map(function (it, i) { return { it: it, i: i }; })
      .sort(function (a, b) {
        var da = a.it.updated || "", db = b.it.updated || "";
        if (da !== db) return da < db ? 1 : -1;
        return b.i - a.i;
      }).map(function (r) { return r.it; });
  }
  function rowId(cat, item) { return item.id ? String(item.id) : cat.id + "-" + item.title; }

  // 相对链接按仓库根解析（数据里的 tools/... 指向正式站点的工具页）
  var repoRoot = new URL("../../", location.href).href;
  function resolveUrl(url) {
    if (/^(https?:|mailto:|file:)/i.test(url)) return url;
    return new URL(url, repoRoot).href;
  }
  function hostNote(url) {
    try {
      var u = new URL(resolveUrl(url));
      if (u.protocol === "file:") return "本地文件";
      var h = u.hostname.replace(/^www\./, "");
      if (h.indexOf("pan.baidu.com") !== -1) return "百度网盘";
      if (h.indexOf("taobao.com") !== -1 || h.indexOf("tb.cn") !== -1) return "淘宝";
      if (h.indexOf("bilibili.com") !== -1) return "哔哩哔哩";
      return h;
    } catch (e) { return ""; }
  }
  var KNOWN_EXT = ["zip", "rar", "7z", "tar", "gz", "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "exe", "msi", "apk", "hex", "bin"];
  function extOf(url) {
    try {
      var m = new URL(resolveUrl(url)).pathname.match(/\.([a-z0-9]+)$/i);
      var ext = m ? m[1].toLowerCase() : "";
      return KNOWN_EXT.indexOf(ext) !== -1 ? ext : "";
    } catch (e) { return ""; }
  }
  function fileNote(obj) {
    var bits = [];
    if (obj.size) bits.push(String(obj.size));
    var fmt = obj.format || extOf(obj.url);
    if (fmt) bits.push(fmt);
    return bits.join(" · ");
  }
  function formatDate(s) {
    var m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[1] + "年" + Number(m[2]) + "月" + Number(m[3]) + "日" : String(s || "");
  }

  /* ---------- 搜索匹配与高亮 ---------- */
  function haystack(item, cat) {
    var parts = [item.title, item.summary, item.source, cat.name];
    (item.tags || []).forEach(function (t) { parts.push(t); });
    packItems(item).forEach(function (p) { parts.push(p.title, p.summary); });
    return norm(parts.filter(Boolean).join(" "));
  }
  function matches(item, cat, q) { return !q || haystack(item, cat).indexOf(q) !== -1; }

  // 文本节点里按查询词包 <mark>，不碰 HTML 结构
  function highlight(root, q) {
    if (!q) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var text = node.nodeValue, low = text.toLowerCase(), idx = low.indexOf(q);
      if (idx === -1 || !node.parentNode) return;
      var frag = document.createDocumentFragment(), last = 0;
      while (idx !== -1) {
        frag.appendChild(document.createTextNode(text.slice(last, idx)));
        var mark = document.createElement("mark");
        mark.textContent = text.slice(idx, idx + q.length);
        frag.appendChild(mark);
        last = idx + q.length;
        idx = low.indexOf(q, last);
      }
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  /* ---------- 状态存储 ---------- */
  var state = { q: "", open: [], y: 0 };
  try {
    var saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null");
    if (saved && typeof saved === "object") {
      state.q = typeof saved.q === "string" ? saved.q : "";
      state.open = Array.isArray(saved.open) ? saved.open.filter(function (x) { return typeof x === "string"; }) : [];
      state.y = Number(saved.y) || 0;
    }
  } catch (e) { /* 隐私模式等场景下静默降级 */ }

  var saveTimer = 0;
  function saveState() {
    state.y = window.scrollY;
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 150);
  }
  window.addEventListener("scroll", saveSoon, { passive: true });
  window.addEventListener("pagehide", saveState);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") saveState();
  });

  /* ---------- 静态文案 ---------- */
  var totalItems = categories.reduce(function (n, c) { return n + published(c).length; }, 0);
  var filledCats = categories.filter(function (c) { return published(c).length > 0; }).length;
  document.getElementById("intro-sub").textContent = site.subtitle || "";
  document.getElementById("notice-text").textContent = site.notice || "";
  document.getElementById("topbar-stat").textContent = pad2(totalItems) + " 条 / " + pad2(categories.length) + " 区";
  var statsHost = document.getElementById("intro-stats");
  [["条目", pad2(totalItems)], ["分区", pad2(categories.length)], ["已收录", pad2(filledCats) + " 区"]].forEach(function (pair) {
    var cell = el("div");
    cell.appendChild(el("dt", "", pair[0]));
    cell.appendChild(el("dd", "", pair[1]));
    statsHost.appendChild(cell);
  });

  /* ---------- 目录（桌面侧栏 + 移动抽屉共用生成器） ---------- */
  var tocList = document.getElementById("toc-list");
  var sheetList = document.getElementById("sheet-list");
  function buildToc(host) {
    categories.forEach(function (cat, i) {
      var li = el("li");
      var a = el("a", "toc-link");
      a.href = "#sec-" + cat.id;
      a.dataset.anchor = cat.id;
      a.appendChild(el("span", "toc-num", pad2(i + 1)));
      a.appendChild(el("span", "toc-name", cat.name));
      var count = published(cat).length;
      a.appendChild(el("span", "toc-count", count ? String(count) : "空"));
      if (!count) a.classList.add("is-empty");
      li.appendChild(a);
      host.appendChild(li);
    });
  }
  buildToc(tocList);
  buildToc(sheetList);

  /* ---------- 详情构建 ---------- */
  function metaList(item) {
    var dl = el("dl", "detail-meta");
    [["来源", item.source], ["更新", item.updated ? formatDate(item.updated) : ""],
     ["提取码", item.extractCode], ["有效期", item.expiry]].forEach(function (pair) {
      if (!pair[1]) return;
      var cell = el("div");
      cell.appendChild(el("dt", "", pair[0]));
      cell.appendChild(el("dd", "", pair[1]));
      dl.appendChild(cell);
    });
    return dl.children.length ? dl : null;
  }
  function actionLink(label, url, note, primary, iconName) {
    var a = el("a", "btn" + (primary ? " btn-primary" : ""));
    a.href = resolveUrl(url);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.appendChild(icon(iconName || "ext"));
    a.appendChild(el("span", "btn-label", label));
    if (note) a.appendChild(el("span", "btn-note", note));
    return a;
  }
  function buildDetail(item, cat) {
    var wrap = el("div", "row-detail-in");
    if (item.summary) wrap.appendChild(el("p", "detail-summary", item.summary));
    if (item.tags && item.tags.length) {
      var ul = el("ul", "tags");
      item.tags.forEach(function (t) { ul.appendChild(el("li", "", t)); });
      wrap.appendChild(ul);
    }
    var meta = metaList(item);
    if (meta) wrap.appendChild(meta);

    var packs = packItems(item);
    var actions = el("div", "actions");
    if (item.url) {
      var label = item.urlLabel || (packs.length ? "主链接" : "资料下载");
      var note = fileNote(item) || hostNote(item.url);
      var isDownload = !!extOf(item.url);
      actions.appendChild(actionLink(label, item.url, note, true, isDownload ? "down" : "ext"));
    }
    (item.links || []).forEach(function (lk) {
      if (lk && lk.label && lk.url) actions.appendChild(actionLink(lk.label, lk.url, lk.note || hostNote(lk.url), false));
    });
    if (actions.children.length) wrap.appendChild(actions);

    if (packs.length) {
      var list = el("ol", "pack-list");
      packs.forEach(function (p) {
        var li = el("li");
        var a = el("a", "pack-link");
        a.href = resolveUrl(p.url);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        var main = el("span", "pack-main");
        main.appendChild(el("span", "pack-title", p.title));
        if (p.summary) main.appendChild(el("span", "pack-sum", p.summary));
        a.appendChild(main);
        a.appendChild(el("span", "pack-size", fileNote(p) || hostNote(p.url)));
        a.appendChild(icon(extOf(p.url) ? "down" : "ext"));
        li.appendChild(a);
        list.appendChild(li);
      });
      wrap.appendChild(list);
      if (item.allUrl) {
        var all = el("p", "pack-all");
        var allA = el("a", "", "查看全部资料包（Release 页）↗");
        allA.href = resolveUrl(item.allUrl);
        allA.target = "_blank";
        allA.rel = "noopener noreferrer";
        all.appendChild(allA);
        wrap.appendChild(all);
      }
    }

    var closeRow = el("div", "detail-close-row");
    var closeBtn = el("button", "detail-close");
    closeBtn.type = "button";
    closeBtn.appendChild(icon("chev"));
    closeBtn.appendChild(document.createTextNode("收起详情"));
    closeRow.appendChild(closeBtn);
    wrap.appendChild(closeRow);
    return { wrap: wrap, closeBtn: closeBtn };
  }

  /* ---------- 分区与条目行 ---------- */
  var rowsById = {};   // id -> { row, toggle, detail, item, cat, secEl }
  var secEls = [];     // [{ id, el, cat }]

  categories.forEach(function (cat, i) {
    var sec = el("section", "sec" + (published(cat).length ? "" : " is-bare"));
    sec.id = "sec-" + cat.id;
    sec.dataset.sec = cat.id;
    sec.setAttribute("aria-labelledby", "sec-title-" + cat.id);

    var head = el("div", "sec-head");
    head.appendChild(el("span", "sec-num", pad2(i + 1)));
    var titleWrap = el("div", "sec-title-wrap");
    var h2 = el("h2", "sec-title");
    h2.id = "sec-title-" + cat.id;
    h2.appendChild(icon(cat.icon || "list"));
    h2.appendChild(el("span", "sec-name", cat.name));
    var count = published(cat).length;
    h2.appendChild(el("span", "sec-badge", count ? count + " 条" : "待收录"));
    titleWrap.appendChild(h2);
    if (cat.description) titleWrap.appendChild(el("p", "sec-desc", cat.description));
    head.appendChild(titleWrap);
    head.appendChild(el("span", "sec-mark", "● 正在浏览"));
    sec.appendChild(head);

    var body = el("div", "sec-body");
    sec.appendChild(body);
    sectionsHost.appendChild(sec);
    secEls.push({ id: cat.id, el: sec, cat: cat, body: body, badge: h2.querySelector(".sec-badge") });
  });

  function renderRows(query) {
    var q = norm(query);
    var shownTotal = 0;
    secEls.forEach(function (secInfo) {
      var cat = secInfo.cat, body = secInfo.body;
      body.textContent = "";
      var all = sortItems(published(cat));
      var shown = all.filter(function (it) { return matches(it, cat, q); });
      shownTotal += shown.length;

      if (!all.length) {
        var empty = el("p", "empty-note");
        empty.appendChild(el("b", "", "待收录 · "));
        empty.appendChild(document.createTextNode(cat.empty || "还没有资料，欢迎补充。"));
        body.appendChild(empty);
        secInfo.badge.textContent = "待收录";
        return;
      }
      if (!shown.length) {
        body.appendChild(el("p", "empty-note", "「" + cat.name + "」里没有匹配的资料。"));
        secInfo.badge.textContent = "0 / " + all.length + " 条";
        return;
      }
      secInfo.badge.textContent = q ? shown.length + " / " + all.length + " 条" : all.length + " 条";

      var rows = el("div", "rows");
      shown.forEach(function (item) {
        var id = rowId(cat, item);
        var isOpen = state.open.indexOf(id) !== -1;

        var row = el("article", "row" + (isOpen ? " is-open" : ""));
        row.id = "row-" + id;
        var h3 = el("h3", "row-head");
        var toggle = el("button", "row-toggle");
        toggle.type = "button";
        toggle.id = "toggle-" + id;
        toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        toggle.setAttribute("aria-controls", "detail-" + id);

        var main = el("span", "row-main");
        main.appendChild(el("span", "row-title", item.title));
        if (item.summary) main.appendChild(el("span", "row-summary", item.summary));
        // 窄屏隐藏右侧栏时用的紧凑元信息行（桌面 display:none）
        var compactBits = [];
        if (isCollection(item)) compactBits.push(packItems(item).length + " 个资料包");
        else if (fileNote(item)) compactBits.push(fileNote(item));
        if (item.updated) compactBits.push(item.updated);
        if (compactBits.length) main.appendChild(el("span", "row-meta-compact", compactBits.join(" · ")));
        toggle.appendChild(main);

        var side = el("span", "row-side");
        var metaBits = fileNote(item);
        if (!metaBits && isCollection(item)) metaBits = packItems(item).length + " 个资料包";
        if (metaBits) side.appendChild(el("i", "", metaBits));
        if (item.updated) side.appendChild(el("i", "", item.updated));
        toggle.appendChild(side);
        toggle.appendChild(icon("chev", "row-chev"));
        h3.appendChild(toggle);
        row.appendChild(h3);

        var detail = el("div", "row-detail");
        detail.id = "detail-" + id;
        detail.setAttribute("role", "region");
        detail.setAttribute("aria-labelledby", "toggle-" + id);
        var clip = el("div", "row-detail-clip");
        var built = buildDetail(item, cat);
        clip.appendChild(built.wrap);
        detail.appendChild(clip);
        if (!isOpen) detail.setAttribute("inert", "");
        row.appendChild(detail);

        toggle.addEventListener("click", function () { setOpen(id, !row.classList.contains("is-open")); });
        built.closeBtn.addEventListener("click", function () {
          setOpen(id, false);
          toggle.focus({ preventScroll: true });
          setTimeout(function () { ensureVisible(toggle, false); }, reducedMotion.matches ? 30 : 300);
        });

        rows.appendChild(row);
        rowsById[id] = { row: row, toggle: toggle, detail: detail, item: item, cat: cat, secEl: secInfo.el };
      });
      body.appendChild(rows);
      if (q) highlight(body, q);
    });
    return shownTotal;
  }

  function setOpen(id, open) {
    var r = rowsById[id];
    if (!r) return;
    var wasOpen = r.row.classList.contains("is-open");
    r.row.classList.toggle("is-open", open);
    r.toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) r.detail.removeAttribute("inert");
    else {
      // 收起时若焦点还在详情里，先归还给行头按钮
      if (r.detail.contains(document.activeElement)) r.toggle.focus({ preventScroll: true });
      r.detail.setAttribute("inert", "");
    }
    var idx = state.open.indexOf(id);
    if (open && idx === -1) state.open.push(id);
    if (!open && idx !== -1) state.open.splice(idx, 1);
    saveState();
    if (open && !wasOpen) {
      // 等展开动画结束再校正：行头必须留在固定页头之下
      setTimeout(function () { ensureVisible(r.toggle, false); }, reducedMotion.matches ? 30 : 300);
    }
  }

  // 行头被顶出视口（或低于视口）时滚回来，保证操作反馈可见
  function ensureVisible(node, both) {
    var rect = node.getBoundingClientRect();
    var topLimit = topbarHeight() + 8;
    if (rect.top < topLimit || (both && rect.bottom > window.innerHeight)) {
      var y = window.scrollY + rect.top - topLimit - 8;
      window.scrollTo({ top: Math.max(0, y), behavior: reducedMotion.matches ? "auto" : "smooth" });
    }
  }

  /* ---------- 搜索 ---------- */
  var qInput = document.getElementById("q");
  var qClear = document.getElementById("q-clear");
  var searchBox = document.querySelector(".search");
  var statusEl = document.getElementById("search-status");
  var searchTimer = 0;

  function applySearch(value, opts) {
    opts = opts || {};
    state.q = value;
    qInput.value = value;
    var has = !!norm(value);
    qClear.hidden = !has;
    searchBox.classList.toggle("has-text", has);

    // 重渲染前记录锚定行，渲染后尽量保持视口稳定
    var anchorId = null, anchorOffset = 0;
    if (opts.keepView) {
      var probe = topbarHeight() + 20;
      var ids = Object.keys(rowsById);
      for (var i = 0; i < ids.length; i++) {
        var rect = rowsById[ids[i]].row.getBoundingClientRect();
        if (rect.bottom > probe) { anchorId = ids[i]; anchorOffset = rect.top; break; }
      }
    }

    rowsById = {};
    var shown = renderRows(value);
    updateTocCounts(norm(value));

    if (has) {
      statusEl.hidden = false;
      statusEl.textContent = "";
      var msg = el("span");
      msg.appendChild(document.createTextNode("搜索「"));
      msg.appendChild(el("b", "", value.trim()));
      msg.appendChild(document.createTextNode("」 · 命中 " + shown + " 条"));
      statusEl.appendChild(msg);
      if (!shown) {
        statusEl.appendChild(el("span", "", "没有匹配的资料，换个关键词试试，或清除搜索继续浏览。"));
      }
      var clearBtn = el("button", "", "清除搜索");
      clearBtn.type = "button";
      clearBtn.addEventListener("click", function () {
        applySearch("", { keepView: false });
        qInput.focus();
        scrollToAnchor("top", false);
      });
      statusEl.appendChild(clearBtn);
    } else {
      statusEl.hidden = true;
      statusEl.textContent = "";
    }

    if (opts.keepView && anchorId && rowsById[anchorId]) {
      var newTop = rowsById[anchorId].row.getBoundingClientRect().top;
      window.scrollBy({ top: newTop - anchorOffset, behavior: "instant" });
    }
    saveState();
    spy();
  }

  qInput.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { applySearch(qInput.value, { keepView: true }); }, 120);
  });
  qInput.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && qInput.value) {
      e.stopPropagation();
      applySearch("", { keepView: true });
    }
  });
  qClear.addEventListener("click", function () {
    applySearch("", { keepView: true });
    qInput.focus();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var t = e.target;
      var typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (!typing) { e.preventDefault(); qInput.focus(); qInput.select(); }
    }
  });

  function updateTocCounts(q) {
    [tocList, sheetList].forEach(function (host) {
      host.querySelectorAll(".toc-link").forEach(function (a) {
        var cat = categories.find(function (c) { return c.id === a.dataset.anchor; });
        if (!cat) return;
        var all = published(cat);
        var shown = all.filter(function (it) { return matches(it, cat, q); });
        var countEl = a.querySelector(".toc-count");
        if (!all.length) countEl.textContent = "空";
        else if (q) countEl.textContent = shown.length + "/" + all.length;
        else countEl.textContent = String(all.length);
        a.classList.toggle("is-dim", !!q && all.length > 0 && shown.length === 0);
      });
    });
  }

  /* ---------- 锚点滚动与当前位置 ---------- */
  function topbarHeight() {
    return document.getElementById("topbar").getBoundingClientRect().height;
  }
  function scrollToAnchor(id, smooth) {
    var target = id === "top" ? document.getElementById("sec-top") : document.getElementById("sec-" + id);
    if (!target) return;
    var y = id === "top" ? 0 : window.scrollY + target.getBoundingClientRect().top - topbarHeight() - 14;
    window.scrollTo({ top: Math.max(0, y), behavior: smooth && !reducedMotion.matches ? "smooth" : "instant" });
    // 焦点给到分区标题容器，读屏与键盘都能感知跳转结果
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    setCurrent(id);
    saveSoon();
  }

  document.querySelectorAll("[data-anchor]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var id = a.dataset.anchor;
      var fromSheet = sheetOpen;
      if (fromSheet) closeSheet(false);
      scrollToAnchor(id, true);
      // 从抽屉跳转时把焦点交给目标分区，而不是归还给悬浮按钮
      if (fromSheet) {
        var target = id === "top" ? document.getElementById("sec-top") : document.getElementById("sec-" + id);
        if (target) target.focus({ preventScroll: true });
      }
      try { history.replaceState(null, "", id === "top" ? "#top" : "#sec-" + id); } catch (err) {}
    });
  });
  document.getElementById("brand-home").addEventListener("click", function (e) {
    e.preventDefault();
    scrollToAnchor("top", true);
    try { history.replaceState(null, "", "#top"); } catch (err) {}
  });
  document.getElementById("skip-link").addEventListener("click", function (e) {
    e.preventDefault();
    var flow = document.getElementById("flow");
    flow.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  });

  var currentId = null;
  function setCurrent(id) {
    if (id === currentId) return;
    currentId = id;
    var cat = categories.find(function (c) { return c.id === id; });
    var label = cat ? cat.name : "总览";
    document.getElementById("fab-current").textContent = label;
    document.getElementById("toc-progress").textContent =
      cat ? "当前位置 · " + pad2(categories.indexOf(cat) + 1) + " " + cat.name : "当前位置 · 总览";
    [tocList, sheetList].forEach(function (host) {
      host.querySelectorAll(".toc-link").forEach(function (a) {
        var on = a.dataset.anchor === id;
        a.classList.toggle("is-active", on);
        if (on) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    });
    secEls.forEach(function (s) { s.el.classList.toggle("is-current", s.id === id); });
    document.getElementById("sec-top").classList.toggle("is-current", id === "top");
  }

  var spyTick = false;
  function spy() {
    var probe = topbarHeight() + 40;
    var found = "top";
    for (var i = 0; i < secEls.length; i++) {
      if (secEls[i].el.getBoundingClientRect().top <= probe) found = secEls[i].id;
    }
    // 滚到页面底部且最后一个分区标题已接近页头时，才把它视为当前位置
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && secEls.length) {
      var last = secEls[secEls.length - 1];
      if (last.el.getBoundingClientRect().top <= probe + 60) found = last.id;
    }
    setCurrent(found);
  }
  window.addEventListener("scroll", function () {
    if (spyTick) return;
    spyTick = true;
    requestAnimationFrame(function () { spyTick = false; spy(); });
  }, { passive: true });
  window.addEventListener("resize", spy);

  /* ---------- 移动端目录抽屉 ---------- */
  var fab = document.getElementById("toc-fab");
  var sheet = document.getElementById("toc-sheet");
  var backdrop = document.getElementById("sheet-backdrop");
  var sheetClose = document.getElementById("sheet-close");
  var sheetOpen = false;
  var lastFocus = null;

  function openSheet() {
    if (sheetOpen) return;
    sheetOpen = true;
    lastFocus = document.activeElement;
    sheet.hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(function () {
      sheet.classList.add("is-shown");
      backdrop.classList.add("is-shown");
    });
    fab.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    var active = sheet.querySelector(".toc-link.is-active") || sheet.querySelector(".toc-link");
    (active || sheetClose).focus();
    // 焦点圈在抽屉内
    document.addEventListener("focusin", trapSheetFocus);
  }
  function trapSheetFocus(e) {
    if (sheetOpen && !sheet.contains(e.target)) {
      var first = sheet.querySelector("a[href], button:not([disabled])");
      if (first) first.focus();
    }
  }
  function closeSheet(restoreFocus) {
    if (!sheetOpen) return;
    sheetOpen = false;
    document.removeEventListener("focusin", trapSheetFocus);
    sheet.classList.remove("is-shown");
    backdrop.classList.remove("is-shown");
    fab.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    var delay = reducedMotion.matches ? 0 : 240;
    setTimeout(function () {
      if (!sheetOpen) { sheet.hidden = true; backdrop.hidden = true; }
    }, delay);
    if (restoreFocus !== false) {
      var target = lastFocus && document.contains(lastFocus) ? lastFocus : fab;
      target.focus({ preventScroll: true });
    }
  }
  fab.addEventListener("click", openSheet);
  sheetClose.addEventListener("click", function () { closeSheet(true); });
  backdrop.addEventListener("click", function () { closeSheet(true); });
  document.addEventListener("keydown", function (e) {
    if (!sheetOpen) return;
    if (e.key === "Escape") { e.preventDefault(); closeSheet(true); return; }
    if (e.key === "Tab") {
      var focusables = sheet.querySelectorAll("a[href], button:not([disabled])");
      if (!focusables.length) return;
      var first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  // 抽屉里点锚点后焦点交给目标分区（scrollToAnchor 已处理），这里只负责关抽屉

  /* ---------- 初始化 ---------- */
  var initialHash = location.hash;
  applySearch(state.q, { keepView: false });

  // 恢复展开状态在 renderRows 内完成；这里恢复滚动/锚点
  var hashSec = initialHash.match(/^#sec-(.+)$/);
  if (hashSec && document.getElementById("sec-" + hashSec[1])) {
    scrollToAnchor(hashSec[1], false);
  } else if (initialHash === "#top") {
    window.scrollTo(0, 0);
  } else if (state.y > 0) {
    window.scrollTo({ top: state.y, behavior: "instant" });
  }
  spy();
  setCurrent(currentId);
  // 首帧后再存一次，避免 restore 过程把 y 覆盖成 0
  requestAnimationFrame(function () { spy(); saveState(); });
})();
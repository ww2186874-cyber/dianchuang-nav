(function () {
  const data = window.NAV_DATA;
  if (!data) {
    document.getElementById("main").innerHTML =
      "<p class=\"empty\">没有读到条目数据，请确认 data/links.js 存在。</p>";
    return;
  }

  const site = data.site || {};
  const categories = Array.isArray(data.categories) ? data.categories : [];

  const orgEl = document.getElementById("org");
  const titleEl = document.getElementById("title");
  const subEl = document.getElementById("subtitle");
  const noticeEl = document.getElementById("notice");
  const statsEl = document.getElementById("stats");
  const chipsEl = document.getElementById("chips");
  const inkEl = document.getElementById("chip-ink");
  const mainEl = document.getElementById("main");
  const qEl = document.getElementById("q");
  const qClearEl = document.getElementById("q-clear");

  if (site.org) orgEl.textContent = site.org;
  if (site.title) titleEl.textContent = site.title;
  if (site.subtitle) subEl.textContent = site.subtitle;
  if (site.notice) noticeEl.textContent = site.notice;

  // 站内用 hash 路由；跳过导航链接不能把地址改成 #main。
  // main 聚焦时默认会把内容顶到视口最上方，被粘性工具条盖住，所以自己算滚动位置。
  const skipLink = document.querySelector(".skip-link");
  if (skipLink) {
    skipLink.addEventListener("click", function (e) {
      e.preventDefault();
      try {
        mainEl.focus({ preventScroll: true });
      } catch (err) {
        mainEl.focus();
      }
      const toolbar = document.querySelector(".toolbar");
      const offset = (toolbar ? toolbar.getBoundingClientRect().height : 0) + 12;
      const top = window.scrollY + mainEl.getBoundingClientRect().top - offset;
      window.scrollTo(0, Math.max(0, top));
    });
  }

  function packItems(item) {
    return ((item && item.pack) || []).filter(function (part) {
      return part && part.title && part.url;
    });
  }

  function isCollection(item) {
    return !!(item && item.title && packItems(item).length);
  }

  function publishedItems(category) {
    return (category.items || []).filter(function (item) {
      return item && item.title && (item.url || isCollection(item));
    });
  }

  // 统一排序：updated 倒序；同一天（或都没写日期）时，数据里排在后面的在前。
  function sortItems(items) {
    return items.map(function (item, index) {
      return { item: item, index: index };
    }).sort(function (a, b) {
      const da = a.item.updated || "";
      const db = b.item.updated || "";
      if (da !== db) return da < db ? 1 : -1;
      return b.index - a.index;
    }).map(function (row) { return row.item; });
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function itemId(item, cat) {
    if (item && item.id) return String(item.id);
    return (cat ? cat.id + "-" : "") + String(item && item.title ? item.title : "");
  }

  function findCategory(id) {
    for (let i = 0; i < categories.length; i++) {
      if (categories[i].id === id) return categories[i];
    }
    return null;
  }

  function findItem(id) {
    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      const items = publishedItems(cat);
      for (let j = 0; j < items.length; j++) {
        const item = items[j];
        if (itemId(item, cat) === id) return { item: item, cat: cat, partId: "" };
        const parts = packItems(item);
        for (let k = 0; k < parts.length; k++) {
          if (itemId(parts[k], cat) === id) {
            return { item: item, cat: cat, partId: id };
          }
        }
      }
    }
    return null;
  }

  function parseRoute() {
    let hash = location.hash || "";
    if (hash === "#top") return { name: "home" };
    if (hash.charAt(0) === "#") hash = hash.slice(1);
    if (hash.charAt(0) === "/") hash = hash.slice(1);
    if (!hash) return { name: "home" };
    const parts = hash.split("/").filter(Boolean);
    if (parts[0] === "c" && parts[1]) {
      return { name: "category", id: safeDecode(parts[1]) };
    }
    if (parts[0] === "i" && parts[1]) {
      return { name: "item", id: safeDecode(parts[1]) };
    }
    return { name: "home" };
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (err) {
      return value;
    }
  }

  const total = categories.reduce(function (n, cat) {
    return n + publishedItems(cat).length;
  }, 0);
  function renderStats() {
    statsEl.innerHTML =
      '<span class="stat"><i>条目</i><b>' + pad2(total) + "</b></span>" +
      '<span class="stat"><i>分类</i><b>' + pad2(categories.length) + "</b></span>";
  }
  renderStats();

  function setActiveChip(activeId) {
    chipsEl.querySelectorAll(".chip").forEach(function (btn) {
      const on = btn.getAttribute("data-id") === activeId;
      btn.classList.toggle("is-active", on);
      if (on) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    moveInk();
    revealActiveChip();
  }

  function revealActiveChip() {
    const active = chipsEl.querySelector(".chip.is-active");
    if (!active || chipsEl.scrollWidth <= chipsEl.clientWidth) return;
    // 把当前分类滚到中间，左右都能看到邻近的分类
    const max = chipsEl.scrollWidth - chipsEl.clientWidth;
    const target = active.offsetLeft - (chipsEl.clientWidth - active.offsetWidth) / 2;
    chipsEl.scrollLeft = Math.max(0, Math.min(max, target));
    updateChipFade();
  }

  // 移动端分类横向滑动：左右两侧还有未露出的分类时，对应一侧显示渐隐
  function updateChipFade() {
    const max = chipsEl.scrollWidth - chipsEl.clientWidth;
    chipsEl.classList.toggle("has-more-left", chipsEl.scrollLeft > 2);
    chipsEl.classList.toggle("has-more-right", max - chipsEl.scrollLeft > 2);
  }

  // 分类标签下的红色下划线：跟随当前分类，宽度与横向滚动位置一起算
  function moveInk() {
    if (!inkEl) return;
    const active = chipsEl.querySelector(".chip.is-active");
    if (!active) {
      inkEl.style.width = "0px";
      return;
    }
    const nav = chipsEl.getBoundingClientRect();
    const r = active.getBoundingClientRect();
    inkEl.style.width = r.width + "px";
    inkEl.style.transform =
      "translate(" +
      (r.left - nav.left + chipsEl.scrollLeft) + "px, " +
      (r.bottom - nav.top + chipsEl.scrollTop - 2) + "px)";
  }

  function makeChip(href, id, text, active, index) {
    const btn = document.createElement("a");
    btn.className = "chip" + (active ? " is-active" : "");
    btn.href = href;
    btn.setAttribute("data-id", id);
    btn.draggable = false;
    const num = document.createElement("span");
    num.className = "chip-num";
    num.setAttribute("aria-hidden", "true");
    num.textContent = index;
    btn.appendChild(num);
    const label = document.createElement("span");
    label.className = "chip-label";
    label.textContent = text;
    btn.appendChild(label);
    return btn;
  }

  chipsEl.appendChild(makeChip("#/", "", "全部", true, "00"));
  categories.forEach(function (cat, i) {
    chipsEl.appendChild(makeChip("#/c/" + encodeURIComponent(cat.id), cat.id, cat.name, false, pad2(i + 1)));
  });

  // 链接在鼠标微动时会被浏览器当成拖拽，从而吃掉 click。禁止拖拽，并在小位移内仍按点击切换。
  chipsEl.addEventListener("dragstart", function (e) {
    e.preventDefault();
  });
  let chipPress = null;
  chipsEl.addEventListener("pointerdown", function (e) {
    const chip = e.target.closest(".chip");
    if (!chip || e.button !== 0) return;
    chipPress = { x: e.clientX, y: e.clientY, chip: chip, id: e.pointerId };
  });
  function endChipPress(e) {
    if (!chipPress || e.pointerId !== chipPress.id) return;
    const press = chipPress;
    chipPress = null;
    if (e.type === "pointercancel") return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (dx * dx + dy * dy > 16 * 16) return;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    if (!over || !press.chip.contains(over)) return;
    const href = press.chip.getAttribute("href");
    if (href && location.hash !== href) location.hash = href;
  }
  chipsEl.addEventListener("pointerup", endChipPress);
  chipsEl.addEventListener("pointercancel", endChipPress);

  requestAnimationFrame(function () {
    requestAnimationFrame(moveInk);
  });
  // 字体加载后标签宽度会变，再对一次下划线
  if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
    document.fonts.ready.then(function () {
      moveInk();
      updateChipFade();
    }).catch(function () {});
  }
  let lastChipWidth = window.innerWidth;
  window.addEventListener("resize", function () {
    moveInk();
    // 只在窗口宽度变化时重新对中当前分类，避免移动端键盘弹起时无谓滚动
    if (window.innerWidth !== lastChipWidth) {
      lastChipWidth = window.innerWidth;
      revealActiveChip();
    }
    updateChipFade();
  });
  chipsEl.addEventListener("scroll", updateChipFade, { passive: true });
  updateChipFade();

  // 详情页里开始打字时跳回首页，在全部分类中显示结果
  let searchFromItem = false;

  function syncSearchState() {
    const hasValue = !!qEl.value;
    qClearEl.hidden = !hasValue;
    const box = qEl.closest(".search");
    if (box) box.classList.toggle("has-query", hasValue);
  }

  function onQueryChange() {
    syncSearchState();
    const route = parseRoute();
    if (route.name === "item" && norm(qEl.value)) {
      searchFromItem = true;
      location.hash = "#/";
      return;
    }
    render();
  }

  function clearQuery() {
    if (!qEl.value) return;
    qEl.value = "";
    searchFromItem = false;
    onQueryChange();
  }

  qEl.addEventListener("input", onQueryChange);
  syncSearchState();
  qEl.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (qEl.value) {
        e.preventDefault();
        clearQuery();
      } else {
        qEl.blur();
      }
    }
  });
  qClearEl.addEventListener("click", function () {
    clearQuery();
    qEl.focus();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && qEl.value && e.target !== qEl) {
      clearQuery();
      return;
    }
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const t = e.target;
    const tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    e.preventDefault();
    qEl.focus();
    qEl.select();
  });

  function norm(s) {
    return String(s || "").toLowerCase().trim();
  }

  function matches(item, cat, query) {
    if (!query) return true;
    const hay = [
      item.title,
      item.summary,
      item.source,
      item.extractCode,
      (item.tags || []).join(" "),
      cat.name
    ];
    packItems(item).forEach(function (part) {
      hay.push(part.title, part.summary);
    });
    return norm(hay.join(" ")).indexOf(query) !== -1;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // 搜索高亮：先匹配完整查询词，再匹配按空白拆开的词；用文本节点和 <mark>，不拼 HTML
  function highlightNeedles(query) {
    const full = String(query || "").trim();
    if (!full) return [];
    const needles = [full];
    full.split(/\s+/).forEach(function (tok) {
      if (tok && needles.indexOf(tok) === -1) needles.push(tok);
    });
    needles.sort(function (a, b) { return b.length - a.length; });
    return needles;
  }

  function appendHighlighted(parent, text, query) {
    const raw = String(text == null ? "" : text);
    const needles = highlightNeedles(query);
    if (!raw || !needles.length) {
      if (raw) parent.appendChild(document.createTextNode(raw));
      return;
    }
    const lower = raw.toLowerCase();
    const ranges = [];
    needles.forEach(function (needle) {
      let from = 0;
      let i;
      while ((i = lower.indexOf(needle, from)) !== -1) {
        ranges.push({ start: i, end: i + needle.length });
        from = i + needle.length;
      }
    });
    ranges.sort(function (a, b) {
      if (a.start !== b.start) return a.start - b.start;
      return (b.end - b.start) - (a.end - a.start);
    });
    const kept = [];
    ranges.forEach(function (r) {
      if (kept.length && r.start < kept[kept.length - 1].end) return;
      kept.push(r);
    });
    let pos = 0;
    kept.forEach(function (r) {
      if (r.start > pos) parent.appendChild(document.createTextNode(raw.slice(pos, r.start)));
      parent.appendChild(el("mark", "", raw.slice(r.start, r.end)));
      pos = r.end;
    });
    if (pos < raw.length) parent.appendChild(document.createTextNode(raw.slice(pos)));
  }

  function formatDate(value) {
    if (!value) return "";
    const m = String(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return m[1] + "年" + Number(m[2]) + "月" + Number(m[3]) + "日";
    return String(value);
  }

  function backLink(href, text) {
    const a = el("a", "back", text);
    a.href = href;
    return a;
  }

  function renderCard(item, cat, i, query) {
    const id = itemId(item, cat);
    const detail = "#/i/" + encodeURIComponent(id);
    const card = el("a", "card");
    card.href = detail;

    const ref = el("span", "card-ref", String(cat.id || "").toUpperCase() + " / " + pad2(i + 1));
    ref.setAttribute("aria-hidden", "true");
    card.appendChild(ref);

    const h3 = el("h3");
    appendHighlighted(h3, item.title, query);
    card.appendChild(h3);
    if (item.summary) {
      const sum = el("p", "summary");
      appendHighlighted(sum, item.summary, query);
      card.appendChild(sum);
    }

    if (item.tags && item.tags.length) {
      const ul = el("ul", "tags");
      item.tags.forEach(function (tag) {
        const li = el("li");
        appendHighlighted(li, tag, query);
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    const packs = packItems(item);
    const footer = el("footer", "links");
    if (packs.length) {
      footer.appendChild(el("span", "pack-count", packs.length + " 个资料包"));
    }
    if (item.updated) {
      footer.appendChild(el("span", "updated", "更新于 " + formatDate(item.updated)));
    }
    if (footer.children.length) card.appendChild(footer);
    return card;
  }

  function countBadge(n) {
    return el("span", n ? "count" : "count is-zero", String(n));
  }

  function categoryHint(cat, count) {
    const seen = [];
    publishedItems(cat).forEach(function (item) {
      (item.tags || []).forEach(function (tag) {
        const t = String(tag || "").trim();
        if (t && seen.indexOf(t) === -1) seen.push(t);
      });
    });
    if (seen.length) return seen.slice(0, 3).join(" · ");
    return "共 " + count + " 条";
  }

  function renderCategoryIcon(cat) {
    const symbolId = cat && cat.icon ? "i-" + String(cat.icon) : "";
    if (symbolId && document.getElementById(symbolId)) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "cat-entry-icon");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "21");
      svg.setAttribute("height", "21");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#" + symbolId);
      use.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#" + symbolId);
      svg.appendChild(use);
      return svg;
    }
    const name = cat && cat.name ? String(cat.name) : "";
    const glyph = el("span", "cat-entry-glyph", name.charAt(0) || "?");
    glyph.setAttribute("aria-hidden", "true");
    return glyph;
  }

  function renderCatEntry(cat) {
    const count = publishedItems(cat).length;
    const card = el("a", "cat-entry");
    card.href = "#/c/" + encodeURIComponent(cat.id);

    const top = el("span", "cat-entry-top");
    top.appendChild(el("span", "cat-entry-num", pad2(categories.indexOf(cat) + 1)));
    top.appendChild(el("span", "cat-entry-count", count + " 条"));
    card.appendChild(top);

    const title = el("span", "cat-entry-title");
    title.appendChild(renderCategoryIcon(cat));
    title.appendChild(el("span", "cat-entry-name", cat.name));
    card.appendChild(title);
    card.appendChild(el("span", "cat-entry-hint", categoryHint(cat, count)));
    return card;
  }

  // opts.linkedTitle：分类名做成链接（首页搜索结果）
  // opts.back：分类页，返回链接和分类编号放在顶部
  function renderGroup(cat, items, opts) {
    opts = opts || {};
    const linkedTitle = !!opts.linkedTitle;
    const section = el("section", opts.back ? "group group-page" : "group");
    if (opts.back) {
      section.appendChild(backLink("#/", "返回首页"));
      const index = categories.indexOf(cat);
      section.appendChild(el(
        "p",
        "group-kicker",
        "INDEX / " + pad2(index + 1) + " · " + String(cat.id || "").toUpperCase()
      ));
    }

    const head = el("div", "group-head");
    const h2 = el("h2");
    if (linkedTitle) {
      const a = el("a", "cat-link", cat.name);
      a.href = "#/c/" + encodeURIComponent(cat.id);
      h2.appendChild(a);
      h2.appendChild(document.createTextNode(" "));
    } else {
      h2.appendChild(document.createTextNode(cat.name + " "));
    }
    h2.appendChild(countBadge(items.length));
    head.appendChild(h2);
    section.appendChild(head);
    if (cat.description) section.appendChild(el("p", "group-desc", cat.description));

    const query = norm(qEl.value);
    if (!items.length) {
      const emptyText = query
        ? "没有匹配的条目。"
        : (cat.empty || "还没有条目，欢迎补充。");
      section.appendChild(el("p", "empty", emptyText));
      return section;
    }

    const grid = el("div", "grid");
    items.forEach(function (item, i) {
      grid.appendChild(renderCard(item, cat, i, query));
    });
    section.appendChild(grid);
    return section;
  }

  function setDocumentTitle(page) {
    const base = site.title || "电创导航";
    document.title = page ? page + " · " + base : base;
  }

  function searchHint(scope, raw, found, prefix, forceClear) {
    const p = el("p", "search-hint");
    // 只把文字放进 live region，清除按钮留在外面，避免读屏把交互控件当状态播报
    const status = el("span", "search-hint-text");
    status.setAttribute("role", "status");
    status.appendChild(document.createTextNode((prefix || "") + "在" + scope + "中搜索「"));
    status.appendChild(el("b", "", raw));
    status.appendChild(document.createTextNode("」 · 共 " + found + " 条 · "));
    p.appendChild(status);
    // 首页零结果由下方 empty-state 提供主按钮；分类页没有 empty-state，由这里提供清除入口
    if (found > 0 || forceClear) {
      const clear = el("button", "search-hint-clear", "清除");
      clear.type = "button";
      clear.addEventListener("click", function () {
        clearQuery();
        qEl.focus();
      });
      p.appendChild(clear);
    }
    return p;
  }

  function renderPendingLine(cats) {
    const p = el("p", "pending-line");
    p.appendChild(document.createTextNode("待收录："));
    cats.forEach(function (cat, i) {
      if (i) p.appendChild(document.createTextNode("、"));
      const a = el("a", "", cat.name);
      a.href = "#/c/" + encodeURIComponent(cat.id);
      p.appendChild(a);
    });
    return p;
  }

  function renderRecent() {
    const all = [];
    categories.forEach(function (cat) {
      publishedItems(cat).forEach(function (item) {
        all.push(item);
      });
    });
    const items = sortItems(all).slice(0, 8);
    if (!items.length) return null;

    const section = el("section", "recent-block");

    const head = el("div", "sec-head");
    head.appendChild(el("span", "sec-kicker", "RECENT"));
    head.appendChild(el("h2", "", "最近加入"));
    section.appendChild(head);

    const list = el("ul", "recent-list");
    items.forEach(function (item) {
      const found = findItem(itemId(item));
      const cat = found ? found.cat : null;
      const li = el("li");
      const a = el("a", "recent-item");
      a.href = "#/i/" + encodeURIComponent(itemId(item, cat));
      const meta = el("span", "recent-meta");
      if (cat && cat.name) meta.appendChild(el("span", "recent-cat", cat.name));
      if (item.updated) meta.appendChild(el("span", "recent-date", formatDate(item.updated)));
      a.appendChild(meta);
      a.appendChild(el("span", "recent-title", item.title));
      li.appendChild(a);
      list.appendChild(li);
    });
    section.appendChild(list);
    return section;
  }

  function renderHome() {
    const raw = qEl.value.trim();
    const query = norm(raw);
    setDocumentTitle(query ? "搜索：" + raw : "");
    const fromItem = searchFromItem;
    searchFromItem = false;
    if (!query) {
      const filled = categories.filter(function (cat) { return publishedItems(cat).length; });
      const pending = categories.filter(function (cat) { return !publishedItems(cat).length; });
      const layout = el("div", "home-layout");
      const mainCol = el("div", "home-main");
      if (filled.length) {
        const block = el("section", "index-block");
        const head = el("div", "sec-head");
        head.appendChild(el("span", "sec-kicker", "INDEX"));
        head.appendChild(el("h2", "", "分类索引"));
        head.appendChild(el("span", "sec-meta", pad2(filled.length) + " / " + pad2(categories.length) + " 个分类"));
        block.appendChild(head);
        const grid = el("div", "cat-entry-grid");
        filled.forEach(function (cat) {
          grid.appendChild(renderCatEntry(cat));
        });
        block.appendChild(grid);
        mainCol.appendChild(block);
      }
      if (pending.length) mainCol.appendChild(renderPendingLine(pending));
      layout.appendChild(mainCol);
      const recent = renderRecent();
      if (recent) {
        layout.appendChild(recent);
        layout.classList.add("has-side");
      }
      if (!mainCol.children.length && !recent) {
        layout.appendChild(el("p", "empty", "还没有条目，欢迎补充。"));
      }
      mainEl.appendChild(layout);
      return;
    }
    let found = 0;
    const groups = [];
    categories.forEach(function (cat) {
      const items = sortItems(publishedItems(cat).filter(function (item) {
        return matches(item, cat, query);
      }));
      if (!items.length) return;
      found += items.length;
      groups.push(renderGroup(cat, items, { linkedTitle: true }));
    });
    mainEl.appendChild(searchHint("全部分类", raw, found, fromItem ? "已回到首页，" : ""));
    groups.forEach(function (g) { mainEl.appendChild(g); });
    if (!groups.length) {
      const empty = el("div", "empty-state");
      empty.appendChild(el("h3", "", "没有匹配的条目"));
      empty.appendChild(el("p", "", "换一个更短的关键词试试，或清除搜索查看全部分类。"));
      const clear = el("button", "btn-ghost", "清除搜索");
      clear.type = "button";
      clear.addEventListener("click", function () {
        clearQuery();
        qEl.focus();
      });
      empty.appendChild(clear);
      mainEl.appendChild(empty);
    }
  }

  function renderCategory(cat) {
    const raw = qEl.value.trim();
    const query = norm(raw);
    setDocumentTitle(query ? cat.name + " · 搜索：" + raw : cat.name);
    const items = sortItems(publishedItems(cat).filter(function (item) {
      return matches(item, cat, query);
    }));
    if (query) mainEl.appendChild(searchHint("「" + cat.name + "」", raw, items.length, "", true));
    mainEl.appendChild(renderGroup(cat, items, { back: true }));
  }

  // size 可以写成 "8.2 MB" 这样的文字，也可以直接写字节数
  function formatSize(size) {
    if (typeof size === "number" && isFinite(size)) {
      if (size >= 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + " MB";
      return Math.max(1, Math.round(size / 1024)) + " KB";
    }
    return String(size || "");
  }

  const KNOWN_EXT = ["zip", "rar", "7z", "tar", "gz", "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "exe", "msi", "apk", "hex", "bin"];
  function extOf(url) {
    try {
      const path = new URL(url, location.href).pathname;
      const m = path.match(/\.([a-z0-9]+)$/i);
      const ext = m ? m[1].toLowerCase() : "";
      return KNOWN_EXT.indexOf(ext) !== -1 ? ext : "";
    } catch (err) {
      return "";
    }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        return legacyCopy(text);
      });
    }
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve();
      else reject(new Error("copy failed"));
    });
  }

  function copyLinkButton() {
    const btn = el("button", "copy-link", "复制链接");
    btn.type = "button";
    let timer = 0;
    btn.addEventListener("click", function () {
      copyText(location.href).then(function () {
        btn.textContent = "已复制";
        btn.classList.add("is-done");
      }, function () {
        btn.textContent = "复制失败，请手动复制地址栏";
      }).then(function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          btn.textContent = "复制链接";
          btn.classList.remove("is-done");
        }, 1800);
      });
    });
    return btn;
  }

  function metaRow(label, value, valueClass) {
    const row = el("div", "detail-row");
    row.appendChild(el("i", "", label));
    const b = el("b", valueClass || "", value);
    row.appendChild(b);
    return row;
  }

  function renderItem(found) {
    const item = found.item;
    const cat = found.cat;
    setDocumentTitle(item.title);
    renderStats();

    const page = el("article", "detail");

    const topRow = el("div", "detail-top");
    topRow.appendChild(backLink("#/c/" + encodeURIComponent(cat.id), "返回" + cat.name));
    topRow.appendChild(copyLinkButton());
    page.appendChild(topRow);

    const kicker = el("p", "detail-kicker");
    kicker.appendChild(el("span", "", String(cat.id || "").toUpperCase()));
    kicker.appendChild(document.createTextNode(" / "));
    const catLink = el("a", "", cat.name);
    catLink.href = "#/c/" + encodeURIComponent(cat.id);
    kicker.appendChild(catLink);
    page.appendChild(kicker);

    page.appendChild(el("h2", "", item.title));
    if (item.summary) page.appendChild(el("p", "detail-summary", item.summary));

    if (item.tags && item.tags.length) {
      const ul = el("ul", "tags");
      item.tags.forEach(function (tag) {
        ul.appendChild(el("li", "", tag));
      });
      page.appendChild(ul);
    }

    const meta = el("div", "detail-meta");
    if (item.source) meta.appendChild(metaRow("来源", item.source));
    if (item.extractCode) meta.appendChild(metaRow("提取码", item.extractCode, "extract"));
    if (item.expiry) meta.appendChild(metaRow("有效期", item.expiry));
    if (item.updated) meta.appendChild(metaRow("更新", formatDate(item.updated)));
    if (meta.children.length) page.appendChild(meta);

    function hostNote(url) {
      try {
        const host = new URL(url, location.href).hostname.replace(/^www\./, "");
        if (host.indexOf("pan.baidu.com") !== -1) return "百度网盘";
        if (host.indexOf("taobao.com") !== -1 || host.indexOf("tb.cn") !== -1) return "淘宝";
        if (host.indexOf("tmall.com") !== -1) return "天猫";
        if (host.indexOf("bilibili.com") !== -1) return "哔哩哔哩";
        return host;
      } catch (err) {
        return "";
      }
    }

    function fileNote(obj) {
      const bits = [];
      if (obj.size) bits.push(formatSize(obj.size));
      const fmt = obj.format || extOf(obj.url);
      if (fmt) bits.push(fmt);
      return bits.filter(Boolean).join(" · ");
    }

    function entryLink(label, url, note, primary) {
      const a = el("a", primary ? "entry is-primary" : "entry");
      a.href = url;
      a.rel = "noopener noreferrer";
      a.target = "_blank";
      a.appendChild(el("span", "entry-label", label));
      if (note) a.appendChild(el("span", "entry-note", note));
      return a;
    }

    const packs = packItems(item);
    if (packs.length) {
      const packList = el("section", "entry-list");
      const packHead = el("div", "entry-list-head");
      packHead.appendChild(el("h3", "", "选择下载"));
      if (item.allUrl) {
        const all = el("a", "entry-all", "查看全部资料包");
        all.href = item.allUrl;
        all.rel = "noopener noreferrer";
        all.target = "_blank";
        packHead.appendChild(all);
      }
      packList.appendChild(packHead);
      packs.forEach(function (part) {
        const a = el("a", "entry pack-entry");
        a.href = part.url;
        a.rel = "noopener noreferrer";
        a.target = "_blank";
        const body = el("span", "pack-body");
        body.appendChild(el("span", "entry-label", part.title));
        if (part.summary) body.appendChild(el("span", "pack-summary", part.summary));
        a.appendChild(body);
        const note = fileNote(part) || hostNote(part.url);
        if (note) a.appendChild(el("span", "entry-note", note));
        if (found.partId && itemId(part, cat) === found.partId) {
          a.classList.add("is-target");
          packFocus = a;
        }
        packList.appendChild(a);
      });
      page.appendChild(packList);
    }

    const list = el("section", "entry-list");
    let hasEntries = false;
    if (item.url) {
      list.appendChild(el("h3", "", "相关入口"));
      const mainBits = [];
      const mainNote = fileNote(item) || hostNote(item.url);
      if (mainNote) mainBits.push(mainNote);
      if (item.extractCode) mainBits.push("提取码 " + item.extractCode);
      if (item.expiry) mainBits.push(item.expiry);
      list.appendChild(entryLink(item.urlLabel || "资料下载", item.url, mainBits.join(" · "), true));
      hasEntries = true;
    }

    (item.links || []).forEach(function (link) {
      if (!link || !link.url || !link.label) return;
      if (!hasEntries) list.appendChild(el("h3", "", "相关入口"));
      const note = link.note || hostNote(link.url);
      list.appendChild(entryLink(link.label, link.url, note));
      hasEntries = true;
    });
    if (hasEntries) page.appendChild(list);
    mainEl.appendChild(page);
  }

  function renderMissing(kind) {
    setDocumentTitle("未找到");
    renderStats();
    const page = el("div", "page-head");
    page.appendChild(backLink("#/", "返回首页"));
    page.appendChild(el("p", "group-kicker", kind === "category" ? "NOT FOUND / CATEGORY" : "NOT FOUND / ITEM"));
    page.appendChild(el("h2", "", kind === "category" ? "没有这个分类。" : "没有这条目。"));
    page.appendChild(el("p", "group-desc", "可能是编号改过了，回首页找找看。"));
    mainEl.appendChild(page);
  }

  let packFocus = null;

  function focusPack() {
    const target = packFocus;
    packFocus = null;
    if (!target) return false;
    try {
      target.focus({ preventScroll: true });
    } catch (err) {
      target.focus();
    }
    target.scrollIntoView({ block: "center" });
    return true;
  }

  function render() {
    const route = parseRoute();
    mainEl.innerHTML = "";
    packFocus = null;

    let view = route.name;
    if (route.name === "home" && norm(qEl.value)) view = "search";
    mainEl.dataset.view = view;
    document.body.classList.toggle("is-subpage", route.name !== "home");

    if (route.name === "category") {
      const cat = findCategory(route.id);
      setActiveChip(cat ? cat.id : route.id);
      if (!cat) renderMissing("category");
      else renderCategory(cat);
    } else if (route.name === "item") {
      const found = findItem(route.id);
      setActiveChip(found ? found.cat.id : "");
      if (!found) renderMissing("item");
      else renderItem(found);
    } else {
      setActiveChip("");
      renderHome();
    }

    requestAnimationFrame(moveInk);
  }

  window.addEventListener("hashchange", function () {
    const activeBefore = document.activeElement;
    const focusWasInMain = !!(activeBefore && activeBefore !== document.body && mainEl.contains(activeBefore));
    render();
    if (!focusPack()) {
      window.scrollTo(0, 0);
      // 卡片被重新渲染后焦点会掉到 body，交给主区域继续键盘浏览
      if (focusWasInMain) {
        try {
          mainEl.focus({ preventScroll: true });
        } catch (err) {
          mainEl.focus();
        }
      }
    }
    onScroll();
  });

  render();
  focusPack();

  let compact = false;
  function onScroll() {
    const sub = document.body.classList.contains("is-subpage");
    const next = sub || window.scrollY > 72;
    if (next === compact) return;
    compact = next;
    document.body.classList.toggle("is-compact", compact);
    requestAnimationFrame(moveInk);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

})();

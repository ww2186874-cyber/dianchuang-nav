(function () {
  const data = window.NAV_DATA;
  if (!data) {
    document.getElementById("main").innerHTML =
      "<p class=\"empty\">没有读到条目数据，请确认 data/links.js 存在。</p>";
    return;
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

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
      return { name: "category", id: decodeURIComponent(parts[1]) };
    }
    if (parts[0] === "i" && parts[1]) {
      return { name: "item", id: decodeURIComponent(parts[1]) };
    }
    return { name: "home" };
  }

  const total = categories.reduce(function (n, cat) {
    return n + publishedItems(cat).length;
  }, 0);
  function renderStats(found) {
    const first = found == null
      ? '<span class="stat"><i>条目</i><b>' + pad2(total) + "</b></span>"
      : '<span class="stat is-search"><i>搜索</i><b>找到 ' + found + " 条</b></span>";
    statsEl.innerHTML = first +
      '<span class="stat"><i>分类</i><b>' + pad2(categories.length) + "</b></span>";
  }
  renderStats(null);

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

  // 移动端分类横向滑动：右侧还有内容时显示渐隐，滑到底就去掉
  function updateChipFade() {
    const more = chipsEl.scrollWidth - chipsEl.clientWidth - chipsEl.scrollLeft > 2;
    chipsEl.classList.toggle("has-more", more);
  }

  function moveInk() {
    if (!inkEl) return;
    const active = chipsEl.querySelector(".chip.is-active");
    if (!active) return;
    const nav = chipsEl.getBoundingClientRect();
    const r = active.getBoundingClientRect();
    inkEl.style.width = r.width + "px";
    inkEl.style.height = r.height + "px";
    inkEl.style.transform =
      "translate(" +
      (r.left - nav.left + chipsEl.scrollLeft) + "px, " +
      (r.top - nav.top + chipsEl.scrollTop) + "px)";
  }

  const allBtn = document.createElement("a");
  allBtn.className = "chip is-active";
  allBtn.href = "#/";
  allBtn.setAttribute("data-id", "");
  allBtn.textContent = "全部";
  chipsEl.appendChild(allBtn);

  categories.forEach(function (cat) {
    const btn = document.createElement("a");
    btn.className = "chip";
    btn.href = "#/c/" + encodeURIComponent(cat.id);
    btn.setAttribute("data-id", cat.id);
    btn.textContent = cat.name;
    chipsEl.appendChild(btn);
  });

  requestAnimationFrame(function () {
    requestAnimationFrame(moveInk);
  });
  window.addEventListener("resize", function () {
    moveInk();
    updateChipFade();
  });
  chipsEl.addEventListener("scroll", updateChipFade, { passive: true });
  updateChipFade();

  // 详情页里开始打字时跳回首页，在全部分类中显示结果
  let searchFromItem = false;

  function onQueryChange() {
    qClearEl.hidden = !qEl.value;
    const route = parseRoute();
    if (route.name === "item" && norm(qEl.value)) {
      searchFromItem = true;
      location.hash = "#/";
      return;
    }
    render({ animate: false });
  }

  function clearQuery() {
    if (!qEl.value) return;
    qEl.value = "";
    searchFromItem = false;
    onQueryChange();
  }

  qEl.addEventListener("input", onQueryChange);
  qClearEl.hidden = !qEl.value;
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

  function formatDate(value) {
    if (!value) return "";
    const m = String(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return m[1] + "年" + Number(m[2]) + "月" + Number(m[3]) + "日";
    return String(value);
  }

  function bindTilt(card) {
    if (reduced || !finePointer) return;
    card.addEventListener("pointermove", function (e) {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty("--rx", ((0.5 - y) * 3).toFixed(2) + "deg");
      card.style.setProperty("--ry", ((x - 0.5) * 4).toFixed(2) + "deg");
    });
    card.addEventListener("pointerleave", function () {
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
    });
  }

  function backLink(href, text) {
    const a = el("a", "back", text);
    a.href = href;
    return a;
  }

  function renderCard(item, cat, i, animate) {
    const id = itemId(item, cat);
    const detail = "#/i/" + encodeURIComponent(id);
    const card = el("a", "card");
    card.href = detail;
    if (animate && !reduced) {
      card.style.setProperty("--d", (80 + i * 55) + "ms");
    } else {
      card.style.animation = "none";
    }

    card.appendChild(el("h3", "", item.title));
    if (item.summary) card.appendChild(el("p", "summary", item.summary));

    if (item.tags && item.tags.length) {
      const ul = el("ul", "tags");
      item.tags.forEach(function (tag) {
        ul.appendChild(el("li", "", tag));
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
    bindTilt(card);
    return card;
  }

  function recentItems(cat, limit) {
    return sortItems(publishedItems(cat)).slice(0, limit);
  }

  function countBadge(n) {
    return el("span", n ? "count" : "count is-zero", String(n));
  }

  function renderCatTile(cat, i, animate) {
    const tile = el("article", "cat-tile");
    if (animate && !reduced) tile.style.setProperty("--d", (i * 50) + "ms");
    else tile.style.animation = "none";

    const catHref = "#/c/" + encodeURIComponent(cat.id);
    const hit = el("a", "cat-tile-hit");
    hit.href = catHref;
    hit.setAttribute("aria-hidden", "true");
    hit.tabIndex = -1;
    tile.appendChild(hit);

    const head = el("div", "cat-tile-head");
    const title = el("h2");
    const titleLink = el("a", "cat-link", cat.name);
    titleLink.href = catHref;
    title.appendChild(titleLink);
    head.appendChild(title);
    head.appendChild(countBadge(publishedItems(cat).length));
    tile.appendChild(head);
    tile.appendChild(el("p", "cat-tile-desc", cat.description || ""));

    const preview = el("ul", "cat-preview");
    const recents = recentItems(cat, 3);
    if (!recents.length) {
      preview.appendChild(el("li", "cat-preview-empty", "还没有条目"));
    } else {
      recents.forEach(function (item) {
        const li = el("li");
        const a = el("a", "", item.title);
        a.href = "#/i/" + encodeURIComponent(itemId(item, cat));
        li.appendChild(a);
        if (item.updated) li.appendChild(el("span", "cat-preview-date", formatDate(item.updated)));
        preview.appendChild(li);
      });
    }
    tile.appendChild(preview);
    return tile;
  }

  // opts.linkedTitle：分类名做成链接（首页搜索结果）
  // opts.back：分类页，返回链接放在面板顶部
  function renderGroup(cat, items, animate, opts) {
    opts = opts || {};
    const linkedTitle = !!opts.linkedTitle;
    const section = el("section", "group");
    if (animate && !reduced) {
      section.style.setProperty("--d", "0ms");
    } else {
      section.style.animation = "none";
    }
    if (opts.back) section.appendChild(backLink("#/", "返回首页"));

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
      const empty = el("p", "empty", emptyText);
      if (!animate || reduced) empty.style.animation = "none";
      section.appendChild(empty);
      return section;
    }

    const grid = el("div", "grid");
    items.forEach(function (item, i) {
      grid.appendChild(renderCard(item, cat, i, animate));
    });
    section.appendChild(grid);
    return section;
  }

  function setDocumentTitle(page) {
    const base = site.title || "电创导航";
    document.title = page ? page + " · " + base : base;
  }

  function searchHint(scope, raw, found, prefix) {
    const p = el("p", "search-hint");
    p.setAttribute("role", "status");
    p.appendChild(document.createTextNode((prefix || "") + "在" + scope + "中搜索「"));
    p.appendChild(el("b", "", raw));
    p.appendChild(document.createTextNode("」 · 找到 " + found + " 条"));
    const clear = el("button", "search-hint-clear", "清除");
    clear.type = "button";
    clear.addEventListener("click", function () {
      clearQuery();
      qEl.focus();
    });
    p.appendChild(clear);
    return p;
  }

  function renderPendingRow(cats, animate) {
    const row = el("p", "pending-row");
    if (!animate || reduced) row.style.animation = "none";
    row.appendChild(el("span", "pending-label", "待收录："));
    cats.forEach(function (cat, i) {
      if (i) row.appendChild(el("span", "pending-sep", " · "));
      const a = el("a", "", cat.name);
      a.href = "#/c/" + encodeURIComponent(cat.id);
      row.appendChild(a);
    });
    return row;
  }

  function renderHome(animate) {
    setDocumentTitle("");
    const raw = qEl.value.trim();
    const query = norm(raw);
    if (!query) {
      searchFromItem = false;
      renderStats(null);
      const filled = categories.filter(function (cat) { return publishedItems(cat).length; });
      const pending = categories.filter(function (cat) { return !publishedItems(cat).length; });
      if (filled.length) {
        const grid = el("div", "cat-grid");
        filled.forEach(function (cat, i) {
          grid.appendChild(renderCatTile(cat, i, animate));
        });
        mainEl.appendChild(grid);
      }
      if (pending.length) mainEl.appendChild(renderPendingRow(pending, animate));
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
      groups.push(renderGroup(cat, items, animate, { linkedTitle: true }));
    });
    renderStats(found);
    mainEl.appendChild(searchHint("全部分类", raw, found, searchFromItem ? "已回到首页，" : ""));
    groups.forEach(function (g) { mainEl.appendChild(g); });
    if (!groups.length) {
      mainEl.appendChild(el("p", "empty", "没有匹配的条目。"));
    }
  }

  function renderCategory(cat, animate) {
    setDocumentTitle(cat.name);
    const raw = qEl.value.trim();
    const query = norm(raw);
    const items = sortItems(publishedItems(cat).filter(function (item) {
      return matches(item, cat, query);
    }));
    renderStats(query ? items.length : null);
    if (query) mainEl.appendChild(searchHint("「" + cat.name + "」", raw, items.length));
    mainEl.appendChild(renderGroup(cat, items, animate, { back: true }));
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

  function renderItem(found, animate) {
    const item = found.item;
    const cat = found.cat;
    setDocumentTitle(item.title);

    const page = el("article", "detail");
    if (animate && !reduced) page.style.setProperty("--d", "0ms");
    else page.style.animation = "none";

    const topRow = el("div", "detail-top");
    topRow.appendChild(backLink("#/c/" + encodeURIComponent(cat.id), "返回" + cat.name));
    topRow.appendChild(copyLinkButton());
    page.appendChild(topRow);

    const kicker = el("p", "detail-kicker");
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

    function entryLink(label, url, note) {
      const a = el("a", "entry");
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
      list.appendChild(entryLink(item.urlLabel || "资料下载", item.url, mainBits.join(" · ")));
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

  function renderMissing(kind, animate) {
    setDocumentTitle("未找到");
    const page = el("div", "page-head");
    if (!animate || reduced) page.style.animation = "none";
    page.appendChild(backLink("#/", "返回首页"));
    page.appendChild(el("h2", "", kind === "category" ? "没有这个分类。" : "没有这条目。"));
    page.appendChild(el("p", "group-desc", "可能是编号改过了，回首页找找看。"));
    mainEl.appendChild(page);
  }

  let firstPaint = true;
  let packFocus = null;

  function focusPack() {
    const target = packFocus;
    packFocus = null;
    if (!target) return false;
    target.scrollIntoView({ block: "center" });
    return true;
  }

  function render(opts) {
    const route = parseRoute();
    const animate = firstPaint || (opts && opts.animate);
    firstPaint = false;
    mainEl.innerHTML = "";
    packFocus = null;

    document.body.classList.toggle("is-subpage", route.name !== "home");

    if (route.name === "category") {
      const cat = findCategory(route.id);
      setActiveChip(cat ? cat.id : route.id);
      if (!cat) renderMissing("category", animate);
      else renderCategory(cat, animate);
    } else if (route.name === "item") {
      const found = findItem(route.id);
      setActiveChip(found ? found.cat.id : "");
      if (!found) renderMissing("item", animate);
      else renderItem(found, animate);
    } else {
      setActiveChip("");
      renderHome(animate);
    }

    requestAnimationFrame(moveInk);
  }

  window.addEventListener("hashchange", function () {
    render({ animate: true });
    if (!focusPack()) window.scrollTo(0, 0);
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

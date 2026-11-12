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

  if (site.org) orgEl.textContent = site.org;
  if (site.title) titleEl.textContent = site.title;
  if (site.subtitle) subEl.textContent = site.subtitle;
  if (site.notice) noticeEl.textContent = site.notice;

  function publishedItems(category) {
    return (category.items || []).filter(function (item) {
      return item && item.title && item.url;
    });
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
        if (itemId(items[j], cat) === id) return { item: items[j], cat: cat };
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
  statsEl.innerHTML =
    '<span class="stat"><i>条目</i><b>' + pad2(total) + "</b></span>" +
    '<span class="stat"><i>分类</i><b>' + pad2(categories.length) + "</b></span>";

  function setActiveChip(activeId) {
    chipsEl.querySelectorAll(".chip").forEach(function (btn) {
      const on = btn.getAttribute("data-id") === activeId;
      btn.classList.toggle("is-active", on);
      if (on) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    moveInk();
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
  window.addEventListener("resize", moveInk);

  qEl.addEventListener("input", function () {
    const route = parseRoute();
    if (route.name === "item") {
      location.hash = "#/";
      return;
    }
    render({ animate: false });
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
      card.style.setProperty("--rx", ((0.5 - y) * 8).toFixed(2) + "deg");
      card.style.setProperty("--ry", ((x - 0.5) * 10).toFixed(2) + "deg");
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
    const card = el("article", "card");
    if (animate && !reduced) {
      card.style.setProperty("--d", (80 + i * 55) + "ms");
    } else {
      card.style.animation = "none";
    }

    const h3 = el("h3");
    const a = el("a", "", item.title);
    a.href = detail;
    h3.appendChild(a);
    card.appendChild(h3);

    if (item.summary) card.appendChild(el("p", "summary", item.summary));

    if (item.tags && item.tags.length) {
      const ul = el("ul", "tags");
      item.tags.forEach(function (tag) {
        ul.appendChild(el("li", "", tag));
      });
      card.appendChild(ul);
    }

    const footer = el("footer", "links");
    const view = el("a", "btn", "查看");
    view.href = detail;
    footer.appendChild(view);
    if (item.updated) {
      footer.appendChild(el("span", "updated", "更新于 " + formatDate(item.updated)));
    }
    card.appendChild(footer);
    bindTilt(card);
    return card;
  }

  function renderGroup(cat, items, idx, animate, linkedTitle) {
    const section = el("section", "group");
    if (animate && !reduced) {
      section.style.setProperty("--d", "0ms");
    } else {
      section.style.animation = "none";
    }

    const head = el("div", "group-head");
    head.appendChild(el("span", "index", pad2(idx + 1)));
    const h2 = el("h2");
    if (linkedTitle) {
      const a = el("a", "cat-link", cat.name);
      a.href = "#/c/" + encodeURIComponent(cat.id);
      h2.appendChild(a);
      h2.appendChild(document.createTextNode(" "));
    } else {
      h2.appendChild(document.createTextNode(cat.name + " "));
    }
    h2.appendChild(el("span", "count", String(items.length)));
    head.appendChild(h2);
    section.appendChild(head);
    if (cat.description) section.appendChild(el("p", "group-desc", cat.description));

    const query = norm(qEl.value);
    if (!items.length) {
      const emptyText = query
        ? "没有匹配的条目。"
        : (cat.empty || "还没有已审核的条目。");
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

  function renderHome(animate) {
    setDocumentTitle("");
    const query = norm(qEl.value);
    let groupIndex = 0;
    categories.forEach(function (cat, idx) {
      const items = publishedItems(cat).filter(function (item) {
        return matches(item, cat, query);
      });
      if (query && !items.length) return;
      const section = renderGroup(cat, items, idx, animate, true);
      if (animate && !reduced) {
        section.style.setProperty("--d", groupIndex * 70 + "ms");
      }
      mainEl.appendChild(section);
      groupIndex += 1;
    });
    if (!mainEl.children.length) {
      mainEl.appendChild(el("p", "empty", "没有匹配的条目。"));
    }
  }

  function renderCategory(cat, animate) {
    setDocumentTitle(cat.name);
    const head = el("div", "page-head");
    if (animate && !reduced) head.style.setProperty("--d", "0ms");
    else head.style.animation = "none";
    head.appendChild(backLink("#/", "返回首页"));
    mainEl.appendChild(head);

    const query = norm(qEl.value);
    const items = publishedItems(cat).filter(function (item) {
      return matches(item, cat, query);
    });
    const idx = categories.indexOf(cat);
    mainEl.appendChild(renderGroup(cat, items, idx < 0 ? 0 : idx, animate, false));
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

    page.appendChild(backLink("#/c/" + encodeURIComponent(cat.id), "返回" + cat.name));

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

    const actions = el("footer", "links detail-actions");
    const open = el("a", "btn primary", "打开资料");
    open.href = item.url;
    open.rel = "noopener noreferrer";
    open.target = "_blank";
    actions.appendChild(open);
    (item.links || []).forEach(function (link) {
      if (!link || !link.url || !link.label) return;
      const extra = el("a", "btn", link.label);
      extra.href = link.url;
      extra.rel = "noopener noreferrer";
      extra.target = "_blank";
      actions.appendChild(extra);
    });
    page.appendChild(actions);
    mainEl.appendChild(page);
  }

  function renderMissing(kind, animate) {
    setDocumentTitle("未找到");
    const page = el("div", "page-head");
    if (!animate || reduced) page.style.animation = "none";
    page.appendChild(backLink("#/", "返回首页"));
    page.appendChild(el("h2", "", kind === "category" ? "没有这个分类。" : "没有这条目。"));
    page.appendChild(el("p", "group-desc", "可能是编号改过了，或这条还没有审核收录。"));
    mainEl.appendChild(page);
  }

  let firstPaint = true;

  function render(opts) {
    const route = parseRoute();
    const animate = firstPaint || (opts && opts.animate);
    firstPaint = false;
    mainEl.innerHTML = "";

    document.body.classList.toggle("is-subpage", route.name !== "home");
    document.body.classList.toggle("is-detail", route.name === "item");

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
    window.scrollTo(0, 0);
  });

  render();

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

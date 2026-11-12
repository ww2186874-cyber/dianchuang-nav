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
  if (site.title) {
    titleEl.textContent = site.title;
    document.title = site.title;
  }
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

  const total = categories.reduce(function (n, cat) {
    return n + publishedItems(cat).length;
  }, 0);
  statsEl.innerHTML =
    '<span class="stat"><i>条目</i><b>' + pad2(total) + "</b></span>" +
    '<span class="stat"><i>分类</i><b>' + pad2(categories.length) + "</b></span>";

  let activeId = "";
  let firstPaint = true;

  function setActiveChip() {
    chipsEl.querySelectorAll(".chip").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-id") === activeId);
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

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "chip is-active";
  allBtn.setAttribute("data-id", "");
  allBtn.textContent = "全部";
  chipsEl.appendChild(allBtn);

  categories.forEach(function (cat) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.setAttribute("data-id", cat.id);
    btn.textContent = cat.name;
    chipsEl.appendChild(btn);
  });

  requestAnimationFrame(function () {
    requestAnimationFrame(moveInk);
  });
  window.addEventListener("resize", moveInk);

  chipsEl.addEventListener("click", function (ev) {
    const btn = ev.target.closest(".chip");
    if (!btn) return;
    activeId = btn.getAttribute("data-id") || "";
    setActiveChip();
    render({ animate: true });
  });

  qEl.addEventListener("input", function () {
    render();
  });

  function norm(s) {
    return String(s || "").toLowerCase().trim();
  }

  function matches(item, cat, query) {
    if (!query) return true;
    const hay = [item.title, item.summary, (item.tags || []).join(" "), cat.name];
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

  function render(opts) {
    const query = norm(qEl.value);
    const animate = firstPaint || (opts && opts.animate);
    firstPaint = false;
    mainEl.innerHTML = "";
    let groupIndex = 0;

    categories.forEach(function (cat, idx) {
      if (activeId && cat.id !== activeId) return;

      const items = publishedItems(cat).filter(function (item) {
        return matches(item, cat, query);
      });

      const section = el("section", "group");
      if (animate && !reduced) {
        section.style.setProperty("--d", groupIndex * 70 + "ms");
      } else {
        section.style.animation = "none";
      }

      const head = el("div", "group-head");
      head.appendChild(el("span", "index", pad2(idx + 1)));
      const h2 = el("h2");
      h2.appendChild(document.createTextNode(cat.name + " "));
      h2.appendChild(el("span", "count", String(items.length)));
      head.appendChild(h2);
      section.appendChild(head);
      if (cat.description) section.appendChild(el("p", "group-desc", cat.description));

      if (!items.length) {
        const emptyText = query
          ? "没有匹配的条目。"
          : (cat.empty || "还没有已审核的条目。");
        const empty = el("p", "empty", emptyText);
        if (!animate || reduced) empty.style.animation = "none";
        section.appendChild(empty);
        mainEl.appendChild(section);
        groupIndex += 1;
        return;
      }

      const grid = el("div", "grid");
      items.forEach(function (item, i) {
        const card = el("article", "card");
        if (animate && !reduced) {
          card.style.setProperty("--d", (80 + i * 55) + "ms");
        } else {
          card.style.animation = "none";
        }

        const h3 = el("h3");
        const a = el("a", "", item.title);
        a.href = item.url;
        a.rel = "noopener noreferrer";
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
        const open = el("a", "btn primary", "打开");
        open.href = item.url;
        open.rel = "noopener noreferrer";
        footer.appendChild(open);
        (item.links || []).forEach(function (link) {
          if (!link || !link.url || !link.label) return;
          const extra = el("a", "btn", link.label);
          extra.href = link.url;
          extra.rel = "noopener noreferrer";
          footer.appendChild(extra);
        });
        if (item.updated) {
          footer.appendChild(el("span", "updated", "更新于 " + formatDate(item.updated)));
        }
        card.appendChild(footer);
        bindTilt(card);
        grid.appendChild(card);
      });
      section.appendChild(grid);
      mainEl.appendChild(section);
      groupIndex += 1;
    });

    if (!mainEl.children.length) {
      mainEl.appendChild(el("p", "empty", "没有匹配的条目。"));
    }
  }

  render();

  let compact = false;
  function onScroll() {
    const next = window.scrollY > 72;
    if (next === compact) return;
    compact = next;
    document.body.classList.toggle("is-compact", compact);
    requestAnimationFrame(moveInk);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (!reduced && finePointer) {
    const glow = document.getElementById("pointer-glow");
    let tx = window.innerWidth * 0.7;
    let ty = 80;
    let x = tx;
    let y = ty;
    let running = false;

    function loop() {
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      glow.style.transform = "translate(" + x + "px, " + y + "px)";
      if (Math.abs(tx - x) + Math.abs(ty - y) > 0.4) {
        requestAnimationFrame(loop);
      } else {
        running = false;
      }
    }

    window.addEventListener("pointermove", function (e) {
      tx = e.clientX;
      ty = e.clientY;
      document.body.classList.add("has-pointer");
      if (!running) {
        running = true;
        requestAnimationFrame(loop);
      }
    });
  }
})();

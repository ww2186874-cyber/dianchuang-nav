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

  const total = categories.reduce(function (n, cat) {
    return n + publishedItems(cat).length;
  }, 0);
  statsEl.innerHTML =
    "<span>" + total + " 个条目</span>" +
    "<span>" + categories.length + " 个分类</span>";

  let activeId = "";

  function setActiveChip() {
    chipsEl.querySelectorAll(".chip").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-id") === activeId);
    });
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

  chipsEl.addEventListener("click", function (ev) {
    const btn = ev.target.closest(".chip");
    if (!btn) return;
    activeId = btn.getAttribute("data-id") || "";
    setActiveChip();
    render();
  });

  qEl.addEventListener("input", render);

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

  function render() {
    const query = norm(qEl.value);
    mainEl.innerHTML = "";
    let shown = 0;

    categories.forEach(function (cat) {
      if (activeId && cat.id !== activeId) return;

      const items = publishedItems(cat).filter(function (item) {
        return matches(item, cat, query);
      });

      const section = el("section", "group");
      const h2 = el("h2");
      h2.appendChild(document.createTextNode(cat.name + " "));
      h2.appendChild(el("span", "count", String(items.length)));
      section.appendChild(h2);
      if (cat.description) section.appendChild(el("p", "group-desc", cat.description));

      if (!items.length) {
        const emptyText = query
          ? "没有匹配的条目。"
          : (cat.empty || "还没有已审核的条目。");
        section.appendChild(el("p", "empty", emptyText));
        mainEl.appendChild(section);
        return;
      }

      const grid = el("div", "grid");
      items.forEach(function (item) {
        shown += 1;
        const card = el("article", "card");
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
        grid.appendChild(card);
      });
      section.appendChild(grid);
      mainEl.appendChild(section);
    });

    if (!mainEl.children.length) {
      mainEl.appendChild(el("p", "empty", "没有匹配的条目。"));
    }
  }

  render();
})();

/* 方案 B · 搜索 / 命令面板 + 悬浮预览
 * 数据来自 links-data.js（正式站 data/links.js 的原样副本，file:// 直接可用）。
 * 所有展示条目均由真实数据渲染；相对链接（如 tools/*.html）解析到站点根目录。
 */
(function () {
  "use strict";

  var data = window.NAV_DATA;
  if (!data) return;

  var site = data.site || {};
  var categories = (data.categories || []).filter(Boolean);

  /* ---------- 工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function icon(name, cls) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", cls || "ic");
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  }
  // 原型位于 previews/02-command-palette/，站内相对资源要回到站点根。
  var SITE_ROOT = "../../";
  function resolveUrl(url) {
    if (!url) return "";
    if (/^(https?:|mailto:|file:|#)/i.test(url)) return url;
    return SITE_ROOT + url.replace(/^\.?\//, "");
  }
  function hostOf(url) {
    try { return new URL(url, location.href).host || "本站页面"; }
    catch (e) { return "本站页面"; }
  }
  function packItems(item) {
    return ((item && item.pack) || []).filter(function (p) { return p && p.title && p.url; });
  }
  function isCollection(item) { return !!(item && item.title && packItems(item).length); }
  function published(cat) {
    return (cat.items || []).filter(function (it) { return it && it.title && (it.url || isCollection(it)); });
  }
  function fmtDate(d) {
    if (!d) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    return m ? (m[1] + "年" + Number(m[2]) + "月" + Number(m[3]) + "日") : d;
  }
  function pad2(n) { return String(n).padStart(2, "0"); }

  /* ---------- 展平条目 ---------- */
  var entries = [];
  categories.forEach(function (cat, ci) {
    published(cat).forEach(function (item, ii) {
      entries.push({
        id: item.id || (cat.id + "-" + ii),
        item: item, cat: cat, order: ci * 1000 + ii,
        collection: isCollection(item),
        haystack: [
          item.title, item.summary || "", item.source || "",
          (item.tags || []).join(" "), cat.name,
          packItems(item).map(function (p) { return p.title + " " + (p.summary || ""); }).join(" ")
        ].join("\n").toLowerCase()
      });
    });
  });
  // 与正式站一致：updated 倒序，同日期时数据里靠后的在前
  var recent = entries.slice().sort(function (a, b) {
    var da = a.item.updated || "", db = b.item.updated || "";
    if (da !== db) return da < db ? 1 : -1;
    return b.order - a.order;
  });
  /* ---------- 首页静态内容 ---------- */
  if (site.subtitle) $("subtitle").textContent = site.subtitle;
  if (site.notice) $("notice").textContent = site.notice;
  $("stats").textContent = pad2(entries.length) + " 条目 / " + pad2(categories.length) + " 分类";

  var recentList = $("recent-list");
  recent.forEach(function (e) {
    var li = el("li", "recent-item");
    var btn = el("button", "recent-btn");
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-label", "预览：" + e.item.title);
    var ic = el("span", "recent-icon");
    ic.appendChild(icon(e.cat.icon || "book"));
    var main = el("span", "recent-main");
    main.appendChild(el("span", "recent-title", e.item.title));
    var sub = el("span", "recent-sub");
    var b = el("b", null, e.cat.name);
    sub.appendChild(b);
    sub.appendChild(document.createTextNode(" · " + (e.collection ? (packItems(e.item).length + " 个资料包") : (e.item.summary || ""))));
    main.appendChild(sub);
    btn.appendChild(ic);
    btn.appendChild(main);
    btn.appendChild(el("span", "recent-date", fmtDate(e.item.updated)));
    btn.addEventListener("click", function () {
      // 首页点条目：桌面开悬浮预览并把焦点移入（P 钉住 / Esc 关闭）；手机开抽屉
      openPreview(e, btn, true);
    });
    li.appendChild(btn);
    recentList.appendChild(li);
  });

  /* ---------- 状态 ---------- */
  var mqMobile = window.matchMedia("(max-width: 720px)");
  var paletteOpen = false;
  var previewEntry = null;
  var pinned = false;
  var activeIdx = -1;
  var filterCat = "";           // "" = 全部
  var results = [];
  var paletteReturnFocus = null;
  var previewReturnFocus = null;

  var overlay = $("palette-overlay");
  var palette = $("palette");
  var input = $("palette-input");
  var listEl = $("palette-list");
  var emptyEl = $("palette-empty");
  var countEl = $("palette-count");
  var filtersEl = $("palette-filters");
  var preview = $("preview");
  var backdrop = $("preview-backdrop");
  var toast = $("toast");
  var toastTimer = 0;

  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 2200);
  }

  /* ---------- 分类筛选 chips ---------- */
  function buildFilters() {
    filtersEl.textContent = "";
    var defs = [{ id: "", name: "全部", n: entries.length }];
    categories.forEach(function (cat) {
      var n = published(cat).length;
      if (n > 0) defs.push({ id: cat.id, name: cat.name, n: n });
    });
    defs.forEach(function (d) {
      var chip = el("button", "filter-chip" + (filterCat === d.id ? " is-active" : ""));
      chip.type = "button";
      chip.setAttribute("aria-pressed", filterCat === d.id ? "true" : "false");
      chip.appendChild(document.createTextNode(d.name));
      chip.appendChild(el("span", "n", String(d.n)));
      chip.addEventListener("click", function () {
        filterCat = d.id;
        buildFilters();
        runSearch();
        input.focus();
      });
      filtersEl.appendChild(chip);
    });
  }

  /* ---------- 搜索 ---------- */
  function tokenize(q) {
    return q.toLowerCase().split(/\s+/).filter(Boolean);
  }
  function matchScore(entry, tokens) {
    // 每个词都要命中；标题命中权重最高
    var score = 0;
    var title = entry.item.title.toLowerCase();
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (entry.haystack.indexOf(t) === -1) return -1;
      if (title.indexOf(t) !== -1) score += 10;
      else score += 1;
    }
    return score;
  }
  function runSearch() {
    var tokens = tokenize(input.value);
    var pool = filterCat ? entries.filter(function (e) { return e.cat.id === filterCat; }) : entries;
    if (!tokens.length) {
      results = pool.slice().sort(function (a, b) {
        var da = a.item.updated || "", db = b.item.updated || "";
        if (da !== db) return da < db ? 1 : -1;
        return b.order - a.order;
      });
    } else {
      results = pool.map(function (e) { return { e: e, s: matchScore(e, tokens) }; })
        .filter(function (r) { return r.s >= 0; })
        .sort(function (a, b) { return b.s - a.s || b.e.order - a.e.order; })
        .map(function (r) { return r.e; });
    }
    activeIdx = results.length ? 0 : -1;
    renderResults(tokens);
  }

  function highlight(text, tokens) {
    // 简单子串高亮：找每个 token 的命中区间，合并后分段
    var lower = text.toLowerCase();
    var marks = [];
    tokens.forEach(function (t) {
      var from = 0, idx;
      while ((idx = lower.indexOf(t, from)) !== -1) {
        marks.push([idx, idx + t.length]);
        from = idx + t.length;
      }
    });
    if (!marks.length) return document.createTextNode(text);
    marks.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    marks.forEach(function (m) {
      var last = merged[merged.length - 1];
      if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
      else merged.push(m.slice());
    });
    var frag = document.createDocumentFragment();
    var pos = 0;
    merged.forEach(function (m) {
      if (m[0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, m[0])));
      frag.appendChild(el("mark", null, text.slice(m[0], m[1])));
      pos = m[1];
    });
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    return frag;
  }

  function renderResults(tokens) {
    listEl.textContent = "";
    results.forEach(function (e, i) {
      var li = el("li", "palette-option" + (i === activeIdx ? " is-active" : ""));
      li.id = "opt-" + i;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === activeIdx ? "true" : "false");
      var ic = el("span", "recent-icon");
      ic.appendChild(icon(e.cat.icon || "book"));
      var main = el("span", "opt-main");
      var title = el("span", "opt-title");
      title.appendChild(highlight(e.item.title, tokens));
      main.appendChild(title);
      var subText = e.collection
        ? (packItems(e.item).length + " 个资料包 · " + (e.item.summary || ""))
        : (e.item.summary || "");
      main.appendChild(el("span", "opt-sub", subText));
      li.appendChild(ic);
      li.appendChild(main);
      li.appendChild(el("span", "opt-cat", e.cat.name));
      li.addEventListener("mousemove", function () {
        if (activeIdx !== i) { activeIdx = i; syncActive(false); refreshFloatingPreview(); }
      });
      li.addEventListener("click", function (ev) {
        activeIdx = i;
        syncActive(false);
        if (ev.ctrlKey || ev.metaKey) { openActiveDirect(); return; }
        previewActive();
        // 宽桌面鼠标点选后焦点回输入框：还能继续打字 refine，Esc 一次收掉面板+悬浮预览。
        // 中等桌面让位 / 手机抽屉时焦点已在预览里，不再抢回。
        if (!mqMobile.matches && !(paletteOpen && mqMid.matches && !preview.hidden)) input.focus();
      });
      listEl.appendChild(li);
    });
    var has = results.length > 0;
    listEl.hidden = !has;
    emptyEl.hidden = has;
    if (!has) {
      emptyEl.textContent = "";
      var line = el("span");
      line.appendChild(document.createTextNode("没有找到匹配「"));
      line.appendChild(el("b", null, input.value.trim() || "（当前分类）"));
      line.appendChild(document.createTextNode("」的资料。"));
      emptyEl.appendChild(line);
      emptyEl.appendChild(el("span", "empty-tip", "试试更短的关键词，或切换上方分类；也可以把想要的资料发给维护人补充。"));
      input.removeAttribute("aria-activedescendant");
    }
    countEl.textContent = has ? (results.length + " 条") : "0 条";
    syncActive(true);
  }

  function syncActive(scroll) {
    var opts = listEl.children;
    for (var i = 0; i < opts.length; i++) {
      var on = i === activeIdx;
      opts[i].classList.toggle("is-active", on);
      opts[i].setAttribute("aria-selected", on ? "true" : "false");
    }
    if (activeIdx >= 0 && opts[activeIdx]) {
      input.setAttribute("aria-activedescendant", opts[activeIdx].id);
      if (scroll) {
        // offsetTop 相对最近的定位祖先，这里用 rect 差值保证滚动计算正确
        var o = opts[activeIdx].getBoundingClientRect();
        var l = listEl.getBoundingClientRect();
        if (o.top < l.top) listEl.scrollTop -= (l.top - o.top) + 4;
        else if (o.bottom > l.bottom) listEl.scrollTop += (o.bottom - l.bottom) + 4;
      }
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function moveActive(delta) {
    if (!results.length) return;
    activeIdx = (activeIdx + delta + results.length) % results.length;
    syncActive(true);
    refreshFloatingPreview();
  }

  /* ---------- 命令面板开关 ----------
   * 弹层规则（最终实现，测试以此为准）：
   * - 手机（≤720px）：面板与底部抽屉都是模态，互斥，开一个先收另一个。
   * - 宽桌面（≥1280px）：面板是模态；悬浮预览非模态，可与面板共存 ——
   *   遮罩让出右栏，预览不被压暗、随时可点可关。「钉住对照着搜」就是这个形态。
   * - 中等桌面（721–1279px）：放不下并排两栏，预览打开时面板让位隐藏（记住输入词），
   *   预览关闭后自动恢复面板继续搜索，避免悬浮窗长期遮挡主操作。
   * - Esc 永远先关最上层：焦点在预览 => 关预览（面板留着继续搜）；
   *   焦点在面板 => 关面板，未钉住的预览随之收起；钉住的保留并接过焦点，
   *   再按一次 Esc 收掉。
   */
  function openPalette() {
    if (paletteOpen) {
      // 中等桌面让位期间再次唤起 => 收掉预览、回到面板继续搜
      if (!preview.hidden && mqMid.matches && !mqMobile.matches) closePreview(false);
      input.focus(); input.select(); return;
    }
    var fromDrawer = !preview.hidden && mqMobile.matches;
    var drawerReturn = previewReturnFocus;
    if (fromDrawer) closePreview(false);   // 手机：抽屉与面板互斥
    paletteOpen = true;                    // 桌面：悬浮预览非模态，保留共存
    paletteReturnFocus = fromDrawer ? drawerReturn : document.activeElement;
    midResumeQuery = null;                 // 新一轮搜索，丢弃旧的让位恢复词
    overlay.hidden = false;
    buildFilters();
    runSearch();
    syncMidLayout();                       // 中等桌面且预览还开着 => 面板让位、焦点进预览
    if (!(mqMid.matches && !mqMobile.matches && !preview.hidden)) {
      input.focus();
      input.select();
    }
  }
  function closePalette(restore) {
    if (!paletteOpen) return;
    paletteOpen = false;
    overlay.hidden = true;
    if (restore !== false) {
      // 桌面还留着预览（只可能是钉住的）=> 焦点移入预览，Esc 下一步收它；
      // 否则归还唤起面板的元素。若归还目标在已隐藏的预览里（如从预览内 Ctrl+K
      // 唤起再关闭），退回预览标题或首页触发器，避免焦点落到 body。
      var keepPreview = !preview.hidden && !mqMobile.matches;
      var ret = paletteReturnFocus;
      var retUsable = ret && document.contains(ret) && !(preview.hidden && preview.contains(ret));
      var target = keepPreview ? $("preview-title") : (retUsable ? ret : null);
      if (!target && !preview.hidden) target = $("preview-title");
      if (target && document.contains(target)) target.focus({ preventScroll: true });
      else $("open-palette").focus();
    }
  }

  $("open-palette").addEventListener("click", openPalette);
  $("open-palette-2").addEventListener("click", openPalette);
  $("palette-close").addEventListener("click", function () { closePalette(); });
  overlay.addEventListener("mousedown", function (e) {
    if (e.target === overlay) closePalette();
  });
  input.addEventListener("input", runSearch);

  /* ---------- 打开动作 ---------- */
  function primaryUrl(e) {
    if (e.item.url) return resolveUrl(e.item.url);
    if (e.item.allUrl) return e.item.allUrl;
    var parts = packItems(e.item);
    return parts.length ? resolveUrl(parts[0].url) : "";
  }
  function openEntryDirect(e) {
    var url = primaryUrl(e);
    if (!url) return;
    window.open(url, "_blank", "noopener");
    showToast("已在新标签页打开：" + e.item.title);
  }
  function openActiveDirect() {
    if (activeIdx >= 0 && results[activeIdx]) openEntryDirect(results[activeIdx]);
  }
  function previewActive() {
    if (activeIdx < 0 || !results[activeIdx]) return;
    var e = results[activeIdx];
    if (mqMobile.matches) {
      // 手机：先收面板再弹抽屉，避免两层叠加
      closePalette(false);
      openPreview(e, paletteReturnFocus, true);
    } else {
      openPreview(e, input, false);
    }
  }

  /* ---------- 详情预览 ---------- */
  function metaRow(dl, k, v) {
    if (!v) return;
    dl.appendChild(el("dt", null, k));
    dl.appendChild(el("dd", null, v));
  }

  function fillPreview(e) {
    var item = e.item;
    $("preview-cat").textContent = e.cat.name + (e.collection ? " · 合集" : "");
    $("preview-title").textContent = item.title;
    $("preview-summary").textContent = item.summary || "";
    $("preview-summary").hidden = !item.summary;

    var dl = $("preview-meta");
    dl.textContent = "";
    metaRow(dl, "来源", item.source);
    metaRow(dl, "更新", fmtDate(item.updated));
    if (!e.collection) {
      var sizeFmt = [item.size, item.format].filter(Boolean).join(" · ");
      metaRow(dl, "文件", sizeFmt);
    }
    metaRow(dl, "提取码", item.extractCode);
    metaRow(dl, "有效期", item.expiry);
    dl.hidden = !dl.children.length;

    var tags = $("preview-tags");
    tags.textContent = "";
    (item.tags || []).forEach(function (t) { tags.appendChild(el("span", "tag", t)); });
    tags.hidden = !(item.tags || []).length;

    var packWrap = $("preview-pack");
    var packList = $("pack-list");
    packList.textContent = "";
    var parts = packItems(item);
    packWrap.hidden = !parts.length;
    parts.forEach(function (p) {
      var li = el("li");
      var a = el("a", "pack-row");
      a.href = resolveUrl(p.url);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.appendChild(el("span", "pack-name", p.title));
      a.appendChild(el("span", "pack-size", [p.size, p.format || "zip"].filter(Boolean).join(" · ")));
      if (p.summary) a.appendChild(el("span", "pack-desc", p.summary));
      li.appendChild(a);
      packList.appendChild(li);
    });
    var all = $("pack-all");
    if (item.allUrl) { all.href = item.allUrl; all.hidden = false; }
    else all.hidden = true;

    var links = $("preview-links");
    links.textContent = "";
    (item.links || []).forEach(function (l) {
      if (!l || !l.url) return;
      var a = el("a", "extra-link");
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.appendChild(document.createTextNode(l.label || l.url));
      if (l.note) a.appendChild(el("span", "note", "（" + l.note + "）"));
      a.appendChild(icon("ext"));
      links.appendChild(a);
    });
    links.hidden = !links.children.length;

    var openBtn = $("preview-open");
    var url = primaryUrl(e);
    if (url) { openBtn.href = url; openBtn.removeAttribute("aria-disabled"); }
    else { openBtn.removeAttribute("href"); openBtn.setAttribute("aria-disabled", "true"); }
    $("preview-open-label").textContent = item.urlLabel || (e.collection ? "查看全部资料包" : "资料下载");
    openBtn.querySelector("use").setAttribute("href", e.collection && !item.url ? "#i-ext" : (item.format === "网页版" ? "#i-ext" : "#i-download"));
    $("preview-host").textContent = url ? hostOf(url) : "";
  }

  function setPinned(on, silent) {
    pinned = on;
    preview.classList.toggle("is-pinned", on);
    var btn = $("preview-pin");
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.querySelector(".pin-label").textContent = on ? "已钉住" : "钉住";
    btn.title = on ? "取消钉住（P / Ctrl+P）" : "钉住预览（P / Ctrl+P）";
    updateModalFlags();
    if (!silent && !preview.hidden) {
      showToast(on ? "预览已钉住：切换搜索结果不会替换它" : "已取消钉住");
    }
  }

  function updateModalFlags() {
    // 手机抽屉 => 模态：遮罩 + 锁滚动 + Tab 圈定。
    // 桌面预览（含钉住）始终非模态：不遮挡面板与主操作，Tab 可自由进出。
    var mobile = mqMobile.matches;
    preview.setAttribute("aria-modal", mobile ? "true" : "false");
    backdrop.hidden = !(mobile && !preview.hidden);
    document.body.style.overflow = (mobile && !preview.hidden) ? "hidden" : "";
    document.body.classList.toggle("has-preview", !mobile && !preview.hidden);
  }

  // 中等桌面（721–1279px）：并排放不下两栏。预览打开时 CSS 让遮罩/面板让位，
  // 这里把焦点移入预览、记住输入词；预览关闭后自动恢复面板继续搜索。
  var mqMid = window.matchMedia("(min-width: 721px) and (max-width: 1279.98px)");
  var midResumeQuery = null;
  function syncMidLayout() {
    if (!paletteOpen || mqMobile.matches || preview.hidden) return;
    if (mqMid.matches) {
      midResumeQuery = input.value;
      $("preview-title").focus({ preventScroll: true });
    }
  }

  function openPreview(e, returnFocus, asModal) {
    var alreadyOpen = !preview.hidden;
    previewEntry = e;
    if (!alreadyOpen) previewReturnFocus = returnFocus || document.activeElement;
    fillPreview(e);
    preview.hidden = false;
    if (mqMobile.matches && pinned) setPinned(false, true); // 手机抽屉无钉住概念
    else preview.classList.toggle("is-pinned", pinned);
    updateModalFlags();
    syncMidLayout();
    if ((mqMobile.matches || asModal) && !alreadyOpen) {
      // 手机抽屉 / 首页直接点条目：焦点移入预览，P、Esc 就地可用
      $("preview-title").focus({ preventScroll: true });
    } else if (paletteOpen && mqMid.matches && !mqMobile.matches) {
      // 中等桌面让位：面板已隐藏，焦点必须跟着进预览
      $("preview-title").focus({ preventScroll: true });
    }
    // 宽桌面面板内 Enter 预览：焦点留在输入框，不打断键盘搜索流
  }

  function closePreview(restore) {
    if (preview.hidden) return;
    preview.hidden = true;
    previewEntry = null;
    setPinned(false, true);
    updateModalFlags();
    if (restore !== false) {
      // 面板还开着（桌面悬浮预览被单独关掉）=> 焦点回输入框继续搜索。
      // 归还目标若已随面板隐藏而不可用，退回首页触发器，避免焦点落到 body。
      var ret = previewReturnFocus;
      var retUsable = ret && document.contains(ret) && !(!paletteOpen && overlay.contains(ret));
      var target = paletteOpen ? input : (retUsable ? ret : null);
      if (target && document.contains(target)) target.focus({ preventScroll: true });
      else $("open-palette").focus();
      // 中等桌面让位期间关预览 => 恢复面板与输入词，接着搜
      if (paletteOpen && midResumeQuery != null && mqMid.matches && !mqMobile.matches) {
        input.value = midResumeQuery;
        runSearch();
        input.focus();
      }
    }
    midResumeQuery = null;
  }

  $("preview-close").addEventListener("click", function () { closePreview(); });
  // 桌面点预览空白处：焦点归预览标题，此后 P 可钉住、Esc 收预览。
  // 按钮/链接保留原生焦点行为（钉住钮点完焦点在钮上，同样在预览圈内）。
  preview.addEventListener("click", function (ev) {
    if (mqMobile.matches) return;
    if (ev.target.closest("a, button")) return;
    if (!preview.hidden) $("preview-title").focus({ preventScroll: true });
  });
  $("preview-pin").addEventListener("click", function () { setPinned(!pinned); });
  backdrop.addEventListener("click", function () { closePreview(); });
  $("preview-open").addEventListener("click", function () {
    showToast("已在新标签页打开");
  });

  // 桌面非钉住时，切换选中项即替换预览内容（快速浏览）；钉住则保持不动。
  // 中等桌面让位期间面板不可见，不做跟随刷新，避免“看不见的列表”偷换预览。
  function refreshFloatingPreview() {
    if (preview.hidden || pinned || mqMobile.matches || !paletteOpen) return;
    if (mqMid.matches) return;
    if (activeIdx >= 0 && results[activeIdx] && previewEntry) {
      previewEntry = results[activeIdx];
      fillPreview(previewEntry);
    }
  }

  /* ---------- 键盘 ---------- */
  document.addEventListener("keydown", function (e) {
    var key = e.key;

    // 全局唤起：Ctrl/Cmd+K；"/" 仅在非输入态
    if ((key === "k" || key === "K") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (paletteOpen) closePalette();
      else openPalette();
      return;
    }
    if (key === "/" && !paletteOpen) {
      var t = e.target;
      var typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (!typing) { e.preventDefault(); openPalette(); }
      return;
    }

    if (key === "Escape") {
      // Esc 永远先关最上层：手机抽屉 > 预览（焦点在其中时）> 面板 > 单独的预览。
      // 焦点在面板时收面板：未钉住的悬浮预览随之收起；钉住的保留并接过焦点。
      if (!preview.hidden && mqMobile.matches) {
        e.preventDefault(); closePreview(); return;
      }
      var focusInPreview = !preview.hidden && preview.contains(document.activeElement);
      if (focusInPreview) {
        e.preventDefault(); closePreview(); return;
      }
      if (paletteOpen) {
        e.preventDefault();
        if (!preview.hidden && !pinned) closePreview(false);
        closePalette();
        return;
      }
      if (!preview.hidden) { e.preventDefault(); closePreview(); }
      return;
    }

    if (paletteOpen) {
      // 中等桌面让位期间面板不可见：键盘事件按“预览获得焦点”处理，不走面板分支
      var midHidden = mqMid.matches && !mqMobile.matches && !preview.hidden;
      if (!midHidden) {
        if (key === "ArrowDown") { e.preventDefault(); moveActive(1); return; }
        if (key === "ArrowUp") { e.preventDefault(); moveActive(-1); return; }
        if (key === "Home" && e.ctrlKey) { e.preventDefault(); activeIdx = 0; syncActive(true); refreshFloatingPreview(); return; }
        if (key === "End" && e.ctrlKey) { e.preventDefault(); activeIdx = results.length - 1; syncActive(true); refreshFloatingPreview(); return; }
        if (key === "Enter") {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) openActiveDirect();
          else previewActive();
          return;
        }
        // Tab：面板内循环；宽桌面预览共存时把预览纳入同一个焦点圈，
        // 键盘可以从搜索结果直接 Tab 进预览去钉住/下载。
        if (key === "Tab") {
          var scope = (!mqMobile.matches && !preview.hidden) ? [palette, preview] : [palette];
          trapTabMulti(e, scope);
          return;
        }
      }
      // Ctrl+P 钉住/取消钉住预览（不占用裸字母，避免和输入冲突）；让位期间同样可用
      if ((key === "p" || key === "P") && (e.ctrlKey || e.metaKey) && !preview.hidden && !mqMobile.matches) {
        e.preventDefault(); setPinned(!pinned);
        return;
      }
    }

    // 预览获得焦点时（手机抽屉，或桌面用户主动点/Tab 过去）
    if (!preview.hidden && preview.contains(document.activeElement)) {
      var midSolo = paletteOpen && mqMid.matches && !mqMobile.matches; // 面板已让位隐藏
      if (key === "Tab" && mqMobile.matches) { trapTab(e, preview); return; }
      if (key === "Tab" && paletteOpen && !mqMobile.matches) {
        trapTabMulti(e, midSolo ? [preview] : [palette, preview]); return;
      }
      // 首页直接点开的独立预览：非模态，不圈定 Tab，可自由回到页面
      if ((key === "p" || key === "P") && !mqMobile.matches && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); setPinned(!pinned);
        return;
      }
      // 面板还开着且可见时，在预览里按上下键 = 继续切换搜索结果（钉住则内容不动）
      if (paletteOpen && !midSolo && !mqMobile.matches && (key === "ArrowDown" || key === "ArrowUp")) {
        e.preventDefault();
        moveActive(key === "ArrowDown" ? 1 : -1);
        return;
      }
      // Enter 行为一致：焦点在预览标题上按 Enter = 打开当前条目主链接；
      // 按钮/链接上的 Enter 保留原生激活（钉住、关闭、下载某个资料包等）。
      if (key === "Enter" && document.activeElement === $("preview-title") && previewEntry) {
        e.preventDefault();
        openEntryDirect(previewEntry);
      }
    }
  });

  function visibleFocusables(container) {
    var nodes = container.querySelectorAll(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
    );
    var vis = [];
    nodes.forEach(function (n) {
      // offsetParent 对 fixed 元素恒为 null，改用 rect + visibility 判可见：
      // 中等桌面让位时面板 visibility:hidden，rect 仍在但不可聚焦，须排除。
      if (!n.getClientRects().length) return;
      if (getComputedStyle(n).visibility === "hidden") return;
      vis.push(n);
    });
    return vis;
  }
  function trapTab(e, container) { trapTabMulti(e, [container]); }
  function trapTabMulti(e, containers) {
    var vis = [];
    containers.forEach(function (c) { vis = vis.concat(visibleFocusables(c)); });
    if (!vis.length) return;
    var cur = document.activeElement;
    var inScope = containers.some(function (c) { return c.contains(cur); });
    // tabindex=-1 的标题不在 vis 里，但它是合法焦点锚点：
    // 从它 Tab => 第一个控件；Shift+Tab => 最后一个控件。
    var anchor = inScope && vis.indexOf(cur) === -1;
    var idx = anchor ? (e.shiftKey ? 0 : vis.length - 1) : vis.indexOf(cur);
    if (e.shiftKey) {
      if (!inScope || idx === 0) { e.preventDefault(); vis[vis.length - 1].focus(); }
    } else {
      if (!inScope || idx === vis.length - 1) { e.preventDefault(); vis[0].focus(); }
    }
  }

  // 视口跨断点时同步模态形态（例如旋转屏幕）
  function onViewportChange() {
    if (!preview.hidden) {
      if (mqMobile.matches) {
        setPinned(false, true);
        // 桌面悬浮预览 + 面板共存时切到手机：两层模态不能叠，收面板留抽屉
        if (paletteOpen) closePalette(false);
      } else if (paletteOpen && mqMid.matches) {
        syncMidLayout(); // 从宽桌面缩到中等宽度：面板让位给预览
      }
      updateModalFlags();
    } else if (paletteOpen && !mqMobile.matches) {
      input.focus({ preventScroll: true }); // 抽屉互斥后转宽桌面等场景，焦点回输入框
    }
  }
  if (mqMobile.addEventListener) mqMobile.addEventListener("change", onViewportChange);
  else if (mqMobile.addListener) mqMobile.addListener(onViewportChange);
  if (mqMid.addEventListener) mqMid.addEventListener("change", onViewportChange);
  else if (mqMid.addListener) mqMid.addListener(onViewportChange);

  // 跳过导航
  document.querySelector(".skip-link").addEventListener("click", function (e) {
    e.preventDefault();
    $("main").focus({ preventScroll: true });
  });
})();
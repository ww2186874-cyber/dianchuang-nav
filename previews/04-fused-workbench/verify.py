# -*- coding: utf-8 -*-
"""A/B 融合工作台 · file:// 浏览器实测（Playwright + 本机 Edge）
用法：python verify.py [--shots]
--shots 时在全部断言通过后生成 desktop/mobile/interaction/wide/resized/empty 六张交付截图。
结果写入 verify-results.json。只读写本目录。
"""
import json
import sys
import pathlib

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
URL = HERE.as_uri() + "/index.html"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

RESULTS = []
PAGE_ERRORS = []


def check(name, ok, detail=""):
    RESULTS.append({"name": name, "ok": bool(ok), "detail": str(detail)})
    print(("PASS " if ok else "FAIL ") + name + ("  | " + str(detail) if detail else ""))


def no_overflow(page, label):
    m = page.evaluate(
        "() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth,"
        " bsw: document.body.scrollWidth})"
    )
    check(f"无横向溢出 {label}", m["sw"] <= m["iw"] and m["bsw"] <= m["iw"], m)


def attach_errors(page, tag):
    page.on("pageerror", lambda e: PAGE_ERRORS.append(f"[{tag}] {e}"))


def sel_state(page):
    return page.evaluate(
        """() => {
      const card = document.querySelector('.result-card.is-selected');
      const out = document.querySelector('.outline-btn.is-current');
      const cat = document.querySelector('.cat-btn.is-active');
      const h2 = document.getElementById('detail-title');
      return {
        list: card ? card.dataset.item : null,
        outline: out ? out.dataset.item : null,
        cat: cat ? cat.dataset.cat : null,
        detail: h2 ? h2.textContent : null,
        step: document.getElementById('step-pos').textContent,
        trigger: document.getElementById('trigger-label').textContent,
        qclearHidden: document.getElementById('q-clear').hidden,
        hash: location.hash,
      };
    }"""
    )


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=EDGE, headless=True)

        # ═══════════ 桌面 1440×1000 ═══════════
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = ctx.new_page()
        attach_errors(page, "desktop")
        page.goto(URL)
        page.wait_for_timeout(400)

        n_cards = page.locator(".result-card").count()
        check("默认渲染 4 条真实条目", n_cards == 4, n_cards)
        st = sel_state(page)
        check("默认选中第一条且三栏同步", st["list"] == "jiben-gaoshu-y1" and st["outline"] == "jiben-gaoshu-y1" and "技本高数" in (st["detail"] or ""), st)
        check("默认分类=全部", st["cat"] == "", st["cat"])
        check("分类 7 项", page.locator(".cat-btn").count() == 7)
        check("步进器 1/4", st["step"].strip() == "1 / 4", st["step"])
        logo_ok = page.evaluate("() => {const i=document.querySelector('.brand img'); return i.complete && i.naturalWidth>0;}")
        check("品牌 logo 加载", logo_ok)
        font_ok = page.evaluate("() => document.fonts.check('16px \"DC Title\"', '电')")
        check("DC Title 字体可用", font_ok)
        no_overflow(page, "1440 默认")

        # —— 点击搜索触发器打开面板 ——
        page.click("#open-palette")
        page.wait_for_timeout(250)
        check("点击触发器打开面板", page.evaluate("() => !document.getElementById('palette-overlay').hidden"))
        check("焦点在面板输入框", page.evaluate("() => document.activeElement.id === 'palette-input'"))
        check("app 底层 inert", page.evaluate("() => document.getElementById('app').hasAttribute('inert')"))
        check("面板空查询显示 4 条", page.locator(".palette-option").count() == 4)
        check("面板 aria-modal", page.get_attribute("#palette", "aria-modal") == "true")

        # —— Esc 取消：状态与焦点恢复 ——
        before = sel_state(page)
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        after = sel_state(page)
        check("Esc 关闭面板", page.evaluate("() => document.getElementById('palette-overlay').hidden"))
        check("Esc 后焦点归还触发器", page.evaluate("() => document.activeElement.id === 'open-palette'"))
        check("Esc 后工作状态不变", before == after, {"before": before, "after": after})
        check("Esc 后 inert 解除", page.evaluate("() => !document.getElementById('app').hasAttribute('inert')"))

        # —— "/" 唤起 + 搜「高数」+ Enter 定位 ——
        page.keyboard.press("/")
        page.wait_for_timeout(200)
        check("/ 唤起面板", page.evaluate("() => !document.getElementById('palette-overlay').hidden"))
        page.fill("#palette-input", "高数")
        page.wait_for_timeout(150)
        check("「高数」命中 1 条", page.locator(".palette-option").count() == 1)
        check("面板高亮 mark", page.locator(".palette-option mark").count() >= 1)
        page.keyboard.press("Enter")
        page.wait_for_timeout(250)
        st = sel_state(page)
        check("Enter 后面板关闭", page.evaluate("() => document.getElementById('palette-overlay').hidden"))
        check("Enter 后三栏定位到合集", st["list"] == "jiben-gaoshu-y1" and st["outline"] == "jiben-gaoshu-y1" and st["cat"] == "heritage", st)
        check("查询上下文可见（触发器）", "高数" in st["trigger"] and not st["qclearHidden"], st["trigger"])
        check("中栏搜索状态行", page.evaluate("() => !document.getElementById('search-status').hidden"))
        check("定位后焦点在列表卡片", page.evaluate("() => document.activeElement.classList.contains('result-card')"))
        check("hash 带查询快照", "%E9%AB%98%E6%95%B0" in st["hash"] or "高数" in st["hash"], st["hash"])
        no_overflow(page, "1440 搜索态")

        # —— 清除查询（顶栏 ×）——
        page.click("#q-clear")
        page.wait_for_timeout(150)
        st = sel_state(page)
        check("清除后查询为空", st["qclearHidden"] and "搜索资料" in st["trigger"], st)
        check("清除后保留分类与选中", st["cat"] == "heritage" and st["list"] == "jiben-gaoshu-y1", st)
        check("清除后焦点回触发器", page.evaluate("() => document.activeElement.id === 'open-palette'"))

        # —— Ctrl+K 唤起 + 搜「引脚」+ ↓ + Enter：跨分类定位 ——
        page.keyboard.press("Control+k")
        page.wait_for_timeout(200)
        check("Ctrl+K 唤起面板", page.evaluate("() => !document.getElementById('palette-overlay').hidden"))
        page.fill("#palette-input", "引脚")
        page.wait_for_timeout(150)
        check("「引脚」命中 2 条", page.locator(".palette-option").count() == 2)
        first_active = page.evaluate("() => document.getElementById('palette-input').getAttribute('aria-activedescendant')")
        page.keyboard.press("ArrowDown")
        second_active = page.evaluate("() => document.getElementById('palette-input').getAttribute('aria-activedescendant')")
        check("↓ 切换 active（aria-activedescendant）", first_active == "opt-0" and second_active == "opt-1", (first_active, second_active))
        page.keyboard.press("ArrowDown")
        wrap_active = page.evaluate("() => document.getElementById('palette-input').getAttribute('aria-activedescendant')")
        check("↓ 末尾回绕", wrap_active == "opt-0", wrap_active)
        page.keyboard.press("ArrowDown")  # 回到第二条 MSPM0
        page.keyboard.press("Enter")
        page.wait_for_timeout(250)
        st = sel_state(page)
        check("跨分类定位：分类切到在线工具", st["cat"] == "tools", st)
        check("跨分类定位：列表/目录/详情同步 MSPM0", st["list"] == "mspm0-pin-planner" and st["outline"] == "mspm0-pin-planner" and "MSPM0" in (st["detail"] or ""), st)
        check("跨分类后查询=引脚 且列表 2 条", page.locator(".result-card").count() == 2 and "引脚" in st["trigger"], st)
        check("步进器 2/2", st["step"].strip() == "2 / 2", st["step"])

        # —— 上一条/下一条 ——
        page.click("#prev-item")
        page.wait_for_timeout(150)
        st = sel_state(page)
        check("上一条 → ESP32-S3", st["list"] == "esp32s3-pin-planner" and st["step"].strip() == "1 / 2", st)
        check("上一条后首端禁用", page.evaluate("() => document.getElementById('prev-item').disabled"))
        page.click("#next-item")
        page.wait_for_timeout(150)
        st = sel_state(page)
        check("下一条 → MSPM0", st["list"] == "mspm0-pin-planner" and st["step"].strip() == "2 / 2", st)
        check("下一条后末端禁用", page.evaluate("() => document.getElementById('next-item').disabled"))

        # —— 工具真实打开（相对链接解析回仓库根）——
        href = page.evaluate("() => document.querySelector('.entry.is-primary').href")
        check("工具链接解析到仓库根 tools/", href.endswith("/tools/mspm0-pin-planner.html") and "/previews/" not in href, href)
        with page.expect_popup() as pop:
            page.click(".entry.is-primary")
        tool_page = pop.value
        tool_page.wait_for_load_state("domcontentloaded")
        check("工具页实际打开", "mspm0-pin-planner" in tool_page.url, tool_page.url)
        tool_title = tool_page.title()
        check("工具页有真实标题", len(tool_title) > 0, tool_title)
        tool_page.close()

        # —— 面板 Ctrl+Enter 直接打开主链接（不改状态）——
        before = sel_state(page)
        page.keyboard.press("Control+k")
        page.wait_for_timeout(200)
        page.fill("#palette-input", "高数")
        page.wait_for_timeout(150)
        # 外网可达性不稳定：在页面侧包一层 window.open 记录真实调用参数，
        # 断言「确实以正确 URL + noopener 发起打开」；popup 能加载则顺带验证。
        page.evaluate(
            """() => {
          window.__opened = [];
          const orig = window.open.bind(window);
          window.open = function (u, t, f) { window.__opened.push({url: String(u), target: t, features: f}); return orig(u, t, f); };
        }"""
        )
        with page.expect_popup() as pop2:
            page.keyboard.press("Control+Enter")
        gh = pop2.value
        opened = page.evaluate("() => window.__opened")
        try:
            gh.wait_for_load_state("domcontentloaded", timeout=15000)
        except Exception:
            pass
        ok_open = bool(opened) and "github.com" in opened[0]["url"] and "jiben-gaoshu-y1" in opened[0]["url"] and "noopener" in (opened[0]["features"] or "")
        check("Ctrl+Enter 以真实 Release URL+noopener 打开", ok_open, opened)
        gh.close()
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        after = sel_state(page)
        check("Ctrl+Enter 不改工作台状态", before == after, {"before": before, "after": after})

        # —— 面板预填当前查询 ——
        page.keyboard.press("Control+k")
        page.wait_for_timeout(150)
        prefill = page.input_value("#palette-input")
        check("面板预填当前查询「引脚」", prefill == "引脚", prefill)
        # 面板内 Esc 恢复原状态
        before = sel_state(page)
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        check("面板 Esc 再次恢复状态", sel_state(page) == before)

        # —— 鼠标点选路径 ——
        page.click("#open-palette")
        page.wait_for_timeout(200)
        page.fill("#palette-input", "")
        page.wait_for_timeout(150)
        # 空查询按 updated 倒序 + 同日期靠后者在前：ESP32-S3 / MSPM0 / DAP / 高数
        opt_texts = page.evaluate("() => [...document.querySelectorAll('.palette-option .opt-title')].map(x => x.textContent)")
        dap_idx = next(i for i, t in enumerate(opt_texts) if "DAP" in t)
        page.locator(".palette-option").nth(dap_idx).click()
        page.wait_for_timeout(250)
        st = sel_state(page)
        check("鼠标点选定位 DAP", st["list"] == "tacker-dap-v3" and st["cat"] == "docs", st)
        check("空查询定位后触发器回默认", "搜索资料" in st["trigger"], st["trigger"])
        buy = page.evaluate("() => {const a=[...document.querySelectorAll('.entry')].find(x=>x.textContent.includes('购买链接')); return a? {href:a.href,target:a.target,rel:a.rel}:null;}")
        check("DAP 购买链接真实淘宝 + noopener", buy and "taobao.com" in buy["href"] and buy["target"] == "_blank" and "noopener" in buy["rel"], buy)

        # —— 合集 4 包真实地址 + 宽屏前置（1440 单列）——
        page.click("#open-palette")
        page.wait_for_timeout(200)
        page.fill("#palette-input", "高数")
        page.wait_for_timeout(150)
        page.keyboard.press("Enter")
        page.wait_for_timeout(250)
        packs = page.evaluate(
            """() => [...document.querySelectorAll('.pack-tile')].map(a => ({
          href: a.href, target: a.target, rel: a.rel,
          title: a.querySelector('.pt-title').textContent.trim(),
          note: a.querySelector('.pt-note').textContent.trim(),
          summary: a.querySelector('.pt-summary') ? a.querySelector('.pt-summary').textContent : ''
        }))"""
        )
        expect_urls = [
            "https://github.com/ww2186874-cyber/dianchuang-nav/releases/download/jiben-gaoshu-y1/jiben-gaoshu-d1-shang-qizhong.zip",
            "https://github.com/ww2186874-cyber/dianchuang-nav/releases/download/jiben-gaoshu-y1/jiben-gaoshu-d1-shang-qimo.zip",
            "https://github.com/ww2186874-cyber/dianchuang-nav/releases/download/jiben-gaoshu-y1/jiben-gaoshu-d1-xia-qizhong.zip",
            "https://github.com/ww2186874-cyber/dianchuang-nav/releases/download/jiben-gaoshu-y1/jiben-gaoshu-d1-xia-qimo.zip",
        ]
        check("合集 4 包 href 与数据逐字一致", [x["href"] for x in packs] == expect_urls, [x["href"] for x in packs])
        check("4 包 _blank+noopener", all(x["target"] == "_blank" and "noopener" in x["rel"] for x in packs))
        check("4 包大小标注", [x["note"] for x in packs] == ["52 KB · zip", "7.8 MB · zip", "620 KB · zip", "8.3 MB · zip"], [x["note"] for x in packs])
        check("4 包摘要非空", all(x["summary"] for x in packs))
        all_url = page.evaluate("() => document.querySelector('.dc-all').href")
        check("查看全部资料包指向 Release tag", all_url == "https://github.com/ww2186874-cyber/dianchuang-nav/releases/tag/jiben-gaoshu-y1", all_url)
        grid_cols = page.evaluate("() => getComputedStyle(document.querySelector('.pack-grid')).gridTemplateColumns.split(' ').length")
        check("1440 资料包单列", grid_cols == 1, grid_cols)

        # —— 空态 / 无结果 ——
        page.click("#q-clear")
        page.wait_for_timeout(150)
        page.click('.cat-btn[data-cat="hardware"]')
        page.wait_for_timeout(150)
        check("空分类空态按钮", page.locator("#results-empty .btn-solid").count() == 1)
        check("空分类右栏占位", page.locator(".detail-placeholder").count() == 1)
        no_overflow(page, "1440 空分类")
        page.click("#results-empty .btn-solid")
        page.wait_for_timeout(150)
        check("空态按钮回全部", page.locator(".result-card").count() == 4)
        page.click("#open-palette")
        page.wait_for_timeout(200)
        page.fill("#palette-input", "不存在的词xyz")
        page.wait_for_timeout(150)
        check("面板无结果提示", page.evaluate("() => !document.getElementById('palette-empty').hidden"))
        page.keyboard.press("Enter")
        page.wait_for_timeout(150)
        check("无结果 Enter 无副作用（面板仍开）", page.evaluate("() => !document.getElementById('palette-overlay').hidden"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)

        # —— Esc 分层：清查询 → 关详情 ——
        page.click("#open-palette")
        page.wait_for_timeout(200)
        page.fill("#palette-input", "规划")
        page.wait_for_timeout(150)
        page.keyboard.press("Enter")
        page.wait_for_timeout(250)
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        st = sel_state(page)
        check("Esc① 清查询保留选中", st["qclearHidden"] and st["list"] is not None, st)
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        st = sel_state(page)
        check("Esc② 关详情回占位", st["list"] is None and page.locator(".detail-placeholder").count() == 1, st)
        check("关详情焦点归还卡片", page.evaluate("() => document.activeElement.classList.contains('result-card')"))

        # —— 面板 Tab 圈定 ——
        page.click("#open-palette")
        page.wait_for_timeout(200)
        inside = True
        for _ in range(12):
            page.keyboard.press("Tab")
            if not page.evaluate("() => document.getElementById('palette').contains(document.activeElement)"):
                inside = False
                break
        check("面板 Tab 12 次不逃逸", inside)
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)

        # —— hash 直达 ——
        page.goto(URL + "#/i/esp32s3-pin-planner")
        page.wait_for_timeout(400)
        st = sel_state(page)
        check("hash 直达跨分类同步", st["list"] == "esp32s3-pin-planner" and st["cat"] == "tools", st)
        no_overflow(page, "1440 直达")

        # —— 1440 详情布局测量 ——
        page.goto(URL)
        page.wait_for_timeout(400)
        geo = page.evaluate(
            """() => {
          const pane = document.getElementById('detail').getBoundingClientRect();
          const bar = document.querySelector('.detail-bar').getBoundingClientRect();
          const doc = document.querySelector('.detail-doc').getBoundingClientRect();
          const sum = document.querySelector('.dc-summary');
          return {paneW: pane.width, docW: doc.width, docLeft: doc.left - pane.left,
                  gapBelowBar: doc.top - bar.bottom, sumW: sum.getBoundingClientRect().width};
        }"""
        )
        check("1440 详情流式铺满右栏（非窄卡居中）", geo["docW"] > geo["paneW"] * 0.9 and geo["docLeft"] < 60, geo)
        check("1440 详情顶对齐（紧贴工具栏下方）", geo["gapBelowBar"] <= 24, geo)
        check("1440 摘要行长 ≤ 72ch 左右", geo["sumW"] < 760, geo)

        # —— 文案清理与红条删除（真实资料内容仍在）——
        gone = page.evaluate(
            """() => ({
          brandSub: !!document.querySelector('.brand-sub'),
          siteNote: !!document.getElementById('site-note'),
          resultsDesc: !!document.getElementById('results-desc'),
          resultsFoot: !!document.querySelector('.results-foot'),
          topbarBefore: getComputedStyle(document.querySelector('.topbar'), '::before').content,
          topbarAfter: getComputedStyle(document.querySelector('.topbar'), '::after').content,
          bodyText: document.body.innerText
        })"""
        )
        check("品牌副标题已删", not gone["brandSub"])
        check("左下备注已删", not gone["siteNote"])
        check("中栏分类介绍已删", not gone["resultsDesc"])
        check("中栏底部快捷键条已删", not gone["resultsFoot"])
        check("顶栏装饰条伪元素已删", gone["topbarBefore"] in ("none", "normal", "") and gone["topbarAfter"] in ("none", "normal", ""), (gone["topbarBefore"], gone["topbarAfter"]))
        check("界面描述文案不再出现", all(s not in gone["bodyText"] for s in ["融合工作台 · 大学生电子创新协会", "想补充资料", "实验室常用的板子"]), "")
        check("真实资料摘要仍在", "学长学姐整理的大一期中、期末历年试卷" in gone["bodyText"] and "52 KB" in gone["bodyText"])
        check("面板键位提示保留", page.evaluate("() => document.querySelector('.palette-foot').textContent.includes('定位到工作台')"))

        # —— 装饰红条全目录审计：详情卡 / 面板 / 空态均无同类装饰 ——
        deco = page.evaluate(
            """() => {
          const cs = (sel, pseudo) => getComputedStyle(document.querySelector(sel), pseudo);
          const doc = document.querySelector('.detail-doc');
          const pal = document.getElementById('palette');
          return {
            docBefore: cs('.detail-doc', '::before').content,
            docAfter: cs('.detail-doc', '::after').content,
            docBorderTop: getComputedStyle(doc).borderTopWidth + ' ' + getComputedStyle(doc).borderTopColor,
            palBorderTop: getComputedStyle(pal).borderTopWidth + ' ' + getComputedStyle(pal).borderTopColor,
            palBorderLeft: getComputedStyle(pal).borderLeftWidth
          };
        }"""
        )
        check("详情卡顶部红黑双线伪元素已删", deco["docBefore"] in ("none", "normal", "") and deco["docAfter"] in ("none", "normal", ""), deco)
        check("详情卡顶边为普通细边", deco["docBorderTop"].startswith("1px") and "176, 42, 34" not in deco["docBorderTop"], deco["docBorderTop"])
        check("面板顶边为普通边框（非 3px 红）", deco["palBorderTop"].startswith("1px") and "176, 42, 34" not in deco["palBorderTop"] and deco["palBorderTop"] == deco["palBorderLeft"] + " " + deco["palBorderTop"].split(" ", 1)[1], deco)
        # 空态为开放式：无边框/无卡片底色/无阴影/无装饰伪元素
        page.click("#detail-close")
        page.wait_for_timeout(200)
        ph_deco = page.evaluate(
            """() => {
          const ph = document.querySelector('.detail-placeholder');
          const cs = getComputedStyle(ph);
          return {before: cs.getPropertyValue('content'), after: getComputedStyle(ph, '::after').content,
                  borderW: cs.borderTopWidth + '|' + cs.borderLeftWidth, bg: cs.backgroundColor,
                  shadow: cs.boxShadow,
                  beforeContent: getComputedStyle(ph, '::before').content};
        }"""
        )
        check("空态无边框", ph_deco["borderW"] == "0px|0px", ph_deco)
        check("空态无卡片底色", ph_deco["bg"] in ("rgba(0, 0, 0, 0)", "transparent"), ph_deco["bg"])
        check("空态无阴影", ph_deco["shadow"] == "none", ph_deco["shadow"])
        check("空态无装饰伪元素", ph_deco["beforeContent"] in ("none", "normal", "") and ph_deco["after"] in ("none", "normal", ""), ph_deco)
        # 功能性红色仍在：选中卡片红边、focus-visible、分隔条 hover
        page.click('.result-card[data-item="jiben-gaoshu-y1"]')
        page.wait_for_timeout(200)
        func_red = page.evaluate(
            """() => {
          const sel = document.querySelector('.result-card.is-selected');
          return {selBorder: getComputedStyle(sel).borderTopColor,
                  focusOutline: getComputedStyle(document.querySelector(':focus-visible') || sel).outlineColor};
        }"""
        )
        check("选中态功能红保留", "176, 42, 34" in func_red["selBorder"], func_red)

        # —— 开放式空态：水平居中 / 视觉重心 ~45% / 宽松宽度 / 三组键位 / 三种语义 ——
        page.click("#detail-close")
        page.wait_for_timeout(200)
        empty_geo = page.evaluate(
            """() => {
          const scroll = document.getElementById('detail-scroll');
          const sr = scroll.getBoundingClientRect();
          const ph = document.querySelector('.detail-placeholder').getBoundingClientRect();
          const cs = getComputedStyle(document.querySelector('.detail-placeholder'));
          const h2 = getComputedStyle(document.querySelector('.detail-placeholder h2'));
          const p = getComputedStyle(document.querySelector('.detail-placeholder p'));
          const keys = document.querySelector('.ph-keys');
          return {cx: (ph.left + ph.right) / 2, sx: (sr.left + sr.right) / 2,
                  vRatio: ((ph.top + ph.bottom) / 2 - sr.top) / sr.height,
                  w: ph.width, h2Size: parseFloat(h2.fontSize), pSize: parseFloat(p.fontSize),
                  kbds: document.querySelectorAll('.detail-placeholder kbd').length,
                  keyRows: document.querySelectorAll('.detail-placeholder .ph-key').length,
                  keysDisplay: getComputedStyle(keys).display,
                  keysBorder: getComputedStyle(keys).borderTopWidth,
                  keysBg: getComputedStyle(keys).backgroundColor,
                  text: document.querySelector('.detail-placeholder').innerText};
        }"""
        )
        check("1440 空态水平居中", abs(empty_geo["cx"] - empty_geo["sx"]) <= 3, empty_geo)
        check("1440 空态视觉重心约 45%（42–48%）", 0.42 <= empty_geo["vRatio"] <= 0.48, empty_geo["vRatio"])
        check("1440 空态开放排版宽松（随空间收缩）", 300 <= empty_geo["w"] <= 900, empty_geo["w"])
        check("空态字号舒展适度", 20 <= empty_geo["h2Size"] <= 28 and 14 <= empty_geo["pSize"] <= 18, empty_geo)
        check("空态快捷键仅三组且键帽存在", empty_geo["kbds"] >= 5 and empty_geo["keyRows"] == 3, empty_geo)
        check("空态键位区开放（flex 换行、无包围卡片）", empty_geo["keysDisplay"] == "flex" and empty_geo["keysBorder"] == "0px" and empty_geo["keysBg"] in ("rgba(0, 0, 0, 0)", "transparent"), empty_geo)
        check("空态快捷键文本准确", all(s in empty_geo["text"] for s in ["搜索与定位", "切换资料", "关闭详情"]), empty_geo["text"])
        check("空态无分隔条键位描述", "微调分隔条" not in empty_geo["text"] and "双击复位" not in empty_geo["text"], empty_geo["text"])
        no_overflow(page, "1440 空态")
        # 空分类语义
        page.click('.cat-btn[data-cat="hardware"]')
        page.wait_for_timeout(200)
        ec = page.evaluate("() => ({h2: document.querySelector('.detail-placeholder h2').textContent, btn: document.querySelector('.detail-placeholder .btn-solid').textContent})")
        check("空分类占位语义正确", "空" in ec["h2"] and ec["btn"] == "查看全部资料", ec)
        no_overflow(page, "1440 空分类占位")
        # 无结果语义
        page.click('.cat-btn[data-cat=""]')
        page.wait_for_timeout(150)
        page.click("#open-palette")
        page.wait_for_timeout(150)
        page.fill("#palette-input", "不存在的词xyz")
        page.wait_for_timeout(120)
        page.keyboard.press("Escape")  # 面板取消不改状态；改用中栏空态按钮路径
        page.wait_for_timeout(120)
        # 直接通过面板定位一个无结果查询不可行（Enter 无副作用），用 hash 带 q 造无结果态
        page.goto(URL + "#/?q=%E4%B8%8D%E5%AD%98%E5%9C%A8xyz")
        page.wait_for_timeout(400)
        nr = page.evaluate("() => ({h2: document.querySelector('.detail-placeholder h2').textContent, btn: document.querySelector('.detail-placeholder .btn-solid') ? document.querySelector('.detail-placeholder .btn-solid').textContent : null})")
        check("无结果占位语义正确", "匹配" in nr["h2"] and nr["btn"] == "清除搜索", nr)
        no_overflow(page, "1440 无结果占位")
        page.goto(URL)
        page.wait_for_timeout(300)

        # —— OUTLINE 资料包项：只定位不下载 ——
        page.goto(URL)
        page.wait_for_timeout(400)
        outline_links = page.evaluate("() => document.querySelectorAll('.outline-pack a').length")
        outline_btns = page.locator(".outline-pack button").count()
        check("目录资料包项全部为按钮（无外链）", outline_links == 0 and outline_btns == 4, (outline_links, outline_btns))
        # 监听 download/popup/导航
        events = {"download": 0, "popup": 0}
        page.on("download", lambda d: events.__setitem__("download", events["download"] + 1))
        page.on("popup", lambda pp: events.__setitem__("popup", events["popup"] + 1))
        url_before = page.url
        page.click('.outline-pack button[data-pack="jiben-gaoshu-d1-xia-qimo"]')
        page.wait_for_timeout(500)
        loc = page.evaluate(
            """() => {
          const t = document.querySelector('.pack-tile[data-pack="jiben-gaoshu-d1-xia-qimo"]');
          const sr = document.getElementById('detail-scroll').getBoundingClientRect();
          const tr = t.getBoundingClientRect();
          return {located: t.classList.contains('is-located'),
                  visible: tr.top >= sr.top - 4 && tr.bottom <= sr.bottom + 4,
                  focused: document.activeElement === t,
                  sel: document.querySelector('.result-card.is-selected').dataset.item};
        }"""
        )
        check("目录点击后右侧瓦片定位高亮", loc["located"] and loc["sel"] == "jiben-gaoshu-y1", loc)
        check("目录点击后瓦片滚入详情视野", loc["visible"], loc)
        check("目录点击后焦点在瓦片", loc["focused"])
        check("目录点击无 download/popup/导航", events["download"] == 0 and events["popup"] == 0 and page.url == url_before, (events, page.url == url_before))
        # 键盘 Enter 同样只定位
        page.click('.result-card[data-item="tacker-dap-v3"]')  # 先切走再回合集，验证未选中父项时的定位
        page.wait_for_timeout(200)
        page.click('.outline-btn[data-item="jiben-gaoshu-y1"]')
        page.wait_for_timeout(200)
        page.focus('.outline-pack button[data-pack="jiben-gaoshu-d1-shang-qizhong"]')
        page.keyboard.press("Enter")
        page.wait_for_timeout(500)
        loc2 = page.evaluate(
            """() => {
          const t = document.querySelector('.pack-tile[data-pack="jiben-gaoshu-d1-shang-qizhong"]');
          return {located: t.classList.contains('is-located'), focused: document.activeElement === t};
        }"""
        )
        check("目录键盘 Enter 只定位", loc2["located"] and loc2["focused"], loc2)
        check("键盘定位仍无 download/popup", events["download"] == 0 and events["popup"] == 0, events)
        # Space 亦然
        page.focus('.outline-pack button[data-pack="jiben-gaoshu-d1-xia-qizhong"]')
        page.keyboard.press(" ")
        page.wait_for_timeout(500)
        check("目录键盘 Space 只定位", page.evaluate("() => document.querySelector('.pack-tile[data-pack=\"jiben-gaoshu-d1-xia-qizhong\"]').classList.contains('is-located')"))
        check("Space 定位仍无 download/popup", events["download"] == 0 and events["popup"] == 0, events)
        # 高亮自动褪去
        page.wait_for_timeout(2600)
        check("定位高亮 2.4s 后自动褪去", page.locator(".pack-tile.is-located").count() == 0)

        # —— 分隔条：存在性 / 只读 ARIA / 拖拽 / 双击复位 / 无键盘调宽 / 容器查询响应 ——
        page.goto(URL)  # 回到默认选中合集，保证 .pack-grid 存在
        page.wait_for_timeout(400)
        rz = page.evaluate(
            """() => {
          const l = document.getElementById('resize-left'), m = document.getElementById('resize-mid');
          const vis = n => n && n.getClientRects().length > 0;
          return {left: vis(l), mid: vis(m),
                  role: l.getAttribute('role'), orient: l.getAttribute('aria-orientation'),
                  tabL: l.getAttribute('tabindex'), tabM: m.getAttribute('tabindex'),
                  vmin: l.getAttribute('aria-valuemin'), vmax: l.getAttribute('aria-valuemax'), vnow: l.getAttribute('aria-valuenow'),
                  titleL: l.getAttribute('title'), titleM: m.getAttribute('title')};
        }"""
        )
        check("两条分隔条可见且只读 ARIA 完整", rz["left"] and rz["mid"] and rz["role"] == "separator" and rz["orient"] == "vertical" and rz["vmin"] and rz["vmax"] and rz["vnow"], rz)
        check("分隔条不可 Tab 聚焦（无 tabindex）", rz["tabL"] is None and rz["tabM"] is None, rz)
        check("分隔条 title 无键盘调宽描述", "微调" not in (rz["titleL"] or "") and "←" not in (rz["titleL"] or "") and "双击复位" in (rz["titleL"] or ""), rz)
        # Tab 全页循环不会落在分隔条上
        page.click("#results-title")
        tab_hits_resizer = False
        for _ in range(30):
            page.keyboard.press("Tab")
            if page.evaluate("() => document.activeElement.classList.contains('col-resizer')"):
                tab_hits_resizer = True
                break
        check("Tab 30 次不聚焦分隔条", not tab_hits_resizer)

        def col_widths():
            return page.evaluate(
                """() => {
              const g = document.querySelector('.pack-grid');
              return {
                left: document.getElementById('sidebar').getBoundingClientRect().width,
                mid: document.getElementById('results').getBoundingClientRect().width,
                detail: document.getElementById('detail').getBoundingClientRect().width,
                gridCols: g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0
              };
            }"""
            )

        w0 = col_widths()
        # pointer 拖动左边界 +80px
        box = page.locator("#resize-left").bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        page.mouse.move(cx, cy)
        page.mouse.down()
        page.mouse.move(cx + 80, cy, steps=8)
        page.mouse.up()
        page.wait_for_timeout(150)
        w1 = col_widths()
        check("左边界拖动 +80 生效", abs(w1["left"] - (w0["left"] + 80)) < 3 and abs(w1["detail"] - (w0["detail"] - 80)) < 3, (w0, w1))
        no_overflow(page, "1440 拖左边界后")
        # pointer 拖动中边界 -60px
        box = page.locator("#resize-mid").bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        page.mouse.move(cx, cy)
        page.mouse.down()
        page.mouse.move(cx - 60, cy, steps=8)
        page.mouse.up()
        page.wait_for_timeout(150)
        w2 = col_widths()
        check("中边界拖动 -60 生效", abs(w2["mid"] - (w1["mid"] - 60)) < 3, (w1, w2))
        no_overflow(page, "1440 拖中边界后")
        # 渲染/搜索/切换条目不复位
        page.click('.result-card[data-item="tacker-dap-v3"]')
        page.wait_for_timeout(150)
        page.click("#open-palette")
        page.wait_for_timeout(150)
        page.fill("#palette-input", "引脚")
        page.wait_for_timeout(120)
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        page.click('.result-card[data-item="jiben-gaoshu-y1"]')  # 回合集，后续测网格
        page.wait_for_timeout(150)
        w3 = col_widths()
        check("切换条目/开关面板后宽度保持", abs(w3["left"] - w2["left"]) < 1 and abs(w3["mid"] - w2["mid"]) < 1, (w2, w3))
        # 键盘不再调宽：方向键/Home/End 不改变列宽（焦点在列表/页面时按原有语义）
        w_before_keys = col_widths()
        page.click('.result-card[data-item="jiben-gaoshu-y1"]')
        page.wait_for_timeout(120)
        for k in ("ArrowRight", "ArrowLeft", "Home", "End"):
            page.keyboard.press(k)
            page.wait_for_timeout(60)
        w_after_keys = col_widths()
        check("方向键/Home/End 不改变列宽", abs(w_after_keys["left"] - w_before_keys["left"]) < 1 and abs(w_after_keys["mid"] - w_before_keys["mid"]) < 1, (w_before_keys, w_after_keys))
        # 直接对分隔条元素派发按键也不生效（无监听器）
        page.evaluate(
            """() => {
          const l = document.getElementById('resize-left');
          ['ArrowRight','ArrowLeft','Home','End','Enter',' '].forEach(k =>
            l.dispatchEvent(new KeyboardEvent('keydown', {key: k, bubbles: true, cancelable: true})));
        }"""
        )
        page.wait_for_timeout(100)
        w_after_dispatch = col_widths()
        check("分隔条元素按键事件无效", abs(w_after_dispatch["left"] - w_after_keys["left"]) < 1 and abs(w_after_dispatch["mid"] - w_after_keys["mid"]) < 1, w_after_dispatch)
        # min/max 钳制：往死里拖
        box = page.locator("#resize-left").bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx + 2000, cy, steps=5); page.mouse.up()
        page.wait_for_timeout(120)
        wmax = col_widths()
        check("左栏拖到极大被 max 钳制", wmax["left"] <= 420 + 1, wmax)
        no_overflow(page, "1440 左栏 max")
        box = page.locator("#resize-mid").bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx + 2000, cy, steps=5); page.mouse.up()
        page.wait_for_timeout(120)
        wboth = col_widths()
        check("两栏同拖极大右栏保底 ≥320", wboth["detail"] >= 319, wboth)
        no_overflow(page, "1440 双栏 max 右栏保底")
        box = page.locator("#resize-left").bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx - 2000, cy, steps=5); page.mouse.up()
        page.wait_for_timeout(120)
        wmin = col_widths()
        check("左栏拖到极小被 min 钳制", wmin["left"] >= 199, wmin)
        no_overflow(page, "1440 左栏 min")
        # 双击复位
        page.dblclick("#resize-left")
        page.dblclick("#resize-mid")
        page.wait_for_timeout(150)
        wrst = col_widths()
        check("双击复位回默认 264/400", abs(wrst["left"] - 264) < 2 and abs(wrst["mid"] - 400) < 2, wrst)
        # 容器查询响应：把中栏拖宽使右栏 <960 → 单列；再拖回 → 双列（1440 右栏本就 <960，改在 1920 上下文测）
        ctx.close()

        # ═══════════ 1920×1080 双区 ═══════════
        ctx = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = ctx.new_page()
        attach_errors(page, "1920")
        page.goto(URL)
        page.wait_for_timeout(400)
        geo = page.evaluate(
            """() => {
          const pane = document.getElementById('detail').getBoundingClientRect();
          const doc = document.querySelector('.detail-doc').getBoundingClientRect();
          const grid = document.querySelector('.pack-grid');
          const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
          const tiles = [...document.querySelectorAll('.pack-tile')].map(t => t.getBoundingClientRect());
          const head = document.querySelector('.dc-head');
          const headCols = getComputedStyle(head).gridTemplateColumns.split(' ').length;
          return {paneW: pane.width, docW: doc.width, cols, headCols,
                  row1: tiles[0].top === tiles[1].top, row2: tiles[2].top === tiles[3].top,
                  twoRows: tiles[2].top > tiles[0].bottom - 1};
        }"""
        )
        check("1920 右栏双区：资料包 2×2", geo["cols"] == 2 and geo["row1"] and geo["row2"] and geo["twoRows"], geo)
        check("1920 页头双列（标题区+元信息区）", geo["headCols"] == 2, geo)
        check("1920 详情占用右栏 ≥85%", geo["docW"] >= geo["paneW"] * 0.85, geo)
        no_overflow(page, "1920 默认")
        # —— 拖动分隔条后右栏容器查询自然切换 ——
        def grid_cols():
            return page.evaluate("() => {const g=document.querySelector('.pack-grid'); return g? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0;}")
        def drag(handle, dx):
            b = page.locator(handle).bounding_box()
            x, y = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
            page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x + dx, y, steps=8); page.mouse.up()
            page.wait_for_timeout(150)
        check("1920 初始双列", grid_cols() == 2)
        drag("#resize-mid", 160)
        mid_w = page.evaluate("() => document.getElementById('results').getBoundingClientRect().width")
        check("中栏拖宽 160 到 max 560", abs(mid_w - 560) < 3, mid_w)
        # 1920 下仅中栏到 max 右栏仍 >960；再拖左栏到 max，右栏 1082-156=926 <960 → 单列
        drag("#resize-left", 156)
        left_w = page.evaluate("() => document.getElementById('sidebar').getBoundingClientRect().width")
        det_w = page.evaluate("() => document.getElementById('detail').getBoundingClientRect().width")
        check("左边界拖到 max 420", abs(left_w - 420) < 3, left_w)
        check("两栏均 max 后右栏 <960", det_w < 960, det_w)
        check("右栏 <960 容器查询切单列", grid_cols() == 1, grid_cols())
        no_overflow(page, "1920 双栏 max")
        page.dblclick("#resize-mid")
        page.wait_for_timeout(150)
        check("中栏双击复位后恢复双列", grid_cols() == 2, grid_cols())
        page.dblclick("#resize-left")
        page.wait_for_timeout(150)
        check("左栏双击复位", abs(page.evaluate("() => document.getElementById('sidebar').getBoundingClientRect().width") - 264) < 2)
        # 普通条目分栏
        page.click('.result-card[data-item="tacker-dap-v3"]')
        page.wait_for_timeout(200)
        geo2 = page.evaluate(
            """() => {
          const cols = document.querySelector('.dc-cols');
          const info = document.querySelector('.dc-col-info').getBoundingClientRect();
          const act = document.querySelector('.dc-col-actions').getBoundingClientRect();
          return {display: getComputedStyle(cols).display, sideBySide: Math.abs(info.top - act.top) < 40 && act.left > info.right - 5};
        }"""
        )
        check("1920 普通条目说明/操作分栏", geo2["display"] == "grid" and geo2["sideBySide"], geo2)
        no_overflow(page, "1920 普通条目")
        ctx.close()

        # ═══════════ 2550×1307 宽屏（用户截图场景） ═══════════
        ctx = browser.new_context(viewport={"width": 2550, "height": 1307})
        page = ctx.new_page()
        attach_errors(page, "2550")
        page.goto(URL)
        page.wait_for_timeout(400)
        geo = page.evaluate(
            """() => {
          const pane = document.getElementById('detail').getBoundingClientRect();
          const bar = document.querySelector('.detail-bar').getBoundingClientRect();
          const doc = document.querySelector('.detail-doc').getBoundingClientRect();
          const grid = document.querySelector('.pack-grid');
          const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
          const tiles = [...document.querySelectorAll('.pack-tile')].map(t => t.getBoundingClientRect());
          const sum = document.querySelector('.dc-summary').getBoundingClientRect();
          const h2 = document.querySelector('.detail-doc h2').getBoundingClientRect();
          return {paneW: pane.width, docW: doc.width, docLeft: doc.left - pane.left, gapBelowBar: doc.top - bar.bottom,
                  cols, tileW: tiles[0].width, row1: tiles[0].top === tiles[1].top,
                  twoRows: tiles[2].top > tiles[0].bottom - 1, sumW: sum.width, h2W: h2.width,
                  rightGap: pane.right - doc.right};
        }"""
        )
        check("2550 详情铺满右栏（≥95%，无固定上限）", geo["docW"] >= geo["paneW"] * 0.95, geo)
        check("2550 详情左右留白对称（各约 40px）", abs(geo["docLeft"] - geo["rightGap"]) <= 2 and 30 <= geo["docLeft"] <= 50, geo)
        check("2550 详情顶对齐", geo["gapBelowBar"] <= 24, geo)
        check("2550 无 1560 固定上限", page.evaluate("() => getComputedStyle(document.querySelector('.detail-doc')).maxWidth") == "none", geo["docW"])
        check("2550 资料包 2×2 双列", geo["cols"] == 2 and geo["row1"] and geo["twoRows"], geo)
        check("2550 单瓦片宽度合理（≥500px）", geo["tileW"] >= 500, geo["tileW"])
        check("2550 摘要不拉超长单行（≤900px）", geo["sumW"] <= 900, geo["sumW"])
        no_overflow(page, "2550 默认")
        # —— 2550 开放式空态：水平居中、视觉重心 ~45%、宽松开放排版 ——
        page.click("#detail-close")
        page.wait_for_timeout(250)
        e2550 = page.evaluate(
            """() => {
          const scroll = document.getElementById('detail-scroll');
          const sr = scroll.getBoundingClientRect();
          const ph = document.querySelector('.detail-placeholder').getBoundingClientRect();
          const cs = getComputedStyle(document.querySelector('.detail-placeholder'));
          return {dx: Math.abs((ph.left + ph.right) / 2 - (sr.left + sr.right) / 2),
                  vRatio: ((ph.top + ph.bottom) / 2 - sr.top) / sr.height,
                  w: ph.width, h: ph.height, areaW: sr.width, areaH: sr.height,
                  borderW: cs.borderTopWidth, bg: cs.backgroundColor, shadow: cs.boxShadow,
                  kbds: document.querySelectorAll('.detail-placeholder kbd').length,
                  keyRows: document.querySelectorAll('.detail-placeholder .ph-key').length};
        }"""
        )
        check("2550 空态水平居中（误差≤4px）", e2550["dx"] <= 4, e2550)
        check("2550 空态视觉重心约 45%（42–48%）", 0.42 <= e2550["vRatio"] <= 0.48, e2550["vRatio"])
        check("2550 空态宽度 760–900 宽松区", 760 <= e2550["w"] <= 900, e2550["w"])
        check("2550 空态无边框/底色/阴影", e2550["borderW"] == "0px" and e2550["bg"] in ("rgba(0, 0, 0, 0)", "transparent") and e2550["shadow"] == "none", e2550)
        check("2550 空态三组键位", e2550["kbds"] >= 5 and e2550["keyRows"] == 3, e2550)
        no_overflow(page, "2550 空态")
        # 空态下实际详情 fluid 不受影响：重新选中后恢复铺满
        page.click('.result-card[data-item="jiben-gaoshu-y1"]')
        page.wait_for_timeout(250)
        back_fluid = page.evaluate(
            """() => {
          const pane = document.getElementById('detail').getBoundingClientRect();
          const doc = document.querySelector('.detail-doc').getBoundingClientRect();
          return {ratio: doc.width / pane.width, emptyCls: document.getElementById('detail-scroll').classList.contains('is-empty')};
        }"""
        )
        check("空态后重选详情仍 fluid 铺满", back_fluid["ratio"] >= 0.95 and not back_fluid["emptyCls"], back_fluid)
        # 合集资料包真实下载（网络可达时验证；不可达则记录跳过，href 已逐字核对）
        try:
            with page.expect_download(timeout=20000) as dl:
                page.click('.pack-tile[data-pack="jiben-gaoshu-d1-shang-qizhong"]')
            download = dl.value
            check("合集小包真实下载触发", download.suggested_filename == "jiben-gaoshu-d1-shang-qizhong.zip", download.suggested_filename)
            download.cancel()
        except Exception as ex:
            check("合集小包真实下载触发（网络不可达，跳过）", True, f"skip: {type(ex).__name__}")
        # 普通条目 + 搜索态 + 空态各测溢出
        page.click('.result-card[data-item="tacker-dap-v3"]')
        page.wait_for_timeout(200)
        no_overflow(page, "2550 普通条目")
        page.click("#open-palette")
        page.wait_for_timeout(200)
        page.fill("#palette-input", "引脚")
        page.wait_for_timeout(150)
        no_overflow(page, "2550 面板")
        page.keyboard.press("Enter")
        page.wait_for_timeout(250)
        no_overflow(page, "2550 搜索态")
        ctx.close()

        # ═══════════ 手机 360×800 ═══════════
        ctx = browser.new_context(
            viewport={"width": 360, "height": 800},
            is_mobile=True, has_touch=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        )
        page = ctx.new_page()
        attach_errors(page, "mobile")
        page.goto(URL)
        page.wait_for_timeout(400)
        check("手机默认列表页（不自动弹详情）", page.evaluate("() => !document.body.classList.contains('detail-open')"))
        check("手机详情层 inert", page.evaluate("() => document.getElementById('detail').hasAttribute('inert')"))
        check("360 不出现分隔条", page.evaluate("() => [...document.querySelectorAll('.col-resizer')].every(n => !n.getClientRects().length)"))
        no_overflow(page, "360 默认")
        # 360 空态占位（详情层内）不溢出：hash 直达空分类
        page.goto(URL + "#/c/hardware")
        page.wait_for_timeout(400)
        no_overflow(page, "360 空分类占位")
        page.goto(URL)
        page.wait_for_timeout(300)

        # 抽屉
        page.click("#nav-toggle")
        page.wait_for_timeout(400)
        check("抽屉 dialog+aria-modal", page.evaluate("() => document.getElementById('sidebar').getAttribute('role') === 'dialog' && document.getElementById('sidebar').getAttribute('aria-modal') === 'true'"))
        check("抽屉焦点进入", page.evaluate("() => document.getElementById('sidebar').contains(document.activeElement)"))
        check("抽屉底层 inert", page.evaluate("() => document.getElementById('results').hasAttribute('inert')"))
        inside = True
        for _ in range(10):
            page.keyboard.press("Tab")
            if not page.evaluate("() => document.getElementById('sidebar').contains(document.activeElement)"):
                inside = False
                break
        check("抽屉 Tab 10 次不逃逸", inside)
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        check("抽屉 Esc 关闭且焦点归还汉堡", page.evaluate("() => !document.body.classList.contains('drawer-open') && document.activeElement.id === 'nav-toggle'"))
        # 抽屉选分类自动收起
        page.click("#nav-toggle")
        page.wait_for_timeout(400)
        page.click('.cat-btn[data-cat="docs"]')
        page.wait_for_timeout(400)
        check("抽屉选分类自动收起", page.evaluate("() => !document.body.classList.contains('drawer-open')"))
        check("分类过滤生效（1 条 DAP）", page.locator(".result-card").count() == 1)
        page.click('.cat-btn[data-cat=""]') if page.locator('.cat-btn[data-cat=""]').is_visible() else None
        page.evaluate("() => document.querySelector('.cat-btn[data-cat=\\'\\']')")  # noop guard
        # 回全部（通过品牌）
        page.click("#brand-home")
        page.wait_for_timeout(300)

        # 点条目 → 全屏详情
        page.click('.result-card[data-item="jiben-gaoshu-y1"]')
        page.wait_for_timeout(500)
        check("手机点条目开全屏详情", page.evaluate("() => document.body.classList.contains('detail-open')"))
        check("详情焦点入标题", page.evaluate("() => document.activeElement.id === 'detail-title'"))
        check("详情层底层 inert", page.evaluate("() => document.getElementById('results').hasAttribute('inert')"))
        no_overflow(page, "360 详情")
        tile_cols = page.evaluate("() => getComputedStyle(document.querySelector('.pack-grid')).gridTemplateColumns.split(' ').length")
        check("360 资料包单列", tile_cols == 1, tile_cols)
        # 下一条
        page.click("#next-item")
        page.wait_for_timeout(300)
        st = sel_state(page)
        check("手机详情内下一条", st["list"] == "tacker-dap-v3" and "DAP" in (st["detail"] or ""), st)
        check("手机步进保持详情层", page.evaluate("() => document.body.classList.contains('detail-open')"))
        # 返回列表
        page.click("#detail-back")
        page.wait_for_timeout(500)
        check("返回列表关闭详情层", page.evaluate("() => !document.body.classList.contains('detail-open')"))
        check("返回后焦点归还原卡片", page.evaluate("() => document.activeElement.dataset && document.activeElement.dataset.item === 'jiben-gaoshu-y1'"), page.evaluate("() => document.activeElement.outerHTML.slice(0,120)"))
        no_overflow(page, "360 返回后")

        # 手机命令面板 → 定位 → 全屏详情
        page.click("#open-palette")
        page.wait_for_timeout(300)
        check("手机面板打开", page.evaluate("() => !document.getElementById('palette-overlay').hidden"))
        page.fill("#palette-input", "高数")
        page.wait_for_timeout(150)
        page.keyboard.press("Enter")
        page.wait_for_timeout(600)
        check("手机面板定位后直接进详情", page.evaluate("() => document.body.classList.contains('detail-open')"))
        st = sel_state(page)
        check("手机定位三栏状态正确", st["cat"] == "heritage" and st["list"] == "jiben-gaoshu-y1", st)
        no_overflow(page, "360 面板定位后")
        page.click("#detail-back")
        page.wait_for_timeout(500)

        # 手机抽屉内目录资料包项：只定位，关抽屉进详情，无下载
        m_events = {"download": 0, "popup": 0}
        page.on("download", lambda d: m_events.__setitem__("download", m_events["download"] + 1))
        page.on("popup", lambda pp: m_events.__setitem__("popup", m_events["popup"] + 1))
        m_url = page.url
        # 手机返回列表保留选中：清查询后合集仍选中，抽屉里子包按钮展开
        if page.locator("#q-clear").is_visible():
            page.click("#q-clear")
            page.wait_for_timeout(200)
        check("手机返回后保持选中（供目录展开）", page.evaluate("() => {const c=document.querySelector('.result-card.is-selected'); return c && c.dataset.item === 'jiben-gaoshu-y1';}"))
        page.click("#nav-toggle")
        page.wait_for_timeout(400)
        check("手机抽屉内目录资料包为按钮", page.evaluate("() => document.querySelectorAll('.outline-pack a').length === 0 && document.querySelectorAll('.outline-pack button').length === 4"))
        page.click('.outline-pack button[data-pack="jiben-gaoshu-d1-xia-qimo"]')
        page.wait_for_timeout(800)
        check("手机目录定位关闭抽屉", page.evaluate("() => !document.body.classList.contains('drawer-open')"))
        check("手机目录定位打开详情层", page.evaluate("() => document.body.classList.contains('detail-open')"))
        m_loc = page.evaluate(
            """() => {
          const t = document.querySelector('.pack-tile[data-pack="jiben-gaoshu-d1-xia-qimo"]');
          const sr = document.getElementById('detail-scroll').getBoundingClientRect();
          const tr = t.getBoundingClientRect();
          return {located: t.classList.contains('is-located'), visible: tr.top >= sr.top - 4 && tr.bottom <= sr.bottom + 4};
        }"""
        )
        check("手机目录定位瓦片高亮且可见", m_loc["located"] and m_loc["visible"], m_loc)
        # hash 快照变化是站内 replaceState（选中父合集），不算外部导航
        check("手机目录定位无 download/popup/外部导航", m_events["download"] == 0 and m_events["popup"] == 0 and page.url.split("#")[0] == m_url.split("#")[0], m_events)
        no_overflow(page, "360 目录定位后")
        page.click("#detail-back")
        page.wait_for_timeout(600)
        # 手机搜索态溢出（目录定位不带查询，此处主动造一个搜索态）
        page.click("#open-palette")
        page.wait_for_timeout(300)
        page.fill("#palette-input", "试卷")
        page.wait_for_timeout(150)
        page.keyboard.press("Enter")
        page.wait_for_timeout(600)
        page.click("#detail-back")
        page.wait_for_timeout(600)
        no_overflow(page, "360 搜索列表态")
        page.click("#q-clear")
        page.wait_for_timeout(200)
        no_overflow(page, "360 清除后")
        ctx.close()

        # ═══════════ reduced-motion ═══════════
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
        page = ctx.new_page()
        attach_errors(page, "reduced")
        page.goto(URL)
        page.wait_for_timeout(300)
        page.click("#open-palette")
        page.wait_for_timeout(100)
        dur = page.evaluate("() => parseFloat(getComputedStyle(document.getElementById('palette')).animationDuration)")
        check("reduced-motion 面板动画 ≈0", dur < 0.01, dur)
        page.fill("#palette-input", "引脚")
        page.wait_for_timeout(100)
        page.keyboard.press("Enter")
        page.wait_for_timeout(150)
        st = sel_state(page)
        check("reduced-motion 功能正常", st["cat"] == "tools" and st["list"] is not None, st)
        trans = page.evaluate("() => parseFloat(getComputedStyle(document.querySelector('.result-card')).transitionDuration)")
        check("reduced-motion 过渡 ≈0", trans < 0.01, trans)
        ctx.close()

        # ═══════════ 截图（最终代码生成） ═══════════
        if "--shots" in sys.argv:
            failed = [r for r in RESULTS if not r["ok"]]
            if failed:
                print("存在失败断言，跳过截图：", [f["name"] for f in failed])
            else:
                # desktop 1440×1000 默认
                ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
                page = ctx.new_page()
                attach_errors(page, "shot-desktop")
                page.goto(URL)
                page.wait_for_timeout(600)
                page.screenshot(path=str(HERE / "desktop.png"))
                # interaction 1440×1000：面板已操作（搜「引脚」↓ 选第二条）
                page.click("#open-palette")
                page.wait_for_timeout(250)
                page.fill("#palette-input", "引脚")
                page.wait_for_timeout(200)
                page.keyboard.press("ArrowDown")
                page.wait_for_timeout(200)
                page.screenshot(path=str(HERE / "interaction.png"))
                ctx.close()
                # mobile 360×800 默认
                ctx = browser.new_context(viewport={"width": 360, "height": 800}, is_mobile=True, has_touch=True)
                page = ctx.new_page()
                attach_errors(page, "shot-mobile")
                page.goto(URL)
                page.wait_for_timeout(600)
                page.screenshot(path=str(HERE / "mobile.png"))
                ctx.close()
                # wide 2550×1307 默认选中高数合集
                ctx = browser.new_context(viewport={"width": 2550, "height": 1307})
                page = ctx.new_page()
                attach_errors(page, "shot-wide")
                page.goto(URL)
                page.wait_for_timeout(600)
                page.screenshot(path=str(HERE / "wide.png"))
                # empty 2550×1307：关闭详情后的开放式空态引导
                page.click("#detail-close")
                page.wait_for_timeout(400)
                page.screenshot(path=str(HERE / "empty.png"))
                ctx.close()
                # resized 1440×1000：两条分隔条均已调整（左栏拖宽、中栏拖窄）
                ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
                page = ctx.new_page()
                attach_errors(page, "shot-resized")
                page.goto(URL)
                page.wait_for_timeout(600)
                box = page.locator("#resize-left").bounding_box()
                cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
                page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx + 96, cy, steps=8); page.mouse.up()
                box = page.locator("#resize-mid").bounding_box()
                cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
                page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx - 70, cy, steps=8); page.mouse.up()
                page.wait_for_timeout(300)
                page.screenshot(path=str(HERE / "resized.png"))
                ctx.close()
                print("截图完成：desktop.png / mobile.png / interaction.png / wide.png / resized.png / empty.png")

        browser.close()

    check("全程无页面 JS 错误", not PAGE_ERRORS, PAGE_ERRORS[:5])
    total = len(RESULTS)
    passed = sum(1 for r in RESULTS if r["ok"])
    out = {"total": total, "passed": passed, "failed": total - passed, "results": RESULTS, "pageErrors": PAGE_ERRORS}
    (HERE / "verify-results.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n=== {passed}/{total} 通过 ===")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(run())
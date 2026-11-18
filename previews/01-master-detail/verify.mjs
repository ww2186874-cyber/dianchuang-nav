'use strict';
/* 方案 A 原型 · file:// 真机浏览器验证（CDP 直连本机 Chromium，无外部依赖）
 * 用法: node verify.mjs [--shots]  （--shots 时输出三张交付截图）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).replaceAll('/', path.sep);
const DIR = decodeURIComponent(HERE);
const CHROME = process.env.CHROME || 'C:\\Users\\12187\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe';
const PORT = 9377;
const PAGE_URL = 'file:///' + path.join(DIR, 'index.html').replaceAll('\\', '/').split('/').map(encodeURIComponent).join('/').replace(/^file:\/\/\//, '');
const FILE_URL = new URL('file://' + path.join(DIR, 'index.html').replaceAll('\\', '/')).href;
const SHOTS = process.argv.includes('--shots');
const results = [];
let failures = 0;
function log(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  if (!ok) failures++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)));
}
const delay = (ms) => new Promise(r => setTimeout(r, ms));
function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
async function waitFor(fn, timeout = 12000, interval = 120) {
  const start = Date.now();
  for (;;) {
    let v;
    try { v = await fn(); } catch { v = null; }
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('waitFor timeout');
    await delay(interval);
  }
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      } else if (msg.method) this.events.push(msg);
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 20000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('page eval failed: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async key(key, code, vk) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  }
  async type(text) {
    for (const ch of text) await this.send('Input.dispatchKeyEvent', { type: 'char', text: ch, unmodifiedText: ch });
  }
  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  async clickSel(sel) {
    const box = await this.eval(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!box) throw new Error('click target missing: ' + sel);
    await this.click(box.x, box.y);
  }
  async shot(file, width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await delay(450);
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(DIR, file), Buffer.from(r.data, 'base64'));
    console.log('SHOT ' + file);
  }
}

const profile = path.join(process.env.TEMP, 'dc-proto-a-profile');
fs.rmSync(profile, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--allow-file-access-from-files', '--window-size=1440,1000', '--hide-scrollbars=false',
  'about:blank'
], { stdio: 'ignore' });

let ws, cdp;
try {
  const target = await waitFor(async () => {
    const list = await httpJson(`http://127.0.0.1:${PORT}/json/list`);
    return list.find(t => t.type === 'page');
  });
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  const pageErrors = [];
  const origOnMessage = ws.onmessage;
  ws.onmessage = (ev) => {
    origOnMessage(ev);
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.exceptionThrown') pageErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') pageErrors.push(msg.params.entry.text);
  };

  async function goto(width, height, url = FILE_URL) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    /* 强制整页重载：同 URL 带不同 hash 的导航是同文档跳转，不会重新执行脚本 */
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await delay(120);
    await cdp.send('Page.navigate', { url });
    await waitFor(() => cdp.eval(`document.readyState === 'complete' && !!document.querySelector('.result-card, .empty-block')`));
    await delay(350);
  }
  const overflow = () => cdp.eval(`(() => { const d = document.documentElement; return { sw: d.scrollWidth, cw: d.clientWidth, bw: document.body.scrollWidth, over: [...document.querySelectorAll('body *')].filter(n => { const r = n.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(n).position !== 'fixed' && !n.closest('.sidebar') && !n.closest('.detail'); }).slice(0, 5).map(n => n.className && String(n.className).slice(0, 40)) }; })()`);
  const active = () => cdp.eval(`(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) + '|' + (a.dataset ? (a.dataset.item || a.dataset.cat || '') : '') : 'none'; })()`);

  /* ═══ 桌面 1440×1000 ═══ */
  await goto(1440, 1000);
  log('desktop: 页面加载且渲染条目', await cdp.eval(`document.querySelectorAll('.result-card').length`) === 4);
  log('desktop: 默认选中第一条且详情可见', await cdp.eval(`(() => { const sel = document.querySelector('.result-card.is-selected'); const h2 = document.querySelector('#detail-body h2'); return !!sel && !!h2 && sel.dataset.item === 'jiben-gaoshu-y1' && h2.textContent.includes('技本高数'); })()`));
  log('desktop: 左栏分类数=7(全部+6)', await cdp.eval(`document.querySelectorAll('.cat-btn').length`) === 7);
  log('desktop: 目录列出当前结果', await cdp.eval(`document.querySelectorAll('.outline-btn').length`) === 4);
  let ov = await overflow();
  log('desktop: 无横向溢出', ov.sw <= ov.cw && ov.bw <= ov.cw, ov);
  log('desktop: 三栏各自独立滚动容器', await cdp.eval(`[document.querySelector('.sidebar-scroll'), document.querySelector('.results-scroll'), document.querySelector('.detail-scroll')].every(n => ['auto','scroll'].includes(getComputedStyle(n).overflowY))`));
  log('desktop: 默认无搜索时状态行隐藏', await cdp.eval(`getComputedStyle(document.getElementById('search-status')).display === 'none'`));
  log('desktop: 详情含 4 个资料包下载链接', await cdp.eval(`document.querySelectorAll('#detail-body .pack-entry').length`) === 4);
  log('desktop: 资料包链接为真实 GitHub Release', await cdp.eval(`document.querySelector('#detail-body .pack-entry').href.startsWith('https://github.com/ww2186874-cyber/dianchuang-nav/releases/download/')`));
  log('desktop: 查看全部资料包外链存在', await cdp.eval(`!!document.querySelector('#detail-body .dc-all')`));

  if (SHOTS) { await cdp.shot('desktop.png', 1440, 1000); }

  /* 分类切换：空分类 */
  await cdp.clickSel('.cat-btn[data-cat="hardware"]');
  await delay(150);
  log('desktop: 空分类有合理状态', await cdp.eval(`(() => { const e = document.querySelector('#results-empty .empty-block'); const ph = document.querySelector('.detail-placeholder'); return !!e && e.textContent.includes('还没有板子') && !!ph && document.querySelectorAll('.result-card').length === 0; })()`));
  log('desktop: 空分类 hash 正确', await cdp.eval(`location.hash`) === '#/c/hardware');
  await cdp.clickSel('#results-empty .btn-solid');
  await delay(150);
  log('desktop: 空态按钮回到全部', await cdp.eval(`document.querySelectorAll('.result-card').length`) === 4);

  /* 分类切换：器件手册 → 详情联动 */
  await cdp.clickSel('.cat-btn[data-cat="docs"]');
  await delay(150);
  log('desktop: 分类过滤生效', await cdp.eval(`document.querySelectorAll('.result-card').length`) === 1);
  await cdp.clickSel('.result-card');
  await delay(150);
  log('desktop: 点选后详情=DAP 调试器', await cdp.eval(`document.querySelector('#detail-body h2').textContent.includes('塔克无线DAP')`));
  log('desktop: DAP 主下载+购买链接', await cdp.eval(`(() => { const a = [...document.querySelectorAll('#detail-body .entry')]; return a.some(x => x.classList.contains('is-primary') && x.href.includes('tacker-dap-v3.0.zip')) && a.some(x => x.href.includes('taobao.com')); })()`));
  log('desktop: 步进器 1/1 且两端禁用', await cdp.eval(`document.getElementById('prev-item').disabled && document.getElementById('next-item').disabled && document.getElementById('step-pos').textContent.trim() === '1 / 1'`));

  /* 搜索：全局关键词 */
  await cdp.clickSel('.cat-btn[data-cat=""]');
  await delay(120);
  await cdp.clickSel('#q');
  await cdp.type('引脚');
  await delay(250);
  log('desktop: 搜索「引脚」命中 2 条', await cdp.eval(`document.querySelectorAll('.result-card').length`) === 2);
  log('desktop: 搜索高亮 mark 存在', await cdp.eval(`document.querySelectorAll('.result-card mark').length`) > 0);
  log('desktop: 搜索状态行 role=status', await cdp.eval(`!document.getElementById('search-status').hidden && document.getElementById('search-status').getAttribute('role') === 'status'`));
  log('desktop: 搜索后详情取消选中(原选中不匹配)', await cdp.eval(`!document.querySelector('.result-card.is-selected') && !!document.querySelector('.detail-placeholder')`));
  /* 键盘：↓ 进列表，再 ↓ 切换 */
  await cdp.key('ArrowDown', 'ArrowDown', 40);
  await delay(150);
  log('desktop: 搜索框 ↓ 焦点进入第一张卡片', (await active()).includes('result-card'));
  log('desktop: 焦点进入卡片即联动详情', await cdp.eval(`document.querySelector('#detail-body h2') && document.querySelector('#detail-body h2').textContent.includes('引脚规划器')`));
  await cdp.key('ArrowDown', 'ArrowDown', 40);
  await delay(150);
  const secondSel = await cdp.eval(`document.querySelector('.result-card.is-selected').dataset.item`);
  log('desktop: ↓ 切换到第二条且详情跟随', secondSel === 'mspm0-pin-planner' && await cdp.eval(`document.querySelector('#detail-body h2').textContent.includes('MSPM0')`));
  log('desktop: 键盘切换后焦点仍在列表卡片', (await active()).includes('result-card'));
  log('desktop: 工具相对链接解析回正式站 tools/', await cdp.eval(`(() => { const a = document.querySelector('#detail-body .entry.is-primary'); return a && a.href.endsWith('/tools/mspm0-pin-planner.html') && a.target === '_blank'; })()`));
  /* Esc 清除搜索（焦点在卡片上） */
  await cdp.key('Escape', 'Escape', 27);
  await delay(150);
  log('desktop: Esc 清除搜索恢复 4 条', await cdp.eval(`document.getElementById('q').value === '' && document.querySelectorAll('.result-card').length === 4`));
  /* 无结果搜索 */
  await cdp.clickSel('#q');
  await cdp.type('zzz不存在');
  await delay(250);
  log('desktop: 无结果空态+清除按钮', await cdp.eval(`document.querySelectorAll('.result-card').length === 0 && !!document.querySelector('#results-empty .btn-solid') && !!document.querySelector('.detail-placeholder')`));
  ov = await overflow();
  log('desktop: 无结果态无横向溢出', ov.sw <= ov.cw, ov);
  await cdp.clickSel('#results-empty .btn-solid');
  await delay(150);
  log('desktop: 清除按钮恢复列表', await cdp.eval(`document.querySelectorAll('.result-card').length === 4 && document.getElementById('q').value === ''`));

  /* 连续比较：依次点选 4 条，列表滚动位置保持 */
  await cdp.eval(`document.querySelector('.results-scroll').scrollTop = 0`);
  for (const id of ['jiben-gaoshu-y1', 'tacker-dap-v3', 'esp32s3-pin-planner', 'mspm0-pin-planner']) {
    await cdp.clickSel(`.result-card[data-item="${id}"]`);
    await delay(120);
    const ok = await cdp.eval(`document.querySelector('.result-card.is-selected').dataset.item === ${JSON.stringify(id)} && !!document.querySelector('#detail-body h2')`);
    log('desktop: 点选 ' + id + ' 详情联动', ok);
  }
  log('desktop: 连续切换后列表未被重建(滚动容器同一节点)', await cdp.eval(`document.querySelector('.results-scroll').scrollTop >= 0`));
  /* 上一条/下一条按钮 */
  await cdp.clickSel('#prev-item');
  await delay(120);
  log('desktop: 上一条按钮切到 ESP32-S3', await cdp.eval(`document.querySelector('.result-card.is-selected').dataset.item === 'esp32s3-pin-planner'`));
  await cdp.clickSel('#next-item');
  await delay(120);
  log('desktop: 下一条按钮切回 MSPM0', await cdp.eval(`document.querySelector('.result-card.is-selected').dataset.item === 'mspm0-pin-planner'`));
  /* 目录(outline)点选 + 合集子包 */
  await cdp.clickSel('.outline-btn[data-item="jiben-gaoshu-y1"]');
  await delay(150);
  log('desktop: 目录点选联动详情与列表', await cdp.eval(`document.querySelector('.result-card.is-selected').dataset.item === 'jiben-gaoshu-y1' && document.querySelector('#detail-body h2').textContent.includes('技本高数')`));
  log('desktop: 选中合集后目录展开 4 个子包', await cdp.eval(`document.querySelectorAll('.outline-pack a').length`) === 4);
  /* Esc 关闭详情 → 焦点归还卡片 */
  await cdp.key('Escape', 'Escape', 27);
  await delay(150);
  log('desktop: Esc 关闭详情回到占位态', await cdp.eval(`!document.querySelector('.result-card.is-selected') && !!document.querySelector('.detail-placeholder')`));
  log('desktop: Esc 后焦点归还列表卡片', (await active()).includes('result-card'));
  /* 关闭按钮路径 */
  await cdp.clickSel('.result-card[data-item="tacker-dap-v3"]');
  await delay(120);
  await cdp.clickSel('#detail-close');
  await delay(120);
  log('desktop: 关闭按钮同样清选中并归还焦点', await cdp.eval(`!document.querySelector('.result-card.is-selected')`) && (await active()).includes('result-card'));
  /* "/" 快捷键 */
  await cdp.key('/', 'Slash', 191);
  await delay(120);
  log('desktop: / 聚焦搜索框', await cdp.eval(`document.activeElement === document.getElementById('q')`));
  await cdp.key('Escape', 'Escape', 27);
  /* hash 直达 + 后退 */
  await cdp.eval(`location.hash = '#/i/tacker-dap-v3'`);
  await delay(250);
  log('desktop: hash 直达条目(跨分类)同步左栏', await cdp.eval(`document.querySelector('.cat-btn.is-active').dataset.cat === 'docs' && document.querySelector('#detail-body h2').textContent.includes('塔克')`));
  await cdp.eval(`history.back()`);
  await delay(300);
  log('desktop: 浏览器后退恢复上一状态', await cdp.eval(`!!document.querySelector('.result-card')`));
  /* 复制链接按钮（file:// 下走 execCommand 降级） */
  await cdp.clickSel('.result-card[data-item="jiben-gaoshu-y1"]');
  await delay(150);
  await cdp.clickSel('.copy-link');
  await delay(250);
  log('desktop: 复制链接按钮有成功/失败反馈', await cdp.eval(`(() => { const b = document.querySelector('.copy-link'); return b.textContent === '已复制' || b.textContent.includes('复制失败'); })()`));

  /* interaction.png：全部资料 + 搜索「规划」+ 键盘选中第二条 MSPM0。
     左栏目录同步过滤并标记当前项、中栏高亮 + 搜索状态行、右栏详情与步进器 2/2，
     一屏同时体现分类目录、搜索、条目切换三条联动路径。 */
  if (SHOTS) {
    await goto(1440, 1000);
    await cdp.clickSel('#q');
    await cdp.type('规划');
    await delay(250);
    await cdp.key('ArrowDown', 'ArrowDown', 40);
    await delay(150);
    await cdp.key('ArrowDown', 'ArrowDown', 40);
    await delay(400);
    await cdp.shot('interaction.png', 1440, 1000);
  }

  /* ═══ 手机 360×800 ═══ */
  await goto(360, 800);
  log('mobile: 默认列表页可见、详情层收起', await cdp.eval(`(() => { const d = document.getElementById('detail'); const cs = getComputedStyle(d); return cs.visibility === 'hidden' && !document.body.classList.contains('detail-open') && document.querySelectorAll('.result-card').length === 4; })()`));
  ov = await overflow();
  log('mobile: 无横向溢出', ov.sw <= ov.cw && ov.bw <= ov.cw, ov);
  log('mobile: 抽屉默认隐藏且 aria-hidden', await cdp.eval(`getComputedStyle(document.getElementById('sidebar')).visibility === 'hidden' && document.getElementById('sidebar').getAttribute('aria-hidden') === 'true'`));
  log('mobile: 详情层 inert(不可聚焦)', await cdp.eval(`document.getElementById('detail').hasAttribute('inert')`));
  if (SHOTS) { await cdp.shot('mobile.png', 360, 800); }

  /* 打开抽屉 */
  await cdp.clickSel('#nav-toggle');
  await delay(400);
  log('mobile: 抽屉打开为 dialog+aria-modal', await cdp.eval(`document.body.classList.contains('drawer-open') && document.getElementById('sidebar').getAttribute('role') === 'dialog' && document.getElementById('sidebar').getAttribute('aria-modal') === 'true'`));
  log('mobile: 抽屉打开后焦点在分类按钮', (await active()).includes('cat-btn'));
  log('mobile: 底层列表与顶栏 inert', await cdp.eval(`document.getElementById('results').hasAttribute('inert') && document.querySelector('.topbar').hasAttribute('inert')`));
  ov = await overflow();
  log('mobile: 抽屉打开无横向溢出', ov.sw <= ov.cw, ov);
  /* 抽屉里选空分类 */
  await cdp.clickSel('.cat-btn[data-cat="learning"]');
  await delay(450);
  log('mobile: 抽屉选分类后自动收起并显示空态', await cdp.eval(`!document.body.classList.contains('drawer-open') && !!document.querySelector('#results-empty .empty-block')`));
  log('mobile: 分类切换后焦点在列表标题', (await active()).includes('results-title'));
  /* Esc 关抽屉 + 焦点归还 */
  await cdp.clickSel('#nav-toggle');
  await delay(400);
  await cdp.key('Escape', 'Escape', 27);
  await delay(400);
  log('mobile: Esc 关闭抽屉', await cdp.eval(`!document.body.classList.contains('drawer-open')`));
  log('mobile: Esc 后焦点归还汉堡按钮', (await active()).includes('nav-toggle'));
  /* 遮罩点击关闭（点右侧露出区域，避开抽屉面板） */
  await cdp.clickSel('#nav-toggle');
  await delay(400);
  await cdp.click(345, 500);
  await delay(400);
  log('mobile: 点遮罩关闭抽屉', await cdp.eval(`!document.body.classList.contains('drawer-open')`));
  /* 回全部，点条目 → 详情页 */
  await cdp.clickSel('#nav-toggle');
  await delay(400);
  await cdp.clickSel('.cat-btn[data-cat=""]');
  await delay(450);
  await cdp.clickSel('.result-card[data-item="jiben-gaoshu-y1"]');
  await delay(500);
  log('mobile: 点条目打开全屏详情页', await cdp.eval(`document.body.classList.contains('detail-open') && getComputedStyle(document.getElementById('detail')).visibility === 'visible'`));
  log('mobile: 详情焦点移入标题', await cdp.eval(`document.activeElement && document.activeElement.id === 'detail-title'`));
  log('mobile: 底层列表 inert', await cdp.eval(`document.getElementById('results').hasAttribute('inert')`));
  ov = await overflow();
  log('mobile: 详情页无横向溢出', ov.sw <= ov.cw, ov);
  log('mobile: 详情内 4 个资料包可下载', await cdp.eval(`document.querySelectorAll('#detail-body .pack-entry').length`) === 4);
  /* 详情页内滚动 */
  const scrolled = await cdp.eval(`(() => { const s = document.getElementById('detail-scroll'); s.scrollTop = 200; return s.scrollTop > 0; })()`);
  log('mobile: 详情页内部可滚动', scrolled);
  await cdp.eval(`document.getElementById('detail-scroll').scrollTop = 0`);
  /* 步进按钮连续比较 */
  await cdp.clickSel('#next-item');
  await delay(250);
  log('mobile: 详情页内下一条切换', await cdp.eval(`document.querySelector('#detail-body h2').textContent.includes('塔克')`));
  /* 返回列表 */
  await cdp.clickSel('#detail-back');
  await delay(500);
  log('mobile: 返回列表收起详情层', await cdp.eval(`!document.body.classList.contains('detail-open')`));
  log('mobile: 返回后焦点归还原列表卡片', (await active()).includes('result-card'));
  /* Esc 关闭详情 */
  await cdp.clickSel('.result-card[data-item="esp32s3-pin-planner"]');
  await delay(500);
  await cdp.key('Escape', 'Escape', 27);
  await delay(500);
  log('mobile: Esc 关闭详情页', await cdp.eval(`!document.body.classList.contains('detail-open')`));
  log('mobile: Esc 后焦点归还触发卡片', (await active()).includes('result-card'));
  /* 手机搜索 */
  await cdp.clickSel('#q');
  await cdp.type('试卷');
  await delay(300);
  log('mobile: 搜索命中 1 条(合集子包字段)', await cdp.eval(`document.querySelectorAll('.result-card').length`) === 1);
  ov = await overflow();
  log('mobile: 搜索态无横向溢出', ov.sw <= ov.cw, ov);
  await cdp.clickSel('#q-clear');
  await delay(200);
  log('mobile: 清除按钮恢复列表', await cdp.eval(`document.querySelectorAll('.result-card').length === 4`));
  /* 抽屉内 Tab 循环 */
  await cdp.clickSel('#nav-toggle');
  await delay(400);
  const trapOk = await cdp.eval(`(() => { const sb = document.getElementById('sidebar'); const f = [...sb.querySelectorAll('button, a[href]')].filter(n => n.offsetParent !== null); f[f.length - 1].focus(); return document.activeElement === f[f.length - 1]; })()`);
  await cdp.key('Tab', 'Tab', 9);
  await delay(150);
  log('mobile: 抽屉 Tab 焦点循环回首项', trapOk && await cdp.eval(`(() => { const sb = document.getElementById('sidebar'); const f = [...sb.querySelectorAll('button, a[href]')].filter(n => n.offsetParent !== null); return document.activeElement === f[0]; })()`));
  await cdp.key('Escape', 'Escape', 27);
  await delay(400);

  /* reduced-motion */
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await goto(360, 800);
  await cdp.clickSel('.result-card[data-item="tacker-dap-v3"]');
  await delay(120);
  const rm = await cdp.eval(`(() => { const d = document.getElementById('detail'); return { dur: getComputedStyle(d).transitionDuration, open: document.body.classList.contains('detail-open') }; })()`);
  log('reduced-motion: 过渡时长趋零且功能正常', parseFloat(rm.dur) < 0.01 && rm.open, rm);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: '' }] });

  /* 资源加载检查：品牌资产 200/file 成功 */
  await goto(1440, 1000);
  const assetsOk = await cdp.eval(`(() => { const img = document.querySelector('.brand img'); return img.complete && img.naturalWidth > 0; })()`);
  log('assets: logo 加载成功', assetsOk);
  const fontOk = await cdp.eval(`document.fonts.check('16px "DC Title"', '电创导航')`);
  log('assets: 标题字体可用', fontOk);
  log('无页面 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 5));

  fs.writeFileSync(path.join(DIR, 'verify-results.json'), JSON.stringify({ fileUrl: FILE_URL, results, pageErrors }, null, 2));
  console.log('\n==== ' + (failures ? failures + ' FAILURES' : 'ALL PASS') + ' (' + results.length + ' checks) ====');
} catch (err) {
  console.error('VERIFY ERROR:', err);
  failures++;
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
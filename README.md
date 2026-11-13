# 电创导航

大学生电子创新协会的静态入口站：实验室常用的板子、程序、课程与资料入口。

大家都可以打开网站查看。想补充资料，发给维护人或提交到仓库即可。出于版权原因，不收盗版或破解软件。

线上地址：<https://ww2186874-cyber.github.io/dianchuang-nav/>

## 页面跳转

站点是静态的，用地址栏哈希来换页，刷新和直接打开 `index.html` 都可以：

- `#/` 首页（全部分类）
- `#/c/<分类id>` 分类页，例如 `#/c/docs`
- `#/i/<条目id>` 详情页，例如 `#/i/tacker-dap-v3`

分类 id：`hardware`（硬件 / 板子）、`software`（软件 / 代码）、`learning`（学习路线）、`heritage`（课业传承）、`docs`（器件手册）、`tools`（在线工具）。

每个分类可以写 `icon` 字段，用于首页入口卡片的线框图标，取值：`chip`（硬件 / 板子）、`code`（软件 / 代码）、`book`（学习路线）、`archive`（课业传承）、`manual`（器件手册）、`tool`（在线工具）。图标是内联在 `index.html` 里的 SVG sprite（`#i-chip` 等），来源与许可见 `assets/ICON-LICENSE.txt`。缺了 `icon` 或对不上 sprite 时，首页改用分类名的首字字块，页面仍可正常显示。

「硬件 / 板子」放实验室自己画的板子及配套程序，外购工具和厂家手册放到「器件手册」。平时上课、由学长学姐整理传下来的资料放到「课业传承」。实验室做的、可在网页里直接打开使用的小工具放到「在线工具」；体积较小的完整网页可以放在 `tools/` 目录，条目的 `url` 填相对路径，例如 `tools/mspm0-pin-planner.html`，不要把这类工具的源码提交进本仓库。

## 本地预览

用浏览器直接打开 `index.html` 即可（数据写在 `data/links.js` 里，不依赖本地服务器）。

## 新增一条

1. 打开 `data/links.js`。
2. 在对应分类的 `items` 数组里追加一个对象，例如：

```js
{
  id: "example-board",
  title: "示例板卡",
  summary: "实验室已验证，附配套程序说明。",
  url: "https://example.com/your-real-link",
  source: "实验室自绘",
  tags: ["已验证"],
  updated: "2026-11-12",
  links: [{ label: "源码", url: "https://example.com/repo" }]
}
```

3. 小文件放到本仓库的 GitHub Releases，条目的 `url` 填 Release 资产下载地址，不要把大文件提交进网页仓库。大的官方课程直接挂厂家官方云盘地址。
   可选写上 `size`（文件大小，如 `"8.2 MB"`、`"620 KB"`，按 1024 进制，MB 保留一位小数、KB 取整）和 `format`（如 `"zip"`，不写时按链接后缀识别）。写了之后，详情页下载行显示「8.2 MB · zip」，否则显示网站名。
4. 同一类型的多份资料可以收成一个合集：条目可以不写 `url`，改写 `pack` 数组，例如 `{ title: "大一上期末", url: "https://..." }`。分类页只出现这一条合集，点进去再选要下载哪一份。条目同时有 `url` 和 `pack` 时，详情页「选择下载」和「相关入口」都会显示。资料包的 `id` 也能直接打开，例如 `#/i/<资料包id>` 会进入该合集并定位到那一份。资料包同样可以写 `size`、`format`。合集再写一个 `allUrl`（一般是 Release 页地址），详情页会多出「查看全部资料包」入口。
5. 网盘链接如有提取码或有效期，加上 `extractCode` 和 `expiry`，会显示在详情页。
6. 保存后刷新页面。没有 `title`，或既没有 `url` 也不是合集的条目不会出现。详情页和合集需要稳定且不重复的 `id`。
7. 发布到 GitHub Pages 后，把这次修改提交到仓库，网站会跟着更新。

站点标题、说明可以在同一文件顶部的 `site` 里改。

## 改样式、脚本或数据

`index.html` 里引用的 `style.css`、`links.js`、`app.js` 共用同一个版本号参数（当前 `?v=25`）。改过这三个文件中的任意一个，就把这个数字加一，免得浏览器继续用旧缓存。`og:image` 和 `twitter:image` 的地址也要用同一个 `?v=N`（例如 `assets/og-image.png?v=25`），换图后社交平台才更可能刷新缓存。GitHub Pages 自带的缓存是 10 分钟。

如果改了站点名称或副标题，请同时重新生成 `assets/og-image.png`：深色背景 `#0c0a0a`，协会标志、标题、组织名和副标题，尺寸 1200×630。

## 发布到 GitHub Pages

用 GitHub 仓库的 Pages 功能，选择主分支的根目录（或 `/docs`，需与仓库设置一致）。网站地址：

https://ww2186874-cyber.github.io/dianchuang-nav/

改完提交后稍等一会儿即可在网上看到。若浏览器还是旧页面，用 Ctrl+F5 强制刷新。

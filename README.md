# 电创导航

实验室与电子创新协会的静态入口站。页面上只放审核通过的条目，不收录未核对的链接，也不放盗版或破解工具。

大家都可以打开网站查看。要增加内容时，把资料发给维护人，审核通过后再写入数据文件。

线上地址：<https://ww2186874-cyber.github.io/dianchuang-nav/>

## 页面跳转

站点是静态的，用地址栏哈希来换页，刷新和直接打开 `index.html` 都可以：

- `#/` 首页（全部分类）
- `#/c/<分类id>` 分类页，例如 `#/c/docs`
- `#/i/<条目id>` 详情页，例如 `#/i/tacker-dap-v3`

分类 id：`hardware`（硬件 / 板子）、`software`（软件 / 代码）、`learning`（学习路线）、`heritage`（课业传承）、`docs`（器件手册）。

「硬件 / 板子」只放实验室自己画的板子及配套程序，外购工具和厂家手册放到「器件手册」。平时上课、由学长学姐整理传下来的资料放到「课业传承」。

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

3. 小文件放到本仓库的 GitHub Releases，条目的 `url` 填 Release 资产下载地址，不要把大文件提交进网页仓库。大的官方课程只挂厂家官方云盘地址。
4. 同一类型的多份资料可以收成一个合集：条目可以不写 `url`，改写 `pack` 数组，例如 `{ title: "大一上期末", url: "https://..." }`。分类页只出现这一条合集，点进去再选要下载哪一份。
5. 网盘链接如有提取码或有效期，加上 `extractCode` 和 `expiry`，会显示在详情页。
6. 保存后刷新页面。没有 `title`，或既没有 `url` 也不是合集的条目不会出现。详情页和合集需要稳定且不重复的 `id`。
7. 发布到 GitHub Pages 后，把这次修改提交到仓库，网站会跟着更新。

站点标题、说明可以在同一文件顶部的 `site` 里改。

## 发布到 GitHub Pages

文件准备好、维护人确认后再发布。用 GitHub 仓库的 Pages 功能，选择主分支的根目录（或 `/docs`，需与仓库设置一致）。网站地址：

https://ww2186874-cyber.github.io/dianchuang-nav/

改完提交后稍等一会儿即可在网上看到。若浏览器还是旧页面，用 Ctrl+F5 强制刷新。

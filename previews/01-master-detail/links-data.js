/* 电创导航 · 条目数据
 * 新增一条：在对应分类的 items 数组里追加一个对象，保存后刷新页面即可。
 * 没有 title，或既没有 url 也不是合集的条目，不会出现在页面上。
 * 详情页靠 id 跳转，请给每条一个稳定、不重复的 id。
 *
 * 分类说明：
 *   hardware  硬件 / 板子 —— 只放实验室自己画的板子及配套程序，不放外购工具。
 *   software  软件 / 代码
 *   learning  学习路线
 *   heritage  课业传承 —— 学长学姐整理并传下来的上课资料。
 *   docs      器件手册 —— 器件与外购工具手册、赛事与实验室资料。
 *   tools      在线工具 —— 实验室做的、可在网页里直接打开使用的小工具。
 *
 * 分类 icon（首页入口卡片用，取值对应 index.html 里的 SVG sprite）：
 *   chip 硬件 / 板子，code 软件 / 代码，book 学习路线，
 *   archive 课业传承，manual 器件手册，tool 在线工具。
 *   缺省或对不上 sprite 时，首页改用分类名首字字块，不阻塞渲染。
 *
 * 字段说明：
 *   id          稳定编号（必填，详情页地址是 #/i/<id>）
 *   title       名称（必填）
 *   summary     一两句说明
 *   url         主链接（普通条目必填；合集可以不写，改用 pack；两者都有时详情页都会显示）
 *   urlLabel    主链接在详情页上的名称，默认「资料下载」
 *   pack        合集里的资料包：[{ title, url, summary, id, size, format }]，详情页列出供选择下载；
 *               资料包的 id 也可直接访问，如 #/i/<资料包id> 会打开合集并定位到该包
 *   allUrl      合集的「查看全部资料包」入口，一般填 Release 页地址，如
 *               https://github.com/<用户>/<仓库>/releases/tag/<标签>
 *   size        文件大小（可选，条目主链接和资料包都能写），如 "8.2 MB"、"620 KB"，
 *               按 1024 进制：MB 保留一位小数，KB 取整
 *   format      文件格式（可选），如 "zip"；不写时按链接后缀自动识别。
 *               有大小或格式时，下载行显示「8.2 MB · zip」，否则显示网站名
 *   source      来源，如 “实验室自绘” 或 “厂家手册”
 *   extractCode 网盘提取码（如有）
 *   expiry      链接有效期，如 “永久” 或 “2026-12-31”
 *   tags        标签，如 ["STM32", "已验证"]
 *   updated     最近更新日期，建议 YYYY-MM-DD
 *   links       详情页的额外入口，如购买、视频教程：
 *               [{ "label": "购买链接", "url": "https://...", "note": "淘宝" }]
 *
 * 条目示例（复制到 items 里，换成真实链接）：
 * {
 *   "id": "example-board",
 *   "title": "示例板卡",
 *   "summary": "实验室已验证，附配套程序说明。",
 *   "url": "https://example.com/your-real-link",
 *   "source": "实验室自绘",
 *   "tags": ["已验证"],
 *   "updated": "2026-11-12",
 *   "links": [{ "label": "源码", "url": "https://example.com/repo" }]
 * }
 */
window.NAV_DATA = {
  site: {
    title: "电创导航",
    org: "大学生电子创新协会",
    subtitle: "实验室常用的板子、程序、课程与资料入口",
    notice: "想补充资料，发给维护人或提交到仓库即可。"
  },
  categories: [
    {
      id: "hardware",
      icon: "chip",
      name: "硬件 / 板子",
      description: "实验室自己画的板子及配套程序；外购工具和厂家手册放在「器件手册」。",
      empty: "还没有板子，欢迎补充。",
      items: []
    },
    {
      id: "software",
      icon: "code",
      name: "软件 / 代码",
      description: "自己写的、可复用的代码与工程。",
      empty: "还没有代码，欢迎补充。",
      items: []
    },
    {
      id: "learning",
      icon: "book",
      name: "学习路线",
      description: "大家实际看过、觉得靠谱的课与路线。",
      empty: "还没有课程或路线，欢迎补充。",
      items: []
    },
    {
      id: "heritage",
      icon: "archive",
      name: "课业传承",
      description: "学长学姐整理并传下来的上课资料，方便后来的同学接着用、接着补。",
      empty: "还没有资料，欢迎补充。",
      items: [
        {
          id: "jiben-gaoshu-y1",
          title: "技本高数 · 大一历年真题",
          summary: "学长学姐整理的大一期中、期末历年试卷，按考试阶段分成 4 个资料包。",
          source: "学长学姐整理",
          tags: ["高数", "技本", "试卷"],
          updated: "2026-11-13",
          allUrl: "https://github.com/ww2186874-cyber/dianchuang-nav/releases/tag/jiben-gaoshu-y1",
          pack: [
            {
              id: "jiben-gaoshu-d1-shang-qizhong",
              title: "大一上期中",
              summary: "2018–2019 学年高数 B 期中试卷 1 份。",
              url: "https://github.com/ww2186874-cyber/dianchuang-nav/releases/download/jiben-gaoshu-y1/jiben-gaoshu-d1-shang-qizhong.zip",
              size: "52 KB"
            },
            {
              id: "jiben-gaoshu-d1-shang-qimo",
              title: "大一上期末",
              summary: "2014–2015 至 2025–2026 学年期末试卷 12 份（缺 2021–2022、2022–2023）。",
              url: "https://github.com/ww2186874-cyber/dianchuang-nav/releases/download/jiben-gaoshu-y1/jiben-gaoshu-d1-shang-qimo.zip",
              size: "7.8 MB"
            },
            {
              id: "jiben-gaoshu-d1-xia-qizhong",
              title: "大一下期中",
              summary: "2016–2017 至 2018–2019 三个学年的期中试卷 3 份。",
              url: "https://github.com/ww2186874-cyber/dianchuang-nav/releases/download/jiben-gaoshu-y1/jiben-gaoshu-d1-xia-qizhong.zip",
              size: "620 KB"
            },
            {
              id: "jiben-gaoshu-d1-xia-qimo",
              title: "大一下期末",
              summary: "2016–2017 至 2025–2026 学年期末、补考与考点等 14 份（含 3 张试卷照片；缺 2018–2019、2022–2023）。",
              url: "https://github.com/ww2186874-cyber/dianchuang-nav/releases/download/jiben-gaoshu-y1/jiben-gaoshu-d1-xia-qimo.zip",
              size: "8.3 MB"
            }
          ]
        }
      ]
    },
    {
      id: "docs",
      icon: "manual",
      name: "器件手册",
      description: "器件与外购工具的手册，以及赛事与实验室资料。",
      empty: "还没有手册，欢迎补充。",
      items: [
        {
          id: "tacker-dap-v3",
          title: "塔克无线DAP调试器资料 V3.0",
          summary: "厂家手册、产品宣传册，以及 Win7 串口驱动（Win8、10、11 无需安装）。",
          url: "https://github.com/ww2186874-cyber/dianchuang-nav/releases/download/tacker-dap-v3/tacker-dap-v3.0.zip",
          size: "4.5 MB",
          source: "厂家资料",
          tags: ["DAP", "调试器"],
          updated: "2026-11-13",
          links: [
            {
              label: "购买链接",
              url: "https://item.taobao.com/item.htm?id=745548099223",
              note: "淘宝"
            }
          ]
        }
      ]
    },
    {
      id: "tools",
      icon: "tool",
      name: "在线工具",
      description: "实验室做的、可在网页里直接打开使用的小工具。",
      empty: "还没有工具，欢迎补充。",
      items: [
        {
          id: "mspm0-pin-planner",
          title: "MSPM0 引脚规划器",
          summary: "用于 MSPM0G3519、MSPM0G3507 的引脚规划，支持多种封装和天猛星 PM-64 板卡模板，可在网页里直接打开使用。",
          url: "tools/mspm0-pin-planner.html",
          urlLabel: "打开工具",
          format: "网页版",
          source: "电子创新协会",
          tags: ["MSPM0", "引脚规划"],
          updated: "2026-11-13"
        },
        {
          id: "esp32s3-pin-planner",
          title: "ESP32-S3 引脚规划器",
          summary: "嘉立创 ESP32-S3R8N8 开发板专用，按这块板的排针、板载占用和芯片约束做引脚规划，可在网页里直接打开使用。",
          url: "tools/esp32s3-pin-planner.html",
          urlLabel: "打开工具",
          format: "网页版",
          source: "电子创新协会",
          tags: ["ESP32-S3", "嘉立创"],
          updated: "2026-11-13"
        }
      ]
    }
  ]
};
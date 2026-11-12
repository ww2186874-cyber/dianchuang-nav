/* 电创导航 · 条目数据
 * 新增一条：在对应分类的 items 数组里追加一个对象，保存后刷新页面即可。
 * 没有 title 和 url 的条目不会出现在页面上，避免放出未核对的链接。
 * 详情页靠 id 跳转，请给每条一个稳定、不重复的 id。
 * 不要收录盗版、破解或未验证的资料。
 *
 * 分类说明：
 *   hardware  硬件 / 板子 —— 只放实验室自己画的板子及配套程序，不放外购工具。
 *   software  软件 / 代码
 *   learning  学习路线
 *   docs      资料 —— 手册、外购工具资料、赛事与实验室资料。
 *
 * 字段说明：
 *   id          稳定编号（必填，详情页地址是 #/i/<id>）
 *   title       名称（必填）
 *   summary     一两句说明
 *   url         主链接（必填，没有则不展示；详情页「资料下载」用这个地址）
 *   urlLabel    主链接在详情页上的名称，默认「资料下载」
 *   source      来源，如 “实验室自绘” 或 “厂家手册”
 *   extractCode 网盘提取码（如有）
 *   expiry      链接有效期，如 “永久” 或 “2026-12-31”
 *   tags        标签，如 ["STM32", "已验证"]
 *   updated     最近更新日期，建议 YYYY-MM-DD
 *   links       详情页的额外入口，如购买、视频教程：
 *               [{ "label": "购买链接", "url": "https://...", "note": "淘宝" }]
 *
 * 条目示例（复制到 items 里，换成真实核对过的链接后再保留）：
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
    subtitle: "实验室验证过的板子、程序、课程与资料入口",
    notice: "内容经审核后收录。欢迎把要补充的资料发给维护人，通过后再加到站上。"
  },
  categories: [
    {
      id: "hardware",
      name: "硬件 / 板子",
      description: "只收录实验室自己画的板子及配套程序，外购工具和厂家手册请放到「资料」。",
      empty: "还没有已审核的自研板条目。实验室自己画的板子和配套程序，审核通过后会放在这里。",
      items: []
    },
    {
      id: "software",
      name: "软件 / 代码",
      description: "自己写的、可复用的代码与工程",
      empty: "还没有已审核的代码条目。可复用的工程和程序，审核通过后会放在这里。",
      items: []
    },
    {
      id: "learning",
      name: "学习路线",
      description: "大家实际看过、觉得靠谱的课与路线",
      empty: "还没有已审核的课程或路线。大家真正用过、觉得靠谱的课，审核通过后会放在这里。",
      items: []
    },
    {
      id: "docs",
      name: "资料",
      description: "手册、外购工具资料，以及核对过的赛事与实验室资料。",
      empty: "还没有已审核的资料。手册、外购工具和实验室资料核对后会放在这里。",
      items: [
        {
          id: "tacker-dap-v3",
          title: "塔克无线DAP调试器资料 V3.0",
          summary: "厂家手册、产品宣传册，以及 Win7 串口驱动（Win8、10、11 无需安装）。",
          url: "https://github.com/ww2186874-cyber/dianchuang-nav/releases/download/tacker-dap-v3/tacker-dap-v3.0.zip",
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
    }
  ]
};

/* 电创导航 · 条目数据
 * 新增一条：在对应分类的 items 数组里追加一个对象，保存后刷新页面即可。
 * 没有 url 的条目不会出现在页面上，避免放出未核对的链接。
 * 不要收录盗版、破解或未验证的资料。
 *
 * 字段说明：
 *   title    名称（必填）
 *   summary  一两句说明（必填）
 *   url      主链接（必填，没有则不展示）
 *   tags     标签，如 ["STM32", "已验证"]
 *   updated  最近更新日期，建议 YYYY-MM-DD
 *   links    可选的额外按钮，如 [{ "label": "源码", "url": "https://..." }]
 *
 * 条目示例（复制到 items 里，换成真实核对过的链接后再保留）：
 * {
 *   "title": "示例板卡",
 *   "summary": "实验室已验证，附配套程序说明。",
 *   "url": "https://example.com/your-real-link",
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
      description: "实验室验证过的板子与配套程序",
      empty: "还没有已审核的板子条目。验证过的板子和配套程序，审核通过后会放在这里。",
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
      description: "赛事与实验室资料，经核对后再收录",
      empty: "还没有已审核的资料。赛事和实验室资料核对后会放在这里。",
      items: []
    }
  ]
};

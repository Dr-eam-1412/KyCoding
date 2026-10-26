# 02 · 来源与数学

优先已连接且能力足够的专用工具，否则通过Computer Use读取已登录普通HTTPS作业页或用户完整本地题目。原型入口为 `https://smartestu.cn/assignment`。核对当前课程、作业、题数、截止时间和已有答案，同名任务用平台身份消歧，不取首项猜测。

连接器仅支持普通作业页。普通作业内题名带“测验”不等同进入考试模块，按当前页面和任务判断。

AX会遗漏公式。先读DOM snapshot，歧义处读题干HTML/KaTeX；现场确认选择器，只截题干，不混入答案照片/评语/账户内容。示意：

~~~javascript
await tab.playwright.domSnapshot();
await tab.playwright.locator('[id^="question-card-"]').evaluateAll(cards =>
  cards.map(c => ({
    id: c.id, title: c.querySelector('h4')?.textContent,
    html: c.querySelector('.space-y-0')?.innerHTML
  }))
);
~~~

深层结果若被截成[MaxDepth]，在页面函数内JSON.stringify后返回字符串。大DOM分批读，不打印base64或长SVG路径。实际API以当前工具文档为准。

| 易错项 | 核对 |
|---|---|
| 分式 | 按KaTeX/视觉位置判分子分母，不按textContent顺序。 |
| 指数 | 本次 `i^{sqrt(2)}` 曾退化成i2，不能误当i²；检查根号、上下标。 |
| 共轭 | 区分指数整体和指数中的共轭，逐层核对横线覆盖。 |
| 行列式 | DOM可能按列输出，核对视觉行列。 |
| 积分 | 路径、方向、上下限、被积式和微分；没有积分不额外加题。 |

先形成题目清单和解答核对稿，再生图。检查小问完整、稳定题号、条件、定义域、端点、主值/全部值、逐点可导/邻域解析。缺条件须注明并给正确的条件结论，不能静默补题。换解法要另推，不能为求不同改数值。按可读性分页，不固定6页或14题。

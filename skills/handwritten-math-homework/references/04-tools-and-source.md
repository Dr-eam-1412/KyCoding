# 04 · 插件、源码与用法

## 工具分类

| 工具 | 类型/用途 | 本技能包含什么 |
|---|---|---|
| imagegen | 内置生图/编辑工具，非必须安装的Chrome扩展 | 生图规范和提示词骨架；原始入口指南见[imagegen-guide.md](tool-guides/imagegen-guide.md)。云端实现源码不可见，不伪称已打包。 |
| ChatGPT Chrome / Computer Use | 浏览器和macOS UI控制 | 按当前文档操作DOM、文件选择器、截图；服务端/扩展完整源码未取得。 |
| X Schedule 作业连接器 0.3.0 | 本地Chrome Manifest V3扩展，普通作业固定适配器 | **完整6文件源码快照**及SHA-256，见[快照信息](source-provenance.json)。 |
| Record & Replay | 用户另有新演示时录制事件流并提炼技能 | [可访问的原始技能入口](tool-guides/record-and-replay-guide.md)；录制服务运行时源码不可见。本技能基于本对话执行记录创建。 |

先发现当前可用工具，专用能力足够时优先使用；缺失时说明并用已支持的替代流程。不能把技能文件、浏览器扩展与云端工具混称为同一个插件，也不要求为了生图安装不相关工具。

## 已打包的连接器源码

相对技能目录 `assets/x-schedule-connector/`：

| 文件 | 职责 |
|---|---|
| manifest.json | 扩展名、0.3.0版本、公开身份key、scripting及站点/本地桥权限。key是公开扩展身份材料，不是API secret。 |
| background.js | 点击工具栏图标后打开连接页。 |
| connect.html | 启停、状态、下一次上传许可checkbox。 |
| connect.js | 本地桥轮询、固定命令路由、独立任务页、上传上下文、提交/回执逻辑。 |
| page-command.js | catalog/open_assignment/open_question/capture_question等固定读取适配器和题干DOM树。 |
| upload-command.js | 验证全部目标后选择图片、核对预览；另含最终提交与恢复分支。 |

源码快照未改动原项目。原路径仅为来源定位，不是通用安装位置：
`$X_SCHEDULE_ROOT/browser-connector`。
另有homework-app/browser-connector副本，不能未经核对混用。完整应用的services/homework.mjs提供createBridge/collectHomework，旧HOMEWORK_PROMPT是只读取题组件的局部提示词，不是整套任务的权限来源，也无需调用旧DeepSeek工具循环。

## 安装与连接

先检查是否已有合适扩展；不要自动安装或扩大持久权限。若确需安装，由用户/经当前工具批准的操作在Chrome扩展管理中加载技能里的assets/x-schedule-connector目录。源码存在不代表扩展已安装或能在当前版本网站运行。

正常使用：用户登录数你最灵普通作业页面 → 启动本地只读桥 → 点击已安装连接器工具栏图标 → 保持连接页打开。连接器必须运行在扩展上下文，直接打开本地connect.html无效。

~~~sh
node /ABS/SKILL/scripts/readonly-bridge.mjs
~~~

脚本从所附manifest公开key推导扩展身份，监听127.0.0.1:17321，验证Host、Origin和Bearer；token只在连接器会话中传递，不打印日志。测试可用临时端口，真实连接器端口固定。

向进程stdin逐行写JSON（示例值必须替换为现场读取的身份）：

~~~json
{"command":"catalog","args":{"course":"完整课程名"}}
{"command":"open_assignment","args":{"id":"完整课程名::作业标题"}}
{"command":"open_question","args":{"id":"question-card-现场ID"}}
{"command":"capture_question","args":{"id":"question-card-现场ID"},"saveTo":"/ABS/WORK/question.json"}
~~~

实际ID来自catalog/题目清单，不编造。saveTo必须是绝对新文件路径，父目录已存在，避免覆盖。完整题干树可另存工作文件；桥不解释数学、不发AI请求。

## 协议与限制

| 路径 | 方法/用途 |
|---|---|
| /session | POST，正确扩展Origin获取短期会话token |
| /command | GET + Bearer，轮询当前一个待处理命令 |
| /result | POST + Bearer，返回同一id的result/error |

`readonly-bridge.mjs`只接受catalog、open_assignment、open_question、capture_question、inspect_upload、pending_assignments。**上传与最终提交全部拒绝**，无启用提交的开关。

原扩展源码的upload_files能力仅经静态检查；如要沿用原应用上传，必须现场预检、绑定完整课程/作业/题号/图片并获得本次授权，再满足连接页许可。不提供盲目从本技能调用源码提交分支的用法。稳定替代为[原生文件选择器](05-browser-staging.md)。

浏览器若禁止chrome-extension协议，不换原生UI、raw CDP或其他入口绕过同一拦截。可以请用户自行打开扩展，或使用授权的普通HTTPS作业页作为独立替代。不伪造Origin、权限、source_kind或simulated标志通过检查。

## 照片映射脚本

photo_manifest.py只读文件并写本地清单，无网站副作用。计划示意：

~~~json
{
  "course":"现场完整课程",
  "assignment":"现场作业",
  "mode":"generate_only",
  "style_reference_count":3,
  "expected_question_count":1,
  "questions":[
    {"platform_ref":"question-card-123","title":"现场原题号","photo_paths":["/ABS/WORK/page-01.png"],"source_kind":"ai_generated"}
  ]
}
~~~

示例ID不是实际任务授权。一个照片可对应多道题；每行保留独立题号，不能因为共享照片少选题。清单必须记录AI生成来源，不伪称真实笔迹实拍。用户只要图片时，计划/核对JSON放工作目录，不添加进图片交付文件夹。


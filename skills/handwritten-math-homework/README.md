# 手写数学作业工作流

用于 Codex 的可复用技能：读取指定普通作业，核对数学表达式和解答，并从用户提供的 **3–4张清晰手写照片**（至少一张含公式）生成手写风格图片。

## 安装与调用

把本目录复制到 `$CODEX_HOME/skills/handwritten-math-homework`；未设置 `CODEX_HOME` 时使用 `~/.codex/skills/handwritten-math-homework`。在 Codex 中调用：

```text
使用 $handwritten-math-homework，按我提供的3–4张含数学符号的手写照片，制作这次普通作业；只生成图片，不上传。
```

新风格先生成一页样张供确认，再批量制作。仅生图、上传到网页预览、最终提交分别处理；本技能把最终提交按钮留给用户。

## 目录

| 位置 | 内容 |
|---|---|
| [SKILL.md](SKILL.md) | 技能入口、输入要求、执行顺序与授权边界 |
| [references/](references/) | 六类流程文档、工具指南、来源与验证记录 |
| [assets/x-schedule-connector/](assets/x-schedule-connector/) | X Schedule Chrome连接器完整6文件源码快照 |
| [scripts/](scripts/) | 只读连接桥、图片映射核对与本地测试 |
| [agents/openai.yaml](agents/openai.yaml) | Codex界面名称与默认调用示例 |

## 工具与用法

- 生图使用当前环境的内置 imagegen；笔迹变化、数学符号、纸张和光影细节见[生图说明](references/03-image-generation.md)。
- [连接器说明](references/04-tools-and-source.md)区分插件、源码、协议与已验证能力。源码快照存在不代表Chrome已经安装或网站联调完成。
- [网页操作说明](references/05-browser-staging.md)包含系统文件选择器、逐题核对和人工提交交接。
- 如需录制新的用户演示，按[证据与录制说明](references/06-evidence.md)使用 Record & Replay。

## 本地验证

要求 Node.js 与 Python 3；以下测试使用本地模拟连接和临时文件，不连接作业网站，不上传或提交：

```sh
node --test scripts/readonly-bridge.test.mjs
python3 scripts/photo_manifest.test.py
```

当前记录为4项连接桥测试与5项图片映射测试通过。技能结构检查、源码快照哈希及验证范围见[验证记录](references/validation.json)。

目录内不包含个人参考照片、作业答案、账号凭据或本机用户名绝对路径。图像模型和录制服务的不可访问运行实现不在此源码包中。


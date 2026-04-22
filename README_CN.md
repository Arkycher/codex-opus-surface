# codex-opus-surface

[English](README.md) | 中文

这是一个 **仅面向 OMX 用户** 的 Codex 风格增强包，用来把“分析类回答”的表层风格推近到更像 Opus 的呈现方式。

这个包会做三件事：

1. 往 `~/.codex/AGENTS.md` 注入一小段常驻 baseline
2. 往 `~/.codex/prompts/opus-surface.md` 安装一层更强的分析类风格面
3. 包装现有的 OMX native hook，让 `UserPromptSubmit` 和 `Stop` 在保留 OMX 行为的同时叠加 Opus 风格

## 适用范围

这个仓库是 **OMX-only**。

默认前提是你已经有：

- Codex Desktop 或 Codex CLI
- `oh-my-codex`
- 可工作的 OMX native hook 链路

这个仓库 **不尝试支持** 没有 OMX 的裸 Codex 环境。

## 会改哪些东西

- `~/.codex/AGENTS.md`
- `~/.codex/prompts/opus-surface.md`
- `~/.codex/hooks/opus-surface-hook.js`
- `~/.codex/hooks.json`
- `~/.codex/style-regressions/cases.md`

## 安装

```bash
git clone git@github.com:Arkycher/codex-opus-surface.git
cd codex-opus-surface
bash install.sh
```

安装脚本会：

- 从你当前的 `~/.codex/hooks.json` 里探测现有 OMX native hook 路径
- 把 baseline 追加进 `~/.codex/AGENTS.md`
- 把 prompt 和 wrapper hook 安装进 `~/.codex`
- 把 `UserPromptSubmit` 和 `Stop` 改接到 wrapper hook

安装后需要 **重开一个 Codex 会话** 才会生效。

## 卸载

```bash
bash install.sh --uninstall
```

卸载时会移除：

- `~/.codex/AGENTS.md` 里的 `opus-surface` 基线块
- 已安装的 prompt / hook / example 文件
- `~/.codex/hooks.json` 里 wrapper hook 的接线

同时会把 `UserPromptSubmit` 和 `Stop` 恢复到安装前探测到的 OMX native hook 路径。

## 仓库结构

```text
baseline.md
prompt.md
hooks/opus-surface-hook.js
examples/cases.md
install.sh
```

## 验证建议

安装后建议做一轮 smoke check：

1. 打开一个新的 Codex 会话
2. 让它做一次仓库分析或架构对比
3. 确认回答里有：
   - 提前落结论
   - 紧凑的矩阵/表格
   - 分组判断
   - 硬落点句
4. 确认回答里没有：
   - 英文内部旁白泄露
   - 条件式 follow-up 菜单
   - 装饰性 filler

## 说明

- 当前 trigger heuristic 是有意保持简单的关键词启发式。
- 这个包优化的是分析 / review / postmortem 风格，不是通用闲聊风格。
- 它更接近 Opus 4.7，而不是 Opus 4.6。

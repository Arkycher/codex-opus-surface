# codex-opus-surface

English | [中文](README_CN.md)

An [OMX](https://github.com/Yeachan-Heo/oh-my-codex)-only Codex surface pack that pushes analysis-style answers closer to an Opus-like presentation style.

This package does three things:

1. Installs a small baseline block into `~/.codex/AGENTS.md`
2. Installs a stronger analysis-only prompt surface into `~/.codex/prompts/opus-surface.md`
3. Wraps the existing [OMX](https://github.com/Yeachan-Heo/oh-my-codex) native hook so `UserPromptSubmit` and `Stop` keep OMX behavior and also apply the Opus-style surface

## Scope

This repo is intentionally **[OMX-only](https://github.com/Yeachan-Heo/oh-my-codex)**.

It assumes the user already has:

- Codex Desktop or Codex CLI
- [`oh-my-codex`](https://github.com/Yeachan-Heo/oh-my-codex) installed
- a working [OMX](https://github.com/Yeachan-Heo/oh-my-codex) native hook chain

This repo does **not** try to support bare Codex without [OMX](https://github.com/Yeachan-Heo/oh-my-codex).

## What it changes

- `~/.codex/AGENTS.md`
- `~/.codex/prompts/opus-surface.md`
- `~/.codex/hooks/opus-surface-hook.js`
- `~/.codex/hooks.json`
- `~/.codex/style-regressions/cases.md`

## Install

```bash
git clone git@github.com:Arkycher/codex-opus-surface.git
cd codex-opus-surface
bash install.sh
```

The installer:

- detects the existing [OMX](https://github.com/Yeachan-Heo/oh-my-codex) native hook path from your current `~/.codex/hooks.json`
- appends a baseline block into `~/.codex/AGENTS.md`
- installs the prompt and wrapper hook into `~/.codex`
- rewires `UserPromptSubmit` and `Stop` to the wrapper hook

Start a new Codex session after install.

## Uninstall

```bash
bash install.sh --uninstall
```

This removes:

- the `opus-surface` block from `~/.codex/AGENTS.md`
- the installed prompt/hook/example files
- the wrapper hook wiring from `~/.codex/hooks.json`

The installer restores `UserPromptSubmit` and `Stop` to the original [OMX](https://github.com/Yeachan-Heo/oh-my-codex) native hook path it detected during install.

## Layout

```text
baseline.md
prompt.md
hooks/opus-surface-hook.js
examples/cases.md
install.sh
```

## Verification

Recommended smoke checks after install:

1. Open a new Codex session.
2. Ask for a repository analysis or architecture comparison.
3. Confirm the answer has:
   - an early verdict
   - a compact matrix
   - grouped judgments
   - a hard landing sentence
4. Confirm it does **not** have:
   - English internal monologue leaks
   - conditional follow-up menus
   - decorative filler

## Notes

- The trigger heuristic is intentionally simple and keyword-based.
- This package optimizes for analysis/review/postmortem style, not generic chat style.
- It is designed to feel closer to Opus 4.7 than Opus 4.6.

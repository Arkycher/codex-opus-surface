#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
AGENTS_FILE="$CODEX_HOME/AGENTS.md"
HOOKS_FILE="$CODEX_HOME/hooks.json"
PROMPTS_DIR="$CODEX_HOME/prompts"
HOOKS_DIR="$CODEX_HOME/hooks"
REG_DIR="$CODEX_HOME/style-regressions"
BASELINE_SRC="$SCRIPT_DIR/baseline.md"
PROMPT_SRC="$SCRIPT_DIR/prompt.md"
HOOK_SRC="$SCRIPT_DIR/hooks/opus-surface-hook.js"
CASES_SRC="$SCRIPT_DIR/examples/cases.md"
INSTALLED_PROMPT="$PROMPTS_DIR/opus-surface.md"
INSTALLED_HOOK="$HOOKS_DIR/opus-surface-hook.js"
INSTALLED_CONFIG="$HOOKS_DIR/opus-surface.config.json"
INSTALLED_CASES="$REG_DIR/cases.md"
REGRESSION_LOG="$REG_DIR/violations.jsonl"
MARKER_BEGIN="<!-- opus-surface baseline BEGIN -->"
MARKER_END="<!-- opus-surface baseline END -->"

find_omx_native_hook() {
  if [ ! -f "$HOOKS_FILE" ]; then
    return 1
  fi
  python3 - "$HOOKS_FILE" <<'PY'
import json, re, sys
path = sys.argv[1]
data = json.load(open(path))
hooks = data.get("hooks", {})
for event in ("SessionStart", "PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop"):
    for entry in hooks.get(event, []):
        for hook in entry.get("hooks", []):
            cmd = hook.get("command", "")
            m = re.search(r'node\s+"?([^"]*codex-native-hook\.js)"?', cmd)
            if m:
                print(m.group(1))
                raise SystemExit(0)
raise SystemExit(1)
PY
}

install_baseline() {
  mkdir -p "$CODEX_HOME"
  touch "$AGENTS_FILE"
  python3 - "$AGENTS_FILE" "$BASELINE_SRC" "$MARKER_BEGIN" "$MARKER_END" <<'PY'
from pathlib import Path
import sys
agents_path = Path(sys.argv[1])
baseline_path = Path(sys.argv[2])
marker_begin = sys.argv[3]
marker_end = sys.argv[4]
agents = agents_path.read_text() if agents_path.exists() else ""
baseline = baseline_path.read_text().strip()
start = agents.find(marker_begin)
end = agents.find(marker_end)
if start != -1 and end != -1 and end > start:
    end += len(marker_end)
    replacement = baseline
    updated = agents[:start].rstrip() + "\n\n" + replacement + "\n" + agents[end:].lstrip("\n")
else:
    updated = agents.rstrip() + ("\n\n" if agents.strip() else "") + baseline + "\n"
agents_path.write_text(updated)
PY
}

install_files() {
  mkdir -p "$PROMPTS_DIR" "$HOOKS_DIR" "$REG_DIR"
  cp "$PROMPT_SRC" "$INSTALLED_PROMPT"
  cp "$HOOK_SRC" "$INSTALLED_HOOK"
  cp "$CASES_SRC" "$INSTALLED_CASES"
  touch "$REGRESSION_LOG"
}

write_config() {
  local native_hook_path="$1"
  python3 - "$INSTALLED_CONFIG" "$native_hook_path" "$INSTALLED_PROMPT" "$REGRESSION_LOG" <<'PY'
import json, sys
path, native, prompt, reglog = sys.argv[1:]
with open(path, "w") as f:
    json.dump({
        "nativeHookPath": native,
        "promptPath": prompt,
        "regressionLogPath": reglog,
    }, f, indent=2)
    f.write("\n")
PY
}

patch_hooks() {
  local native_hook_path="$1"
  python3 - "$HOOKS_FILE" "$INSTALLED_HOOK" "$native_hook_path" <<'PY'
import json, sys
hooks_path, installed_hook, native_hook = sys.argv[1:]
with open(hooks_path) as f:
    data = json.load(f)
hooks = data.setdefault("hooks", {})

def ensure_wrapper(event, status_message=None, timeout=None):
    wrapper = {
        "type": "command",
        "command": f'node "{installed_hook}"',
    }
    if status_message:
        wrapper["statusMessage"] = status_message
    if timeout is not None:
        wrapper["timeout"] = timeout
    hooks[event] = [{"hooks": [wrapper]}]

ensure_wrapper("UserPromptSubmit", "Applying OMX prompt routing + opus surface")
ensure_wrapper("Stop", timeout=30)

with open(hooks_path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
}

uninstall_all() {
  if [ -f "$AGENTS_FILE" ]; then
    python3 - "$AGENTS_FILE" "$MARKER_BEGIN" "$MARKER_END" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
begin = sys.argv[2]
end = sys.argv[3]
text = path.read_text()
start = text.find(begin)
finish = text.find(end)
if start != -1 and finish != -1 and finish > start:
    finish += len(end)
    updated = (text[:start].rstrip() + "\n" + text[finish:].lstrip("\n")).rstrip() + "\n"
    path.write_text(updated)
PY
  fi

  local native_hook_path=""
  if [ -f "$INSTALLED_CONFIG" ]; then
    native_hook_path="$(python3 - "$INSTALLED_CONFIG" <<'PY'
import json, sys
print(json.load(open(sys.argv[1])).get("nativeHookPath", ""))
PY
)"
  fi

  if [ -n "$native_hook_path" ] && [ -f "$HOOKS_FILE" ]; then
    python3 - "$HOOKS_FILE" "$native_hook_path" <<'PY'
import json, sys
hooks_path, native_hook = sys.argv[1:]
with open(hooks_path) as f:
    data = json.load(f)
hooks = data.setdefault("hooks", {})
native_cmd = f'node "{native_hook}"'
hooks["UserPromptSubmit"] = [{"hooks": [{"type": "command", "command": native_cmd, "statusMessage": "Applying OMX prompt routing"}]}]
hooks["Stop"] = [{"hooks": [{"type": "command", "command": native_cmd, "timeout": 30}]}]
with open(hooks_path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
  fi

  rm -f "$INSTALLED_PROMPT" "$INSTALLED_HOOK" "$INSTALLED_CONFIG" "$INSTALLED_CASES"
  echo "Uninstalled codex-opus-surface from $CODEX_HOME"
}

main() {
  if [ "${1:-}" = "--uninstall" ]; then
    uninstall_all
    exit 0
  fi

  if [ ! -f "$HOOKS_FILE" ]; then
    echo "Expected existing OMX hooks at $HOOKS_FILE"
    echo "This package is OMX-only. Install oh-my-codex first."
    exit 1
  fi

  local native_hook_path
  native_hook_path="$(find_omx_native_hook)" || {
    echo "Could not detect OMX native hook from $HOOKS_FILE"
    echo "This package is OMX-only. Install oh-my-codex first."
    exit 1
  }

  install_baseline
  install_files
  write_config "$native_hook_path"
  patch_hooks "$native_hook_path"

  echo "Installed codex-opus-surface into $CODEX_HOME"
  echo "Detected OMX native hook: $native_hook_path"
  echo "Start a new Codex session to apply the new surface."
}

main "$@"

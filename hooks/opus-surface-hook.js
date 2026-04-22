#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const CONFIG_PATH = path.join(__dirname, "opus-surface.config.json");

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function readStdinRaw() {
  return fs.readFileSync(0, "utf8");
}

function parseJson(raw) {
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function readPrompt(payload) {
  return safeString(
    payload.prompt || payload.user_prompt || payload.userPrompt || payload.text
  ).trim();
}

function readHookEventName(payload) {
  const name = safeString(
    payload.hook_event_name || payload.hookEventName || payload.event || payload.name
  ).trim();
  return name || "Unknown";
}

function shouldApplyOpusSurface(prompt) {
  const lower = prompt.toLowerCase();
  const analysisSignals = [
    "分析",
    "评估",
    "复盘",
    "审查",
    "方案",
    "对比",
    "compare",
    "analysis",
    "review",
    "diagnose",
    "investigate",
    "postmortem",
    "architecture",
    "plan",
    "设计",
    "原因",
    "why",
  ];
  const simpleSignals = [
    "translate",
    "翻译",
    "what is",
    "几点",
    "time",
    "date",
    "rewrite",
    "润色",
    "一句话",
  ];

  if (!prompt) return false;
  if (simpleSignals.some((signal) => lower.includes(signal))) return false;
  return analysisSignals.some((signal) => lower.includes(signal));
}

function loadOpusSurfacePrompt(promptPath) {
  return fs.readFileSync(promptPath, "utf8").trim();
}

function runOmxHook(raw, nativeHookPath) {
  try {
    const stdout = execFileSync("node", [nativeHookPath], {
      input: raw,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return stdout ? parseJson(stdout) : {};
  } catch (error) {
    return {
      decision: "block",
      reason: `opus-surface wrapper could not run OMX native hook: ${error.message}`,
    };
  }
}

function mergeAdditionalContext(baseOutput, extraContext) {
  if (!extraContext) return baseOutput;
  const next = { ...baseOutput };
  const existing = safeString(
    next.hookSpecificOutput && next.hookSpecificOutput.additionalContext
  ).trim();
  next.hookSpecificOutput = {
    ...(next.hookSpecificOutput || {}),
    hookEventName:
      (next.hookSpecificOutput && next.hookSpecificOutput.hookEventName) ||
      "UserPromptSubmit",
    additionalContext: existing ? `${existing}\n\n${extraContext}` : extraContext,
  };
  return next;
}

function sha1(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function readLastAssistantTextFromTranscript(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return "";
  const raw = fs.readFileSync(transcriptPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  let last = "";

  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (obj.role === "assistant" && obj.message && Array.isArray(obj.message.content)) {
      const text = obj.message.content
        .filter((item) => item && item.type === "text")
        .map((item) => item.text || "")
        .join("\n")
        .trim();
      if (text) last = text;
      continue;
    }

    if (
      obj.type === "response_item" &&
      obj.payload &&
      obj.payload.type === "message" &&
      obj.payload.role === "assistant" &&
      Array.isArray(obj.payload.content)
    ) {
      const text = obj.payload.content
        .filter((item) => item && item.type === "output_text")
        .map((item) => item.text || "")
        .join("\n")
        .trim();
      if (text) last = text;
    }
  }

  return last;
}

function detectViolations(text) {
  const violations = [];
  const checks = [
    {
      type: "english_meta_leak",
      pattern: /\b(The user wants|Let me|I need to|Now I'm|I'm getting a clearer sense)\b/,
    },
    {
      type: "followup_menu",
      pattern: /\bIf you want, I can also\b|如果你愿意，我还可以|如果你要，我可以/u,
    },
    {
      type: "summary_stamp",
      pattern: /\bIn summary\b|Hope this helps|一句话总结|总结一下|简而言之|总而言之/u,
    },
  ];

  for (const check of checks) {
    const match = text.match(check.pattern);
    if (match) {
      violations.push({
        type: check.type,
        snippet: text.slice(Math.max(0, match.index - 40), match.index + 160),
      });
    }
  }

  return violations;
}

function appendViolations(regressionLogPath, payload, assistantText) {
  const transcriptPath = safeString(payload.transcript_path || payload.transcriptPath).trim();
  const prompt = readPrompt(payload);
  const violations = detectViolations(assistantText);
  if (!violations.length) return;

  const baseRecord = {
    ts: new Date().toISOString(),
    hookEventName: readHookEventName(payload),
    transcriptPath: transcriptPath || null,
    promptSig: prompt ? `sha1:${sha1(prompt)}` : null,
  };

  const lines = violations
    .map((violation) =>
      JSON.stringify({
        ...baseRecord,
        type: violation.type,
        snippet: violation.snippet,
      })
    )
    .join("\n");

  fs.appendFileSync(regressionLogPath, `${lines}\n`);
}

function main() {
  const config = readConfig();
  const raw = readStdinRaw();
  const payload = parseJson(raw);
  const hookEventName = readHookEventName(payload);
  const omxOutput = runOmxHook(raw, config.nativeHookPath);

  if (hookEventName === "UserPromptSubmit") {
    const prompt = readPrompt(payload);
    if (shouldApplyOpusSurface(prompt)) {
      const extraContext = loadOpusSurfacePrompt(config.promptPath);
      const merged = mergeAdditionalContext(omxOutput, extraContext);
      process.stdout.write(`${JSON.stringify(merged)}\n`);
      return;
    }
  }

  if (hookEventName === "Stop") {
    const transcriptPath = safeString(payload.transcript_path || payload.transcriptPath).trim();
    const assistantText = readLastAssistantTextFromTranscript(transcriptPath);
    if (assistantText) {
      appendViolations(config.regressionLogPath, payload, assistantText);
    }
  }

  if (Object.keys(omxOutput).length > 0) {
    process.stdout.write(`${JSON.stringify(omxOutput)}\n`);
  }
}

main();

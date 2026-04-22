#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
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

  if (Object.keys(omxOutput).length > 0) {
    process.stdout.write(`${JSON.stringify(omxOutput)}\n`);
  }
}

main();

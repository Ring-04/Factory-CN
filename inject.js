#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const rendererInstaller = require("./renderer");

const HOST = "127.0.0.1";
const PORT = 9229;
const UNTRANSLATED_FILE = "/tmp/factory-cn-untranslated.txt";

function loadTranslations() {
  const dir = path.join(__dirname, "translations");
  const dict = {};
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith(".json")).sort()) {
    Object.assign(dict, JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
  }
  return dict;
}

const translations = loadTranslations();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getJSON(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: HOST, port: PORT, path, timeout: 2500 }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (err) { reject(err); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

function getWS() {
  if (typeof globalThis.WebSocket === "function") return globalThis.WebSocket;
  try { return require("ws"); }
  catch { return null; }
}

function chooseTarget(targets) {
  const pages = (targets || []).filter(x => x && x.type === "page" && x.webSocketDebuggerUrl);
  return (
    pages.find(x => String(x.url || "").includes("/main_window/index.html")) ||
    pages.find(x => String(x.url || "").includes("app.asar/.vite/renderer/main_window")) ||
    pages.find(x => x.title === "Factory") ||
    pages[0] ||
    null
  );
}

async function waitForTarget() {
  let lastTargets = [];
  for (let i = 0; i < 40; i++) {
    try {
      lastTargets = await getJSON("/json/list");
      const target = chooseTarget(lastTargets);
      if (target) return target;
    } catch (_) {}
    await sleep(500);
  }
  console.error("[Factory CN] 等待 20 秒后仍没找到 Factory renderer target。");
  console.error(JSON.stringify(lastTargets, null, 2));
  return null;
}

/*
 * IMPORTANT:
 * Keep the renderer installer as a real JS function and serialize it with toString().
 * This avoids the nested-template escaping regression that broke v0.4.
 */

async function main() {
  const WS = getWS();
  if (!WS) {
    console.error("[Factory CN] 当前 Node 没有 WebSocket 支持，也未找到 ws 包。");
    process.exit(10);
  }

  console.log("[Factory CN] 正在等待 Factory renderer...");
  const target = await waitForTarget();
  if (!target) process.exit(12);

  console.log("[Factory CN] 找到 renderer:");
  console.log("  title: " + (target.title || "(empty)"));
  console.log("  url:   " + (target.url || "(empty)"));

  const source = "(" + rendererInstaller.toString() + ")(" + JSON.stringify(translations) + ");";

  // Parse-check the exact source that will be injected before touching the renderer.
  try {
    new Function(source);
  } catch (err) {
    console.error("[Factory CN] 内部注入脚本语法校验失败：");
    console.error(err && err.stack ? err.stack : err);
    process.exit(20);
  }

  const ws = new WS(target.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();

  function handleMessage(raw) {
    let msg;
    try { msg = JSON.parse(String(raw)); }
    catch (_) { return; }

    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(msg.error.message || "CDP error"));
      else entry.resolve(msg.result);
    }
  }

  if (ws.addEventListener) ws.addEventListener("message", event => handleMessage(event.data));
  else ws.on("message", handleMessage);

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  const opened = new Promise((resolve, reject) => {
    if (ws.addEventListener) {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    } else {
      ws.once("open", resolve);
      ws.once("error", reject);
    }
  });

  await opened;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source });

  const evalResult = await send("Runtime.evaluate", {
    expression: source,
    returnByValue: true
  });

  if (evalResult && evalResult.exceptionDetails) {
    console.error("[Factory CN] renderer 执行注入脚本时抛出异常：");
    console.error(JSON.stringify(evalResult.exceptionDetails, null, 2));
    process.exit(21);
  }

  console.log("[Factory CN] v0.8 已注入。");

  const seen = new Set();
  try { fs.writeFileSync(UNTRANSLATED_FILE, ""); } catch (_) {}

  async function collect() {
    try {
      const result = await send("Runtime.evaluate", {
        expression: "JSON.stringify(window.__factoryCnScanUntranslated ? window.__factoryCnScanUntranslated() : [])",
        returnByValue: true
      });

      const raw = result && result.result && result.result.value;
      if (typeof raw !== "string") return;

      const arr = JSON.parse(raw);
      let changed = false;

      for (const item of arr) {
        if (!seen.has(item)) {
          seen.add(item);
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(
          UNTRANSLATED_FILE,
          Array.from(seen).sort((a, b) => a.localeCompare(b)).join("\n") + "\n",
          "utf8"
        );
      }
    } catch (_) {}
  }

  await collect();
  const collector = setInterval(collect, 2500);

  const heartbeat = setInterval(() => {
    try {
      ws.send(JSON.stringify({
        id: nextId++,
        method: "Runtime.evaluate",
        params: { expression: "1" }
      }));
    } catch (_) {}
  }, 30000);

  function finish() {
    clearInterval(collector);
    clearInterval(heartbeat);
    process.exit(0);
  }

  if (ws.addEventListener) ws.addEventListener("close", finish);
  else ws.on("close", finish);
}

main().catch(err => {
  console.error("[Factory CN] 注入失败：");
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});

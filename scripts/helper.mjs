// Listens for "refresh" requests from the website and publishes fresh data.
//
// The page posts "refresh" to a public ntfy.sh topic (see config.json). This helper,
// running on my PC, replies "ack", re-runs the collectors, commits and pushes data/,
// then replies "done <sha>" so the page can load that commit's files directly.
// The message body is never executed or interpolated; anything but "refresh" is ignored.
//
// Usage: node scripts/helper.mjs

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cfg = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
const topicUrl = `${cfg.relay}/${cfg.topic}`;
const MIN_INTERVAL = 60_000; // reuse a refresh newer than this instead of redoing it

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const publish = (msg) => fetch(topicUrl, { method: "POST", body: msg }).catch((e) => log("publish failed:", e.message));

function run(cmd, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: root, stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit" });
    let out = "";
    if (capture) p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

let running = null;
let last = { sha: null, at: 0 };

function refresh() {
  if (running) return running;
  if (last.sha && Date.now() - last.at < MIN_INTERVAL) return Promise.resolve(last.sha);
  running = (async () => {
    log("refreshing");
    await run(process.execPath, ["scripts/collect.mjs"]);
    await run(process.execPath, ["scripts/limits.mjs"]).catch((e) => log(e.message));
    await run("git", ["add", "data"]);
    const changed = await run("git", ["diff", "--cached", "--quiet"]).then(() => false, () => true);
    if (changed) await run("git", ["commit", "-q", "-m", "Refresh usage data"]);
    await run("git", ["push", "-q"]);
    const sha = (await run("git", ["rev-parse", "HEAD"], { capture: true })).trim();
    last = { sha, at: Date.now() };
    log("done", sha);
    return sha;
  })().finally(() => (running = null));
  return running;
}

async function handle(msg) {
  if (msg.event !== "message" || msg.message !== "refresh") return;
  await publish("ack");
  try {
    await publish(`done ${await refresh()}`);
  } catch (e) {
    log("refresh failed:", e.message);
    await publish("error");
  }
}

async function listen() {
  for (;;) {
    try {
      const res = await fetch(`${topicUrl}/json`);
      if (!res.ok) throw new Error(`subscribe returned ${res.status}`);
      log("listening on", topicUrl);
      const decoder = new TextDecoder();
      let buf = "";
      for await (const chunk of res.body) {
        buf += decoder.decode(chunk, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try { handle(JSON.parse(line)); } catch {}
        }
      }
      log("stream closed, reconnecting");
    } catch (e) {
      log("connection error:", e.message);
    }
    await sleep(5000);
  }
}

listen();

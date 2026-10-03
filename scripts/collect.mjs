// Aggregates Claude Code token usage from local transcripts into data/usage.json.
// Only counts are exported: no prompts, responses, file paths or project names.
//
// Usage: node scripts/collect.mjs [extra transcript dirs...]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sources = [path.join(os.homedir(), ".claude", "projects"), ...process.argv.slice(2)];

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.name.endsWith(".jsonl")) yield p;
  }
}

function family(model) {
  const m = /claude-(opus|sonnet|haiku|fable)/.exec(model);
  return m ? m[1][0].toUpperCase() + m[1].slice(1) : "Other";
}

function prettyModel(model) {
  // claude-opus-5-5 -> Opus 5.5, claude-haiku-4-5-20251001 -> Haiku 4.5
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(model);
  if (!m) return model;
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? "." + m[3] : ""}`;
}

const pad = (n) => String(n).padStart(2, "0");
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// One API response is written as several transcript lines that share a message id;
// the last one carries the final usage, so keep the latest per id.
const messages = new Map();

for (const dir of sources) {
  for (const file of walk(dir)) {
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.includes('"usage"')) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      const msg = o.message;
      if (o.type !== "assistant" || !msg?.usage || !o.timestamp) continue;
      if (!msg.model || msg.model.startsWith("<")) continue;
      const id = msg.id || o.requestId || o.uuid;
      const u = msg.usage;
      const prev = messages.get(id);
      const out = Math.max(u.output_tokens || 0, prev?.out || 0);
      messages.set(id, {
        ts: new Date(o.timestamp),
        model: msg.model,
        session: o.sessionId,
        subagent: !!o.isSidechain,
        in: u.input_tokens || 0,
        cw: u.cache_creation_input_tokens || 0,
        cr: u.cache_read_input_tokens || 0,
        out,
      });
    }
  }
}

const days = new Map();
const models = new Map();
const heat = Array.from({ length: 7 }, () => Array(24).fill(0)); // [weekday Mon=0][hour]
const sessions = new Set();
const totals = { in: 0, cw: 0, cr: 0, out: 0, msgs: 0, subagentMsgs: 0 };
let first = null, last = null;

for (const m of messages.values()) {
  const day = localDay(m.ts);
  if (!days.has(day)) days.set(day, { date: day, sessions: new Set(), byModel: {} });
  const d = days.get(day);
  d.sessions.add(m.session);
  const key = prettyModel(m.model);
  const slot = (d.byModel[key] ||= { in: 0, cw: 0, cr: 0, out: 0, msgs: 0 });
  const mt = models.get(key) || { name: key, family: family(m.model), in: 0, cw: 0, cr: 0, out: 0, msgs: 0 };
  for (const t of [slot, mt, totals]) {
    t.in += m.in; t.cw += m.cw; t.cr += m.cr; t.out += m.out; t.msgs += 1;
  }
  models.set(key, mt);
  if (m.subagent) totals.subagentMsgs++;
  heat[(m.ts.getDay() + 6) % 7][m.ts.getHours()]++;
  sessions.add(m.session);
  if (!first || m.ts < first) first = m.ts;
  if (!last || m.ts > last) last = m.ts;
}

const data = {
  generatedAt: new Date().toISOString(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  range: first ? { first: localDay(first), last: localDay(last) } : null,
  totals: { ...totals, sessions: sessions.size, activeDays: days.size },
  models: [...models.values()].sort((a, b) => b.out - a.out),
  days: [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: d.date, sessions: d.sessions.size, byModel: d.byModel })),
  heat,
};

fs.mkdirSync(path.join(root, "data"), { recursive: true });
fs.writeFileSync(path.join(root, "data", "usage.json"), JSON.stringify(data, null, 1));
console.log(`Wrote ${messages.size} responses across ${days.size} days, ${sessions.size} sessions.`);

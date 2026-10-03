// Refreshes data/limits.json with live plan limits from Anthropic, using the local
// Claude Code login in ~/.claude/.credentials.json. The token is only sent to
// api.anthropic.com and is never written anywhere else. If the token is missing or
// expired, the existing snapshot is left untouched.
//
// Note: /api/oauth/usage is the endpoint the Claude apps use; it is not a documented
// public API and may change.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "data", "limits.json");

let creds;
try {
  creds = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", ".credentials.json"), "utf8")).claudeAiOauth;
} catch {
  creds = null;
}
if (!creds?.accessToken) {
  console.log("Limits skipped: no local Claude Code login found.");
  process.exit(0);
}
if (creds.expiresAt && creds.expiresAt < Date.now() + 60_000) {
  console.log("Limits skipped: local Claude Code login token has expired. Open Claude Code in a terminal to renew it.");
  process.exit(0);
}

const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
  headers: {
    Authorization: `Bearer ${creds.accessToken}`,
    "anthropic-beta": "oauth-2025-04-20",
    "Content-Type": "application/json",
  },
});
if (!res.ok) {
  console.log(`Limits skipped: usage endpoint returned ${res.status}.`);
  process.exit(0);
}
const body = await res.json();

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const labelFor = (key) => {
  if (key === "five_hour") return "5-hour limit";
  if (key === "seven_day") return "Weekly · all models";
  const m = /^seven_day_(.+)$/.exec(key);
  return m ? `Weekly · ${m[1].split("_").map(cap).join(" ")}` : cap(key.replace(/_/g, " "));
};

const windows = Object.entries(body)
  .filter(([, v]) => v && typeof v === "object" && typeof v.utilization === "number")
  .map(([key, v]) => ({ label: labelFor(key), percentUsed: Math.round(v.utilization), resetsAt: v.resets_at }));

if (!windows.length) {
  console.log("Limits skipped: unexpected response shape.");
  process.exit(0);
}

const extra = body.extra_usage;
const limits = {
  capturedAt: new Date().toISOString(),
  plan: creds.subscriptionType ? cap(creds.subscriptionType) : undefined,
  windows,
  extraUsage: extra
    ? { enabled: !!extra.is_enabled, percentUsed: Math.round(extra.utilization ?? 0) }
    : undefined,
};
fs.writeFileSync(out, JSON.stringify(limits, null, 1));
console.log(`Wrote ${windows.length} limit windows.`);

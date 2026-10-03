// Claude Code Stop hook: when the published limits snapshot is stale, asks Claude to
// refresh it (via its get_usage tool and save-limits.mjs) before ending the turn.
// Asks at most once per STALE_AFTER, so sessions without that tool aren't nagged.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STALE_AFTER = 15 * 60_000;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const stateFile = path.join(os.homedir(), ".claude", "claude-usage-limits-hook.json");
const now = Date.now();

let input = {};
try { input = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch {}
if (input.stop_hook_active) process.exit(0); // already continuing because of a Stop hook

const age = (file, key) => {
  try { return now - new Date(JSON.parse(fs.readFileSync(file, "utf8"))[key]).getTime(); } catch { return Infinity; }
};
if (age(path.join(root, "data", "limits.json"), "capturedAt") < STALE_AFTER) process.exit(0);
if (age(stateFile, "lastAsked") < STALE_AFTER) process.exit(0);
fs.writeFileSync(stateFile, JSON.stringify({ lastAsked: new Date(now).toISOString() }));

const script = path.join(root, "scripts", "save-limits.mjs").replace(/\\/g, "/");
console.log(JSON.stringify({
  decision: "block",
  reason:
    "Automatic housekeeping set up by the user (not part of the current task): refresh the Claude usage dashboard's plan-limits snapshot. " +
    "Call mcp__ccd_session_mgmt__get_usage (load it with ToolSearch if it is deferred), then run " +
    `node ${script} '<its "plan" object as one-line JSON>'. ` +
    "If that tool isn't available in this session, skip it. Afterwards reply only with one short line saying the limits snapshot was updated (or skipped); don't repeat your previous answer.",
}));

// Saves the plan-limits object from Claude's get_usage tool to data/limits.json.
// The 5-minute auto-update task then commits and publishes it.
//
// Usage: node scripts/save-limits.mjs '<the "plan" object from get_usage, as JSON>'

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let plan;
try {
  plan = JSON.parse(process.argv[2] || "");
} catch {
  console.error("Expected the get_usage `plan` object as a JSON argument.");
  process.exit(1);
}
if (plan.plan && typeof plan.plan === "object") plan = plan.plan; // accept the whole get_usage result too
if (plan.status !== "ok" || !Array.isArray(plan.windows)) {
  console.log(`Limits not saved: status is ${plan.status || "missing"}.`);
  process.exit(0);
}

const x = plan.extraUsage;
const limits = {
  capturedAt: new Date().toISOString(),
  plan: plan.plan,
  windows: plan.windows.map((w) => ({ label: w.label, percentUsed: w.percentUsed, resetsAt: w.resetsAt })),
  extraUsage: x
    ? { enabled: !!x.enabled, percentUsed: x.percentUsed, spent: x.spent, monthlyLimit: x.monthlyLimit, currency: x.currency }
    : undefined,
};
fs.writeFileSync(path.join(root, "data", "limits.json"), JSON.stringify(limits, null, 1));
console.log(`Saved ${limits.windows.length} limit windows.`);

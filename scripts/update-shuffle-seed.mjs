// scripts/update-shuffle-seed.mjs
import fs from "node:fs/promises";
import path from "node:path";

function hourSeedJST(date = new Date()) {
  // UTC -> JST(+9)
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  const h = String(jst.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${d}-${h}`;
}

const seed = hourSeedJST();
const outPath = path.join(process.cwd(), "public", "data", "shuffle-seed.json");

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify({ hourSeedJST: seed }, null, 2) + "\n", "utf-8");

console.log(`[shuffle-seed] updated: ${seed}`);

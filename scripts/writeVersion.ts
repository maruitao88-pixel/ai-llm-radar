import fs from "node:fs";
import path from "node:path";

const out = path.resolve("public", "version.json");
const data = { buildAt: new Date().toISOString(), v: Date.now() };
fs.writeFileSync(out, JSON.stringify(data));
console.log(`[version] wrote ${out} → v=${data.v}`);

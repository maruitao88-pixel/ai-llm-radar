import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const svgPath = path.resolve("public/og-image.svg");
const pngPath = path.resolve("public/og-image.png");

async function main() {
  const svg = fs.readFileSync(svgPath);
  await sharp(svg).resize(1200, 630).png().toFile(pngPath);
  console.log(`[og] generated ${pngPath}`);
}

main().catch((e) => {
  console.error("[og] failed:", e.message);
  process.exit(0);
});

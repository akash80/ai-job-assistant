/**
 * Generates extension icons from the source logo.
 * Run: node scripts/generate-icons.js
 *
 * Resizes AI_JOB_ASSISTANT_LOGO.png into the required Chrome Extension icon sizes.
 */

const sharp = require("sharp");
const path = require("path");

const SOURCE = path.join(__dirname, "..", "assets", "icons", "logo.png");
const OUT_DIR = path.join(__dirname, "..", "assets", "icons");
const SIZES = [16, 32, 48, 128];

async function generateIcons() {
  for (const size of SIZES) {
    const outPath = path.join(OUT_DIR, `icon-${size}.png`);
    await sharp(SOURCE)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);
    console.log(`Created ${outPath} (${size}x${size})`);
  }
  console.log("Done! All icons generated from AI_JOB_ASSISTANT_LOGO.png");
}

generateIcons().catch((err) => {
  console.error("Error generating icons:", err);
  process.exit(1);
});

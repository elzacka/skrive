import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const iconsDir = path.join(publicDir, 'icons');
const fontsDir = path.join(publicDir, 'fonts');

// Read the font file and encode as base64
const fontPath = path.join(fontsDir, 'JetBrainsMono-Bold.woff2');
const fontBase64 = fs.readFileSync(fontPath).toString('base64');

// Create SVG with embedded font
function createSvg(size) {
  const cornerRadius = Math.round(size * 0.125); // 12.5% corner radius
  const fontSize = Math.round(size * 0.58); // 58% of size for the S

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <style>
      @font-face {
        font-family: 'JetBrains Mono';
        src: url('data:font/woff2;base64,${fontBase64}') format('woff2');
        font-weight: 700;
        font-style: normal;
      }
    </style>
  </defs>
  <rect width="${size}" height="${size}" rx="${cornerRadius}" ry="${cornerRadius}" fill="#0A520D"/>
  <text x="${size/2}" y="${size/2}" font-family="JetBrains Mono" font-size="${fontSize}" font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">S</text>
</svg>`;
}

// Icon sizes to generate
const sizes = [
  { name: 'favicon.png', size: 32, dir: publicDir },
  { name: 'apple-touch-icon.png', size: 180, dir: publicDir },
  { name: 'icon-192x192.png', size: 192, dir: iconsDir },
  { name: 'icon-512x512.png', size: 512, dir: iconsDir },
];

async function generateIcons() {
  for (const { name, size, dir } of sizes) {
    const svg = createSvg(size);
    const outputPath = path.join(dir, name);

    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);

    console.log(`Generated: ${outputPath} (${size}x${size})`);
  }

  // Also save the 512 SVG for reference (without embedded font for smaller size)
  const cleanSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="64" ry="64" fill="#0A520D"/>
  <text x="256" y="256" font-family="JetBrains Mono, monospace" font-size="297" font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">S</text>
</svg>`;
  fs.writeFileSync(path.join(iconsDir, 'icon-512x512.svg'), cleanSvg);
  console.log('Updated: icon-512x512.svg');

  // Update 192 SVG too
  const svg192 = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="24" ry="24" fill="#0A520D"/>
  <text x="96" y="96" font-family="JetBrains Mono, monospace" font-size="111" font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">S</text>
</svg>`;
  fs.writeFileSync(path.join(iconsDir, 'icon-192x192.svg'), svg192);
  console.log('Updated: icon-192x192.svg');
}

generateIcons().catch(console.error);

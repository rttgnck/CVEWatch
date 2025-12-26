#!/usr/bin/env node
/**
 * Generates macOS app icons (.icns) from SVG
 * 
 * Requirements:
 *   brew install librsvg
 *   (provides rsvg-convert for SVG to PNG conversion)
 * 
 * Or use sharp (npm install sharp --save-dev)
 * 
 * Usage:
 *   node scripts/generate-app-icons.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const assetsDir = path.join(__dirname, '..', 'assets');
const iconsetDir = path.join(assetsDir, 'icon.iconset');

// Ensure directories exist
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}
if (!fs.existsSync(iconsetDir)) {
  fs.mkdirSync(iconsetDir, { recursive: true });
}

// App icon SVG - filled version with gradient for macOS app icon style
// This is a more detailed, colorful version suitable for app icons
const createAppIconSVG = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6"/>
      <stop offset="100%" style="stop-color:#1d4ed8"/>
    </linearGradient>
    <!-- Shield gradient -->
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff"/>
      <stop offset="100%" style="stop-color:#e2e8f0"/>
    </linearGradient>
    <!-- Subtle shadow -->
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#1e3a5f" flood-opacity="0.3"/>
    </filter>
  </defs>
  
  <!-- Rounded square background -->
  <rect x="16" y="16" width="480" height="480" rx="96" ry="96" fill="url(#bgGrad)"/>
  
  <!-- Shield shape with shadow -->
  <g filter="url(#shadow)">
    <path d="M256 80 L400 128 L400 240 C400 340 340 410 256 440 C172 410 112 340 112 240 L112 128 Z" 
          fill="url(#shieldGrad)"/>
  </g>
  
  <!-- Checkmark -->
  <path d="M180 260 L230 310 L340 200" 
        fill="none" 
        stroke="#22c55e" 
        stroke-width="32"
        stroke-linecap="round"
        stroke-linejoin="round"/>
</svg>`;

// Required sizes for macOS .icns
const sizes = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

// Write the master SVG
const masterSvg = createAppIconSVG(512);
const svgPath = path.join(assetsDir, 'app-icon.svg');
fs.writeFileSync(svgPath, masterSvg);
console.log('✓ Generated app-icon.svg (512x512 master)');

// Check if we have rsvg-convert (from librsvg)
let hasRsvg = false;
try {
  execSync('which rsvg-convert', { stdio: 'ignore' });
  hasRsvg = true;
} catch (e) {
  hasRsvg = false;
}

// Check if we have sharp
let hasSharp = false;
try {
  require.resolve('sharp');
  hasSharp = true;
} catch (e) {
  hasSharp = false;
}

if (hasRsvg) {
  console.log('\nUsing rsvg-convert to generate PNGs...\n');
  
  for (const { name, size } of sizes) {
    const outputPath = path.join(iconsetDir, name);
    try {
      execSync(`rsvg-convert -w ${size} -h ${size} "${svgPath}" -o "${outputPath}"`, { stdio: 'inherit' });
      console.log(`✓ Generated ${name} (${size}x${size})`);
    } catch (e) {
      console.error(`✗ Failed to generate ${name}:`, e.message);
    }
  }
  
  // Generate .icns using iconutil (macOS only)
  const icnsPath = path.join(assetsDir, 'icon.icns');
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'inherit' });
    console.log(`\n✓ Generated icon.icns`);
  } catch (e) {
    console.error('\n✗ Failed to generate .icns (iconutil failed):', e.message);
    console.log('  Note: iconutil only works on macOS');
  }
  
} else if (hasSharp) {
  console.log('\nUsing sharp to generate PNGs...\n');
  
  const sharp = require('sharp');
  
  (async () => {
    for (const { name, size } of sizes) {
      const outputPath = path.join(iconsetDir, name);
      try {
        await sharp(Buffer.from(masterSvg))
          .resize(size, size)
          .png()
          .toFile(outputPath);
        console.log(`✓ Generated ${name} (${size}x${size})`);
      } catch (e) {
        console.error(`✗ Failed to generate ${name}:`, e.message);
      }
    }
    
    console.log('\n⚠️  To create .icns file, run on macOS:');
    console.log(`   iconutil -c icns "${iconsetDir}" -o "${path.join(assetsDir, 'icon.icns')}"`);
  })();
  
} else {
  console.log('\n⚠️  No SVG converter found!');
  console.log('\nOption 1: Install librsvg (recommended)');
  console.log('   brew install librsvg');
  console.log('\nOption 2: Install sharp');
  console.log('   npm install sharp --save-dev');
  console.log('\nOption 3: Manual conversion');
  console.log('   1. Open assets/app-icon.svg in a design tool');
  console.log('   2. Export PNGs at these sizes: 16, 32, 64, 128, 256, 512, 1024');
  console.log('   3. Name them according to the iconset format');
  console.log('   4. Run: iconutil -c icns assets/icon.iconset -o assets/icon.icns');
  
  // Still write individual SVGs for manual conversion
  console.log('\nGenerating sized SVGs for manual conversion...\n');
  for (const { name, size } of sizes) {
    const svgName = name.replace('.png', '.svg');
    const svgContent = createAppIconSVG(size);
    fs.writeFileSync(path.join(iconsetDir, svgName), svgContent);
    console.log(`✓ Generated ${svgName}`);
  }
}

// Also create a 512x512 PNG for other uses (Windows, Linux, etc.)
const png512Path = path.join(assetsDir, 'icon.png');
if (hasRsvg) {
  try {
    execSync(`rsvg-convert -w 512 -h 512 "${svgPath}" -o "${png512Path}"`, { stdio: 'inherit' });
    console.log(`✓ Generated icon.png (512x512)`);
  } catch (e) {
    console.error('✗ Failed to generate icon.png');
  }
}

console.log('\n✨ Done!');
console.log('\nNext steps:');
console.log('1. Ensure icon.icns exists in assets/');
console.log('2. The electron-builder config will use it automatically');

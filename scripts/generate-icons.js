#!/usr/bin/env node
// Generates tray icons for macOS menu bar
// Creates 18x18 and 36x36 (2x) PNG template images

const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');

// Ensure assets directory exists
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// SVG for a shield with checkmark icon
const createShieldSVG = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
  <path d="M9 1.5L2.5 4.5V9C2.5 13 5.5 15.5 9 17C12.5 15.5 15.5 13 15.5 9V4.5L9 1.5Z" 
        fill="none" 
        stroke="black" 
        stroke-width="1.25"
        stroke-linejoin="round"/>
  <path d="M6.5 8L8.5 10L12.5 6"
        fill="none" 
        stroke="black" 
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"/>
</svg>`;

// Write SVG files (Electron can use SVG directly)
const svg18 = createShieldSVG(18);
const svg36 = createShieldSVG(36);

fs.writeFileSync(path.join(assetsDir, 'tray-iconTemplate.svg'), svg18);
console.log('✓ Generated tray-iconTemplate.svg (18x18)');

fs.writeFileSync(path.join(assetsDir, 'tray-iconTemplate@2x.svg'), svg36);
console.log('✓ Generated tray-iconTemplate@2x.svg (36x36)');

// Base64 encoded 18x18 PNG for 1x fallback
const png18Base64 = 'iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAACXBIWXMAAAsTAAALEwEAmpwYAAABEklEQVQ4y6WTsU7DMBCG/3MSqVQqIzuLh8LAwMLAwANkYGTgARgYGHiADowMPAADAwtLB0ZGJqQOSG0Np/gupygkDnCS++TT/b7zbIchw/FZxmP8w0iGaQyHZ5lq8oUqSA/K6sY5bxz0fNfdXVxdd7z3nVevH9wdJyR9fxpL0un+ofMZEhMRsCABQKIBAEUDAFUB4JwDANn3CQBEBECwbwCgKAC8e/FytXZddzjKsmzlVu+c/7m3u3NbBIAqmDMRSCKJJJLkHGq0NQIQAChV1BgxBgCY2R/I2ycPd2n3vx0R+bqIKaJPSQQ9cxYAEBEAJAJAqaiIGABIVQVA6UVEAND3CQBVBUApAIiqAqD0JyJKAPwCr+FPXXJvIh8AAAAASUVORK5CYII=';

// Base64 encoded 36x36 PNG for 2x fallback (actual 2x size)
// This is a properly scaled 36x36 version of the shield icon
const png36Base64 = 'iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAACXBIWXMAABYlAAAWJQFJUiTwAAACEklEQVRYw+2YP0/DMBDFfyfpgMRAF0YWJgaGDgwMfAAGxg58AAYGBj4AB0YGPgADA0tXBgYGJiQU/kgJaWv7nDhKoFR6kt/lnZ/v7uwLoKQoigL4c3p6mhlVSqXS2fvXVhf+1lU8GGz//pHq6b3B4GD11uvuB8DqEaBMfBiIAUCmHWJ+2XSNv6/dwXdJSPO0JCHNk1LAMAmxppqWJNTpdBaPhMK+CwLbO/vzF6/ySYhIKJl2aPz6bPOgtDvMJyEz0TT3hJxzPoCNJyFL0+JfJBRFkXOObSqJAKCuKJtDXAqfvb26upYnxAAw0LRNz3FXMwm1Wq2FICGT0LSElJLEANh2EtIkxPoBaAhxAJAQEgnZlYJOQm5IQkop57aVRQGAKgrqI8B2pbDfT38lMUWEGABEHYJOQi4AQJskIQ4AVAqKRAHYrBT2++kPJoYSQhRAAwAGwtFJyCVhAJJKQZeE3IAE1VpJyCcJSSShf5KQlYSIAGBXCl4SwgIAmxI6CQEAxJWCLgmxAIBFQjYBYHOlMMWUGE4AABBJQupKQQJgBQCWAKDfT38tKcEJIQQAikrBvpKQdQDYqhS2++k3RgQnhJwAAO5K4b+RkC8AIIEkhK9VCpuEkACArEohH0oMT4gCAISVggcJYQCQbQCYnRDiAMCDSmFXCgEBEGwQ4gAAg9cQhhIFEDQBcLpSCEaAXRD6AK8JPYj1MaujAAAAAElFTkSuQmCC';

const pngBuffer18 = Buffer.from(png18Base64, 'base64');
const pngBuffer36 = Buffer.from(png36Base64, 'base64');

fs.writeFileSync(path.join(assetsDir, 'tray-icon-Template.png'), pngBuffer18);
console.log('✓ Generated tray-icon-Template.png (18x18)');

fs.writeFileSync(path.join(assetsDir, 'tray-icon-Template@2x.png'), pngBuffer36);
console.log('✓ Generated tray-icon-Template@2x.png (36x36)');

console.log('\n✨ Done! Icons saved to assets/');
console.log('Note: For best quality, replace PNG files with proper 18x18 and 36x36 icons.');

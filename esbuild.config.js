const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Copy webview assets
function copyWebviewAssets() {
  const webviewSrc = path.join(__dirname, 'webview');
  const webviewDest = path.join(__dirname, 'out', 'webview');
  
  if (!fs.existsSync(webviewDest)) {
    fs.mkdirSync(webviewDest, { recursive: true });
  }
  
  // Copy HTML file
  if (fs.existsSync(path.join(webviewSrc, 'index.html'))) {
    fs.copyFileSync(
      path.join(webviewSrc, 'index.html'),
      path.join(webviewDest, 'index.html')
    );
  }
}

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src-extension/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['vscode'],
    logLevel: 'info',
    plugins: [
      {
        name: 'copy-assets',
        setup(build) {
          build.onEnd(() => {
            copyWebviewAssets();
            console.log('Copied webview assets');
          });
        }
      }
    ]
  });

  if (watch) {
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('Build complete');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});


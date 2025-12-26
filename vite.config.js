import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Plugin to remove crossorigin attribute from HTML (breaks Electron's file:// protocol)
function removeCrossOrigin() {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/ crossorigin/g, '');
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    removeCrossOrigin()
  ],
  base: './',
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
    // Disable module preload polyfill for Electron compatibility
    modulePreload: {
      polyfill: false
    },
    rollupOptions: {
      output: {
        // Ensure consistent naming for easier debugging
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});


import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  // 1. BASE PATH: Makes all asset links relative (./video.mp4)
  // This ensures the video loads whether on localhost or GitHub Pages.
  base: './', 
  server: {
    // 2. LOCAL DEV HEADERS: 
    // These headers explicitly tell the browser "It is safe to read pixels from this video".
    // This fixes the "Tainted Canvas" error that breaks the Green Screen.
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    }
  },
  build: {
    outDir: 'dist',
  }
});
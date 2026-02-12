import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: './', 
  server: {
    port: 5173,
    strictPort: true,
    // Headers removed to prevent blocking external fonts/icons
  },
  build: {
    outDir: 'dist',
  }
});
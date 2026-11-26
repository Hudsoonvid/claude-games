import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build produces one self-contained dist/index.html (no external scripts).
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  assetsInclude: ['**/*.glb'],
  build: { target: 'es2020', chunkSizeWarningLimit: 4000 },
});

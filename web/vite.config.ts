import { defineConfig } from 'vite';
import { randomUUID } from 'node:crypto';
import react from '@vitejs/plugin-react';

const buildId = randomUUID();
export default defineConfig({
  define: { 'import.meta.env.VITE_WEB_BUILD_ID': JSON.stringify(buildId) },
  plugins: [react(), { name: 'web-build-version', generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId }) });
  } }],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3010',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/auth': {
        target: 'http://localhost:3010',
        changeOrigin: true,
      },
      '/clipboard': {
        target: 'http://localhost:3010',
        changeOrigin: true,
      },
      '/upload': {
        target: 'http://localhost:3010',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3010',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});

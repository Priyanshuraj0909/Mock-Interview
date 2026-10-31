import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    // Preserve existing Vercel environment configuration during the migration.
    define: { __API_BASE_URL__: JSON.stringify(env.VITE_API_BASE_URL || env.REACT_APP_API_BASE_URL || '/api') },
    build: { outDir: 'build' },
    server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
    test: { environment: 'jsdom', setupFiles: ['./src/setupTests.js'], globals: true, clearMocks: true },
  };
});

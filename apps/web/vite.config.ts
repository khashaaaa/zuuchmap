import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Same origin as production (nginx serves the web and proxies /api and /socket.io): no CORS preflights.
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8383',
      '/socket.io': { target: 'http://localhost:8383', ws: true },
    },
  },
});

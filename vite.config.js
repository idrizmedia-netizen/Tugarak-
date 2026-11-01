import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    port: 5173
  },
  // `npm test` — vitest (src/lib dagi toza mantiq va qoidalar fayli tekshiruvlari)
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js']
  }
});

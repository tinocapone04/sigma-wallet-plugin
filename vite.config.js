import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite sits behind `netlify dev` (public port 3030). Plain `npm run dev`
// also lands here when you don't need the /api functions.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3040,
    strictPort: true,
  },
});

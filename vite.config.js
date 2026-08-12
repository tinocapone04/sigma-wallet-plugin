import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate port from the game library (3030) so both can run locally.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3040,
    strictPort: true,
  },
});

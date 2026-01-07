import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: true, // Enable network access
    port: 5173,
    // Proxy removed - all API calls now go through SvelteKit bridge endpoints
  },
});

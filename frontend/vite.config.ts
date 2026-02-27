import { sentrySvelteKit } from "@sentry/sveltekit";
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
  },
  plugins: [sentrySvelteKit({
    org: "zoe-mart-derick-pabillaran",
    project: "bidtomo",
    sourceMapsUploadOptions: {
      telemetry: false,
    },
  }), sveltekit()],
  server: {
    host: true, // Enable network access
    port: 5173,
    // Proxy removed - all API calls now go through SvelteKit bridge endpoints
  },
});
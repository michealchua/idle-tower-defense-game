import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to all network interfaces so a tunnel (ngrok, etc.) can reach the
    // dev server, not just localhost.
    host: true,
    // Vite rejects requests whose Host header it doesn't recognize (DNS
    // rebinding protection). ngrok's hostname changes every session, so
    // there's no fixed value to allow-list - disable the check for local
    // dev/testing. Don't leave this running long-term or expose anything
    // sensitive while it's on.
    allowedHosts: true,
    hmr: {
      // ngrok terminates TLS on 443 and forwards to this server over plain
      // HTTP; without this the hot-reload websocket tries the wrong port
      // and silently fails for remote testers (page still loads fine).
      clientPort: 443,
    },
  },
});

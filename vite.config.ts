import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4728,
    // Bind to all network interfaces so a tunnel (ngrok, etc.) can reach the
    // dev server, not just localhost.
    host: true,
    // Vite rejects requests whose Host header it doesn't recognize (DNS
    // rebinding protection). ngrok's hostname changes every session, so
    // there's no fixed value to allow-list - disable the check for local
    // dev/testing. Don't leave this running long-term or expose anything
    // sensitive while it's on.
    allowedHosts: true,
    // Only forced to 443 when actually tunneling (`NGROK=1 npm run dev`) -
    // ngrok terminates TLS on 443 and forwards here over plain HTTP, so the
    // hot-reload websocket needs that hint or it tries the wrong port for
    // remote testers (page still loads fine either way, just no live-reload).
    // Left unset for plain local dev, otherwise the HMR socket tries to
    // connect to port 443 on localhost, which nothing is listening on.
    hmr: process.env.NGROK ? { clientPort: 443 } : undefined,
  },
});

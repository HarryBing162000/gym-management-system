/**
 * vite.config.ts
 * GMS -- Vite configuration with PWA support
 *
 * Added: vite-plugin-pwa
 *   - Registers sw.ts as the service worker
 *   - Auto-generates precache manifest for app shell
 *   - Enables offline app loading
 *
 * Install before deploying:
 *   npm install -D vite-plugin-pwa workbox-precaching workbox-routing
 *   npm install -D workbox-strategies workbox-expiration workbox-cacheable-response
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest: we supply sw.ts, Workbox injects the precache manifest
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",

      // Dev mode -- set enabled: true temporarily to test offline locally
      devOptions: {
        enabled: false,
        type: "module",
      },

      // PWA manifest -- makes the app installable on desktop and tablet
      manifest: {
        name: "Gym Management System",
        short_name: "GMS",
        description: "Gym management for owners and staff",
        theme_color: "#FF6B1A",
        background_color: "#141414",
        display: "standalone",
        orientation: "any",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },

      // injectManifest config -- controls what gets precached
      // Note: when strategies is "injectManifest", use injectManifest block only.
      // The workbox block is only used when strategies is "generateSW".
      injectManifest: {
        injectionPoint: "self.__WB_MANIFEST",
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],

  server: {
    port: 5173,
  },

  build: {
    outDir: "dist",
    sourcemap: true,
  },
});

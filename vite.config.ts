import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered explicitly from src/main.tsx via `virtual:pwa-register`.
      injectRegister: false,
      // The manifest is authored by hand in public/manifest.webmanifest and linked from index.html.
      manifest: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png', 'screenshots/*.png'],
      workbox: {
        // Precache the full app shell, including the lazily-loaded WebLLM and PDF chunks,
        // so the installed app (and cached models) work completely offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    // The WebLLM runtime is a single ~6 MB lazy chunk by design (loaded only when the browser engine is used).
    chunkSizeWarningLimit: 8000,
  },
  worker: { format: 'es' },
  // Unique ports (not Vite's 5173/4173 defaults) so this app never collides with other local Vite projects.
  server: { port: 5381, strictPort: true },
  preview: { port: 4381, strictPort: true },
})

import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        importScripts: ['push-sw.js'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallbackDenylist: [/\.vcf$/i],
      },
      includeAssets: ['brand/science-by-hugs.svg', 'brand/sbh-monogram.svg', 'brand/nexus.svg', 'brand/nexus-app-icon.svg', 'default-product-vial-photo.webp', 'science-by-hugs-contact.vcf'],
      manifest: {
        name: 'Science By Hugs Nexus',
        short_name: 'Nexus',
        description: 'NEXUS — Explore. Connect. Order. Customer research portal by Science By Hugs.',
        theme_color: '#0A0A0B',
        background_color: '#0A0A0B',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          {
            src: `${base}brand/nexus-app-icon.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})

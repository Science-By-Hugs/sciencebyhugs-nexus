import { defineConfig, loadEnv } from 'vite'
import { validateV2Environment } from './src/environment'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  for (const name of Object.keys(env)) {
    if (/SECRET|PASSWORD|SERVICE_ROLE|TOKEN|PRIVATE_KEY/.test(name)) throw new Error('Secret-like VITE variable is forbidden: ' + name)
  }
  validateV2Environment({
    appEnv: env.VITE_APP_ENV, supabaseUrl: env.VITE_SUPABASE_URL,
    publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY, expectedProjectRef: env.VITE_EXPECTED_SUPABASE_REF,
    appOrigin: env.VITE_APP_ORIGIN, paymentEnv: env.VITE_PAYMENT_ENV,
    enableTestPayments: env.VITE_ENABLE_TEST_PAYMENTS,
  })
  return {
  server: { port: 5173, strictPort: true },
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
        name: 'NEXUS 2.0 — Internal Staging',
        short_name: 'NEXUS Test',
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
  }
})

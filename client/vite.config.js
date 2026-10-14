import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import bundleBudgets from './scripts/bundle-budgets.mjs'
import { offlineCacheVersion } from './scripts/offline-cache-version.mjs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Vite looks for .env files in the project root (where vite.config.js is)
  const env = loadEnv(mode, process.cwd(), '')
  const landingExamplesStaticUrl = env.VITE_LANDING_EXAMPLES_STATIC_URL || ''

  return {
    plugins: [
      {
        name: 'landing-examples-static-url-html-default',
        transformIndexHtml: (html) => html.replaceAll(
          '%VITE_LANDING_EXAMPLES_STATIC_URL%',
          landingExamplesStaticUrl,
        ),
      },
      react(),
      bundleBudgets(),
      // App-shell precache so an open session survives reloads with no signal.
      // API responses are never cached here: session data persists per user
      // through the query cache, and writes through the offline outbox.
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        manifest: {
          name: 'Fractal Goals',
          short_name: 'Fractal Goals',
          description: 'Goals, programs, and training sessions in one app.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#121419',
          theme_color: '#121419',
          icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,woff,woff2,ico}'],
          // Pages never needed mid-workout are fetched on demand, then kept by the runtime route below.
          globIgnores: [
            '**/assets/Admin-*',
            '**/assets/Landing*',
            '**/assets/PublicLandingRoot-*',
            '**/assets/Legal-*',
            '**/assets/ResetPassword-*',
          ],
          runtimeCaching: [{
            // Hashed build assets never change, so a cached copy is always correct.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-assets',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          }],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/sitemap\.xml$/, /^\/robots\.txt$/],
          cleanupOutdatedCaches: true,
          clientsClaim: false,
          skipWaiting: false,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
      }),
    ],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8001',
          changeOrigin: true,
        },
      },
    },
    define: {
      // Explicitly define environment variables
      'import.meta.env.VITE_ENV': JSON.stringify(env.VITE_ENV || mode),
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || '/api'),
      'import.meta.env.VITE_LANDING_EXAMPLES_STATIC_URL': JSON.stringify(landingExamplesStaticUrl),
      __OFFLINE_CACHE_VERSION__: JSON.stringify(offlineCacheVersion()),
    },
  }
})

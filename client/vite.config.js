import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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
    },
  }
})

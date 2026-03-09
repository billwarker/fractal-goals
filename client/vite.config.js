import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Vite looks for .env files in the project root (where vite.config.js is)
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined
            }

            if (id.includes('@sentry/')) {
              return 'sentry'
            }

            if (id.includes('@tanstack/react-query')) {
              return 'query'
            }

            if (
              id.includes('chart.js') ||
              id.includes('react-chartjs-2')
            ) {
              return 'charts'
            }

            if (
              id.includes('@fullcalendar/') ||
              id.includes('react-big-calendar') ||
              id.includes('/moment/') ||
              id.includes('/date-fns/')
            ) {
              return 'calendar'
            }

            if (
              id.includes('reactflow') ||
              id.includes('react-d3-tree') ||
              id.includes('/dagre/')
            ) {
              return 'fractal-graph'
            }

            if (
              id.includes('react-router') ||
              id.includes('@remix-run/router')
            ) {
              return 'router'
            }

            return 'vendor'
          },
        },
      },
    },
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
    },
  }
})

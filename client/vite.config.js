import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { gzipSync } from 'node:zlib'

const LANDING_INITIAL_JS_GZIP_BUDGET = 175 * 1024
const LANDING_INITIAL_CSS_GZIP_BUDGET = 20 * 1024

const formatKb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`

const landingBundleBudget = () => ({
  name: 'landing-public-bundle-budget',
  generateBundle(_options, bundle) {
    const chunks = Object.values(bundle).filter((item) => item.type === 'chunk')
    const entry = chunks.find((chunk) => chunk.isEntry)
    const publicRoot = chunks.find((chunk) => chunk.name === 'PublicLandingRoot')
    if (!entry || !publicRoot) {
      this.error('Unable to locate the public landing entry chunks for budget validation.')
    }

    const visited = new Set()
    const visit = (chunk) => {
      if (!chunk || visited.has(chunk.fileName)) return
      visited.add(chunk.fileName)
      chunk.imports.forEach((fileName) => visit(bundle[fileName]))
    }
    visit(entry)
    visit(publicRoot)

    const initialChunks = chunks.filter((chunk) => visited.has(chunk.fileName))
    const jsBytes = initialChunks.reduce((total, chunk) => (
      total + gzipSync(chunk.code).byteLength
    ), 0)
    const cssFiles = new Set(initialChunks.flatMap((chunk) => (
      [...(chunk.viteMetadata?.importedCss || [])]
    )))
    const cssBytes = [...cssFiles].reduce((total, fileName) => {
      const asset = bundle[fileName]
      if (!asset || asset.type !== 'asset') return total
      return total + gzipSync(asset.source).byteLength
    }, 0)

    this.info(
      `Public landing initial transfer: ${formatKb(jsBytes)} JS gzip + `
      + `${formatKb(cssBytes)} CSS gzip across ${initialChunks.length} JS chunks.`,
    )
    if (jsBytes > LANDING_INITIAL_JS_GZIP_BUDGET) {
      this.error(
        `Public landing initial JS exceeds ${formatKb(LANDING_INITIAL_JS_GZIP_BUDGET)} `
        + `(${formatKb(jsBytes)}). Keep authenticated and interactive-only code deferred.`,
      )
    }
    if (cssBytes > LANDING_INITIAL_CSS_GZIP_BUDGET) {
      this.error(
        `Public landing initial CSS exceeds ${formatKb(LANDING_INITIAL_CSS_GZIP_BUDGET)} `
        + `(${formatKb(cssBytes)}). Keep non-critical surface styles deferred.`,
      )
    }
  },
})

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
      landingBundleBudget(),
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

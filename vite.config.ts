import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Loads the full .env (no VITE_ filter): GSTIN_API_KEY is server-side only —
  // the proxy below injects it, so it never ends up in the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')

  // gstinapi.in sends no CORS headers, so the browser cannot call it directly.
  // Same-origin /gstapi/* requests are proxied to https://gstinapi.in/* with
  // the key attached here; `vite preview` gets the same route.
  const gstinProxy = {
    target: 'https://gstinapi.in',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/gstapi/, ''),
    headers: { 'x-api-key': env.GSTIN_API_KEY ?? '' },
  }

  return {
    plugins: [react()],
    server: {
      proxy: { '/gstapi': gstinProxy },
      // The project lives on a mounted drive where inotify events are
      // unreliable — Vite's watcher missed edits and kept serving stale
      // modules. Polling makes HMR trustworthy here.
      watch: { usePolling: true },
    },
    preview: { proxy: { '/gstapi': gstinProxy } },
  }
})

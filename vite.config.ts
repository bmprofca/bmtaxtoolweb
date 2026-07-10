import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    envPrefix: ['VITE_', 'BASE_'],
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.BASE_API_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: env.BASE_API_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  }
})

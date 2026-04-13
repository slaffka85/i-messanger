import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [
    react(),
    // basicSsl(),
  ],
  server: {
    host: true,
    port: 5173,
    https: false,
    allowedHosts: ['imessanger.tssv85.com'],
    hmr: {
      host: 'imessanger.tssv85.com',
      protocol: 'wss',
      clientPort: 443
    },
    headers: {
      'Connection': 'close'
    },
    proxy: {
      '/signal': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        headers: {
          'X-Forwarded-Proto': 'https'
        }
      },
      '/login': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        headers: {
          'X-Forwarded-Proto': 'https'
        }
      },
      '/oauth2': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        headers: {
          'X-Forwarded-Proto': 'https'
        }
      },
      '/ws': {
        target: 'http://localhost:8080',
        ws: true
      }
    },
  },
})

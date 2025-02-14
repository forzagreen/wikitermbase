import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
  },
  server: {
    proxy: {
      // Proxy API endpoints to port 5001
      '/search': 'http://localhost:5001',
      '/api/v1/search': 'http://localhost:5001',
      '/ui/search/raw': 'http://localhost:5001',
      '/api/v1/search/aggregated': 'http://localhost:5001',
      '/dicts': 'http://localhost:5001',
      '/stats': 'http://localhost:5001'
    }
  }
})

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
      '/api': 'http://localhost:5001',
    }
  }
})

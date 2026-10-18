import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
  },
  server: {
    proxy: {
      // Everything FastAPI serves besides the SPA shell goes to the backend on
      // port 5001: the API and its OpenAPI docs.
      '/api': 'http://localhost:5001',
      '/docs': 'http://localhost:5001',
      '/redoc': 'http://localhost:5001',
      '/openapi.json': 'http://localhost:5001',
    }
  }
})

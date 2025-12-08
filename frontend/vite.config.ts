import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // IMPORTANTE: Percorso completo della sottocartella
  base: '/agente/v4/', 
})
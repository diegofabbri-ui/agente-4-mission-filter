import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // ⚠️ PUNTO CRITICO PER ARUBA ⚠️
  // Questo dice al browser: "Tutti i file JS e CSS si trovano qui".
  // Se togli questo o sbagli una lettera, avrai schermo nero e errore 404.
  base: '/agente/v4/',

  build: {
    // Cartella di destinazione (standard)
    outDir: 'dist',
    // Cartella per js/css/immagini (standard)
    assetsDir: 'assets',
    // Pulisce la cartella dist prima di ricostruire
    emptyOutDir: true,
  }
})
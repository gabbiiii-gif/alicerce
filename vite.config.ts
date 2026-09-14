import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Espelha o alias do tsconfig: componentes do React Bits entram por @/reactbits.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Alicerce',
        short_name: 'Alicerce',
        description: 'Obras e gastos no lugar certo',
        // Sem isto o plugin grava lang "en" num app escrito inteiro em português.
        lang: 'pt-BR',
        theme_color: '#0A2A6E',
        // O mesmo navy da abertura. No iPhone instalado pela tela de início, é este
        // valor que pinta a tela enquanto o app carrega: em branco, dava um flash claro
        // antes da abertura navy. Agora a primeira cor que aparece já é a do app —
        // igual ao que o APK do Android já faz pelo splash nativo.
        background_color: '#0A2A6E',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})

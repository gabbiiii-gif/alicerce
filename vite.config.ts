import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Ajustes no index.html gerado, para a primeira pintura não esperar nada da rede.
function primeiraPintura(): Plugin {
  return {
    name: 'alicerce:primeira-pintura',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, { bundle }) {
        if (!bundle) return html
        return (
          html
            // O CSS do app vai dentro do próprio HTML. Ele é pequeno (uns 3 KB comprimido),
            // e como arquivo separado segurava o primeiro quadro: o navegador não pinta nada
            // antes de ter todo o CSS, e buscar o arquivo era mais uma ida e volta ao
            // servidor — no 4G fraco de canteiro de obra, a mais cara do carregamento.
            .replace(/<link rel="stylesheet"[^>]*?href="\/(assets\/[^"]+\.css)"[^>]*>/g, (tag, arquivo: string) => {
              const css = bundle[arquivo]
              if (!css || css.type !== 'asset') return tag
              delete bundle[arquivo]
              const texto = typeof css.source === 'string' ? css.source : new TextDecoder().decode(css.source)
              return `<style>${texto}</style>`
            })
            // O JavaScript do app com prioridade baixa: a primeira pintura não depende dele,
            // quem ocupa a tela enquanto ele chega é a abertura, que é HTML puro. (O Vite
            // reescreve essa tag e descarta atributos extras, por isso entra aqui.)
            .replace(/<script type="module" crossorigin src="\/assets\/index-/, '<script type="module" crossorigin fetchpriority="low" src="/assets/index-')
        )
      },
    },
  }
}

export default defineConfig({
  // Espelha o alias do tsconfig: componentes do React Bits entram por @/reactbits.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    primeiraPintura(),
    VitePWA({
      registerType: 'autoUpdate',
      // Quem registra o service worker é o main.tsx, depois que a primeira tela assentou.
      // O script que o plugin injetaria ficava no <head> travando a primeira pintura.
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      workbox: {
        // Fontes e ícones também: sem eles, o app aberto sem internet cai na letra do
        // sistema e fica sem ícone.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // O jsPDF traz junto o que ele usa para converter HTML e SVG em PDF (html2canvas,
        // DOMPurify e canvg). O relatório desenha direto, nunca chama essas partes — são
        // quase 400 KB que o service worker baixaria para cada celular à toa.
        globIgnores: ['**/html2canvas*.js', '**/purify.es*.js', '**/index.es-*.js'],
        // Estes caminhos são arquivos de verdade, não telas do app: abertos no navegador,
        // não podem cair no index.html.
        navigateFallbackDenylist: [/^\/(assets|fonts)\//, /^\/robots\.txt$/, /^\/sitemap\.xml$/],
      },
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

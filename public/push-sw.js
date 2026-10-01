// Aviso com o app fechado no iPhone (app da Tela de Início) e nos navegadores: Web Push.
//
// Entra no service worker que o Workbox gera (vite.config.ts, importScripts). Quem manda é a
// função enviar-push; o conteúdo chega cifrado e o navegador entrega já decifrado aqui.

self.addEventListener('push', event => {
  let aviso = {}
  try {
    aviso = event.data ? event.data.json() : {}
  } catch {
    aviso = { corpo: event.data ? event.data.text() : '' }
  }
  // Só caminho de dentro do app: o endereço vem de fora.
  const url = typeof aviso.url === 'string' && aviso.url.startsWith('/') && !aviso.url.startsWith('//') ? aviso.url : '/notificacoes'

  event.waitUntil(
    Promise.all([
      // O iPhone exige um aviso visível para cada push que chega: push sem aviso faz a Apple
      // cortar a assinatura. Por isso não há caminho que pule o showNotification.
      self.registration.showNotification(aviso.titulo || 'Alicerce', {
        body: aviso.corpo || '',
        icon: '/icon-192.png',
        // O mesmo aviso chegando de novo substitui o anterior em vez de duplicar.
        tag: aviso.id || undefined,
        data: { url, id: aviso.id || null },
      }),
      // O número no ícone do app na Tela de Início.
      typeof aviso.naoLidas === 'number' && self.navigator.setAppBadge
        ? self.navigator.setAppBadge(aviso.naoLidas).catch(() => {})
        : null,
    ]),
  )
})

// Tocou no aviso: abre a tela dele. Se o app já está aberto, ele vai para a tela e marca como
// lido (lib/notificacoes.tsx); se não está, abre com ?aviso= no endereço, que faz o mesmo.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const { url = '/', id = null } = event.notification.data || {}
  const destino = new URL(url, self.location.origin)
  if (id) destino.searchParams.set('aviso', id)

  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const aberta = janelas.find(j => new URL(j.url).origin === self.location.origin)
      if (aberta) {
        try {
          await aberta.focus()
          aberta.postMessage({ tipo: 'abrir-aviso', caminho: destino.pathname + destino.search })
          return
        } catch {
          /* sem foco permitido: abre uma janela nova */
        }
      }
      await self.clients.openWindow(destino.href)
    })(),
  )
})

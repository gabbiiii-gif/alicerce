// Para onde voltar depois de entrar.
//
// O `state` do react-router não sobrevive ao login com Google: o OAuth troca a página
// inteira e o app volta como documento novo, com state nulo. Era isso que perdia um
// convite aberto por quem ainda não tem conta — o código não está na URL depois da volta,
// nem em lugar nenhum, e o mesmo convite não pode ser gerado de novo enquanto não expira.
// Por isso o destino fica fora do router, num lugar que o redirect não apaga.
const CHAVE = 'alicerce:destino'
// O destino vale para o login que está acontecendo agora. Passado isso é lixo de outra
// sessão, e mandaria alguém para uma tela que ele não pediu.
const VALIDADE = 10 * 60 * 1000

export function guardarDestino(caminho: string) {
  if (!caminho || caminho === '/' || caminho.startsWith('/login')) return
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ caminho, em: Date.now() }))
  } catch {
    /* modo privado: perde-se o destino, mas o login continua funcionando */
  }
}

export function lerDestino(): string | null {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return null
    const { caminho, em } = JSON.parse(cru) as { caminho?: unknown; em?: unknown }
    if (typeof caminho !== 'string' || typeof em !== 'number' || Date.now() - em > VALIDADE) {
      limparDestino()
      return null
    }
    return caminho
  } catch {
    return null
  }
}

export function limparDestino() {
  try {
    localStorage.removeItem(CHAVE)
  } catch {
    /* nada a limpar */
  }
}

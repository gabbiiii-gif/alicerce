// Login com Google no app da Tela de Início do iPhone.
//
// Ali o iPhone abre o Google numa janela do Safari por cima do app, com armazenamento próprio.
// O login termina nessa janela, mas a metade que falta para a troca (o code verifier do PKCE)
// ficou no app. A ponte (0019) junta as duas pelo servidor:
//
//   1. o app sorteia o número da ponte e manda o Google voltar para /login?ponte=<número>;
//   2. a janela do Google entrega o código ao servidor com esse número (entregarCodigo);
//   3. o app busca o código pelo número e faz a troca com o verifier que só ele tem
//      (lib/auth.tsx).
//
// Se o iPhone um dia abrir o Google dentro do próprio app, a volta cai no app com o verifier
// ao lado e o login segue o caminho normal; a ponte só fica sem uso.
//
// Este arquivo entra na primeira tela (main.tsx, auth.tsx), então é só o mínimo. A entrega do
// código fica em components/VoltaDoGoogle.tsx, que só baixa na janela do Google.
import { ehIphone, instaladoNaTelaDeInicio } from './plataforma'

const CHAVE = 'alicerce:ponte-login'
// O mesmo prazo do servidor.
const VALIDADE = 10 * 60_000

export const precisaDePonte = () => ehIphone() && instaladoNaTelaDeInicio()

export function abrirPonte(): string {
  const id = crypto.randomUUID()
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ id, desde: Date.now() }))
  } catch {
    /* sem armazenamento a ponte não se fecha sozinha, mas o login ainda pode cair no app */
  }
  return id
}

export function pontePendente(): string | null {
  try {
    const ponte = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as { id: string; desde: number } | null
    if (ponte && Date.now() - ponte.desde < VALIDADE) return ponte.id
    localStorage.removeItem(CHAVE)
  } catch {
    /* nada guardado */
  }
  return null
}

export function fecharPonte() {
  try {
    localStorage.removeItem(CHAVE)
  } catch {
    /* nada a fazer */
  }
}

// Esta página é a janela do Google que o iPhone abriu por cima do app? É, quando a volta traz
// uma ponte que não foi aberta aqui.
export function codigoParaEntregar(): { ponte: string; codigo: string } | null {
  try {
    const p = new URLSearchParams(window.location.search)
    const ponte = p.get('ponte')
    const codigo = p.get('code')
    if (!ponte || !codigo || pontePendente() === ponte) return null
    return { ponte, codigo }
  } catch {
    return null
  }
}

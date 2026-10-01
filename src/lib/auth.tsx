import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { carregarSupabase, talvezTenhaSessao } from './sessao'
import { aoInteragir } from './agenda'
import { ehNativo, urlDeRetorno } from './plataforma'
import { abrirPonte, fecharPonte, pontePendente, precisaDePonte } from './ponte'
import type { Profile } from './types'

type Contexto = {
  session: Session | null
  perfil: Profile | null
  carregando: boolean
  entrar: (email: string, senha: string) => Promise<void>
  cadastrar: (nome: string, email: string, senha: string) => Promise<void>
  entrarComGoogle: () => Promise<void>
  // iPhone, app da Tela de Início: o Google está aberto numa janela à parte e o app espera a
  // volta pela ponte (lib/ponte.ts).
  aguardandoGoogle: boolean
  sair: () => Promise<void>
}

const AuthContext = createContext<Contexto | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Profile | null>(null)
  // Sem sessão guardada, a resposta já é conhecida: ninguém entrou. A tela de entrada
  // aparece no primeiro quadro, sem esperar o Supabase baixar (lib/sessao.ts).
  const [carregando, setCarregando] = useState(talvezTenhaSessao)
  const [ponte, setPonte] = useState<string | null>(pontePendente)

  useEffect(() => {
    let ativo = true
    let desligar = () => {}
    const ligar = async () => {
      try {
        const supabase = await carregarSupabase()
        if (!ativo) return
        const { data } = await supabase.auth.getSession()
        if (!ativo) return
        setSession(data.session)
        const { data: sub } = supabase.auth.onAuthStateChange((_evento, nova) => setSession(nova))
        desligar = () => sub.subscription.unsubscribe()
      } catch {
        // O Supabase não baixou (sem sinal e sem o app guardado no aparelho). Melhor cair
        // na tela de entrada, que tenta de novo no toque, do que ficar na abertura para
        // sempre.
      } finally {
        if (ativo) setCarregando(false)
      }
    }
    // Com sessão possível, o Supabase é o caminho da primeira tela e vem já. Sem sessão,
    // ele só serve a quem vai entrar: começa a baixar no primeiro toque — na intro, ou no
    // próprio "Continuar com Google", que de todo modo espera por ele antes de sair
    // para o Google. Quem só olha a tela de entrada não paga o download.
    const esquecer = carregando ? (ligar(), () => {}) : aoInteragir(ligar)
    return () => {
      ativo = false
      esquecer()
      desligar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // No app empacotado o Google volta pelo esquema app.alicerce:// em vez de uma URL,
  // então é o sistema que reabre o Alicerce e nós trocamos o código pela sessão.
  useEffect(() => {
    if (!ehNativo()) return
    let cancelar = () => {}
    ;(async () => {
      const { App } = await import('@capacitor/app')
      const { Browser } = await import('@capacitor/browser')
      const ouvinte = await App.addListener('appUrlOpen', async ({ url }) => {
        const params = new URL(url).searchParams
        const codigo = params.get('code')
        // O Google devolve `error` quando a pessoa cancela ou nega o acesso.
        if (!codigo && !params.get('error')) return
        if (codigo) await (await carregarSupabase()).auth.exchangeCodeForSession(codigo)
        await Browser.close().catch(() => {})
      })
      cancelar = () => ouvinte.remove()
    })()
    return () => cancelar()
  }, [])

  const buscarPerfil = useCallback(async (userId: string) => {
    // O perfil nasce de um trigger no banco junto com a conta. No primeiro login pelo
    // Google os dois acontecem no mesmo instante, então vale uma segunda tentativa.
    const supabase = await carregarSupabase()
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const { data } = await supabase
        .from('profiles')
        .select('id, nome, iniciais, avatar_url')
        .eq('id', userId)
        .maybeSingle()
      if (data) return data as Profile
      await new Promise(pronto => setTimeout(pronto, 400))
    }
    return null
  }, [])

  // Login com Google no app da Tela de Início do iPhone (lib/ponte.ts): o código volta pelo
  // servidor e a troca acontece aqui, com o verifier que ficou no app. Confere a cada 2
  // segundos e na hora em que a pessoa volta da janela do Google.
  useEffect(() => {
    if (session) {
      if (ponte) {
        fecharPonte()
        setPonte(null)
      }
      return
    }
    if (!ponte) return
    let ativo = true
    let buscando = false
    const tentar = async () => {
      if (!ativo || buscando) return
      if (pontePendente() !== ponte) {
        setPonte(null)
        return
      }
      buscando = true
      try {
        const supabase = await carregarSupabase()
        const { data: codigo } = await supabase.rpc('buscar_codigo_login', { p_ponte: ponte })
        if (!ativo || typeof codigo !== 'string') return
        fecharPonte()
        setPonte(null)
        // Quem põe a sessão no lugar é o onAuthStateChange, lá em cima.
        const { error } = await supabase.auth.exchangeCodeForSession(codigo)
        if (error) console.warn('login pela ponte não terminou:', error.message)
      } catch {
        /* sem rede: a próxima tentativa resolve */
      } finally {
        buscando = false
      }
    }
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') tentar()
    }
    const relogio = setInterval(tentar, 2000)
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    tentar()
    return () => {
      ativo = false
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('focus', aoVoltar)
    }
  }, [session, ponte])

  useEffect(() => {
    const userId = session?.user.id
    if (!userId) {
      setPerfil(null)
      return
    }
    let valido = true
    buscarPerfil(userId).then(p => valido && setPerfil(p))
    return () => {
      valido = false
    }
  }, [session?.user.id, buscarPerfil])

  const valor = useMemo<Contexto>(
    () => ({
      session,
      perfil,
      carregando,
      entrar: async (email, senha) => {
        const supabase = await carregarSupabase()
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
        if (error) throw new Error(traduzErro(error.message))
      },
      cadastrar: async (nome, email, senha) => {
        const supabase = await carregarSupabase()
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
          options: { data: { nome: nome.trim() } },
        })
        if (error) throw new Error(traduzErro(error.message))
      },
      entrarComGoogle: async () => {
        const nativo = ehNativo()
        const supabase = await carregarSupabase()
        // App da Tela de Início do iPhone: o Google abre numa janela à parte, que não enxerga o
        // app. A volta passa pela ponte (lib/ponte.ts, 0019).
        if (!nativo && precisaDePonte()) {
          const id = abrirPonte()
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${urlDeRetorno()}?ponte=${id}`,
              queryParams: { prompt: 'select_account' },
              skipBrowserRedirect: true,
            },
          })
          if (error || !data?.url) {
            fecharPonte()
            throw new Error(traduzErro(error?.message ?? 'o Google não respondeu'))
          }
          setPonte(id)
          window.location.href = data.url
          return
        }
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: urlDeRetorno(),
            // Quem tem mais de uma conta Google escolhe qual usar em vez de entrar na última.
            queryParams: { prompt: 'select_account' },
            // No navegador deixamos o próprio Supabase redirecionar; no app abrimos na mão.
            skipBrowserRedirect: nativo,
          },
        })
        if (error) throw new Error(traduzErro(error.message))
        if (nativo && data?.url) {
          const { Browser } = await import('@capacitor/browser')
          await Browser.open({ url: data.url, presentationStyle: 'popover' })
        }
      },
      aguardandoGoogle: ponte !== null,
      sair: async () => {
        // O aparelho para de receber os avisos desta conta antes de a sessão acabar: sem ela,
        // o banco não deixaria apagar. Import dinâmico: o push não entra na primeira tela, e
        // só baixa para quem ligou o aviso neste aparelho.
        if (temAvisoLigado()) await import('./push').then(m => m.esquecerNesteAparelho()).catch(() => {})
        await (await carregarSupabase()).auth.signOut()
      },
    }),
    [session, perfil, carregando, ponte],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

// Algum aviso com o app fechado já registrado neste aparelho (lib/push.ts e lib/webPush.ts)?
function temAvisoLigado(): boolean {
  try {
    return Boolean(localStorage.getItem('alicerce:push-token') || localStorage.getItem('alicerce:webpush-token'))
  } catch {
    return false
  }
}

function traduzErro(mensagem: string): string {
  if (/invalid login credentials/i.test(mensagem)) return 'E-mail ou senha não conferem'
  if (/user already registered/i.test(mensagem)) return 'Esse e-mail já tem conta'
  if (/password should be at least/i.test(mensagem)) return 'A senha precisa de pelo menos 6 caracteres'
  if (/email address .* invalid/i.test(mensagem)) return 'E-mail inválido'
  if (/provider is not enabled/i.test(mensagem)) return 'O login com Google ainda não está ligado no Supabase'
  if (/email not confirmed/i.test(mensagem)) return 'Confirme o e-mail antes de entrar'
  if (/failed to fetch|network/i.test(mensagem)) return 'Sem conexão com o servidor'
  return mensagem
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fora do AuthProvider')
  return ctx
}

export function useUsuario() {
  const { session, perfil } = useAuth()
  return { userId: session?.user.id ?? '', perfil }
}

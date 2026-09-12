import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { ehNativo, urlDeRetorno } from './plataforma'
import type { Profile } from './types'

type Contexto = {
  session: Session | null
  perfil: Profile | null
  carregando: boolean
  entrar: (email: string, senha: string) => Promise<void>
  cadastrar: (nome: string, email: string, senha: string) => Promise<void>
  entrarComGoogle: () => Promise<void>
  sair: () => Promise<void>
}

const AuthContext = createContext<Contexto | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Profile | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nova) => setSession(nova))
    return () => sub.subscription.unsubscribe()
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
        if (codigo) await supabase.auth.exchangeCodeForSession(codigo)
        await Browser.close().catch(() => {})
      })
      cancelar = () => ouvinte.remove()
    })()
    return () => cancelar()
  }, [])

  const buscarPerfil = useCallback(async (userId: string) => {
    // O perfil nasce de um trigger no banco junto com a conta. No primeiro login pelo
    // Google os dois acontecem no mesmo instante, então vale uma segunda tentativa.
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
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
        if (error) throw new Error(traduzErro(error.message))
      },
      cadastrar: async (nome, email, senha) => {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
          options: { data: { nome: nome.trim() } },
        })
        if (error) throw new Error(traduzErro(error.message))
      },
      entrarComGoogle: async () => {
        const nativo = ehNativo()
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
      sair: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, perfil, carregando],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
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

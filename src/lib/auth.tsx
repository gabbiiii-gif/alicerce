import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './types'

type Contexto = {
  session: Session | null
  perfil: Profile | null
  carregando: boolean
  entrar: (email: string, senha: string) => Promise<void>
  cadastrar: (nome: string, email: string, senha: string) => Promise<void>
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

  useEffect(() => {
    if (!session?.user) {
      setPerfil(null)
      return
    }
    supabase
      .from('profiles')
      .select('id, nome, iniciais')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setPerfil((data as Profile | null) ?? null))
  }, [session?.user?.id])

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

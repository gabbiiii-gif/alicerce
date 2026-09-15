import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { carregarPlano, planoVale, type PlanoDoGrupo } from '../data/api'
import { useAuth } from './auth'

// O plano do grupo, carregado uma vez e compartilhado.
//
// Vive num contexto e não num useAsync por tela porque quase toda tela precisa dele: o
// aviso no topo, os botões de lançar, a tela de Plano. Buscando em cada uma, a mesma
// linha seria lida quatro vezes a cada navegação — e as telas poderiam discordar entre si
// por alguns instantes, mostrando o aviso numa e o botão ativo na outra.
//
// IMPORTANTE: isto é conforto, não segurança. Quem barra de verdade é a policy de insert
// no banco (0012). Desligar um botão no React só evita que a pessoa preencha um formulário
// inteiro para levar um erro de RLS no fim.

type Contexto = {
  plano: PlanoDoGrupo | null
  carregando: boolean
  erro: string | null
  vale: boolean
  ehCortesia: boolean
  diasRestantes: number | null
  recarregar: () => Promise<void>
}

const PlanoContext = createContext<Contexto | null>(null)

export function PlanoProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [plano, setPlano] = useState<PlanoDoGrupo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    if (!session) {
      setPlano(null)
      setCarregando(false)
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      setPlano(await carregarPlano())
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para ler o plano')
      // Falha de rede não pode virar cadeado: sem resposta, o app segue como estava e
      // quem decide continua sendo o banco. O contrário — assumir "sem plano" no erro —
      // travaria o app de quem pagou toda vez que a conexão oscilasse.
      setPlano(null)
    } finally {
      setCarregando(false)
    }
  }, [session])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  const valor = useMemo<Contexto>(() => {
    const assinatura = plano?.assinatura ?? null
    const vale = planoVale(assinatura)
    const ate = assinatura?.vale_ate ? new Date(assinatura.vale_ate).getTime() : null
    return {
      plano,
      carregando,
      erro,
      vale,
      ehCortesia: assinatura?.status === 'cortesia',
      diasRestantes: ate ? Math.max(0, Math.ceil((ate - Date.now()) / 86400000)) : null,
      recarregar,
    }
  }, [plano, carregando, erro, recarregar])

  return <PlanoContext.Provider value={valor}>{children}</PlanoContext.Provider>
}

export function usePlano() {
  const ctx = useContext(PlanoContext)
  if (!ctx) throw new Error('usePlano fora do PlanoProvider')
  return ctx
}

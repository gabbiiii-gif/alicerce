import { useCallback, useSyncExternalStore } from 'react'

const CHAVE = 'alicerce:obra-atual'
const ouvintes = new Set<() => void>()

function ler(): string | null {
  try {
    return localStorage.getItem(CHAVE)
  } catch {
    return null
  }
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

// Guarda a última obra aberta para as abas Enviar e Relatórios saberem de qual obra falam.
export function useObraAtual() {
  const obraId = useSyncExternalStore(assinar, ler, () => null)

  const definir = useCallback((id: string) => {
    try {
      localStorage.setItem(CHAVE, id)
    } catch {
      /* modo privado do navegador: seguimos sem lembrar */
    }
    ouvintes.forEach(o => o())
  }, [])

  return { obraId, definir }
}

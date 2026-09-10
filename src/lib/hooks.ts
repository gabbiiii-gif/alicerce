import { useCallback, useEffect, useRef, useState } from 'react'

export function useAsync<T>(carregar: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const vivo = useRef(true)

  const recarregar = useCallback(async () => {
    setErro(null)
    try {
      const resultado = await carregar()
      if (vivo.current) setDados(resultado)
    } catch (e) {
      if (vivo.current) setErro(e instanceof Error ? e.message : 'não deu para carregar')
    } finally {
      if (vivo.current) setCarregando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    vivo.current = true
    setCarregando(true)
    recarregar()
    return () => {
      vivo.current = false
    }
  }, [recarregar])

  return { dados, carregando, erro, recarregar }
}

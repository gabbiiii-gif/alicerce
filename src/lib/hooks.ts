import { useCallback, useEffect, useRef, useState } from 'react'

export function useAsync<T>(carregar: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Um número por execução, e não um único booleano "vivo": o React roda a limpeza do
  // efeito antigo e o corpo do novo no mesmo commit, então o booleano voltaria a true e a
  // resposta atrasada ainda escreveria. Era assim que, ao trocar de obra no relatório, os
  // números de uma obra podiam aparecer sob o nome de outra — e ir para o PDF e o WhatsApp.
  const sequencia = useRef(0)
  const montado = useRef(true)

  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  const recarregar = useCallback(async () => {
    const minhaVez = ++sequencia.current
    const atual = () => montado.current && minhaVez === sequencia.current
    setCarregando(true)
    setErro(null)
    try {
      const resultado = await carregar()
      if (atual()) setDados(resultado)
    } catch (e) {
      if (atual()) setErro(e instanceof Error ? e.message : 'não deu para carregar')
    } finally {
      if (atual()) setCarregando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    recarregar()
  }, [recarregar])

  return { dados, carregando, erro, recarregar }
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const ToastContext = createContext<(mensagem: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [mensagem, setMensagem] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const avisar = useCallback((texto: string) => {
    clearTimeout(timer.current)
    setMensagem(texto)
    timer.current = setTimeout(() => setMensagem(null), 2600)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <ToastContext.Provider value={avisar}>
      {children}
      {mensagem && <div className="toast">{mensagem}</div>}
    </ToastContext.Provider>
  )
}

export function useAviso() {
  return useContext(ToastContext)
}

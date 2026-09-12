import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'

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
      {/* Antes o aviso sumia de uma vez, porque desmontar não dispara @keyframes. */}
      <AnimatePresence>
        {mensagem && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18 }}
          >
            {mensagem}
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  )
}

export function useAviso() {
  return useContext(ToastContext)
}

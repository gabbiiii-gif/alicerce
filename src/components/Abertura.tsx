import { useEffect, useState } from 'react'
import { motion } from 'motion/react'

// A tela de abertura: marca e nome sobre o navy, toda vez que o app abre.
//
// Ela cobre a espera que já existia. Entre abrir o app e ter resposta do servidor sobre
// a sessão há um vazio — antes preenchido por um spinner. Aqui o mesmo tempo passa com a
// marca se montando, então a espera vira apresentação em vez de carregamento.
//
// As barras são as mesmas da marca (components/Marca.tsx), mas em cima do navy a de
// baixo ficaria invisível: por isso uma delas é branca.
const BARRAS = [
  { largura: 46, cor: '#6CB4F0' },
  { largura: 66, cor: '#FFFFFF' },
  { largura: 58, cor: '#6CB4F0' },
  { largura: 72, cor: '#1B8FE8' },
]

export function Abertura({ aoTerminar }: { aoTerminar: () => void }) {
  const [saindo, setSaindo] = useState(false)

  useEffect(() => {
    // Quem pediu menos movimento no sistema não fica esperando uma animação: a abertura
    // passa quase direto.
    const suave = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const espera = suave ? 200 : 1500
    const t1 = setTimeout(() => setSaindo(true), espera)
    // Só avisa o app depois que o navy terminou de sumir, senão a tela de trás aparece
    // por baixo no meio da transição.
    const t2 = setTimeout(aoTerminar, espera + 320)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [aoTerminar])

  return (
    <motion.div
      animate={{ opacity: saindo ? 0 : 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: '#0A2A6E',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        // A barra de status do aparelho é navy também, então a tela toda é uma cor só.
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {BARRAS.map((b, i) => (
          <motion.i
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.1, ease: 'easeOut' }}
            style={{ width: b.largura, height: 10, background: b.cor, display: 'block' }}
          />
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.45, ease: 'easeOut' }}
        style={{
          fontFamily: 'var(--fonte-titulo)',
          fontSize: 21,
          fontWeight: 500,
          letterSpacing: '.14em',
          color: '#fff',
        }}
      >
        ALICERCE
      </motion.div>
    </motion.div>
  )
}

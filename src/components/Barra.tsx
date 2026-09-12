import { motion } from 'motion/react'
import { CURVA } from '../lib/animacao'

export function Barra({ pct, cor = '#1B8FE8' }: { pct: number; cor?: string }) {
  const preenchido = Math.max(0, Math.min(100, pct))
  return (
    <div className="bar">
      {/* Cresce até a marca em vez de já nascer cheia — e reanima quando o valor muda,
          que é o que dá a sensação de a obra ter andado depois de uma entrada nova.
          O resto da largura é o fundo da própria trilha. */}
      <motion.div
        style={{ background: cor, height: '100%', flex: 'none' }}
        initial={{ width: 0 }}
        animate={{ width: `${preenchido}%` }}
        transition={{ ...CURVA, duration: 0.55 }}
      />
    </div>
  )
}

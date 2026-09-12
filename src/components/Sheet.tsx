import type { ReactNode } from 'react'
import { motion } from 'motion/react'

// A folha que sobe de baixo. Quem chama envolve num <AnimatePresence> para a saída
// acontecer — é justamente o que o CSS não sabe fazer, porque na hora de desmontar o
// elemento já saiu do DOM antes de qualquer @keyframes rodar.
export function Sheet({ aoFechar, children }: { aoFechar: () => void; children: ReactNode }) {
  return (
    <motion.div
      className="ovl"
      onClick={aoFechar}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        className="sheet"
        onClick={e => e.stopPropagation()}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        // A alça prometia que dava para arrastar e não dava. Agora dá: puxar para
        // baixo fecha, e um puxão rápido fecha antes mesmo de percorrer a distância.
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_evento, info) => {
          if (info.offset.y > 90 || info.velocity.y > 600) aoFechar()
        }}
      >
        <div className="sheet-alca" />
        {children}
      </motion.div>
    </motion.div>
  )
}

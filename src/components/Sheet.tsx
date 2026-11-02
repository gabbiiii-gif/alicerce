import type { ReactNode } from 'react'
import { m } from 'motion/react'
import { useLargo } from '../lib/hooks'

// A folha. No celular ela sobe de baixo e puxar para baixo fecha; no desktop vira uma
// janela no meio da tela, que aparece crescendo um pouco. Quem chama envolve num
// <AnimatePresence> para a saída acontecer — é justamente o que o CSS não sabe fazer,
// porque na hora de desmontar o elemento já saiu do DOM antes de qualquer @keyframes rodar.
export function Sheet({ aoFechar, children }: { aoFechar: () => void; children: ReactNode }) {
  const largo = useLargo()

  return (
    <m.div
      className="ovl"
      onClick={aoFechar}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      {largo ? (
        <m.div
          className="sheet"
          role="dialog"
          aria-modal="true"
          onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 4 }}
          transition={{ type: 'spring', stiffness: 520, damping: 40 }}
        >
          {children}
        </m.div>
      ) : (
        <m.div
          className="sheet"
          role="dialog"
          aria-modal="true"
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
        </m.div>
      )}
    </m.div>
  )
}

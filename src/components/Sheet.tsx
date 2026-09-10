import type { ReactNode } from 'react'

export function Sheet({ aoFechar, children }: { aoFechar: () => void; children: ReactNode }) {
  return (
    <div className="ovl" onClick={aoFechar}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-alca" />
        {children}
      </div>
    </div>
  )
}

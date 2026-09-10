export function Barra({ pct, cor = '#1B8FE8' }: { pct: number; cor?: string }) {
  const preenchido = Math.max(0, Math.min(100, pct))
  return (
    <div className="bar">
      <div style={{ flex: preenchido, background: cor }} />
      <div style={{ flex: 100 - preenchido }} />
    </div>
  )
}

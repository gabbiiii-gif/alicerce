// Marca do Alicerce (Marco, rodada 1b): um pórtico sobre a laje. O A sem travessa é a
// estrutura; a laje embaixo é o alicerce.
//
// "cor" é a versão sobre fundo claro; "escura" é a que vai sobre o navy (abertura, login,
// ícone do app).
const CORES = {
  cor: { portico: '#1B8FE8', laje: '#0A2A6E' },
  escura: { portico: '#FFFFFF', laje: '#1B8FE8' },
}

export function Marca({ largura = 72, variante = 'cor' }: { largura?: number; variante?: keyof typeof CORES }) {
  const { portico, laje } = CORES[variante]
  return (
    <svg
      className="marca"
      width={largura}
      height={Math.round((largura * 64) / 72)}
      viewBox="0 0 72 64"
      fill="none"
      aria-hidden="true"
    >
      <path d="M10 40 L36 8 L62 40" stroke={portico} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="52" width="64" height="12" rx="4" fill={laje} />
    </svg>
  )
}

// Marca e nome lado a lado, como no topo do menu lateral.
export function Assinatura({ largura = 28 }: { largura?: number }) {
  return (
    <span className="assinatura">
      <Marca largura={largura} />
      <span>alicerce</span>
    </span>
  )
}

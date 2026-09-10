// Mark do Alicerce: quatro barras empilhadas, do protótipo aprovado.
export function Marca({ escala = 1 }: { escala?: number }) {
  const barras = [
    { largura: 44, cor: '#1B8FE8' },
    { largura: 62, cor: '#6CB4F0' },
    { largura: 56, cor: '#1B8FE8' },
    { largura: 66, cor: '#0A2A6E' },
  ]
  return (
    <div className="marca">
      {barras.map((b, i) => (
        <i key={i} style={{ width: b.largura * escala, height: 9 * escala, background: b.cor }} />
      ))}
    </div>
  )
}

import type { CSSProperties } from 'react'

// O nome da marca entrando letra a letra, na tela de entrada.
//
// Era Anime.js dividindo o texto depois que a fonte carregava. Agora as letras já nascem
// separadas e a animação é CSS (.nome-marca em index.css): nenhuma biblioteca no caminho
// da primeira tela, e a animação começa junto com a saída da abertura (classe `revelado`
// no <html>), em vez de rodar escondida atrás dela.
//
// `style` acerta tamanho e cor de cada lugar (o login v2 usa o nome grande, em branco
// sobre o navy) sem mexer na animação, que mora na classe.
export function NomeAnimado({ texto, className, style }: { texto: string; className?: string; style?: CSSProperties }) {
  return (
    <h1 className={className} style={style}>
      {/* O leitor de tela lê a palavra inteira, não oito letras soltas. */}
      <span className="so-leitor">{texto}</span>
      <span aria-hidden="true">
        {[...texto].map((letra, i) => (
          <span key={i} style={{ '--i': i } as CSSProperties}>
            {letra}
          </span>
        ))}
      </span>
    </h1>
  )
}

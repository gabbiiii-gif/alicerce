export type Papel = 'dono' | 'colaborador'
export type TipoLancamento = 'entrada' | 'saida'
export type StatusComprovante = 'lendo' | 'pronto' | 'erro' | 'confirmado'
export type StatusObra = 'ativa' | 'encerrada'

export type Profile = {
  id: string
  nome: string
  iniciais: string
  // Vem da conta Google de quem entrou por lá; nulo para quem entrou por e-mail.
  avatar_url?: string | null
}

export type Obra = {
  id: string
  nome: string
  endereco: string | null
  valor_fechado: number
  previsto_mensal: number
  status: StatusObra
  dono_id: string
  encerrada_em: string | null
  created_at: string
}

export type Membro = {
  obra_id: string
  user_id: string
  papel: Papel
  profile: Profile
}

export type Categoria = {
  id: string
  dono_id: string
  criado_por: string
  nome: string
}

export type Aditivo = {
  id: string
  obra_id: string
  autor_id: string
  descricao: string
  valor: number
  created_at: string
}

export type DadosExtraidos = {
  fornecedor: string | null
  descricao: string | null
  valor: number | null
  data: string | null
  categoria_sugerida: string | null
  confianca: 'alta' | 'media' | 'baixa' | null
}

export type Comprovante = {
  id: string
  obra_id: string
  autor_id: string
  storage_path: string
  mime: string | null
  origem: 'foto' | 'arquivo'
  status: StatusComprovante
  extraido: DadosExtraidos | null
  erro: string | null
  created_at: string
}

export type Lancamento = {
  id: string
  obra_id: string
  autor_id: string
  tipo: TipoLancamento
  descricao: string
  categoria_id: string | null
  valor: number
  data: string
  comprovante_id: string | null
  created_at: string
  autor?: Profile
  categoria?: { id: string; nome: string } | null
  // Só vem preenchido no relatório consolidado, onde lançamentos de obras
  // diferentes se misturam e é preciso saber de qual obra cada um é.
  obra?: { id: string; nome: string } | null
}

export type Convite = {
  id: string
  obra_id: string
  codigo: string
  expira_em: string
  aceito_por: string | null
}

// Contas da obra, derivadas dos lançamentos e aditivos.
export type ContasObra = {
  recebido: number
  aditivos: number
  total: number
  aberto: number
  pct: number
  saidas: number
}

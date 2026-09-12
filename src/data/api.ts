import { supabase } from '../lib/supabase'
import type {
  Aditivo, Categoria, Comprovante, ContasObra, Convite, Lancamento, Membro, Obra, Profile,
} from '../lib/types'
import { hojeISO } from '../lib/format'

export type ObraComContas = Obra & { contas: ContasObra }

export function calcContas(
  valorFechado: number,
  aditivos: { valor: number }[],
  lancamentos: { tipo: string; valor: number }[],
): ContasObra {
  const recebido = lancamentos.filter(l => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0)
  const saidas = lancamentos.filter(l => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0)
  const somaAditivos = aditivos.reduce((s, a) => s + Number(a.valor), 0)
  const total = Number(valorFechado) + somaAditivos
  return {
    recebido,
    aditivos: somaAditivos,
    total,
    aberto: Math.max(total - recebido, 0),
    pct: total ? Math.min(Math.round((recebido / total) * 100), 100) : 0,
    saidas,
  }
}

export async function listarObras(): Promise<ObraComContas[]> {
  const { data, error } = await supabase
    .from('obras')
    .select('*, lancamentos(tipo, valor), aditivos(valor)')
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data ?? []).map(linha => {
    const { lancamentos = [], aditivos = [], ...obra } = linha as unknown as Obra & {
      lancamentos: { tipo: string; valor: number }[]
      aditivos: { valor: number }[]
    }
    return { ...obra, contas: calcContas(obra.valor_fechado, aditivos, lancamentos) }
  })
}

export type ObraCompleta = {
  obra: Obra
  membros: Membro[]
  aditivos: Aditivo[]
  lancamentos: Lancamento[]
  contas: ContasObra
}

export async function carregarObra(obraId: string): Promise<ObraCompleta> {
  const [obraRes, membrosRes, aditivosRes, lancRes] = await Promise.all([
    supabase.from('obras').select('*').eq('id', obraId).single(),
    supabase.from('obra_membros').select('obra_id, user_id, papel, profile:profiles(id, nome, iniciais)').eq('obra_id', obraId),
    supabase.from('aditivos').select('*').eq('obra_id', obraId).order('created_at', { ascending: false }),
    supabase
      .from('lancamentos')
      .select('*, autor:profiles(id, nome, iniciais), categoria:categorias(id, nome)')
      .eq('obra_id', obraId)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  if (obraRes.error) throw obraRes.error
  if (membrosRes.error) throw membrosRes.error
  if (aditivosRes.error) throw aditivosRes.error
  if (lancRes.error) throw lancRes.error

  const obra = obraRes.data as Obra
  const aditivos = (aditivosRes.data ?? []) as Aditivo[]
  const lancamentos = (lancRes.data ?? []) as unknown as Lancamento[]

  return {
    obra,
    membros: (membrosRes.data ?? []) as unknown as Membro[],
    aditivos,
    lancamentos,
    contas: calcContas(obra.valor_fechado, aditivos, lancamentos),
  }
}

export type RelatorioGeral = {
  lancamentos: Lancamento[]
  membros: Membro[]
}

// Relatório consolidado: tudo de todas as obras que eu participo, de uma vez.
// A RLS já limita às minhas obras, então não é preciso filtrar por obra aqui.
export async function carregarRelatorioGeral(): Promise<RelatorioGeral> {
  const [lancRes, membrosRes] = await Promise.all([
    supabase
      .from('lancamentos')
      .select('*, autor:profiles(id, nome, iniciais), categoria:categorias(id, nome), obra:obras(id, nome)')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('obra_membros').select('obra_id, user_id, papel, profile:profiles(id, nome, iniciais)'),
  ])

  if (lancRes.error) throw lancRes.error
  if (membrosRes.error) throw membrosRes.error

  // A mesma pessoa aparece uma vez por obra que dividimos; no consolidado ela é uma só.
  const porPessoa = new Map<string, Membro>()
  ;((membrosRes.data ?? []) as unknown as Membro[]).forEach(m => {
    if (!porPessoa.has(m.user_id)) porPessoa.set(m.user_id, m)
  })

  // O "em aberto" consolidado nao sai daqui: e a soma do `contas.aberto` das obras que a
  // tela ja carregou para montar os chips. Repetir o select de obras custava a query mais
  // pesada da tela duas vezes, e as duas copias podiam discordar se uma escrita caisse no meio.
  return {
    lancamentos: (lancRes.data ?? []) as unknown as Lancamento[],
    membros: [...porPessoa.values()],
  }
}

// Sócios e parceiros de obra. A RLS de profiles já limita a resposta a quem divide grupo
// ou obra comigo, então não há filtro a fazer aqui — pedir a tabela é pedir a minha gente.
export async function listarSocios(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, iniciais, avatar_url')
    .order('nome')
  if (error) throw error
  return (data ?? []) as Profile[]
}

// Quanto a obra pode gastar por mês. Nasce como um chute do sistema (3% do valor
// fechado) porque um número precisa existir para haver comparação — mas quem sabe o
// ritmo da obra é quem toca a obra, e alertar contra um chute que ninguém escolheu é
// ruído, não aviso.
export async function definirPrevistoMensal(obraId: string, valor: number) {
  const { error } = await supabase
    .from('obras')
    .update({ previsto_mensal: Math.max(valor, 0) })
    .eq('id', obraId)
  if (error) throw error
}

export async function criarObra(dados: {
  nome: string
  endereco: string
  valorFechado: number
  entrada: number
  autorId: string
}): Promise<string> {
  const { data, error } = await supabase
    .from('obras')
    .insert({
      nome: dados.nome,
      endereco: dados.endereco || null,
      valor_fechado: dados.valorFechado,
      // Previsto mensal de partida: 3% do valor fechado, ajustável depois.
      previsto_mensal: Math.round(dados.valorFechado * 0.03),
      dono_id: dados.autorId,
    })
    .select('id')
    .single()
  if (error) throw error

  const obraId = data.id as string
  await registrarEntrada({ obraId, autorId: dados.autorId, valor: dados.entrada, descricao: 'Entrada' })
  return obraId
}

export async function registrarEntrada(dados: {
  obraId: string
  autorId: string
  valor: number
  descricao: string
  comprovanteId?: string | null
}) {
  const { error } = await supabase.from('lancamentos').insert({
    obra_id: dados.obraId,
    autor_id: dados.autorId,
    tipo: 'entrada',
    descricao: dados.descricao || 'Entrada',
    valor: dados.valor,
    data: hojeISO(),
    comprovante_id: dados.comprovanteId ?? null,
    categoria_id: null,
  })
  if (error) throw error
}

export async function registrarSaida(dados: {
  obraId: string
  autorId: string
  valor: number
  descricao: string
  categoriaId: string | null
  data: string
  comprovanteId?: string | null
}) {
  const { error } = await supabase.from('lancamentos').insert({
    obra_id: dados.obraId,
    autor_id: dados.autorId,
    tipo: 'saida',
    descricao: dados.descricao,
    categoria_id: dados.categoriaId,
    valor: dados.valor,
    data: dados.data,
    comprovante_id: dados.comprovanteId ?? null,
  })
  if (error) throw error
}

export async function apagarLancamento(id: string) {
  const { error } = await supabase.from('lancamentos').delete().eq('id', id)
  if (error) throw error
}

export async function criarAditivo(dados: { obraId: string; autorId: string; descricao: string; valor: number }) {
  const { error } = await supabase.from('aditivos').insert({
    obra_id: dados.obraId,
    autor_id: dados.autorId,
    descricao: dados.descricao || 'Aditivo',
    valor: dados.valor,
  })
  if (error) throw error
}

export async function encerrarObra(obraId: string) {
  const { error } = await supabase
    .from('obras')
    .update({ status: 'encerrada', encerrada_em: new Date().toISOString() })
    .eq('id', obraId)
  if (error) throw error
}

// A lista de categorias é a do dono da obra — os dois usuários enxergam a mesma.
export async function listarCategorias(donoId: string): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from('categorias')
    .select('id, dono_id, criado_por, nome')
    .eq('dono_id', donoId)
    .order('nome')
  if (error) throw error
  return (data ?? []) as Categoria[]
}

export async function criarCategoria(dados: { donoId: string; criadoPor: string; nome: string }) {
  const { error } = await supabase.from('categorias').insert({
    dono_id: dados.donoId,
    criado_por: dados.criadoPor,
    nome: dados.nome,
  })
  if (error) throw error
}

export async function apagarCategoria(id: string) {
  const { error } = await supabase.from('categorias').delete().eq('id', id)
  if (error) throw error
}

export async function listarFila(autorId: string): Promise<Comprovante[]> {
  const { data, error } = await supabase
    .from('comprovantes')
    .select('*')
    .eq('autor_id', autorId)
    .in('status', ['lendo', 'pronto', 'erro'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Comprovante[]
}

export async function carregarComprovante(id: string): Promise<Comprovante> {
  const { data, error } = await supabase.from('comprovantes').select('*').eq('id', id).single()
  if (error) throw error
  return data as Comprovante
}

export async function urlComprovante(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('comprovantes').createSignedUrl(path, 60 * 10)
  if (error) return null
  return data.signedUrl
}

// Envia o arquivo, cria a linha na fila e dispara o agente que lê a nota.
export async function enviarComprovante(dados: {
  obraId: string
  autorId: string
  arquivo: File
  origem: 'foto' | 'arquivo'
}): Promise<Comprovante> {
  const extensao = dados.arquivo.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${dados.obraId}/${dados.autorId}/${crypto.randomUUID()}.${extensao}`

  const upload = await supabase.storage.from('comprovantes').upload(path, dados.arquivo, {
    contentType: dados.arquivo.type || undefined,
    upsert: false,
  })
  if (upload.error) throw upload.error

  const { data, error } = await supabase
    .from('comprovantes')
    .insert({
      obra_id: dados.obraId,
      autor_id: dados.autorId,
      storage_path: path,
      mime: dados.arquivo.type || null,
      origem: dados.origem,
      status: 'lendo',
    })
    .select('*')
    .single()
  if (error) throw error

  const comprovante = data as Comprovante
  chamarAgente(comprovante.id)
  return comprovante
}

// O agente roda no servidor; a fila mostra "lendo a nota…" enquanto isso.
//
// Se a chamada não chega de pé — função não publicada, sem chave, rede caiu —, ninguém
// do outro lado vai mexer na linha, e a nota ficaria girando para sempre. Então quem
// falha aqui marca a própria nota como erro: ela vira "preencha na mão" na fila, e o
// usuário segue sem depender do agente.
//
// `invoke` devolve o erro no resultado em vez de lançar, então não basta um catch.
function chamarAgente(comprovanteId: string) {
  supabase.functions
    .invoke('ler-comprovante', { body: { comprovante_id: comprovanteId } })
    .then(({ error }) => {
      if (error) throw error
    })
    .catch(async (e: unknown) => {
      const motivo = e instanceof Error ? e.message : 'o agente não respondeu'
      await supabase.from('comprovantes').update({ status: 'erro', erro: motivo }).eq('id', comprovanteId)
    })
}

// Pede ao servidor que mande o resumo das obras por e-mail. Quem monta o conteúdo é a
// função, com o token de quem chamou — o app não decide o que vai no e-mail.
export async function enviarRelatorioPorEmail(para?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('enviar-relatorio', {
    body: para ? { para } : {},
  })
  if (error) throw error
  // A função responde 200 mesmo quando o serviço de e-mail recusa, para a mensagem dele
  // chegar inteira aqui em vez de virar um erro de rede sem explicação.
  if (data?.erro) throw new Error(data.erro)
  return (data?.para as string) ?? ''
}

export async function descartarComprovante(id: string, storagePath: string) {
  await supabase.storage.from('comprovantes').remove([storagePath])
  const { error } = await supabase.from('comprovantes').delete().eq('id', id)
  if (error) throw error
}

export async function marcarComprovanteConfirmado(id: string) {
  const { error } = await supabase.from('comprovantes').update({ status: 'confirmado' }).eq('id', id)
  if (error) throw error
}

function codigoConvite(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const sorteia = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint8Array(n)))
      .map(b => alfabeto[b % alfabeto.length])
      .join('')
  return `${sorteia(3)}-${sorteia(2)}`
}

export async function criarConvite(obraId: string, criadoPor: string): Promise<Convite> {
  const existente = await supabase
    .from('convites')
    .select('id, obra_id, codigo, expira_em, aceito_por')
    .eq('obra_id', obraId)
    .is('aceito_por', null)
    .gt('expira_em', new Date().toISOString())
    .limit(1)
    .maybeSingle()

  if (existente.data) return existente.data as Convite

  const { data, error } = await supabase
    .from('convites')
    .insert({ obra_id: obraId, codigo: codigoConvite(), criado_por: criadoPor })
    .select('id, obra_id, codigo, expira_em, aceito_por')
    .single()
  if (error) throw error
  return data as Convite
}

export async function aceitarConvite(codigo: string): Promise<string> {
  const { data, error } = await supabase.rpc('aceitar_convite', { p_codigo: codigo })
  if (error) throw error
  return data as string
}

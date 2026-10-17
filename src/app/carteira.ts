import { supabase } from "@/lib/supabase";
import { Beneficio } from "@/lib/beneficio";

export interface Promocao extends Beneficio {
  id: string;
  titulo: string;
  descricao: string | null;
  fim: string | null;
  limite_total: number | null;
  limite_por_pessoa: number;
  resgatados: number;
  meus: number;
}

export interface Recompensa extends Beneficio {
  id: string;
  titulo: string;
  custo: number;
}

export interface Programa {
  ativo: boolean;
  pontos_checkin: number;
  pontos_ingresso: number;
}

export interface Cupom extends Beneficio {
  id: string;
  titulo: string;
  codigo: string;
  situacao: "disponivel" | "usado" | "cancelado";
  validade: string;
  usado_em: string | null;
  criado_em: string;
  recompensa_id: string | null;
  estabelecimento: { id: string; nome: string; logo_url: string | null } | null;
}

export interface Ingresso {
  id: string;
  codigo: string;
  situacao: "valido" | "usado" | "cancelado";
  criado_em: string;
  usado_em: string | null;
  evento: {
    id: string;
    nome: string;
    inicio: string;
    fim: string | null;
    situacao: string;
    capa_url: string | null;
    estabelecimento: { id: string; nome: string } | null;
  } | null;
}

export interface SaldoPontos {
  estabelecimento_id: string;
  nome: string;
  logo_url: string | null;
  saldo: number;
  ativo: boolean;
}

export interface ResumoIngresso {
  evento_id: string;
  vagas: number | null;
  pegos: number;
  entraram: number;
  meu_ingresso: string | null;
  meu_situacao: string | null;
}

const num = (v: unknown) => (v == null ? null : Number(v));

/** Promoções no ar de um lugar, com quantos já resgataram e quantos eu resgatei. */
export async function buscarPromocoes(estab: string): Promise<Promocao[]> {
  const agora = new Date().toISOString();
  const { data } = await supabase
    .from("promocoes")
    .select("id, titulo, descricao, tipo, valor, pedido_minimo, dias, hora_inicio, hora_fim, fim, limite_total, limite_por_pessoa, item:cardapio_itens(nome)")
    .eq("estabelecimento_id", estab)
    .eq("situacao", "ativa")
    .lte("inicio", agora)
    .or(`fim.is.null,fim.gt.${agora}`)
    .order("criado_em", { ascending: false });
  const lista = (data ?? []) as unknown as Omit<Promocao, "resgatados" | "meus">[];
  if (!lista.length) return [];
  const { data: r } = await supabase.rpc("resumo_promocoes", { p_ids: lista.map((p) => p.id) });
  const mapa = new Map(((r ?? []) as { promocao_id: string; resgatados: number; meus: number }[]).map((x) => [x.promocao_id, x]));
  return lista.map((p) => ({
    ...p,
    valor: num(p.valor),
    pedido_minimo: num(p.pedido_minimo),
    resgatados: mapa.get(p.id)?.resgatados ?? 0,
    meus: mapa.get(p.id)?.meus ?? 0,
  }));
}

export async function buscarProgramaDoLugar(estab: string) {
  const [p, r, s] = await Promise.all([
    supabase.from("programa_pontos").select("ativo, pontos_checkin, pontos_ingresso").eq("estabelecimento_id", estab).maybeSingle(),
    supabase
      .from("recompensas")
      .select("id, titulo, custo, tipo, valor, pedido_minimo, item:cardapio_itens(nome)")
      .eq("estabelecimento_id", estab)
      .eq("ativa", true)
      .order("custo"),
    supabase.rpc("meus_pontos", { p_estab: estab }),
  ]);
  const saldo = ((s.data ?? []) as SaldoPontos[])[0]?.saldo ?? 0;
  return {
    programa: (p.data as Programa | null) ?? null,
    recompensas: ((r.data ?? []) as unknown as Recompensa[]).map((x) => ({ ...x, valor: num(x.valor), pedido_minimo: num(x.pedido_minimo) })),
    saldo,
  };
}

export async function buscarCarteira(usuario: string) {
  const [c, i, p] = await Promise.all([
    supabase
      .from("cupons")
      .select(
        "id, titulo, codigo, situacao, validade, usado_em, criado_em, recompensa_id, tipo, valor, pedido_minimo, dias, hora_inicio, hora_fim, item:cardapio_itens(nome), estabelecimento:estabelecimentos(id, nome, logo_url)",
      )
      .eq("usuario_id", usuario)
      .order("criado_em", { ascending: false })
      .limit(100),
    supabase
      .from("ingressos")
      .select("id, codigo, situacao, criado_em, usado_em, evento:eventos(id, nome, inicio, fim, situacao, capa_url, estabelecimento:estabelecimentos(id, nome))")
      .eq("usuario_id", usuario)
      .neq("situacao", "cancelado")
      .order("criado_em", { ascending: false })
      .limit(100),
    supabase.rpc("meus_pontos", { p_estab: null }),
  ]);
  return {
    cupons: ((c.data ?? []) as unknown as Cupom[]).map((x) => ({ ...x, valor: num(x.valor), pedido_minimo: num(x.pedido_minimo) })),
    ingressos: (i.data ?? []) as unknown as Ingresso[],
    pontos: (p.data ?? []) as SaldoPontos[],
  };
}

export async function resumoIngressos(ids: string[]): Promise<Map<string, ResumoIngresso>> {
  if (!ids.length) return new Map();
  const { data } = await supabase.rpc("resumo_ingressos", { p_eventos: ids });
  return new Map(((data ?? []) as ResumoIngresso[]).map((x) => [x.evento_id, x]));
}

/** Conteúdo do QR do ingresso. O prefixo evita confundir com outros QR codes. */
export const qrDoIngresso = (codigo: string) => `RVI-${codigo}`;

/** Código em blocos para ler em voz alta: ABCD-2345. */
export const codigoLegivel = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

export const fimDoEvento = (e: { inicio: string; fim: string | null }) => (e.fim ? Date.parse(e.fim) : Date.parse(e.inicio) + 6 * 3600 * 1000);

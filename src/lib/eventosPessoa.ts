import { supabase } from "./supabase";

export type TipoEventoPessoa = "churrasco" | "aniversario" | "comemoracao" | "festa" | "outro";
export type VisibilidadeEvento = "convidados" | "amigos" | "publico";

export const TIPOS_EVENTO: { valor: TipoEventoPessoa; nome: string; emoji: string; exemplo: string }[] = [
  { valor: "churrasco", nome: "Churrasco colaborativo", emoji: "🍖", exemplo: "Churras da galera no sábado" },
  { valor: "aniversario", nome: "Aniversário", emoji: "🎂", exemplo: "Niver da Ana" },
  { valor: "comemoracao", nome: "Comemoração", emoji: "🥂", exemplo: "Formatura, promoção, aprovação..." },
  { valor: "festa", nome: "Festa em casa", emoji: "🪩", exemplo: "Festa na casa do Caio" },
  { valor: "outro", nome: "Outro rolê", emoji: "✨", exemplo: "Qualquer encontro com os amigos" },
];
export const NOME_TIPO = Object.fromEntries(TIPOS_EVENTO.map((t) => [t.valor, t])) as Record<TipoEventoPessoa, (typeof TIPOS_EVENTO)[number]>;

export const VISIBILIDADES_EVENTO: { valor: VisibilidadeEvento; nome: string; texto: string }[] = [
  { valor: "convidados", nome: "Só convidados", texto: "Só quem você convidar vê e compra." },
  { valor: "amigos", nome: "Convidados e amigos", texto: "Seus amigos (quem se segue com você) também veem." },
  { valor: "publico", nome: "Público", texto: "Qualquer pessoa perto do local pode ver e comprar." },
];

export interface Pacote {
  id: string;
  nome: string;
  dias: number;
  preco: number;
  raio_km: number;
  descricao: string | null;
}

export interface RegrasEventos {
  ativo: boolean;
  taxa_pct: number;
  preco_min: number;
  preco_max: number;
  max_ingressos: number;
  max_por_compra: number;
  corte_venda_horas: number;
  antecedencia_max_dias: number;
  permitir_publico: boolean;
  termos: string;
  termos_versao: number;
  mp_conectado: boolean;
  pacotes: Pacote[];
}

export interface CotaEvento {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  quantidade: number;
  disponiveis: number;
}

export interface PessoaMini {
  id: string;
  nome: string;
  usuario: string | null;
  foto_url: string | null;
}

export interface EventoPessoa {
  id: string;
  titulo: string;
  tipo: TipoEventoPessoa;
  descricao: string | null;
  capa_url: string | null;
  inicio: string;
  fim: string | null;
  visibilidade: VisibilidadeEvento;
  situacao: "publicado" | "cancelado";
  suspenso: boolean;
  local_nome: string | null;
  bairro: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  endereco_liberado: boolean;
  sou_anfitriao: boolean;
  anfitriao: PessoaMini;
  vendas_abertas: boolean;
  max_por_compra: number;
  taxa_pct: number;
  cotas: CotaEvento[];
  meus_ingressos: { id: string; codigo: string; situacao: "valido" | "usado" | "cancelado"; cota: string | null; preco: number }[];
  meu_convite: "convidado" | "vou" | "talvez" | "nao_vou" | null;
  confirmados: number;
  impulso: { fim: string; raio_km: number } | null;
  painel: {
    vendidos: number;
    usados: number;
    arrecadado: number;
    taxas: number;
    convidados: (PessoaMini & { situacao: string; ingressos: number })[];
    compradores: PessoaMini[];
    mp_conectado: boolean;
  } | null;
}

const erroDe = (e: { message: string }) => (/function|schema cache|relation/i.test(e.message) ? new Error("Falta aplicar a atualização 037 do banco.") : new Error(e.message));

export async function buscarRegras(): Promise<RegrasEventos | null> {
  const { data, error } = await supabase.rpc("regras_eventos_app");
  if (error || !data) return null;
  const r = data as RegrasEventos;
  return { ...r, taxa_pct: Number(r.taxa_pct), preco_min: Number(r.preco_min), preco_max: Number(r.preco_max), pacotes: r.pacotes.map((p) => ({ ...p, preco: Number(p.preco) })) };
}

export async function buscarEventoPessoa(id: string): Promise<EventoPessoa | null> {
  const { data, error } = await supabase.rpc("evento_pessoa", { p_evento: id });
  if (error) throw erroDe(error);
  if (!data) return null;
  const e = data as EventoPessoa;
  return { ...e, cotas: e.cotas.map((c) => ({ ...c, preco: Number(c.preco) })) };
}

export async function salvarEventoPessoa(id: string | null, dados: Record<string, unknown>, cotas: { id?: string; nome: string; descricao?: string; preco: string; quantidade: string }[], termosVersao: number | null) {
  const { data, error } = await supabase.rpc("salvar_evento_pessoa", { p_id: id, p_dados: dados, p_cotas: cotas, p_termos_versao: termosVersao });
  if (error) throw erroDe(error);
  return data as string;
}

export async function reservarAnfitriao(evento: string, itens: { cota_id: string; quantidade: number }[]) {
  const { data, error } = await supabase.rpc("reservar_anfitriao", { p_evento: evento, p_itens: itens });
  if (error) throw erroDe(error);
  return ((data ?? []) as { compra_id: string; total: number; gratis: boolean }[])[0];
}

async function chamarPagamento(corpo: Record<string, unknown>): Promise<{ url: string; teste: boolean }> {
  const { data, error } = await supabase.functions.invoke("mp-anfitriao", { body: corpo });
  if (error || !(data as { url?: string })?.url) {
    let msg = (data as { erro?: string } | null)?.erro;
    if (!msg && error && "context" in error) {
      try {
        msg = ((await (error as { context: Response }).context.json()) as { erro?: string }).erro;
      } catch {
        /* sem detalhe */
      }
    }
    throw new Error(msg ?? "Não foi possível abrir o pagamento agora.");
  }
  return data as { url: string; teste: boolean };
}

export const pagarCompraAnfitriao = (compra: string) => chamarPagamento({ compra });
export const pagarImpulso = (evento: string, pacote: string) => chamarPagamento({ evento, pacote });

/** Ao voltar do Mercado Pago: pede ao servidor para conferir o pagamento. */
export async function conferirVolta(tipo: "anfitriao" | "impulso", id: string, mpId: string | null) {
  if (!mpId) return null;
  const { data } = await supabase.functions.invoke("mp-webhook", { body: { [tipo]: id, payment_id: mpId, type: "payment" } });
  return (data as { situacao?: string } | null)?.situacao ?? null;
}

export interface EventoParaMim {
  id: string;
  titulo: string;
  tipo: TipoEventoPessoa;
  inicio: string;
  capa_url: string | null;
  bairro: string | null;
  anfitriao: PessoaMini;
  motivo: string;
  impulsionado: boolean;
  menor_preco: number | null;
}

export async function eventosParaMim(pos: [number, number] | null): Promise<EventoParaMim[]> {
  const { data, error } = await supabase.rpc("eventos_pessoa_para_mim", { p_lat: pos?.[0] ?? null, p_lng: pos?.[1] ?? null });
  if (error) return [];
  return ((data ?? []) as EventoParaMim[]).map((e) => ({ ...e, menor_preco: e.menor_preco == null ? null : Number(e.menor_preco) }));
}

export const dataEvento = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", " ·");

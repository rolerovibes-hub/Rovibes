import { supabase } from "./supabase";

export interface ItemVenda {
  tipo_id: string;
  tipo: string;
  descricao: string | null;
  meia_entrada: boolean;
  lote_id: string | null;
  lote: string | null;
  preco: number;
  disponiveis: number;
  meias_disponiveis: number;
  vende_ate: string | null;
  esgotado: boolean;
}

export interface MeuIngresso {
  id: string;
  codigo: string;
  situacao: "pendente" | "valido" | "usado" | "cancelado" | "reembolsado";
  preco: number;
  meia: boolean;
  tipo: string | null;
  evento: { id: string; nome: string; inicio: string; fim: string | null; capa_url: string | null; estabelecimento: { id: string; nome: string } };
  comprei: boolean;
  posso_transferir: boolean;
  transferencia_ate: string | null;
  compra_situacao: string | null;
  reembolso: { valor: number; situacao: "solicitado" | "feito" | "falhou" } | null;
  compra_id: string | null;
  expira_em: string | null;
}

export interface LoteEditor {
  id?: string;
  nome: string;
  preco: string;
  quantidade: string;
  vende_ate: string;
}
export interface TipoEditor {
  id?: string;
  nome: string;
  descricao: string;
  meia_entrada: boolean;
  lotes: LoteEditor[];
}
export interface RegrasIngresso {
  modelo: "flexivel" | "moderada" | "rigida";
  prazo_horas: number;
  percentual: number;
  transferencia_horas: number | null;
  limite_por_compra: number;
}

export const MODELOS_CANCELAMENTO: Record<RegrasIngresso["modelo"], { nome: string; texto: string; prazo_horas: number; percentual: number }> = {
  flexivel: { nome: "Flexível", texto: "Devolve 100% até 24 h antes do evento.", prazo_horas: 24, percentual: 100 },
  moderada: { nome: "Moderada", texto: "Devolve 50% até 48 h antes do evento.", prazo_horas: 48, percentual: 50 },
  rigida: { nome: "Rígida", texto: "Sem reembolso depois dos 7 dias de arrependimento.", prazo_horas: 0, percentual: 0 },
};

export const reaisIngresso = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const erroDe = (e: { message: string } | null) =>
  e ? (/function|schema cache|does not exist/i.test(e.message) ? new Error("Falta aplicar a atualização 029 do banco (ingressos pagos).") : new Error(e.message)) : null;

export async function ingressosAVenda(evento: string): Promise<ItemVenda[]> {
  const { data, error } = await supabase.rpc("ingressos_a_venda", { p_evento: evento });
  if (error) return [];
  return ((data ?? []) as ItemVenda[]).map((x) => ({ ...x, preco: Number(x.preco ?? 0) }));
}

export async function textoCancelamento(evento: string): Promise<string | null> {
  const { data } = await supabase.rpc("texto_cancelamento", { p_evento: evento });
  return (data as string | null) ?? null;
}

export async function reservarIngressos(evento: string, itens: { lote_id: string; quantidade: number; meia: boolean }[], ref: string | null) {
  const { data, error } = await supabase.rpc("reservar_ingressos", { p_evento: evento, p_itens: itens, p_ref: ref });
  if (error) throw erroDe(error);
  return ((data ?? []) as { compra_id: string; total: number; gratis: boolean }[])[0];
}

/** Abre o pagamento no Mercado Pago (Pix ou cartão). */
export async function pagarCompra(compra: string): Promise<{ url: string; teste: boolean }> {
  const { data, error } = await supabase.functions.invoke("mp-ingresso", { body: { compra } });
  if (error) {
    const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(corpo?.erro ?? "Não foi possível abrir o pagamento agora.");
  }
  if ((data as { erro?: string })?.erro) throw new Error((data as { erro: string }).erro);
  return data as { url: string; teste: boolean };
}

export async function meusIngressos(): Promise<MeuIngresso[] | null> {
  const { data, error } = await supabase.rpc("meus_ingressos");
  if (error) return null;
  return ((data ?? []) as MeuIngresso[]).map((x) => ({ ...x, preco: Number(x.preco) }));
}

export async function transferirIngresso(ingresso: string, para: string) {
  const { error } = await supabase.rpc("transferir_ingresso", { p_ingresso: ingresso, p_para: para });
  if (error) throw erroDe(error);
}

export async function simularCancelamento(ingresso: string) {
  const { data, error } = await supabase.rpc("simular_cancelamento", { p_ingresso: ingresso });
  if (error) throw erroDe(error);
  const r = ((data ?? []) as { permitido: boolean; valor: number; motivo: string }[])[0];
  return { ...r, valor: Number(r?.valor ?? 0) };
}

export async function cancelarIngresso(ingresso: string): Promise<number> {
  const { data, error } = await supabase.rpc("cancelar_ingresso", { p_ingresso: ingresso });
  if (error) throw erroDe(error);
  const valor = Number(data ?? 0);
  if (valor > 0) {
    // Pede o reembolso no Mercado Pago (se falhar, o estabelecimento vê e conclui pelo Business).
    const { data: r } = await supabase.from("reembolsos_ingresso").select("id").eq("ingresso_id", ingresso).eq("situacao", "solicitado");
    const ids = ((r ?? []) as { id: string }[]).map((x) => x.id);
    if (ids.length) await supabase.functions.invoke("mp-reembolso", { body: { reembolsos: ids } }).catch(() => undefined);
  }
  return valor;
}

export async function carregarEditor(evento: string): Promise<{ tipos: TipoEditor[]; regras: RegrasIngresso }> {
  const [t, e] = await Promise.all([
    supabase
      .from("ingresso_tipos")
      .select("id, nome, descricao, meia_entrada, ordem, ativo, lotes:ingresso_lotes(id, nome, preco, quantidade, vende_ate, ordem, ativo)")
      .eq("evento_id", evento)
      .eq("ativo", true)
      .order("ordem"),
    supabase.from("eventos").select("cancelamento, transferencia_horas, limite_por_compra").eq("id", evento).maybeSingle(),
  ]);
  if (t.error) throw erroDe(t.error);
  const paraLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  type T = { id: string; nome: string; descricao: string | null; meia_entrada: boolean; lotes: { id: string; nome: string; preco: number; quantidade: number; vende_ate: string | null; ordem: number; ativo: boolean }[] };
  const tipos = ((t.data ?? []) as T[]).map((x) => ({
    id: x.id,
    nome: x.nome,
    descricao: x.descricao ?? "",
    meia_entrada: x.meia_entrada,
    lotes: [...x.lotes]
      .filter((l) => l.ativo)
      .sort((a, b) => a.ordem - b.ordem)
      .map((l) => ({ id: l.id, nome: l.nome, preco: String(l.preco).replace(".", ","), quantidade: String(l.quantidade), vende_ate: paraLocal(l.vende_ate) })),
  }));
  const ev = (e.data ?? {}) as { cancelamento?: { modelo: RegrasIngresso["modelo"]; prazo_horas: number; percentual: number }; transferencia_horas?: number | null; limite_por_compra?: number };
  return {
    tipos,
    regras: {
      modelo: ev.cancelamento?.modelo ?? "moderada",
      prazo_horas: ev.cancelamento?.prazo_horas ?? 48,
      percentual: ev.cancelamento?.percentual ?? 50,
      transferencia_horas: ev.transferencia_horas ?? null,
      limite_por_compra: ev.limite_por_compra ?? 10,
    },
  };
}

export async function salvarEditor(evento: string, tipos: TipoEditor[], regras: RegrasIngresso) {
  const dados = tipos.map((t) => ({
    id: t.id ?? null,
    nome: t.nome.trim(),
    descricao: t.descricao.trim(),
    meia_entrada: t.meia_entrada,
    lotes: t.lotes.map((l) => ({
      id: l.id ?? null,
      nome: l.nome.trim() || "Lote",
      preco: l.preco.replace(/\./g, "").replace(",", ".") || "0",
      quantidade: l.quantidade || "0",
      vende_ate: l.vende_ate ? new Date(l.vende_ate).toISOString() : "",
    })),
  }));
  const { error } = await supabase.rpc("salvar_ingressos_evento", {
    p_evento: evento,
    p_tipos: dados,
    p_regras: { ...regras, transferencia_horas: regras.transferencia_horas == null ? "" : String(regras.transferencia_horas) },
  });
  if (error) throw erroDe(error);
}

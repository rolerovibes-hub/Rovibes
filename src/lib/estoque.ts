import { supabase } from "./supabase";

export type Unidade = "un" | "kg" | "g" | "l" | "ml" | "cx" | "dose";
export const UNIDADES: { id: Unidade; nome: string }[] = [
  { id: "un", nome: "unidade" },
  { id: "ml", nome: "ml" },
  { id: "l", nome: "litro" },
  { id: "g", nome: "g" },
  { id: "kg", nome: "kg" },
  { id: "dose", nome: "dose" },
  { id: "cx", nome: "caixa" },
];

export type TipoLocal = "deposito" | "refrigerador" | "bar" | "cozinha" | "camara" | "outro";
export const TIPOS_LOCAL: { id: TipoLocal; nome: string }[] = [
  { id: "deposito", nome: "Depósito" },
  { id: "refrigerador", nome: "Refrigerador" },
  { id: "camara", nome: "Câmara fria" },
  { id: "bar", nome: "Bar" },
  { id: "cozinha", nome: "Cozinha" },
  { id: "outro", nome: "Outro" },
];

export const SETORES = [
  { id: "bar", nome: "Bar" },
  { id: "cozinha", nome: "Cozinha" },
  { id: "sem_preparo", nome: "Itens sem preparo" },
] as const;

export const CONSERVACOES = [
  { id: "ambiente", nome: "Ambiente" },
  { id: "refrigerado", nome: "Refrigerado" },
  { id: "congelado", nome: "Congelado" },
] as const;

export interface ProdutoEstoque {
  id: string;
  nome: string;
  codigo: string | null;
  ean: string | null;
  marca: string | null;
  grupo: string | null;
  categoria: string | null;
  unidade: Unidade;
  embalagem_nome: string | null;
  embalagem_fator: number | null;
  saldo: number;
  minimo: number | null;
  custo: number | null;
  validade: string | null;
  controla_validade: boolean;
  conservacao: "ambiente" | "refrigerado" | "congelado";
  ncm: string | null;
  local_padrao_id: string | null;
  ativo: boolean;
  biblioteca_id?: string | null;
  foto_url?: string | null;
  descricao?: string | null;
}

export interface LocalEstoque {
  id: string;
  nome: string;
  tipo: TipoLocal;
  consumo_setor: "bar" | "cozinha" | "sem_preparo" | null;
  ativo: boolean;
  ordem: number;
}

export type TipoMovimento = "entrada" | "transferencia" | "perda" | "ajuste";

export const NOME_MOVIMENTO: Record<string, string> = {
  entrada: "Entrada",
  transferencia: "Transferência",
  perda: "Perda / quebra",
  saida: "Perda / quebra",
  ajuste: "Ajuste (contagem)",
  consumo: "Venda",
};

export const CAMPOS_PRODUTO_BASE =
  "id, nome, codigo, ean, marca, grupo, categoria, unidade, embalagem_nome, embalagem_fator, saldo, minimo, custo, validade, controla_validade, conservacao, ncm, local_padrao_id, ativo";
export const CAMPOS_PRODUTO = `${CAMPOS_PRODUTO_BASE}, biblioteca_id, foto_url, descricao`;

const n = (v: unknown) => (v == null ? null : Number(v));

export function normalizarProduto(x: Record<string, unknown>): ProdutoEstoque {
  return {
    ...(x as unknown as ProdutoEstoque),
    saldo: Number(x.saldo ?? 0),
    minimo: n(x.minimo),
    custo: n(x.custo),
    embalagem_fator: n(x.embalagem_fator),
    controla_validade: !!x.controla_validade,
    conservacao: (x.conservacao as ProdutoEstoque["conservacao"]) ?? "ambiente",
  };
}

/** Produtos, locais e o saldo de cada produto em cada local. */
export async function carregarEstoque(estab: string) {
  const produtosDe = (campos: string) => supabase.from("estoque_produtos").select(campos).eq("estabelecimento_id", estab).order("nome");
  const [p0, l] = await Promise.all([
    produtosDe(CAMPOS_PRODUTO),
    supabase.from("estoque_locais").select("id, nome, tipo, consumo_setor, ativo, ordem").eq("estabelecimento_id", estab).order("ordem").order("nome"),
  ]);
  // Antes da atualização 021 do banco não há biblioteca/foto.
  const p = p0.error ? await produtosDe(CAMPOS_PRODUTO_BASE) : p0;
  const erro = p.error ?? l.error;
  const produtos = ((p.data ?? []) as unknown as Record<string, unknown>[]).map(normalizarProduto);
  const locais = (l.data ?? []) as LocalEstoque[];
  const saldos = new Map<string, number>();
  if (locais.length) {
    const { data } = await supabase.from("estoque_saldos").select("produto_id, local_id, quantidade").in("local_id", locais.map((x) => x.id));
    for (const s of (data ?? []) as { produto_id: string; local_id: string; quantidade: number }[]) saldos.set(`${s.produto_id}:${s.local_id}`, Number(s.quantidade));
  }
  return { produtos, locais, saldos, erro };
}

export async function movimentar(args: {
  produto: string;
  tipo: TipoMovimento;
  quantidade: number;
  motivo?: string | null;
  local?: string | null;
  destino?: string | null;
  emEmbalagem?: boolean;
  validade?: string | null;
}) {
  const { data, error } = await supabase.rpc("movimentar_estoque", {
    p_produto: args.produto,
    p_tipo: args.tipo,
    p_quantidade: args.quantidade,
    p_motivo: args.motivo ?? null,
    p_validade: args.validade ?? null,
    p_local: args.local ?? null,
    p_destino: args.destino ?? null,
    p_em_embalagem: !!args.emEmbalagem,
  });
  if (error) throw error;
  return Number(data);
}

export const formatarQtd = (v: number | null | undefined, casas = 3) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: casas }));

export const lerNumero = (t: string) => {
  const s = t.trim();
  if (!s) return null;
  const v = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(v) ? v : null;
};

export const paraCampo = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

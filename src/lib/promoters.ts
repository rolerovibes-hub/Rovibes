import { supabase } from "./supabase";

export interface Beneficio {
  id: string;
  tipo: "comissao" | "evento" | "consumacao" | "vip" | "outro";
  descricao: string;
  valor: number | null;
  unidade: "%" | "R$" | "itens" | "pessoas" | null;
  condicao: string | null;
  evento_id: string | null;
  ativo: boolean;
}

export interface Resultados {
  cliques: number;
  pessoas: number;
  na_lista: number;
  chegaram: number;
  checkins: number;
}

export interface PromoterEstab {
  id: string;
  usuario_id: string;
  nome: string;
  usuario: string | null;
  foto_url: string | null;
  situacao: "convidado" | "ativo";
  codigo: string;
  convidado_em: string;
  aceito_em: string | null;
  beneficios: Beneficio[];
  resultados: Resultados;
}

export interface MinhaArea {
  id: string;
  situacao: "convidado" | "ativo";
  codigo: string;
  mensagem: string | null;
  convidado_em: string;
  estab: { id: string; nome: string; logo_url: string | null };
  beneficios: Beneficio[];
  resultados: Resultados | null;
  eventos: { id: string; nome: string; inicio: string }[] | null;
  ao_vivo: boolean;
}

export interface ListaAberta {
  id: string;
  nome: string;
  beneficio: string | null;
  limite: number | null;
  encerra_em: string | null;
  inscritos: number;
  promoter: string | null;
  promoter_codigo: string | null;
  eu_estou: boolean;
  cheia: boolean;
}

export interface ListaGerir {
  id: string;
  nome: string;
  beneficio: string | null;
  limite: number | null;
  encerra_em: string | null;
  ativa: boolean;
  evento: { id: string; nome: string; inicio: string } | null;
  promoter: string | null;
  inscritos: number;
  chegaram: number;
  minha: boolean;
}

export interface NomeLista {
  id: string;
  nome: string;
  usuario: string | null;
  acompanhantes: number;
  criado_em: string;
  chegou_em: string | null;
}

export const TIPOS_BENEFICIO: { id: Beneficio["tipo"]; nome: string; unidade: Beneficio["unidade"] }[] = [
  { id: "comissao", nome: "Comissão financeira", unidade: "%" },
  { id: "evento", nome: "Acesso a eventos", unidade: "pessoas" },
  { id: "consumacao", nome: "Bebidas ou comidas", unidade: "itens" },
  { id: "vip", nome: "Área VIP", unidade: null },
  { id: "outro", nome: "Outro", unidade: null },
];
export const nomeTipoBeneficio = (t: string) => TIPOS_BENEFICIO.find((x) => x.id === t)?.nome ?? t;

export function textoBeneficio(b: Beneficio) {
  const v = b.valor == null ? "" : b.unidade === "R$" ? `R$ ${Number(b.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : b.unidade === "%" ? `${Number(b.valor).toLocaleString("pt-BR")}%` : `${Number(b.valor).toLocaleString("pt-BR")} ${b.unidade ?? ""}`;
  return [v, b.descricao].filter(Boolean).join(" · ");
}

export const erroPromoter = (e: { message: string } | null) =>
  e ? (/function|schema cache|does not exist/i.test(e.message) ? new Error("Falta aplicar a atualização 025 do banco (Promoters).") : new Error(e.message)) : null;

export async function rpc<T = unknown>(nome: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw erroPromoter(error);
  return data as T;
}

// ------------------------------------------------------------
// Link de divulgação: /lugar/ID?ref=CODIGO ou /evento/ID?ref=CODIGO
// ------------------------------------------------------------
const CHAVE_REF = "rovibes:ref";
export const linkDivulgacao = (alvo: "lugar" | "evento", id: string, codigo: string) => `${window.location.origin}/${alvo}/${id}?ref=${codigo}`;

/** Guarda o código do promoter que trouxe a pessoa e registra a visita. */
export function capturarRef(alvo: "lugar" | "evento", id: string) {
  const codigo = new URLSearchParams(window.location.search).get("ref");
  if (!codigo) return;
  try {
    sessionStorage.setItem(CHAVE_REF, codigo);
  } catch {
    /* sem armazenamento */
  }
  void supabase.rpc("registrar_clique_promoter", { p_codigo: codigo, p_alvo: alvo, p_alvo_id: id });
}
export function refGuardado(): string | null {
  try {
    return sessionStorage.getItem(CHAVE_REF);
  } catch {
    return null;
  }
}

export async function compartilhar(titulo: string, url: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title: titulo, url });
      return "compartilhado";
    } catch {
      /* cancelado: copia */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copiado";
  } catch {
    window.prompt("Copie o link:", url);
    return "copiado";
  }
}

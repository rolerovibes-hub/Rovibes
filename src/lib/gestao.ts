import { createContext, useContext } from "react";
import { supabase } from "./supabase";
import { chamarFuncao } from "./sistema";

export const emailGestao = (login: string) => `${login.trim().toLowerCase()}@gestao.rovibes.app`;
export const contasGestao = <T = Record<string, unknown>,>(acao: string, corpo: Record<string, unknown> = {}) => chamarFuncao<T>("contas-gestao", acao, corpo);

export interface AcessoGestao {
  gestao: boolean;
  login?: string;
  nome?: string;
  ceo?: boolean;
  ativo?: boolean;
  cargo?: string | null;
  niveis?: string[];
  confirmada?: boolean;
  permissoes?: Record<string, number>;
}

export async function meuAcessoGestao(): Promise<AcessoGestao | null> {
  const { data, error } = await supabase.rpc("meu_acesso_gestao");
  return error ? null : (data as AcessoGestao);
}

/** Situação do código (autenticador): precisa cadastrar, precisa digitar ou já confirmado. */
export async function etapaDoCodigo(): Promise<"cadastrar" | "digitar" | "ok"> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === "aal2") return "ok";
  return data?.nextLevel === "aal2" ? "digitar" : "cadastrar";
}

// ============================================================
// Central de operação
// ============================================================

export const AREAS_OPERACAO: { id: string; nome: string }[] = [
  { id: "atendimento", nome: "Atendimento" },
  { id: "suporte", nome: "Suporte" },
  { id: "operacao", nome: "Operação" },
  { id: "estabelecimentos", nome: "Estabelecimentos" },
  { id: "usuarios", nome: "Usuários e acessos" },
  { id: "produto", nome: "Produto" },
  { id: "financeiro", nome: "Financeiro" },
  { id: "seguranca", nome: "Segurança" },
  { id: "conhecimento", nome: "Conhecimento" },
  { id: "configuracoes", nome: "Configurações" },
  { id: "inteligencia", nome: "Inteligência" },
];
export const nomeArea = (id: string) => AREAS_OPERACAO.find((a) => a.id === id)?.nome ?? id;

export const NIVEIS_ACAO = ["—", "Ver", "Atuar", "Decidir", "Autorizar", "Administrar"];

export const PRIORIDADES: Record<string, { nome: string; cor: string }> = {
  critica: { nome: "Crítica", cor: "bg-perigo" },
  alta: { nome: "Alta", cor: "bg-alerta" },
  media: { nome: "Média", cor: "bg-azul" },
  baixa: { nome: "Baixa", cor: "bg-borda" },
};
export const ESTADOS: Record<string, string> = { nova: "Nova", em_analise: "Em análise", aguardando: "Aguardando", resolvida: "Resolvida", encerrada: "Encerrada" };
export const TIPOS: Record<string, string> = {
  tecnica: "Técnica",
  solicitacao: "Solicitação",
  reclamacao: "Reclamação",
  anomalia: "Anomalia",
  integracao: "Integração",
  financeira: "Financeira",
  seguranca: "Segurança",
  melhoria: "Melhoria",
  outra: "Outra",
};
export const codSit = (n: number) => `SIT-${String(n).padStart(4, "0")}`;
export const codCon = (n: number) => `CON-${String(n).padStart(3, "0")}`;

export interface SituacaoLinha {
  id: string;
  numero: number;
  titulo: string;
  area: string;
  tipo: string;
  prioridade: string;
  estado: string;
  origem: string;
  conhecimento_numero: number | null;
  estabelecimento_id: string | null;
  estabelecimento: string | null;
  responsavel_id: string | null;
  responsavel: string | null;
  criado_em: string;
  atualizado_em: string;
}

/** Acesso da pessoa na Gestão (inclui o nível por área). */
export const GestaoContexto = createContext<{ acesso: AcessoGestao & { permissoes?: Record<string, number> }; nivel: (area: string) => number }>({
  acesso: { gestao: false },
  nivel: () => 0,
});
export const useGestao = () => useContext(GestaoContexto);

export const tempoCurto = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

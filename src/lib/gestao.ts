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

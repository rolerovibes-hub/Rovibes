import { clienteTemporario, supabase } from "./supabase";

/** "Bar da Bia" → "bardabia" (o código nasce do nome assim; aceita também o nome digitado). */
export const normalizarCodigo = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
export const normalizarLogin = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9._]/g, "");

/** Login do sistema do estabelecimento vira um e-mail interno (nunca recebe mensagens). */
export const emailSistema = (login: string, codigo: string) => `${normalizarLogin(login)}.${normalizarCodigo(codigo)}@sistema.rovibes.app`;

export async function entrarNoSistema(codigo: string, login: string, senha: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: emailSistema(login, codigo), password: senha });
  if (error) throw error;
  try {
    localStorage.setItem("rovibes:ultimo-codigo", normalizarCodigo(codigo));
  } catch {
    /* sem armazenamento */
  }
}

export const ultimoCodigo = () => {
  try {
    return localStorage.getItem("rovibes:ultimo-codigo") ?? "";
  } catch {
    return "";
  }
};

/** Chama a função do servidor que cria e gerencia os usuários do sistema. */
export const contasSistema = <T = Record<string, unknown>,>(acao: string, corpo: Record<string, unknown> = {}) => chamarFuncao<T>("contas-sistema", acao, corpo);

/** Chama uma função do servidor e traduz o erro que vem no corpo da resposta. */
export async function chamarFuncao<T = Record<string, unknown>>(nome: string, acao: string, corpo: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body: { acao, ...corpo } });
  const d = data as { erro?: string } | null;
  if (d?.erro) throw new Error(d.erro);
  if (error) {
    // A resposta de erro da função vem no corpo.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const j = (await ctx.json().catch(() => null)) as { erro?: string } | null;
      if (j?.erro) throw new Error(j.erro);
    }
    throw new Error(/Failed to send|not found|404/i.test(error.message) ? "O servidor do sistema ainda não está pronto. Tente de novo em alguns minutos." : error.message);
  }
  return data as T;
}

/** Confirma a conta pessoal do RoVibes (sem abrir sessão aqui) e devolve o token de uso único. */
export async function confirmarContaPessoal(email: string, senha: string) {
  const temp = clienteTemporario();
  const { data, error } = await temp.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error || !data.session) throw error ?? new Error("Não foi possível confirmar.");
  return { token: data.session.access_token, id: data.user.id, encerrar: () => void temp.auth.signOut({ scope: "local" }).catch(() => undefined), cliente: temp };
}

export interface EstabResponsavel {
  id: string;
  nome: string;
  codigo: string;
  situacao: string;
  login_proprietario: string | null;
}

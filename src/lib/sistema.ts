import { clienteTemporario, supabase } from "./supabase";

/** Login do sistema do estabelecimento vira um e-mail interno (nunca recebe mensagens). */
export const emailSistema = (login: string, codigo: string) => `${login.trim().toLowerCase()}.${codigo.trim().toLowerCase()}@sistema.rovibes.app`;

export async function entrarNoSistema(codigo: string, login: string, senha: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: emailSistema(login, codigo), password: senha });
  if (error) throw error;
  try {
    localStorage.setItem("rovibes:ultimo-codigo", codigo.trim().toLowerCase());
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
export async function contasSistema<T = Record<string, unknown>>(acao: string, corpo: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("contas-sistema", { body: { acao, ...corpo } });
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

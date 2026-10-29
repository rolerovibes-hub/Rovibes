import { createClient } from "@supabase/supabase-js";

export const bancoConfigurado = Boolean(__SUPABASE_URL__ && __SUPABASE_CHAVE__);

/**
 * O RoVibes Business e o Job usam outra sessão (usuário do sistema do estabelecimento), separada do perfil pessoal do app.
 * O cliente é escolhido ao abrir a página; trocar entre app e sistema recarrega a página (veja `sessaoDoSistema`).
 */
export const ehAreaSistema = (caminho: string) => /^\/(business|job)(\/|$)/.test(caminho);
export const ehAreaGestao = (caminho: string) => /^\/gestao(\/|$)/.test(caminho);
/** Cada mundo tem a sua sessão: app (pessoal), sistema (Business/Job) e gestão (equipe RoVibes). */
export const contextoDe = (caminho: string): "app" | "sistema" | "gestao" => (ehAreaGestao(caminho) ? "gestao" : ehAreaSistema(caminho) ? "sistema" : "app");
/** Apps de computador (Tauri) definem o contexto antes de carregar: o caminho da janela não diz qual é. */
const contextoForcado = typeof window !== "undefined" ? (window as unknown as { __ROVIBES_CONTEXTO__?: "app" | "sistema" | "gestao" }).__ROVIBES_CONTEXTO__ : undefined;
export const contextoAtual = contextoForcado ?? (typeof window !== "undefined" ? contextoDe(window.location.pathname) : "app");
export const sessaoDoSistema = contextoAtual === "sistema";

// Sem as variáveis (ex.: antes de ligar o Supabase), cria um cliente que só falha ao ser usado.
export const supabase = createClient(
  __SUPABASE_URL__ || "https://sem-banco.invalid",
  __SUPABASE_CHAVE__ || "sem-chave",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: contextoAtual === "app",
      ...(contextoAtual === "sistema" ? { storageKey: "rovibes-sistema-sessao" } : contextoAtual === "gestao" ? { storageKey: "rovibes-gestao-sessao" } : {}),
    },
  },
);

/** Cliente de uso único (não guarda sessão): confirma a conta pessoal sem mexer na sessão aberta. */
export const clienteTemporario = () =>
  createClient(__SUPABASE_URL__ || "https://sem-banco.invalid", __SUPABASE_CHAVE__ || "sem-chave", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `rovibes-temp-${Math.random()}` },
  });

/** Traduz os erros mais comuns do Supabase para mensagens claras. */
export function mensagemDeErro(erro: unknown): string {
  const msg = erro instanceof Error ? erro.message : typeof erro === "object" && erro && "message" in erro ? String((erro as { message: unknown }).message) : String(erro);
  if (/Invalid login credentials/i.test(msg)) return sessaoDoSistema ? "Estabelecimento, usuário ou senha incorretos." : "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(msg)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (/User already registered/i.test(msg)) return "Já existe uma conta com este e-mail.";
  if (/Password should be at least/i.test(msg)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/maiores de 18/i.test(msg) || /Database error saving new user/i.test(msg)) return "O RoVibes é para maiores de 18 anos.";
  if (/rate limit/i.test(msg)) return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
  if (/Failed to fetch|sem-banco/i.test(msg)) return "Sem conexão com o banco de dados.";
  if (/row-level security|permission denied/i.test(msg)) return "Você não tem permissão para fazer isso.";
  if (/violates check constraint/i.test(msg)) return "Confira os campos: algum valor está fora do permitido.";
  return msg;
}

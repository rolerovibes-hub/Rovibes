import { createClient } from "@supabase/supabase-js";

export const bancoConfigurado = Boolean(__SUPABASE_URL__ && __SUPABASE_CHAVE__);

// Sem as variáveis (ex.: antes de ligar o Supabase), cria um cliente que só falha ao ser usado.
export const supabase = createClient(
  __SUPABASE_URL__ || "https://sem-banco.invalid",
  __SUPABASE_CHAVE__ || "sem-chave",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

/** Traduz os erros mais comuns do Supabase para mensagens claras. */
export function mensagemDeErro(erro: unknown): string {
  const msg = erro instanceof Error ? erro.message : typeof erro === "object" && erro && "message" in erro ? String((erro as { message: unknown }).message) : String(erro);
  if (/Invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(msg)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (/User already registered/i.test(msg)) return "Já existe uma conta com este e-mail.";
  if (/Password should be at least/i.test(msg)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/maiores de 18/i.test(msg) || /Database error saving new user/i.test(msg)) return "O RoVibes é para maiores de 18 anos.";
  if (/rate limit/i.test(msg)) return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
  if (/Failed to fetch|sem-banco/i.test(msg)) return "Sem conexão com o banco de dados.";
  return msg;
}

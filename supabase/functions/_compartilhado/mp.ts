// Utilidades do Mercado Pago usadas pelas funções do servidor do RoVibes.
import { createClient } from "jsr:@supabase/supabase-js@2";

export const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
export const CHAVE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
export const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const SITE = Deno.env.get("ROVIBES_SITE") ?? "https://rovibes.vercel.app";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

export const admin = () => createClient(URL_SUPABASE, CHAVE_SERVICO, { auth: { persistSession: false } });

/** Token do Mercado Pago do estabelecimento (conectado) ou, em modo teste, o da aplicação RoVibes. */
export async function tokenDoEstab(estab: string): Promise<{ token: string; conectado: boolean } | null> {
  const { data } = await admin().from("mp_contas").select("access_token").eq("estabelecimento_id", estab).maybeSingle();
  if (data?.access_token) return { token: data.access_token as string, conectado: true };
  const teste = Deno.env.get("MP_ACCESS_TOKEN_TESTE");
  return teste ? { token: teste, conectado: false } : null;
}

/** Token do Mercado Pago do anfitrião (conta pessoal conectada) ou, em modo teste, o da aplicação RoVibes. */
export async function tokenDoAnfitriao(usuario: string): Promise<{ token: string; conectado: boolean } | null> {
  const { data } = await admin().from("mp_contas_pessoas").select("access_token").eq("usuario_id", usuario).maybeSingle();
  if (data?.access_token) return { token: data.access_token as string, conectado: true };
  const teste = Deno.env.get("MP_ACCESS_TOKEN_TESTE");
  return teste ? { token: teste, conectado: false } : null;
}

/** Token da própria conta RoVibes (para cobrar o impulsionamento). Sem a de produção, usa a de teste. */
export function tokenRoVibes(): { token: string; teste: boolean } | null {
  const producao = Deno.env.get("MP_ACCESS_TOKEN_ROVIBES");
  if (producao) return { token: producao, teste: false };
  const teste = Deno.env.get("MP_ACCESS_TOKEN_TESTE");
  return teste ? { token: teste, teste: true } : null;
}

export function meioDoMp(tipo: string | undefined) {
  if (tipo === "bank_transfer" || tipo === "pix") return "pix";
  if (tipo === "credit_card") return "credito";
  if (tipo === "debit_card") return "debito";
  return "outro";
}

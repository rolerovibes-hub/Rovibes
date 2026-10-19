// Reembolso de ingresso no Mercado Pago (parcial, por ingresso). Só quem pediu o reembolso ou a equipe do lugar pode acionar.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { admin, CHAVE_ANON, cors, resposta, tokenDoEstab, URL_SUPABASE } from "../_compartilhado/mp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const autorizacao = req.headers.get("Authorization");
    if (!autorizacao) return resposta({ erro: "Entre na sua conta." }, 401);
    const { reembolsos } = (await req.json()) as { reembolsos: string[] };
    const usuario = createClient(URL_SUPABASE, CHAVE_ANON, { global: { headers: { Authorization: autorizacao } }, auth: { persistSession: false } });
    // A leitura com o login da pessoa garante a permissão (regras do banco).
    const { data: lista } = await usuario.from("reembolsos_ingresso").select("id, compra_id, estabelecimento_id, valor, situacao").in("id", reembolsos ?? []);
    const db = admin();
    const feitos: string[] = [];
    const falhas: string[] = [];
    for (const r of (lista ?? []) as { id: string; compra_id: string; estabelecimento_id: string; valor: number; situacao: string }[]) {
      if (r.situacao === "feito") continue;
      const { data: compra } = await db.from("compras_ingresso").select("mp_pagamento").eq("id", r.compra_id).maybeSingle();
      const conta = await tokenDoEstab(r.estabelecimento_id);
      if (!compra?.mp_pagamento || !conta) {
        falhas.push(r.id);
        continue;
      }
      const resp = await fetch(`https://api.mercadopago.com/v1/payments/${compra.mp_pagamento}/refunds`, {
        method: "POST",
        headers: { Authorization: `Bearer ${conta.token}`, "Content-Type": "application/json", "X-Idempotency-Key": `reembolso-${r.id}` },
        body: JSON.stringify({ amount: Number(r.valor) }),
      });
      const corpo = await resp.json().catch(() => ({}));
      if (resp.ok) {
        await db.rpc("marcar_reembolso", { p_reembolso: r.id, p_situacao: "feito", p_mp: String(corpo.id ?? "") });
        feitos.push(r.id);
      } else {
        console.error("Reembolso recusado", resp.status, JSON.stringify(corpo));
        await db.rpc("marcar_reembolso", { p_reembolso: r.id, p_situacao: "falhou", p_mp: null });
        falhas.push(r.id);
      }
    }
    return resposta({ feitos, falhas });
  } catch (e) {
    console.error(e);
    return resposta({ erro: "Erro inesperado no reembolso." }, 500);
  }
});

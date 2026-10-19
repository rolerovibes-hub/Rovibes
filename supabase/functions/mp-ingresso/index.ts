// Pagamento dos ingressos: o banco confere a reserva (com o login de quem compra) e o Mercado Pago gera o link.
// A taxa do RoVibes é absorvida pelo estabelecimento (sai do repasse como marketplace_fee).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { admin, CHAVE_ANON, cors, resposta, SITE, tokenDoEstab, URL_SUPABASE } from "../_compartilhado/mp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const autorizacao = req.headers.get("Authorization");
    if (!autorizacao) return resposta({ erro: "Entre na sua conta." }, 401);
    const { compra } = await req.json();
    const usuario = createClient(URL_SUPABASE, CHAVE_ANON, { global: { headers: { Authorization: autorizacao } }, auth: { persistSession: false } });

    const { data, error } = await usuario.rpc("preparar_compra_ingresso", { p_compra: compra });
    if (error) return resposta({ erro: error.message }, 400);
    const p = (data as { compra_id: string; total: number; estabelecimento_id: string; descricao: string; comissao_pct: number; quantidade: number; evento_id: string }[])[0];

    const conta = await tokenDoEstab(p.estabelecimento_id);
    if (!conta) return resposta({ erro: "Este lugar ainda não vende ingressos pelo App." }, 400);

    const total = Number(p.total);
    const comissao = conta.conectado ? Math.round(total * Number(p.comissao_pct)) / 100 : 0;
    const origem = req.headers.get("origin") ?? SITE;
    const volta = `${origem.startsWith("http") && !origem.includes("localhost") ? origem : SITE}/carteira?aba=ingressos&compra=${p.compra_id}`;

    const corpo: Record<string, unknown> = {
      items: [{ id: p.compra_id, title: p.descricao, quantity: 1, unit_price: total, currency_id: "BRL" }],
      external_reference: `ingresso:${p.compra_id}`,
      notification_url: `${URL_SUPABASE}/functions/v1/mp-webhook?compra=${p.compra_id}`,
      back_urls: { success: volta, failure: volta, pending: volta },
      auto_return: "approved",
      statement_descriptor: "ROVIBES",
      payment_methods: { installments: 6 },
      expires: true,
      expiration_date_to: new Date(Date.now() + 15 * 60000).toISOString(),
    };
    if (comissao > 0) corpo.marketplace_fee = comissao;

    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${conta.token}`, "Content-Type": "application/json", "X-Idempotency-Key": `ingresso-${p.compra_id}` },
      body: JSON.stringify(corpo),
    });
    const pref = await r.json();
    if (!r.ok || !pref.init_point) {
      console.error("Mercado Pago recusou a preferência", r.status, JSON.stringify(pref));
      return resposta({ erro: "Não foi possível iniciar o pagamento agora. Tente de novo." }, 502);
    }
    await admin().from("compras_ingresso").update({ mp_preferencia: pref.id }).eq("id", p.compra_id);
    return resposta({ url: pref.init_point, compra: p.compra_id, total, teste: !conta.conectado });
  } catch (e) {
    console.error(e);
    return resposta({ erro: "Erro inesperado ao iniciar o pagamento." }, 500);
  }
});

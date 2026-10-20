// Cria o pagamento pelo App: o banco calcula o valor (com o login da pessoa) e o Mercado Pago gera o link de pagamento.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { admin, CHAVE_ANON, cors, resposta, SITE, tokenDoEstab, URL_SUPABASE } from "../_compartilhado/mp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const autorizacao = req.headers.get("Authorization");
    if (!autorizacao) return resposta({ erro: "Entre na sua conta." }, 401);
    const { comanda: comandaPedida, modo, valor, pedido } = await req.json();
    const usuario = createClient(URL_SUPABASE, CHAVE_ANON, { global: { headers: { Authorization: autorizacao } }, auth: { persistSession: false } });

    // Pedido pré-pago (balcão ou mesa pré-paga) ou parte da conta da comanda.
    const { data, error } = pedido
      ? await usuario.rpc("preparar_pagamento_pedido", { p_pedido: pedido })
      : await usuario.rpc("preparar_pagamento_app", { p_comanda: comandaPedida, p_modo: modo, p_valor: valor ?? null });
    if (error) return resposta({ erro: error.message }, 400);
    const p = (data as { pagamento_id: string | null; valor: number; estabelecimento_id: string; descricao: string; comissao_pct: number; comanda_id?: string }[])[0];
    const comanda = p.comanda_id ?? comandaPedida;
    // Cupom cobriu o pedido inteiro: já foi liberado para o preparo.
    if (!p.pagamento_id) return resposta({ liberado: true, comanda });

    const conta = await tokenDoEstab(p.estabelecimento_id);
    if (!conta) return resposta({ erro: "Este lugar ainda não recebe pagamentos pelo App." }, 400);

    const valorNum = Number(p.valor);
    const comissao = conta.conectado ? Math.round(valorNum * Number(p.comissao_pct)) / 100 : 0;
    const origem = req.headers.get("origin") ?? SITE;
    const volta = `${origem}/comanda/${comanda}?pagamento=${p.pagamento_id}`;

    const corpo: Record<string, unknown> = {
      items: [{ id: p.pagamento_id, title: p.descricao, quantity: 1, unit_price: valorNum, currency_id: "BRL" }],
      external_reference: p.pagamento_id,
      notification_url: `${URL_SUPABASE}/functions/v1/mp-webhook?pagamento=${p.pagamento_id}`,
      back_urls: { success: volta, failure: volta, pending: volta },
      auto_return: "approved",
      statement_descriptor: "ROVIBES",
      payment_methods: { installments: 1 },
      expires: true,
      expiration_date_to: new Date(Date.now() + 30 * 60000).toISOString(),
    };
    if (comissao > 0) corpo.marketplace_fee = comissao;

    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${conta.token}`, "Content-Type": "application/json", "X-Idempotency-Key": p.pagamento_id },
      body: JSON.stringify(corpo),
    });
    const pref = await r.json();
    if (!r.ok || !pref.init_point) {
      await admin().from("pagamentos").update({ situacao: "cancelado", motivo_cancelamento: "Falha ao criar no Mercado Pago" }).eq("id", p.pagamento_id);
      console.error("Mercado Pago recusou a preferência", r.status, JSON.stringify(pref));
      return resposta({ erro: "Não foi possível iniciar o pagamento agora. Tente de novo." }, 502);
    }
    await admin().from("pagamentos").update({ mp_preferencia: pref.id, comissao }).eq("id", p.pagamento_id);
    return resposta({ url: pref.init_point, pagamento: p.pagamento_id, valor: valorNum, teste: !conta.conectado, comanda });
  } catch (e) {
    console.error(e);
    return resposta({ erro: "Erro inesperado ao iniciar o pagamento." }, 500);
  }
});

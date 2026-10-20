// Pagamentos dos eventos de anfitriões:
//  • { compra }  → ingressos; o dinheiro vai para a conta Mercado Pago do anfitrião e o RoVibes fica com a taxa (marketplace_fee).
//  • { impulso } → impulsionamento; pago à conta do RoVibes.
// O valor sempre vem do banco (com o login de quem paga), nunca do celular.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { admin, CHAVE_ANON, cors, resposta, SITE, tokenDoAnfitriao, tokenRoVibes, URL_SUPABASE } from "../_compartilhado/mp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const autorizacao = req.headers.get("Authorization");
    if (!autorizacao) return resposta({ erro: "Entre na sua conta." }, 401);
    const { compra, evento, pacote } = await req.json();
    const usuario = createClient(URL_SUPABASE, CHAVE_ANON, { global: { headers: { Authorization: autorizacao } }, auth: { persistSession: false } });
    const origem = req.headers.get("origin") ?? SITE;
    const site = origem.startsWith("http") && !origem.includes("localhost") ? origem : SITE;

    let token: string;
    let teste: boolean;
    let corpo: Record<string, unknown>;
    let referencia: string;
    let atualizar: () => Promise<unknown>;

    if (compra) {
      const { data, error } = await usuario.rpc("preparar_compra_anfitriao", { p_compra: compra });
      if (error) return resposta({ erro: error.message }, 400);
      const p = (data as { compra_id: string; total: number; anfitriao_id: string; descricao: string; taxa_pct: number }[])[0];
      const conta = await tokenDoAnfitriao(p.anfitriao_id);
      if (!conta) return resposta({ erro: "Este evento ainda não recebe pagamentos." }, 400);
      token = conta.token;
      teste = !conta.conectado;
      const total = Number(p.total);
      const comissao = conta.conectado ? Math.round(total * Number(p.taxa_pct)) / 100 : 0;
      const { data: ev } = await admin().from("compras_anfitriao").select("evento_id").eq("id", p.compra_id).maybeSingle();
      const volta = `${site}/evento-pessoa/${ev?.evento_id}?compra=${p.compra_id}`;
      referencia = `anfitriao:${p.compra_id}`;
      corpo = {
        items: [{ id: p.compra_id, title: p.descricao, quantity: 1, unit_price: total, currency_id: "BRL" }],
        external_reference: referencia,
        notification_url: `${URL_SUPABASE}/functions/v1/mp-webhook?anfitriao=${p.compra_id}`,
        back_urls: { success: volta, failure: volta, pending: volta },
        auto_return: "approved",
        statement_descriptor: "ROVIBES",
        payment_methods: { installments: 3 },
        expires: true,
        expiration_date_to: new Date(Date.now() + 15 * 60000).toISOString(),
      };
      if (comissao > 0) corpo.marketplace_fee = comissao;
      atualizar = () => Promise.resolve();
    } else if (evento && pacote) {
      const { data, error } = await usuario.rpc("preparar_impulso", { p_evento: evento, p_pacote: pacote });
      if (error) return resposta({ erro: error.message }, 400);
      const p = (data as { impulso_id: string; preco: number; descricao: string }[])[0];
      const conta = tokenRoVibes();
      if (!conta) return resposta({ erro: "O impulsionamento ainda não está disponível." }, 400);
      token = conta.token;
      teste = conta.teste;
      const volta = `${site}/evento-pessoa/${evento}?impulso=${p.impulso_id}`;
      referencia = `impulso:${p.impulso_id}`;
      corpo = {
        items: [{ id: p.impulso_id, title: p.descricao, quantity: 1, unit_price: Number(p.preco), currency_id: "BRL" }],
        external_reference: referencia,
        notification_url: `${URL_SUPABASE}/functions/v1/mp-webhook?impulso=${p.impulso_id}`,
        back_urls: { success: volta, failure: volta, pending: volta },
        auto_return: "approved",
        statement_descriptor: "ROVIBES",
        payment_methods: { installments: 1 },
        expires: true,
        expiration_date_to: new Date(Date.now() + 30 * 60000).toISOString(),
      };
      atualizar = () => Promise.resolve();
    } else return resposta({ erro: "Pedido inválido." }, 400);

    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Idempotency-Key": referencia },
      body: JSON.stringify(corpo),
    });
    const pref = await r.json();
    if (!r.ok || !pref.init_point) {
      console.error("Mercado Pago recusou a preferência", r.status, JSON.stringify(pref));
      return resposta({ erro: "Não foi possível iniciar o pagamento agora. Tente de novo." }, 502);
    }
    await atualizar();
    if (compra) await admin().from("compras_anfitriao").update({ mp_preferencia: pref.id }).eq("id", compra);
    else await admin().from("impulsos").update({ mp_preferencia: pref.id }).eq("evento_id", evento).eq("situacao", "pendente");
    return resposta({ url: pref.init_point, teste });
  } catch (e) {
    console.error(e);
    return resposta({ erro: "Erro inesperado ao iniciar o pagamento." }, 500);
  }
});

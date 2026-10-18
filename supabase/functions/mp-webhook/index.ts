// Aviso do Mercado Pago (e verificação ao voltar do pagamento). Nunca confia no que chega:
// consulta o pagamento direto na API do Mercado Pago antes de confirmar no banco.
import { admin, cors, meioDoMp, resposta, tokenDoEstab } from "../_compartilhado/mp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    let corpo: Record<string, unknown> = {};
    if (req.method === "POST") corpo = await req.json().catch(() => ({}));
    const pagamentoId = url.searchParams.get("pagamento") ?? (corpo.pagamento as string | undefined);
    const tipo = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? (corpo.type as string | undefined) ?? "payment";
    const mpId =
      url.searchParams.get("data.id") ??
      url.searchParams.get("payment_id") ??
      ((corpo.data as { id?: string } | undefined)?.id ?? null) ??
      (corpo.payment_id as string | undefined) ??
      (tipo === "payment" ? url.searchParams.get("id") : null);
    if (!pagamentoId || tipo !== "payment" || !mpId) return resposta({ ok: true, ignorado: true });

    const db = admin();
    const { data: pg } = await db.from("pagamentos").select("id, estabelecimento_id").eq("id", pagamentoId).maybeSingle();
    if (!pg) return resposta({ ok: true, ignorado: "pagamento desconhecido" });
    const conta = await tokenDoEstab(pg.estabelecimento_id as string);
    if (!conta) return resposta({ ok: false }, 200);

    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(mpId))}`, { headers: { Authorization: `Bearer ${conta.token}` } });
    if (!r.ok) return resposta({ ok: false, status: r.status }, 200);
    const mp = await r.json();
    if (mp.external_reference !== pagamentoId) return resposta({ ok: false, motivo: "referência não confere" }, 200);

    const { data: res, error } = await db.rpc("confirmar_pagamento_mp", {
      p_pagamento: pagamentoId,
      p_mp_id: String(mp.id),
      p_status: mp.status,
      p_valor: Number(mp.transaction_amount),
      p_comissao: Number(mp.marketplace_fee ?? 0),
      p_meio: meioDoMp(mp.payment_type_id),
    });
    if (error) console.error(error);
    return resposta({ ok: true, situacao: res ?? mp.status });
  } catch (e) {
    console.error(e);
    return resposta({ ok: false }, 200);
  }
});

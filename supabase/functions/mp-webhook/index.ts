// Aviso do Mercado Pago (e verificação ao voltar do pagamento). Nunca confia no que chega:
// consulta o pagamento direto na API do Mercado Pago antes de confirmar no banco.
import { admin, cors, meioDoMp, resposta, tokenDoAnfitriao, tokenDoEstab, tokenRoVibes } from "../_compartilhado/mp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    let corpo: Record<string, unknown> = {};
    if (req.method === "POST") corpo = await req.json().catch(() => ({}));
    const pagamentoId = url.searchParams.get("pagamento") ?? (corpo.pagamento as string | undefined);
    const compraId = url.searchParams.get("compra") ?? (corpo.compra as string | undefined);
    const anfitriaoId = url.searchParams.get("anfitriao") ?? (corpo.anfitriao as string | undefined);
    const impulsoId = url.searchParams.get("impulso") ?? (corpo.impulso as string | undefined);
    const tipo = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? (corpo.type as string | undefined) ?? "payment";
    const mpId =
      url.searchParams.get("data.id") ??
      url.searchParams.get("payment_id") ??
      ((corpo.data as { id?: string } | undefined)?.id ?? null) ??
      (corpo.payment_id as string | undefined) ??
      (tipo === "payment" ? url.searchParams.get("id") : null);
    if ((!pagamentoId && !compraId && !anfitriaoId && !impulsoId) || tipo !== "payment" || !mpId) return resposta({ ok: true, ignorado: true });

    const db = admin();
    const consultar = async (token: string) => {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(mpId))}`, { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? await r.json() : null;
    };
    // Ingressos de evento de anfitrião.
    if (anfitriaoId) {
      const { data: cp } = await db.from("compras_anfitriao").select("id, evento:eventos_pessoa(anfitriao_id)").eq("id", anfitriaoId).maybeSingle();
      const dono = (cp?.evento as { anfitriao_id?: string } | null)?.anfitriao_id;
      if (!cp || !dono) return resposta({ ok: true, ignorado: "compra desconhecida" });
      const conta = await tokenDoAnfitriao(dono);
      const mpa = conta ? await consultar(conta.token) : null;
      if (!mpa || mpa.external_reference !== `anfitriao:${anfitriaoId}`) return resposta({ ok: false, motivo: "referência não confere" }, 200);
      const { data: resA, error: errA } = await db.rpc("confirmar_compra_anfitriao", {
        p_compra: anfitriaoId,
        p_mp_id: String(mpa.id),
        p_status: mpa.status,
        p_valor: Number(mpa.transaction_amount),
        p_comissao: Number(mpa.marketplace_fee ?? 0),
      });
      if (errA) console.error(errA);
      return resposta({ ok: true, situacao: resA ?? mpa.status });
    }
    // Impulsionamento (pago ao RoVibes).
    if (impulsoId) {
      const conta = tokenRoVibes();
      const mpm = conta ? await consultar(conta.token) : null;
      if (!mpm || mpm.external_reference !== `impulso:${impulsoId}`) return resposta({ ok: false, motivo: "referência não confere" }, 200);
      const { data: resM, error: errM } = await db.rpc("confirmar_impulso", { p_impulso: impulsoId, p_mp_id: String(mpm.id), p_status: mpm.status, p_valor: Number(mpm.transaction_amount) });
      if (errM) console.error(errM);
      return resposta({ ok: true, situacao: resM ?? mpm.status });
    }
    // Ingressos (compra pelo App).
    if (compraId) {
      const { data: cp } = await db.from("compras_ingresso").select("id, estabelecimento_id").eq("id", compraId).maybeSingle();
      if (!cp) return resposta({ ok: true, ignorado: "compra desconhecida" });
      const contaI = await tokenDoEstab(cp.estabelecimento_id as string);
      if (!contaI) return resposta({ ok: false }, 200);
      const ri = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(mpId))}`, { headers: { Authorization: `Bearer ${contaI.token}` } });
      if (!ri.ok) return resposta({ ok: false, status: ri.status }, 200);
      const mpi = await ri.json();
      if (mpi.external_reference !== `ingresso:${compraId}`) return resposta({ ok: false, motivo: "referência não confere" }, 200);
      const { data: resI, error: errI } = await db.rpc("confirmar_compra_ingresso", {
        p_compra: compraId,
        p_mp_id: String(mpi.id),
        p_status: mpi.status,
        p_valor: Number(mpi.transaction_amount),
        p_comissao: Number(mpi.marketplace_fee ?? 0),
        p_meio: meioDoMp(mpi.payment_type_id),
      });
      if (errI) console.error(errI);
      return resposta({ ok: true, situacao: resI ?? mpi.status });
    }
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

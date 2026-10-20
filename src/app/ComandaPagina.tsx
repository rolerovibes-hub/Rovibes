import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, BadgePercent, Plus, QrCode as IconeQr, ReceiptText, Store, Truck, Users, X } from "lucide-react";
import { QrCode } from "@/components/Qr";
import { Carregando } from "@/components/Carregando";
import { reais } from "@/components/Formulario";
import { Carrinho, carrinhoParaBanco, carregarItensParaPedido, ItemParaPedido, MontarPedido, qtdNoCarrinho, totalDoCarrinho } from "@/components/MontarPedido";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";
import { descreverBeneficio, descreverRegras } from "@/lib/beneficio";
import {
  buscarPagamentos,
  buscarTotais,
  CAMPOS_PEDIDO,
  COR_SITUACAO_ITEM,
  Modalidade,
  NOME_MEIO,
  NOME_MODALIDADE,
  NOME_SITUACAO_ITEM,
  normalizarPedidos,
  PagamentoComanda,
  Pedido,
  Totais,
  useAoVivo, buscarRegraEntrega, RegraEntrega, buscarModelo, ModeloAtendimento, pagarPedido } from "@/lib/salao";
import { buscarCarteira, Cupom } from "./carteira";

interface Comanda {
  id: string;
  situacao: "aberta" | "fechada" | "cancelada";
  nome: string | null;
  total: number | null;
  aberta_em: string;
  estabelecimento: { id: string; nome: string; logo_url: string | null } | null;
  mesa: { numero: string; area: string | null } | null;
}

interface Envio {
  id: string;
  usuario_id: string | null;
  criado_em: string;
  pedidos: Pedido[];
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Estimativa do desconto antes de enviar (o valor final é calculado pelo banco). */
function estimarDesconto(c: Cupom | undefined, total: number, carrinho: Carrinho, itens: ItemParaPedido[]) {
  if (!c) return 0;
  if (c.pedido_minimo && total < c.pedido_minimo) return 0;
  if (c.tipo === "percentual") return Math.round(total * (c.valor ?? 0)) / 100;
  if (c.tipo === "valor") return Math.min(c.valor ?? 0, total);
  const item = itens.find((i) => i.id === c.item_id);
  return item && carrinho[item.id] ? Math.min(item.preco ?? 0, total) : 0;
}

export function ComandaPagina() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const { sessao } = useSessao();
  const eu = sessao!.user.id;
  const [comanda, setComanda] = useState<Comanda | null | undefined>(undefined);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [totais, setTotais] = useState<Totais | null>(null);
  const [pagamentos, setPagamentos] = useState<PagamentoComanda[]>([]);
  const [pagando, setPagando] = useState(false);
  const [outroValor, setOutroValor] = useState<string | null>(null);
  const [erroPagamento, setErroPagamento] = useState("");
  const [busca, setBusca] = useSearchParams();
  const voltouDoPagamento = busca.get("pagamento");
  const [confirmando, setConfirmando] = useState<null | "aguardando" | "aprovado" | "recusado">(voltouDoPagamento ? "aguardando" : null);
  const [pessoas, setPessoas] = useState<{ id: string; nome: string }[]>([]);
  const [descontos, setDescontos] = useState<{ id: string; titulo: string; valor: number; usuario_id: string }[]>([]);
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState("");
  const [qrAberto, setQrAberto] = useState(false);
  const [aviso, setAviso] = useState("");
  const situacoes = useRef<Map<string, string> | null>(null);
  const [modelo, setModelo] = useState<ModeloAtendimento | null>(null);
  const [pagandoPedido, setPagandoPedido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [c, p, g, d, t] = await Promise.all([
      supabase
        .from("comandas")
        .select("id, situacao, nome, total, aberta_em, estabelecimento:estabelecimentos(id, nome, logo_url), mesa:mesas(numero, area)")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("pedidos").select(CAMPOS_PEDIDO).eq("comanda_id", id).order("criado_em"),
      supabase.from("comanda_pessoas").select("usuario_id").eq("comanda_id", id).order("entrou_em"),
      supabase.from("comanda_descontos").select("id, titulo, valor, usuario_id").eq("comanda_id", id),
      buscarTotais(id),
    ]);
    const dadosComanda = (c.data as unknown as Comanda | null) ?? null;
    // Mesa juntada com outra: leva para a comanda que ficou aberta.
    if ((dadosComanda?.situacao as string | undefined) === "juntada") {
      const { data: atual } = await supabase.rpc("comanda_atual", { p_comanda: id });
      if (atual && atual !== id) return navegar(`/comanda/${atual as string}`, { replace: true });
    }
    setComanda(dadosComanda);
    buscarPagamentos(id).then(setPagamentos);
    const lista = normalizarPedidos(p.data);
    // Avisa quando algum item da pessoa sai para entrega ou fica pronto para retirar.
    const antes = situacoes.current;
    const agora = new Map(lista.flatMap((x) => x.itens.map((i) => [i.id, `${i.situacao}|${x.modalidade}|${x.usuario_id ?? ""}`] as [string, string])));
    if (antes) {
      for (const [idItem, v] of agora) {
        const [sit, mod, dono] = v.split("|");
        if (dono !== eu || antes.get(idItem)?.split("|")[0] === sit) continue;
        if (sit === "saiu") setAviso("Seu pedido saiu para entrega. Tenha o QR de entrega à mão.");
        else if (sit === "pronto" && mod === "retirada") setAviso("Seu pedido está pronto. Retire no balcão mostrando o QR de entrega.");
        else continue;
        navigator.vibrate?.([120, 80, 120]);
      }
    }
    situacoes.current = agora;
    setPedidos(lista);
    setDescontos(((d.data ?? []) as { id: string; titulo: string; valor: number; usuario_id: string }[]).map((x) => ({ ...x, valor: Number(x.valor) })));
    setTotais(t);
    const ids = ((g.data ?? []) as { usuario_id: string }[]).map((x) => x.usuario_id);
    if (ids.length) {
      const { data } = await supabase.from("perfis_publicos").select("id, nome").in("id", ids);
      const nomes = new Map(((data ?? []) as { id: string; nome: string }[]).map((x) => [x.id, x.nome]));
      setPessoas(ids.map((i) => ({ id: i, nome: nomes.get(i) ?? "Alguém" })));
    } else setPessoas([]);
  }, [id, eu, navegar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Voltou do Mercado Pago: pede ao servidor para conferir o pagamento direto no Mercado Pago.
  useEffect(() => {
    if (!voltouDoPagamento) return;
    const mpId = busca.get("payment_id") ?? busca.get("collection_id");
    let tentativas = 0;
    let parar = false;
    const conferir = async () => {
      if (parar) return;
      tentativas++;
      const { data } = await supabase.functions.invoke("mp-webhook", { body: { pagamento: voltouDoPagamento, payment_id: mpId, type: "payment" } });
      const sit = (data as { situacao?: string } | null)?.situacao;
      if (sit === "aprovado" || sit === "ja_aprovado") {
        setConfirmando("aprovado");
        void carregar();
      } else if (sit === "recusado" || busca.get("status") === "rejected") setConfirmando("recusado");
      else if (tentativas < 6) window.setTimeout(() => void conferir(), 3000);
      else setConfirmando(null);
    };
    if (mpId) void conferir();
    else setConfirmando(busca.get("status") === "rejected" ? "recusado" : null);
    return () => {
      parar = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voltouDoPagamento]);

  const pagar = async (modo: "meus_itens" | "igual" | "total" | "valor", valor?: number) => {
    setPagando(true);
    setErroPagamento("");
    const { data, error } = await supabase.functions.invoke("mp-pagar", { body: { comanda: id, modo, valor: valor ?? null } });
    if (error || !(data as { url?: string })?.url) {
      let msg = (data as { erro?: string } | null)?.erro;
      if (!msg && error && "context" in error) {
        try {
          msg = ((await (error as { context: Response }).context.json()) as { erro?: string }).erro;
        } catch {
          /* sem detalhe */
        }
      }
      setErroPagamento(msg ?? "O pagamento pelo App ainda não está disponível neste lugar.");
      setPagando(false);
      return;
    }
    window.location.href = (data as { url: string }).url;
  };

  useAoVivo("comanda", { pedidos: `comanda_id=eq.${id}`, comandas: `id=eq.${id}`, pagamentos: `comanda_id=eq.${id}` }, () => void carregar(), !!id);

  const envios = useMemo(() => {
    const mapa = new Map<string, Envio>();
    for (const p of pedidos) {
      const e = mapa.get(p.envio_id) ?? { id: p.envio_id, usuario_id: p.usuario_id, criado_em: p.criado_em, pedidos: [] };
      e.pedidos.push(p);
      mapa.set(p.envio_id, e);
    }
    return [...mapa.values()].sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  }, [pedidos]);

  useEffect(() => {
    if (comanda?.estabelecimento) document.title = `Comanda · ${comanda.estabelecimento.nome}`;
  }, [comanda]);
  const estabDaComanda = comanda?.estabelecimento?.id;
  useEffect(() => {
    if (estabDaComanda) buscarModelo(estabDaComanda).then(setModelo);
  }, [estabDaComanda]);
  // Vindo do cardápio (?pedir=1): já abre a escolha dos itens.
  useEffect(() => {
    if (busca.get("pedir") === "1") {
      setPedindo(true);
      busca.delete("pedir");
      setBusca(busca, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (comanda === undefined) return <Carregando />;
  if (!comanda || !comanda.estabelecimento) {
    return (
      <div className="px-6 py-20 text-center">
        <ReceiptText className="mx-auto h-8 w-8 text-suave" />
        <p className="mt-3 font-medium">Comanda não encontrada</p>
        <Link to="/" className="botao mt-5">
          Voltar ao início
        </Link>
      </div>
    );
  }

  const aberta = comanda.situacao === "aberta";
  // Pré-pago: comanda sem mesa (balcão) ou lugar que cobra cada pedido na hora (atualização 035).
  const prepago = !!modelo && (!comanda.mesa || modelo.pagamento === "prepago");
  const pagarAgora = async (pedido: string) => {
    setPagandoPedido(pedido);
    setErro("");
    try {
      const r = await pagarPedido(pedido);
      if (r.url) window.location.href = r.url;
      else {
        setPagandoPedido(null);
        void carregar();
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
      setPagandoPedido(null);
    }
  };
  const prontosParaEntrega = pedidos.flatMap((p) => p.itens).filter((i) => i.situacao === "pronto" || i.situacao === "saiu").length;
  const nomeDe = (u: string | null) => (u ? (u === eu ? "Você" : pessoas.find((p) => p.id === u)?.nome ?? "Alguém da mesa") : "Equipe");

  const cancelarEnvio = async (envio: string) => {
    if (!window.confirm("Cancelar este pedido?")) return;
    setErro("");
    const { error } = await supabase.rpc("cancelar_meu_pedido", { p_envio: envio });
    if (error) setErro(mensagemDeErro(error));
    await carregar();
  };

  const sair = async () => {
    if (!window.confirm("Sair desta mesa?")) return;
    const { error } = await supabase.rpc("sair_da_comanda", { p_comanda: comanda.id });
    if (error) return setErro(mensagemDeErro(error));
    navegar("/", { replace: true });
  };

  return (
    <div className="pb-28">
      <div className="flex items-center gap-2 px-2 pt-3">
        <button onClick={() => navegar(-1)} className="rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Link to={`/lugar/${comanda.estabelecimento.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
          {comanda.estabelecimento.logo_url ? (
            <img src={comanda.estabelecimento.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-elevado text-suave">
              <Store className="h-4 w-4" />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-semibold">{comanda.estabelecimento.nome}</span>
            <span className="block text-[13px] text-suave">
              {comanda.mesa ? `Mesa ${comanda.mesa.numero}${comanda.mesa.area ? ` · ${comanda.mesa.area}` : ""}` : comanda.nome ?? "Comanda"}
            </span>
          </span>
        </Link>
      </div>

      {!aberta && (
        <p className="mx-4 mt-4 rounded-cartao border border-borda bg-elevado px-4 py-3 text-sm">
          {comanda.situacao === "fechada" ? `Comanda fechada no caixa · total ${reais(Number(comanda.total ?? 0))}` : "Comanda cancelada."}
        </p>
      )}

      <section className="mx-4 mt-4 flex items-center gap-2 text-sm text-suave">
        <Users className="h-4 w-4 shrink-0" />
        <span className="truncate">{pessoas.map((p) => (p.id === eu ? "Você" : p.nome)).join(", ") || "Só você"}</span>
      </section>

      {erro && <p className="mx-4 mt-3 rounded-cartao border border-perigo/40 bg-perigo/10 px-4 py-3 text-sm text-perigo">{erro}</p>}

      {aviso && (
        <button onClick={() => { setAviso(""); setQrAberto(true); }} className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 rounded-cartao border border-magenta/40 bg-magenta/10 px-4 py-3 text-left text-sm">
          <Truck className="h-5 w-5 shrink-0 text-magenta" />
          <span className="flex-1 font-medium">{aviso}</span>
        </button>
      )}

      {aberta && prontosParaEntrega > 0 && (
        <div className="mx-4 mt-3">
          <button className="botao h-11 w-full border-marca text-destaque" onClick={() => setQrAberto(true)}>
            <IconeQr className="h-4 w-4" />
            Mostrar QR de entrega · {prontosParaEntrega} {prontosParaEntrega === 1 ? "item pronto" : "itens prontos"}
          </button>
        </div>
      )}

      <div className="space-y-3 px-4 pt-4">
        {envios.length === 0 ? (
          <div className="cartao px-6 py-12 text-center">
            <ReceiptText className="mx-auto h-8 w-8 text-suave" />
            <p className="mt-3 font-medium">Nenhum pedido ainda</p>
            <p className="mt-1 text-sm text-suave">Toque em "Fazer pedido" para escolher no cardápio.</p>
          </div>
        ) : (
          envios.map((e) => {
            const itensEnvio = e.pedidos.flatMap((p) => p.itens);
            const cancelavel =
              aberta &&
              e.usuario_id === eu &&
              itensEnvio.every((i) => i.situacao === "aguardando" || i.situacao === "recebido" || i.situacao === "cancelado" || (i.situacao === "pronto" && i.destino === "sem_preparo")) &&
              itensEnvio.some((i) => i.situacao !== "cancelado");
            return (
              <article key={e.id} className="cartao overflow-hidden">
                <header className="flex items-center justify-between gap-2 border-b border-borda px-4 py-2.5 text-[13px]">
                  <span className="font-semibold">
                    #{e.pedidos[0].numero} · {nomeDe(e.usuario_id)}
                    <span className="ml-1.5 font-normal text-suave">· {e.pedidos[0].modalidade === "retirada" ? "retirada no balcão" : "na mesa"}</span>
                  </span>
                  <span className="text-suave">{hora(e.criado_em)}</span>
                </header>
                <ul className="divide-y divide-borda">
                  {itensEnvio.map((i) => (
                    <li key={i.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className={clsx(i.situacao === "cancelado" && "text-suave line-through")}>
                        {i.quantidade}× {i.nome}
                        {i.observacao && <span className="block text-[12px] text-suave">{i.observacao}</span>}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="codigo block">{reais(i.preco * i.quantidade)}</span>
                        <span className={clsx("block text-[12px] font-semibold", COR_SITUACAO_ITEM[i.situacao])}>
                          {i.situacao === "pronto" && e.pedidos[0].modalidade === "retirada" ? "Pronto para retirar" : NOME_SITUACAO_ITEM[i.situacao]}
                        </span>
                        {i.situacao === "cancelado" && i.motivo_cancelamento && <span className="block text-[11px] text-suave">{i.motivo_cancelamento}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {e.pedidos[0].observacao && <p className="border-t border-borda px-4 py-2 text-[12px] text-suave">Obs.: {e.pedidos[0].observacao}</p>}
                {aberta && e.usuario_id === eu && itensEnvio.some((i) => i.situacao === "aguardando") && (
                  <div className="border-t border-borda px-4 py-3">
                    <button className="botao-principal h-10 w-full rounded-full" disabled={pagandoPedido === e.pedidos[0].id} onClick={() => void pagarAgora(e.pedidos[0].id)}>
                      {pagandoPedido === e.pedidos[0].id
                        ? "Abrindo o pagamento..."
                        : `Pagar agora · ${reais(itensEnvio.filter((i) => i.situacao === "aguardando").reduce((t, i) => t + i.preco * i.quantidade, 0))}`}
                    </button>
                    <p className="mt-1.5 text-center text-[12px] text-suave">O pedido vai para o preparo assim que o pagamento for aprovado. Sem pagamento em 30 min, ele é cancelado.</p>
                  </div>
                )}
                {cancelavel && (
                  <button onClick={() => void cancelarEnvio(e.id)} className="w-full border-t border-borda px-4 py-2 text-[13px] text-suave hover:bg-elevado">
                    Cancelar pedido
                  </button>
                )}
              </article>
            );
          })
        )}

        {confirmando && (
          <div
            role="status"
            className={clsx(
              "cartao flex items-center gap-3 px-4 py-3 text-sm",
              confirmando === "aprovado" ? "border-ok/40 text-ok" : confirmando === "recusado" ? "border-perigo/40 text-perigo" : "text-suave",
            )}
          >
            <span className="flex-1">
              {confirmando === "aprovado"
                ? "Pagamento aprovado! Já entrou na conta da mesa."
                : confirmando === "recusado"
                  ? "O pagamento não foi aprovado. Você pode tentar de novo ou pagar no caixa."
                  : "Confirmando seu pagamento com o Mercado Pago..."}
            </span>
            <button
              onClick={() => {
                setConfirmando(null);
                setBusca({}, { replace: true });
              }}
              aria-label="Fechar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {totais && (totais.subtotal > 0 || descontos.length > 0) && (
          <section className="cartao divide-y divide-borda text-sm">
            <p className="flex justify-between px-4 py-2.5">
              <span className="text-suave">Você pediu</span>
              <span className="codigo">{reais(totais.meu_subtotal)}</span>
            </p>
            <p className="flex justify-between px-4 py-2.5">
              <span className="text-suave">Itens da mesa</span>
              <span className="codigo">{reais(totais.subtotal)}</span>
            </p>
            {descontos.map((d) => (
              <p key={d.id} className="flex justify-between px-4 py-2.5 text-ok">
                <span className="flex items-center gap-1.5">
                  <BadgePercent className="h-4 w-4" />
                  {d.titulo}
                </span>
                <span className="codigo">−{reais(d.valor)}</span>
              </p>
            ))}
            {totais.servico > 0 && (
              <p className="flex justify-between px-4 py-2.5">
                <span className="text-suave">Serviço ({String(totais.taxa_servico).replace(".", ",")}%)</span>
                <span className="codigo">{reais(totais.servico)}</span>
              </p>
            )}
            <p className="flex justify-between px-4 py-3 font-semibold">
              <span>{comanda.mesa ? "Total da mesa" : "Total"}</span>
              <span className="codigo">{reais(totais.total)}</span>
            </p>
            {pagamentos.length > 0 && (
              <div className="px-4 py-2.5">
                {pagamentos
                  .filter((p) => p.situacao === "aprovado")
                  .map((p) => (
                    <p key={p.id} className="flex justify-between text-[13px] text-ok">
                      <span>
                        {p.minha ? "Você pagou" : p.origem === "caixa" ? `Pago no caixa (${NOME_MEIO[p.meio ?? "outro"]})` : `${p.quem ?? "Alguém"} pagou`}
                      </span>
                      <span className="codigo">−{reais(p.valor)}</span>
                    </p>
                  ))}
              </div>
            )}
            <p className={clsx("flex justify-between px-4 py-3 text-base font-bold", totais.falta > 0 ? "" : "text-ok")}>
              <span>{totais.falta > 0 ? "Falta pagar" : "Conta paga"}</span>
              <span className="codigo">{reais(totais.falta)}</span>
            </p>
          </section>
        )}

        {totais && aberta && totais.falta > 0 && !prepago && (
          <section className="cartao p-4">
            <h2 className="font-semibold">Dividir a conta</h2>
            <p className="mt-0.5 text-[13px] text-suave">Escolha como quer pagar a sua parte. Já com o serviço.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <button disabled={pagando} onClick={() => void pagar("meus_itens")} className="rounded-xl bg-elevado px-3 py-3 transition-colors hover:bg-borda">
                <span className="block text-[12px] text-suave">Só o que eu pedi</span>
                <span className="codigo mt-0.5 block text-lg font-semibold">{reais(totais.minha_parte_itens)}</span>
                <span className="mt-1 block text-[12px] font-semibold text-destaque">Pagar</span>
              </button>
              <button disabled={pagando} onClick={() => void pagar("igual")} className="rounded-xl bg-elevado px-3 py-3 transition-colors hover:bg-borda">
                <span className="block text-[12px] text-suave">Dividir igual ({totais.pessoas})</span>
                <span className="codigo mt-0.5 block text-lg font-semibold">{reais(totais.minha_parte_igual)}</span>
                <span className="mt-1 block text-[12px] font-semibold text-destaque">Pagar</span>
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button disabled={pagando} className="botao h-10 text-[13px]" onClick={() => setOutroValor(outroValor === null ? "" : null)}>
                Outro valor
              </button>
              <button disabled={pagando} className="botao-principal h-10 text-[13px]" onClick={() => void pagar("total")}>
                Pagar tudo ({reais(totais.falta)})
              </button>
            </div>
            {outroValor !== null && (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void pagar("valor", Number(outroValor.replace(/\./g, "").replace(",", ".")));
                }}
              >
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Valor a pagar</span>
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-suave">R$</span>
                  <input autoFocus value={outroValor} onChange={(e) => setOutroValor(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" className="entrada pl-9" />
                </label>
                <button type="submit" className="botao-principal h-10 px-4" disabled={pagando || !outroValor}>
                  Pagar
                </button>
              </form>
            )}
            {erroPagamento && <p className="mt-2 text-sm text-perigo">{erroPagamento}</p>}
            <p className="mt-3 text-[12px] text-suave">Pix ou cartão pelo Mercado Pago, com segurança. Itens lançados pela equipe sem dono entram divididos entre todos. Também dá para pagar no caixa.</p>
          </section>
        )}

        {aberta && (
          <button onClick={() => void sair()} className="mx-auto block py-2 text-[13px] text-suave underline underline-offset-2">
            {comanda.mesa ? "Sair da mesa" : "Sair"}
          </button>
        )}
      </div>

      {aberta && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 mx-auto max-w-xl px-4 pb-3">
          <button className="botao-principal h-12 w-full rounded-full text-[15px] shadow-lg" onClick={() => setPedindo(true)}>
            <Plus className="h-5 w-5" />
            Fazer pedido
          </button>
        </div>
      )}

      {qrAberto && <QrEntrega comanda={comanda.id} fechar={() => setQrAberto(false)} />}

      {pedindo && (
        <FolhaPedido
          prepago={prepago}
          comMesa={!!comanda.mesa}
          comanda={comanda.id}
          estab={comanda.estabelecimento.id}
          usuario={eu}
          fechar={() => setPedindo(false)}
          enviado={() => {
            setPedindo(false);
            void carregar();
          }}
        />
      )}
    </div>
  );
}

function FolhaPedido({
  comanda,
  estab,
  usuario,
  comMesa,
  prepago,
  fechar,
  enviado,
}: {
  comanda: string;
  estab: string;
  usuario: string;
  comMesa: boolean;
  prepago: boolean;
  fechar: () => void;
  enviado: () => void;
}) {
  const [modalidade, setModalidade] = useState<Modalidade>(comMesa ? "mesa" : "retirada");
  const [regra, setRegra] = useState<RegraEntrega | null>(null);
  const [itens, setItens] = useState<ItemParaPedido[] | null>(null);
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [carrinho, setCarrinho] = useState<Carrinho>({});
  const [observacao, setObservacao] = useState("");
  const [cupom, setCupom] = useState("");
  const [etapa, setEtapa] = useState<"itens" | "revisar">("itens");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    buscarRegraEntrega(estab).then(setRegra);
    carregarItensParaPedido(estab).then(setItens);
    buscarCarteira(usuario).then((c) =>
      setCupons(c.cupons.filter((x) => x.estabelecimento?.id === estab && x.situacao === "disponivel" && Date.parse(x.validade) > Date.now())),
    );
  }, [estab, usuario]);

  const lista = itens ?? [];
  const total = totalDoCarrinho(carrinho, lista);
  const qtd = qtdNoCarrinho(carrinho);
  const escolhido = cupons.find((c) => c.id === cupom);
  const desconto = estimarDesconto(escolhido, total, carrinho, lista);

  const enviar = async () => {
    setEnviando(true);
    setErro("");
    const { data, error } = await supabase.rpc("fazer_pedido", {
      p_comanda: comanda,
      p_itens: carrinhoParaBanco(carrinho),
      p_observacao: observacao.trim() || null,
      p_cupom: cupom || null,
      // O estabelecimento decide; só manda a escolha quando ele deixa o cliente escolher.
      p_modalidade: regra === "cliente" ? modalidade : null,
    });
    if (error) {
      setEnviando(false);
      return setErro(mensagemDeErro(error));
    }
    // Pré-pago: segue direto para o pagamento; o pedido só vai para o preparo depois de aprovado.
    if (prepago && data) {
      try {
        const r = await pagarPedido(data as string);
        if (r.url) {
          window.location.href = r.url;
          return;
        }
      } catch (e) {
        setErro(`Pedido criado, mas o pagamento não abriu: ${mensagemDeErro(e)} Tente “Pagar agora” no pedido.`);
        setEnviando(false);
        window.setTimeout(enviado, 2500);
        return;
      }
    }
    setEnviando(false);
    enviado();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-fundo" role="dialog" aria-modal="true" aria-label="Fazer pedido">
      <header className="mx-auto flex w-full max-w-xl items-center gap-2 border-b border-borda px-2 py-2.5">
        <button onClick={etapa === "revisar" ? () => setEtapa("itens") : fechar} className="rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
          {etapa === "revisar" ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
        </button>
        <h2 className="font-semibold">{etapa === "itens" ? "Escolha no cardápio" : "Revisar pedido"}</h2>
      </header>

      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 py-4">
        {!itens ? (
          <Carregando />
        ) : etapa === "itens" ? (
          <MontarPedido itens={lista} carrinho={carrinho} mudar={setCarrinho} />
        ) : (
          <div className="space-y-5">
            <ul className="cartao divide-y divide-borda text-sm">
              {Object.entries(carrinho).map(([idItem, e]) => {
                const i = lista.find((x) => x.id === idItem);
                if (!i) return null;
                return (
                  <li key={idItem} className="flex justify-between gap-3 px-4 py-2.5">
                    <span>
                      {e.quantidade}× {i.nome}
                      {e.observacao.trim() && <span className="block text-[12px] text-suave">{e.observacao}</span>}
                    </span>
                    <span className="codigo">{reais((i.preco ?? 0) * e.quantidade)}</span>
                  </li>
                );
              })}
            </ul>
            {prepago && (
              <p className="cartao px-4 py-3 text-sm">
                <span className="font-semibold">Pagamento na hora</span>
                <span className="text-suave"> · Pix ou cartão pelo Mercado Pago. O pedido vai para o preparo assim que o pagamento for aprovado.</span>
              </p>
            )}
            {(!comMesa || (regra && regra !== "cliente")) && (
              <p className="cartao flex items-center gap-2 px-4 py-3 text-sm">
                <span className="font-semibold">{!comMesa || regra === "retirada" ? "Retirada no balcão" : "Entrega na mesa"}</span>
                <span className="text-suave">· {!comMesa || regra === "retirada" ? "quando ficar pronto, mostre o QR do pedido no balcão" : "a equipe leva até você"}</span>
              </p>
            )}
            {comMesa && regra === "cliente" && (
              <fieldset>
                <legend className="rotulo mb-1.5">Como você quer receber</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["mesa", "retirada"] as Modalidade[]).map((m) => (
                    <label key={m} className={clsx("cartao flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm", modalidade === m && "border-marca")}>
                      <input type="radio" name="modalidade" className="accent-[rgb(var(--marca))]" checked={modalidade === m} onChange={() => setModalidade(m)} />
                      {NOME_MODALIDADE[m]}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="block">
              <span className="rotulo mb-1 block">Observação para a equipe (opcional)</span>
              <textarea rows={2} maxLength={300} className="entrada" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </label>
            <fieldset>
              <legend className="rotulo mb-1.5">Cupom (um por pedido)</legend>
              {cupons.length === 0 ? (
                <p className="text-sm text-suave">Você não tem cupons deste lugar.</p>
              ) : (
                <div className="space-y-2">
                  {[{ id: "", titulo: "Sem cupom" } as Cupom, ...cupons].map((c) => (
                    <label key={c.id || "nenhum"} className={clsx("cartao flex cursor-pointer items-start gap-3 px-4 py-3", cupom === c.id && "border-marca")}>
                      <input type="radio" name="cupom" className="mt-1 accent-[rgb(var(--marca))]" checked={cupom === c.id} onChange={() => setCupom(c.id)} />
                      <span className="min-w-0 flex-1 text-sm">
                        {c.id ? (
                          <>
                            <span className="block font-semibold text-magenta">{descreverBeneficio(c)}</span>
                            <span className="block">{c.titulo}</span>
                            {descreverRegras(c) && <span className="block text-[12px] text-suave">Vale {descreverRegras(c)}</span>}
                          </>
                        ) : (
                          "Sem cupom"
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <section className="cartao divide-y divide-borda text-sm">
              <p className="flex justify-between px-4 py-2.5">
                <span className="text-suave">Itens</span>
                <span className="codigo">{reais(total)}</span>
              </p>
              {escolhido && (
                <p className="flex justify-between px-4 py-2.5 text-ok">
                  <span>Desconto (estimado)</span>
                  <span className="codigo">−{reais(desconto)}</span>
                </p>
              )}
              <p className="flex justify-between px-4 py-3 font-semibold">
                <span>Total deste pedido</span>
                <span className="codigo">{reais(Math.max(0, total - desconto))}</span>
              </p>
            </section>
            {erro && <p className="rounded-cartao border border-perigo/40 bg-perigo/10 px-4 py-3 text-sm text-perigo">{erro}</p>}
          </div>
        )}
      </div>

      <footer className="mx-auto w-full max-w-xl border-t border-borda px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        {etapa === "itens" ? (
          <button className="botao-principal h-12 w-full rounded-full text-[15px]" disabled={qtd === 0} onClick={() => setEtapa("revisar")}>
            {qtd === 0 ? "Escolha os itens" : `Revisar · ${qtd} ${qtd === 1 ? "item" : "itens"} · ${reais(total)}`}
          </button>
        ) : (
          <button className="botao-principal h-12 w-full rounded-full text-[15px]" disabled={enviando} onClick={() => void enviar()}>
            {enviando ? (prepago ? "Abrindo o pagamento..." : "Enviando...") : prepago ? `Pagar ${reais(Math.max(0, total - desconto))} e pedir` : "Enviar pedido"}
          </button>
        )}
      </footer>
    </div>
  );
}

/** QR dinâmico de entrega: renova sozinho e vale uma leitura. */
function QrEntrega({ comanda, fechar }: { comanda: string; fechar: () => void }) {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    const gerar = async () => {
      const { data, error } = await supabase.rpc("gerar_codigo_entrega", { p_comanda: comanda });
      if (!ativo) return;
      if (error) setErro(mensagemDeErro(error));
      else {
        setErro("");
        setCodigo(data as string);
      }
    };
    void gerar();
    const t = window.setInterval(() => void gerar(), 30000);
    return () => {
      ativo = false;
      window.clearInterval(t);
    };
  }, [comanda]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="QR de entrega" onClick={fechar}>
      <div className="w-full max-w-sm rounded-t-2xl bg-superficie p-6 text-center sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end">
          <button onClick={fechar} className="-mr-2 -mt-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="font-semibold">QR de entrega</p>
        <p className="text-sm text-suave">Mostre para quem trouxer o pedido.</p>
        <div className="mt-5 min-h-[264px]">{codigo ? <QrCode texto={codigo} tamanho={240} /> : <p className="py-24 text-sm text-suave">Gerando...</p>}</div>
        {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}
        <p className="mt-3 text-[12px] text-suave">O código muda a cada 30 segundos. Print não funciona.</p>
      </div>
    </div>
  );
}

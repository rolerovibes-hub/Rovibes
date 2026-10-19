import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Ban, Clock3, Minus, Plus, Send, ShieldCheck, Ticket, X } from "lucide-react";
import { QrCode } from "@/components/Qr";
import { mensagemDeErro } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";
import { refGuardado } from "@/lib/promoters";
import {
  cancelarIngresso,
  ingressosAVenda,
  ItemVenda,
  MeuIngresso,
  meusIngressos,
  pagarCompra,
  reaisIngresso,
  reservarIngressos,
  simularCancelamento,
  textoCancelamento,
  transferirIngresso,
} from "@/lib/ingressos";
import { codigoLegivel, qrDoIngresso } from "./carteira";
import { quando } from "./dados";
import { EscolherPessoas } from "./NovoRole";

function Contador({ valor, max, mudar, rotulo }: { valor: number; max: number; mudar: (v: number) => void; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-2" aria-label={rotulo}>
      <button type="button" className="botao h-8 w-8 px-0" disabled={valor <= 0} onClick={() => mudar(valor - 1)} aria-label={`Menos ${rotulo}`}>
        <Minus className="h-4 w-4" />
      </button>
      <span className="codigo w-5 text-center font-semibold">{valor}</span>
      <button type="button" className="botao h-8 w-8 px-0" disabled={valor >= max} onClick={() => mudar(valor + 1)} aria-label={`Mais ${rotulo}`}>
        <Plus className="h-4 w-4" />
      </button>
    </span>
  );
}

/** "Comprar" na página do evento: tipos, lote atual, inteira/meia, total e pagamento. Devolve false se o evento não vende ingressos. */
export function ComprarIngressos({ evento, encerrado, semIngressos }: { evento: string; encerrado: boolean; semIngressos: () => void }) {
  const [itens, setItens] = useState<ItemVenda[] | null>(null);
  const [politica, setPolitica] = useState<string | null>(null);
  const [qtd, setQtd] = useState<Record<string, { inteira: number; meia: number }>>({});
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    ingressosAVenda(evento).then((l) => {
      setItens(l);
      if (!l.length) semIngressos();
    });
    textoCancelamento(evento).then(setPolitica);
  }, [evento, semIngressos]);

  const total = useMemo(
    () => (itens ?? []).reduce((s, i) => s + (qtd[i.tipo_id]?.inteira ?? 0) * i.preco + (qtd[i.tipo_id]?.meia ?? 0) * Math.round((i.preco / 2) * 100) / 100, 0),
    [itens, qtd],
  );
  const quantos = Object.values(qtd).reduce((s, x) => s + x.inteira + x.meia, 0);

  if (!itens || !itens.length) return null;

  const comprar = async () => {
    setOcupado(true);
    setErro("");
    try {
      const pedido = (itens ?? []).flatMap((i) =>
        i.lote_id
          ? [
              ...(qtd[i.tipo_id]?.inteira ? [{ lote_id: i.lote_id, quantidade: qtd[i.tipo_id].inteira, meia: false }] : []),
              ...(qtd[i.tipo_id]?.meia ? [{ lote_id: i.lote_id, quantidade: qtd[i.tipo_id].meia, meia: true }] : []),
            ]
          : [],
      );
      const r = await reservarIngressos(evento, pedido, refGuardado());
      if (r.gratis) {
        setOk("Ingressos garantidos! Estão na sua Carteira.");
        setQtd({});
        setItens(await ingressosAVenda(evento));
      } else {
        const p = await pagarCompra(r.compra_id);
        window.location.href = p.url;
        return;
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setOcupado(false);
  };

  return (
    <section className="cartao overflow-hidden" aria-label="Comprar ingressos">
      <div className="flex items-center gap-2 border-b border-borda px-4 py-3">
        <Ticket className="h-5 w-5 text-destaque" />
        <h2 className="flex-1 font-semibold">Ingressos</h2>
      </div>
      <ul className="divide-y divide-borda">
        {itens.map((i) => {
          const q = qtd[i.tipo_id] ?? { inteira: 0, meia: 0 };
          const restam = Math.max(0, i.disponiveis - q.inteira - q.meia);
          const set = (v: Partial<typeof q>) => setQtd((x) => ({ ...x, [i.tipo_id]: { ...q, ...v } }));
          return (
            <li key={i.tipo_id} className={clsx("px-4 py-3", i.esgotado && "opacity-60")}>
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{i.tipo}</span>
                  {i.descricao && <span className="block text-[13px] text-suave">{i.descricao}</span>}
                  <span className="block text-[12px] text-suave">
                    {i.esgotado ? "Esgotado" : `${i.lote}${i.vende_ate ? ` · até ${new Date(i.vende_ate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : ""}${i.disponiveis <= 10 ? ` · últimos ${i.disponiveis}` : ""}`}
                  </span>
                </span>
                <span className="codigo shrink-0 text-right font-semibold text-destaque">{i.esgotado ? "—" : i.preco === 0 ? "Grátis" : reaisIngresso(i.preco)}</span>
              </div>
              {!i.esgotado && !encerrado && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{i.meia_entrada ? "Inteira" : "Quantidade"}</span>
                    <Contador valor={q.inteira} max={q.inteira + restam} mudar={(v) => set({ inteira: v })} rotulo={`inteira ${i.tipo}`} />
                  </div>
                  {i.meia_entrada && i.meias_disponiveis > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span>
                        Meia-entrada <span className="codigo text-suave">{reaisIngresso(Math.round((i.preco / 2) * 100) / 100)}</span>
                      </span>
                      <Contador valor={q.meia} max={Math.min(i.meias_disponiveis, q.meia + restam)} mudar={(v) => set({ meia: v })} rotulo={`meia ${i.tipo}`} />
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="space-y-3 border-t border-borda px-4 py-3">
        {quantos > 0 && (
          <p className="flex items-center justify-between font-semibold">
            <span>
              {quantos} ingresso{quantos === 1 ? "" : "s"}
            </span>
            <span className="codigo">{total === 0 ? "Grátis" : reaisIngresso(total)}</span>
          </p>
        )}
        {Object.values(qtd).some((x) => x.meia > 0) && <p className="text-[12px] text-alerta">Meia-entrada: leve o documento que dá direito (estudante, idoso, PcD ou ID Jovem). A portaria confere.</p>}
        <button className="botao-principal h-11 w-full" disabled={!quantos || ocupado || encerrado} onClick={() => void comprar()}>
          {ocupado ? "Abrindo pagamento..." : encerrado ? "Vendas encerradas" : total === 0 && quantos ? "Garantir ingresso" : "Comprar"}
        </button>
        {ok && (
          <p className="text-sm text-ok">
            {ok}{" "}
            <Link to="/carteira?aba=ingressos" className="font-semibold underline">
              Ver na Carteira
            </Link>
          </p>
        )}
        {erro && <p className="text-sm text-perigo">{erro}</p>}
        {politica && (
          <p className="flex gap-1.5 text-[12px] text-suave">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {politica}
          </p>
        )}
        <p className="text-[12px] text-suave">Pagamento seguro pelo Mercado Pago (Pix ou cartão). Os ingressos ficam reservados por 10 minutos enquanto você paga.</p>
      </div>
    </section>
  );
}

const NOME_SITUACAO: Record<MeuIngresso["situacao"], string> = {
  pendente: "Aguardando pagamento",
  valido: "Válido",
  usado: "Entrada confirmada",
  cancelado: "Cancelado",
  reembolsado: "Reembolsado",
};

/** Ingressos na Carteira (gratuitos e pagos): QR, enviar para amigo, transferir e cancelar com reembolso. */
export function IngressosCarteira({ lista, recarregar, compraVolta }: { lista: MeuIngresso[]; recarregar: () => void; compraVolta: string | null }) {
  const { perfil } = useSessao();
  const [aberto, setAberto] = useState<MeuIngresso | null>(null);
  const [enviando, setEnviando] = useState<MeuIngresso | null>(null);
  const [cancelando, setCancelando] = useState<{ i: MeuIngresso; permitido: boolean; valor: number; motivo: string } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const agora = Date.now();

  // Voltou do Mercado Pago: confirma o pagamento (o aviso do Mercado Pago chega em segundos).
  const [confirmando, setConfirmando] = useState(!!compraVolta);
  useEffect(() => {
    if (!compraVolta) return;
    const pendente = lista.some((x) => x.compra_id === compraVolta && x.situacao === "pendente");
    const pago = lista.some((x) => x.compra_id === compraVolta && x.situacao === "valido");
    if (pago) {
      setConfirmando(false);
      setAviso({ tipo: "ok", texto: "Pagamento aprovado! Seus ingressos estão garantidos." });
      return;
    }
    if (!pendente) {
      setConfirmando(false);
      return;
    }
    const t = window.setTimeout(recarregar, 3000);
    const fim = window.setTimeout(() => setConfirmando(false), 90000);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(fim);
    };
  }, [compraVolta, lista, recarregar]);

  const ativos = lista.filter((i) => (i.situacao === "valido" || i.situacao === "pendente") && Date.parse(i.evento.fim ?? i.evento.inicio) + 6 * 3600000 > agora);
  const passados = lista.filter((i) => !ativos.includes(i));
  const pendentesPorCompra = useMemo(() => {
    const m = new Map<string, MeuIngresso[]>();
    for (const i of ativos) if (i.situacao === "pendente" && i.compra_id) m.set(i.compra_id, [...(m.get(i.compra_id) ?? []), i]);
    return m;
  }, [ativos]);

  const pedirCancelamento = async (i: MeuIngresso) => {
    setAviso(null);
    try {
      setCancelando({ i, ...(await simularCancelamento(i.id)) });
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
    }
  };
  const confirmarCancelamento = async () => {
    if (!cancelando) return;
    try {
      const v = await cancelarIngresso(cancelando.i.id);
      setAviso({ tipo: "ok", texto: v > 0 ? `Ingresso cancelado. Reembolso de ${reaisIngresso(v)} solicitado ao Mercado Pago.` : "Ingresso cancelado." });
      setCancelando(null);
      setAberto(null);
      recarregar();
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
    }
  };

  return (
    <div className="space-y-6 px-4 pt-5">
      {confirmando && (
        <p className="flex items-center gap-2 rounded-cartao border border-borda bg-elevado px-4 py-3 text-sm">
          <Clock3 className="h-4 w-4 animate-pulse text-destaque" />
          Confirmando seu pagamento...
        </p>
      )}
      {aviso && <p className={clsx("rounded-cartao border px-4 py-3 text-sm", aviso.tipo === "ok" ? "border-ok/40 bg-ok/10 text-ok" : "border-perigo/40 bg-perigo/10 text-perigo")}>{aviso.texto}</p>}

      {[...pendentesPorCompra.entries()].map(([compra, l]) => (
        <div key={compra} className="cartao border-alerta/50 p-4">
          <p className="font-semibold">Pagamento pendente · {l[0].evento.nome}</p>
          <p className="text-sm text-suave">
            {l.length} ingresso{l.length === 1 ? "" : "s"} · {reaisIngresso(l.reduce((s, x) => s + x.preco, 0))}
            {l[0].expira_em ? ` · reserva até ${new Date(l[0].expira_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </p>
          <button
            className="botao-principal mt-3 h-10"
            onClick={() =>
              pagarCompra(compra)
                .then((p) => (window.location.href = p.url))
                .catch((e) => setAviso({ tipo: "erro", texto: mensagemDeErro(e) }))
            }
          >
            Pagar agora
          </button>
        </div>
      ))}

      {ativos.filter((i) => i.situacao === "valido").length === 0 && !pendentesPorCompra.size ? (
        <div className="px-4 py-12 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destaque-suave text-destaque">
            <Ticket className="h-6 w-6" />
          </span>
          <p className="mt-4 font-semibold">Nenhum ingresso</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-suave">Compre ou garanta ingressos na página dos eventos.</p>
        </div>
      ) : (
        <section className="space-y-2.5">
          <h2 className="rotulo px-1">Próximos</h2>
          {ativos
            .filter((i) => i.situacao === "valido")
            .map((i) => (
              <button key={i.id} onClick={() => setAberto(i)} className="cartao flex w-full items-center gap-3 p-3 text-left hover:bg-elevado">
                {i.evento.capa_url ? (
                  <img src={i.evento.capa_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-elevado text-suave">
                    <Ticket className="h-5 w-5" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{i.evento.nome}</span>
                  <span className="block truncate text-[13px] text-suave">
                    {i.evento.estabelecimento.nome} · {quando(i.evento.inicio)}
                  </span>
                  <span className="block text-[12px] font-medium text-destaque">
                    {[i.tipo, i.meia ? "Meia-entrada" : null].filter(Boolean).join(" · ") || "Ingresso"}
                  </span>
                </span>
                <span className="botao h-8 shrink-0 px-3 text-[13px]">Ver QR</span>
              </button>
            ))}
        </section>
      )}

      {passados.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="rotulo px-1">Já foram / cancelados</h2>
          {passados.map((i) => (
            <div key={i.id} className="cartao flex items-center gap-3 p-3 opacity-60">
              <Ticket className="h-5 w-5 shrink-0 text-suave" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{i.evento.nome}</span>
                <span className="block text-[12px] text-suave">
                  {NOME_SITUACAO[i.situacao]}
                  {i.reembolso ? ` · reembolso ${reaisIngresso(Number(i.reembolso.valor))} ${i.reembolso.situacao === "feito" ? "feito" : "em andamento"}` : ""}
                </span>
              </span>
            </div>
          ))}
        </section>
      )}

      {aberto && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Ingresso" onClick={() => setAberto(null)}>
          <div className="folha max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-superficie p-6 text-center sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end">
              <button onClick={() => setAberto(null)} className="-mr-2 -mt-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="font-semibold">{aberto.evento.nome}</p>
            <p className="text-sm text-suave">
              {aberto.evento.estabelecimento.nome} · {quando(aberto.evento.inicio)}
            </p>
            <p className="mt-1 text-sm font-semibold text-destaque">{[aberto.tipo, aberto.meia ? "Meia-entrada" : null].filter(Boolean).join(" · ")}</p>
            <div className="mt-4">
              <QrCode texto={qrDoIngresso(aberto.codigo)} tamanho={230} />
            </div>
            <p className="codigo mt-3 text-base tracking-widest">{codigoLegivel(aberto.codigo)}</p>
            <p className="mt-2 text-[13px] text-suave">
              Ingresso nominal: titular <strong className="text-texto">{perfil?.nome}</strong>. Mostre na entrada; vale uma vez.
              {aberto.meia && " Leve o documento da meia-entrada."}
            </p>
            {aberto.compra_id && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="botao" disabled={!aberto.posso_transferir} onClick={() => setEnviando(aberto)}>
                  <Send className="h-4 w-4" />
                  {aberto.comprei ? "Enviar" : "Transferir"}
                </button>
                <button className="botao text-perigo" onClick={() => void pedirCancelamento(aberto)}>
                  <Ban className="h-4 w-4" />
                  Cancelar
                </button>
              </div>
            )}
            {aberto.compra_id && !aberto.posso_transferir && <p className="mt-2 text-[12px] text-suave">Este ingresso não pode mais ser transferido.</p>}
            {aberto.compra_id && aberto.posso_transferir && aberto.transferencia_ate && !aberto.comprei && (
              <p className="mt-2 text-[12px] text-suave">Transferência até {new Date(aberto.transferencia_ate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.</p>
            )}
          </div>
        </div>
      )}

      {enviando && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Enviar ingresso" onClick={() => setEnviando(null)}>
          <div className="folha max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie pb-[max(12px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <h2 className="text-lg font-semibold">Enviar ingresso para</h2>
              <button onClick={() => setEnviando(null)} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="px-5 text-[13px] text-suave">A pessoa passa a ser a titular: o ingresso sai da sua Carteira e vai para a dela.</p>
            <EscolherPessoas
              unica
              textoBotao="Enviar"
              cancelar={() => setEnviando(null)}
              confirmar={async ([pessoa]) => {
                await transferirIngresso(enviando.id, pessoa);
                setEnviando(null);
                setAberto(null);
                setAviso({ tipo: "ok", texto: "Ingresso enviado." });
                recarregar();
              }}
            />
          </div>
        </div>
      )}

      {cancelando && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Cancelar ingresso" onClick={() => setCancelando(null)}>
          <div className="folha w-full max-w-sm rounded-t-2xl bg-superficie p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Cancelar ingresso</h2>
            <p className="mt-2 text-sm">{cancelando.motivo}</p>
            {cancelando.permitido && (
              <p className="mt-2 text-sm">
                Você recebe de volta: <strong className="codigo">{reaisIngresso(cancelando.valor)}</strong>
                {cancelando.valor < cancelando.i.preco ? ` (de ${reaisIngresso(cancelando.i.preco)})` : ""}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="botao" onClick={() => setCancelando(null)}>
                Voltar
              </button>
              <button className="botao-principal bg-perigo" disabled={!cancelando.permitido} onClick={() => void confirmarCancelamento()}>
                Cancelar ingresso
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Carrega os ingressos da Carteira pela função nova (029). Devolve null se o banco ainda não tem a atualização. */
export function useMeusIngressos() {
  const [lista, setLista] = useState<MeuIngresso[] | null | undefined>(undefined);
  const recarregar = useCallback(() => {
    meusIngressos().then(setLista);
  }, []);
  useEffect(() => {
    recarregar();
  }, [recarregar]);
  return { lista, recarregar };
}

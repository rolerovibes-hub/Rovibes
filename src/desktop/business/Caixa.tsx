import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Banknote, CreditCard, MoreHorizontal, Plus, Printer, QrCode, Search, Store, X } from "lucide-react";
import { reais } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { buscarPagamentos, buscarTotais, CAMPOS_PEDIDO, faltaAoFechar, minutosDesde, normalizarPedidos, NOME_MEIO, PagamentoComanda, Pedido, Totais, useAoVivo } from "@/lib/salao";
import { useBusiness } from "@/lib/acessos";
import { usePermissoesJob } from "@/job/permissoes";
import { DetalheComanda, Desconto, resumoDaComanda } from "@/job/DetalheComanda";
import { FormularioPedido } from "@/job/FormularioPedido";
import { cupomConta, imprimir } from "../impressao";
import { Estacao } from "../estacao";
import { Moldura, useAtalhos } from "./Moldura";

interface Mesa {
  id: string;
  numero: string;
  area: string | null;
}
interface Comanda {
  id: string;
  mesa_id: string | null;
  nome: string | null;
  aberta_em: string;
  responsavel_id: string | null;
  pessoas: { usuario_id: string }[];
}

const MEIOS = [
  { v: "pix", nome: "Pix", icone: QrCode },
  { v: "credito", nome: "Crédito", icone: CreditCard },
  { v: "debito", nome: "Débito", icone: CreditCard },
  { v: "dinheiro", nome: "Dinheiro", icone: Banknote },
];
const paraNumero = (t: string) => Number(t.replace(/\./g, "").replace(",", ".")) || 0;
const paraTexto = (v: number) => v.toFixed(2).replace(".", ",");

/** Caixa do computador: comandas à esquerda, consumo no meio e recebimento à direita, com atalhos e impressão. */
export function Caixa({ estacao, configurar }: { estacao: Estacao; configurar?: () => void }) {
  const { atual } = useBusiness();
  const estab = atual!.estabelecimento_id;
  const perm = usePermissoesJob();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [pedidos, setPedidos] = useState<(Pedido & { comanda_id: string })[]>([]);
  const [descontos, setDescontos] = useState<Desconto[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [totais, setTotais] = useState<Totais | null>(null);
  const [pagos, setPagos] = useState<PagamentoComanda[]>([]);
  const [meio, setMeio] = useState("pix");
  const [valor, setValor] = useState("");
  const [janela, setJanela] = useState<null | "nova" | "lancar" | "mais">(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const campoBusca = useRef<HTMLInputElement>(null);
  const campoValor = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const [m, c] = await Promise.all([
      supabase.from("mesas").select("id, numero, area").eq("estabelecimento_id", estab).eq("ativa", true),
      supabase.from("comandas").select("id, mesa_id, nome, aberta_em, responsavel_id, pessoas:comanda_pessoas(usuario_id)").eq("estabelecimento_id", estab).eq("situacao", "aberta").order("aberta_em"),
    ]);
    setMesas(((m.data ?? []) as Mesa[]).sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true })));
    const abertas = (c.data ?? []) as unknown as Comanda[];
    setComandas(abertas);
    const ids = abertas.map((x) => x.id);
    if (!ids.length) {
      setPedidos([]);
      setDescontos([]);
      return;
    }
    const [p, d] = await Promise.all([
      supabase.from("pedidos").select(`comanda_id, ${CAMPOS_PEDIDO}`).in("comanda_id", ids).order("criado_em"),
      supabase.from("comanda_descontos").select("*").in("comanda_id", ids),
    ]);
    setPedidos(normalizarPedidos(p.data) as (Pedido & { comanda_id: string })[]);
    setDescontos(((d.data ?? []) as Desconto[]).map((x) => ({ ...x, valor: Number(x.valor) })));
  }, [estab]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  useAoVivo("caixa-desktop", { itens: `estabelecimento_id=eq.${estab}`, comandas: `estabelecimento_id=eq.${estab}` }, () => void carregar());

  const nomeDa = useCallback((c: Comanda) => (c.mesa_id ? `Mesa ${mesas.find((m) => m.id === c.mesa_id)?.numero ?? ""}` : c.nome ?? "Balcão"), [mesas]);
  const resumo = useMemo(() => {
    const r = new Map<string, ReturnType<typeof resumoDaComanda>>();
    for (const c of comandas) r.set(c.id, resumoDaComanda(pedidos.filter((p) => p.comanda_id === c.id), descontos.filter((d) => d.comanda_id === c.id)));
    return r;
  }, [comandas, pedidos, descontos]);
  const t = busca.trim().toLowerCase();
  const lista = comandas.filter((c) => !t || nomeDa(c).toLowerCase().includes(t));
  const sel = comandas.find((c) => c.id === selId) ?? null;
  const pedidosSel = sel ? pedidos.filter((p) => p.comanda_id === sel.id) : [];
  const itensSel = pedidosSel.flatMap((p) => p.itens).filter((i) => i.situacao !== "cancelado");

  // Totais e pagamentos da comanda aberta.
  const carregarConta = useCallback(async () => {
    if (!selId) return setTotais(null);
    const [a, b] = await Promise.all([buscarTotais(selId), buscarPagamentos(selId)]);
    setTotais(a);
    setPagos(b);
    setValor(paraTexto(a.falta));
  }, [selId]);
  useEffect(() => {
    void carregarConta();
  }, [carregarConta, pedidos]);
  useAoVivo(`pag-desktop-${selId}`, { pagamentos: `comanda_id=eq.${selId}` }, () => void carregarConta(), !!selId);

  // A comanda fechada some da lista: seleciona a próxima.
  useEffect(() => {
    if (selId && !comandas.some((c) => c.id === selId)) setSelId(lista[0]?.id ?? null);
    else if (!selId && lista.length) setSelId(lista[0].id);
  }, [comandas, selId, lista]);

  const receber = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!sel || !totais) return;
    const v = paraNumero(valor);
    if (v <= 0) return setErro("Informe o valor recebido.");
    setOcupado(true);
    setErro("");
    const { data, error } = await supabase.rpc("registrar_pagamento_caixa", { p_comanda: sel.id, p_valor: v, p_meio: meio, p_observacao: null });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    setOk(data ? `${nomeDa(sel)} quitada e fechada.` : `${reais(v)} recebido em ${NOME_MEIO[meio]}.`);
    await Promise.all([carregar(), carregarConta()]);
  };

  const fechar = async () => {
    if (!sel) return;
    setOcupado(true);
    setErro("");
    let r = await supabase.rpc("fechar_comanda", { p_comanda: sel.id, p_cancelar: false, p_mesmo_assim: false });
    const falta = r.error ? faltaAoFechar(r.error.message) : null;
    if (falta && perm.pode("fechar_em_aberto") && window.confirm(`Ainda falta receber R$ ${falta}. Fechar mesmo assim (cortesia ou pagamento por fora)?`))
      r = await supabase.rpc("fechar_comanda", { p_comanda: sel.id, p_cancelar: false, p_mesmo_assim: true });
    setOcupado(false);
    if (r.error) return setErro(falta ? `Ainda falta receber R$ ${falta}.` : mensagemDeErro(r.error));
    setOk(`${nomeDa(sel)} fechada.`);
    void carregar();
  };

  const imprimirConta = async () => {
    if (!sel || !totais) return;
    setErro("");
    try {
      await imprimir(
        estacao.impressora,
        cupomConta({
          estabelecimento: atual!.estabelecimento.nome,
          titulo: nomeDa(sel),
          itens: itensSel.map((i) => ({ quantidade: i.quantidade, nome: i.nome, total: i.preco * i.quantidade })),
          subtotal: totais.subtotal,
          desconto: totais.desconto,
          servico: totais.servico,
          total: totais.total,
          pago: totais.pago,
          falta: totais.falta,
          papel: estacao.papel,
        }),
      );
      setOk("Conta enviada para a impressora.");
    } catch (x) {
      setErro((x as Error).message);
    }
  };

  const mover = (d: number) => {
    const i = lista.findIndex((c) => c.id === selId);
    const prox = lista[Math.min(lista.length - 1, Math.max(0, i + d))];
    if (prox) setSelId(prox.id);
  };

  useAtalhos(
    {
      F2: () => setJanela("nova"),
      F3: () => sel && setJanela("lancar"),
      F4: () => void receber(),
      F6: () => void imprimirConta(),
      F9: () => void fechar(),
      "Ctrl+K": () => campoBusca.current?.focus(),
      ArrowDown: () => mover(1),
      ArrowUp: () => mover(-1),
      "1": () => setMeio("pix"),
      "2": () => setMeio("credito"),
      "3": () => setMeio("debito"),
      "4": () => setMeio("dinheiro"),
      Escape: () => setJanela(null),
    },
    janela === null,
  );

  useEffect(() => {
    if (!ok) return;
    const x = window.setTimeout(() => setOk(""), 5000);
    return () => window.clearTimeout(x);
  }, [ok]);

  return (
    <Moldura
      titulo="Caixa"
      estacao={estacao}
      configurar={configurar}
      extra={
        <label className="relative ml-6 w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
          <input ref={campoBusca} className="entrada h-9 pl-9" placeholder="Buscar mesa ou comanda" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      }
      atalhos={[
        ["F2", "Nova comanda"],
        ["F3", "Lançar item"],
        ["F4", "Receber"],
        ["F6", "Imprimir conta"],
        ["F9", "Fechar conta"],
        ["↑ ↓", "Trocar comanda"],
        ["1–4", "Meio de pagamento"],
        ["Ctrl U", "Trocar usuário"],
      ]}
    >
      <div className="grid h-full grid-cols-[320px_minmax(0,1fr)_360px]">
        {/* Comandas */}
        <section className="flex min-h-0 flex-col border-r border-borda">
          <div className="flex items-center justify-between px-4 pb-2 pt-3 text-[12px] font-semibold uppercase tracking-wide text-suave">
            Comandas abertas <span>{comandas.length}</span>
          </div>
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
            {lista.map((c) => {
              const r = resumo.get(c.id);
              const nome = nomeDa(c);
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setSelId(c.id)}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-lg border bg-superficie px-3 py-2.5 text-left",
                      c.id === selId ? "border-marca ring-2 ring-marca/20" : "border-borda hover:bg-elevado",
                    )}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destaque-suave text-[14px] font-bold text-destaque">
                      {c.mesa_id ? mesas.find((m) => m.id === c.mesa_id)?.numero : <Store className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{nome}</span>
                      <span className="block text-[12px] text-suave">
                        {minutosDesde(c.aberta_em)} min{r?.prontos ? ` · ${r.prontos} pronto${r.prontos > 1 ? "s" : ""}` : ""}
                      </span>
                    </span>
                    <span className="codigo shrink-0 font-semibold">{reais(r?.total ?? 0)}</span>
                  </button>
                </li>
              );
            })}
            {lista.length === 0 && <li className="px-2 py-10 text-center text-sm text-suave">Nenhuma comanda aberta.</li>}
          </ul>
          <div className="border-t border-borda p-3">
            <button className="botao-principal h-10 w-full" onClick={() => setJanela("nova")}>
              <Plus className="h-4 w-4" />
              Nova comanda
            </button>
          </div>
        </section>

        {/* Consumo */}
        <section className="flex min-h-0 flex-col border-r border-borda bg-superficie">
          {!sel ? (
            <p className="m-auto text-suave">Escolha uma comanda.</p>
          ) : (
            <>
              <div className="flex items-center gap-3 px-5 pb-2 pt-3">
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-suave">{nomeDa(sel)}</h2>
                <span className="text-[12px] text-suave">{sel.pessoas.length ? `${sel.pessoas.length} pelo app` : ""}</span>
                <div className="ml-auto flex gap-2">
                  <button className="botao h-8 px-3 text-[13px]" onClick={() => setJanela("lancar")}>
                    <Plus className="h-4 w-4" />
                    Lançar item
                  </button>
                  <button className="botao h-8 px-3 text-[13px]" onClick={() => setJanela("mais")} title="Desconto, serviço, cancelar ou estornar item, histórico">
                    <MoreHorizontal className="h-4 w-4" />
                    Mais
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-superficie text-left text-[12px] text-suave">
                    <tr className="border-b border-borda">
                      <th className="px-5 py-2 font-medium">Item</th>
                      <th className="px-2 py-2 text-right font-medium">Qtd</th>
                      <th className="px-2 py-2 text-right font-medium">Unit.</th>
                      <th className="px-5 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensSel.map((i) => (
                      <tr key={i.id} className="border-b border-borda/60">
                        <td className="px-5 py-2">
                          {i.nome}
                          {i.observacao && <span className="block text-[12px] text-suave">{i.observacao}</span>}
                        </td>
                        <td className="px-2 py-2 text-right">{i.quantidade}</td>
                        <td className="codigo px-2 py-2 text-right">{paraTexto(i.preco)}</td>
                        <td className="codigo px-5 py-2 text-right">{paraTexto(i.preco * i.quantidade)}</td>
                      </tr>
                    ))}
                    {itensSel.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-5 py-10 text-center text-suave">
                          Nenhum item ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {totais && (
                <div className="space-y-1 border-t border-borda px-5 py-3 text-sm">
                  <p className="flex justify-between text-suave">
                    <span>Subtotal</span>
                    <span className="codigo">{reais(totais.subtotal)}</span>
                  </p>
                  {totais.desconto > 0 && (
                    <p className="flex justify-between text-ok">
                      <span>Desconto</span>
                      <span className="codigo">−{reais(totais.desconto)}</span>
                    </p>
                  )}
                  <p className="flex justify-between text-suave">
                    <span>Serviço {totais.taxa_servico > 0 ? `${String(totais.taxa_servico).replace(".", ",")}%` : ""}</span>
                    <span className="codigo">{reais(totais.servico)}</span>
                  </p>
                  {totais.pago > 0 && (
                    <p className="flex justify-between text-ok">
                      <span>Já pago</span>
                      <span className="codigo">−{reais(totais.pago)}</span>
                    </p>
                  )}
                  <p className="flex items-end justify-between pt-1 text-2xl font-bold">
                    <span>{totais.falta > 0 ? "Falta" : "Quitada"}</span>
                    <span className="codigo">{reais(totais.falta)}</span>
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        {/* Receber */}
        <section className="flex min-h-0 flex-col gap-3 overflow-y-auto bg-fundo p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-suave">Receber</p>
          <div className="grid grid-cols-2 gap-2">
            {MEIOS.map((m, i) => (
              <button
                key={m.v}
                onClick={() => setMeio(m.v)}
                className={clsx("flex items-center justify-between rounded-lg border px-3 py-3 font-semibold", meio === m.v ? "border-marca bg-destaque-suave text-destaque" : "border-borda bg-superficie")}
              >
                <span className="inline-flex items-center gap-2">
                  <m.icone className="h-4 w-4" />
                  {m.nome}
                </span>
                <kbd className="rounded border border-borda px-1.5 text-[11px] font-normal text-suave">{i + 1}</kbd>
              </button>
            ))}
          </div>
          <form onSubmit={(e) => void receber(e)} className="space-y-2">
            <label className="relative block">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-suave">R$</span>
              <input
                ref={campoValor}
                className="h-16 w-full rounded-lg border border-borda bg-superficie pl-14 pr-4 text-right text-3xl font-bold focus:border-marca focus:outline-none"
                value={valor}
                inputMode="decimal"
                onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))}
                disabled={!sel || !totais || totais.falta <= 0}
              />
            </label>
            {totais && totais.pessoas > 1 && totais.falta > 0 && (
              <button type="button" className="botao h-9 w-full text-[13px]" onClick={() => setValor(paraTexto(Math.min(totais.falta, Math.round((totais.total / totais.pessoas) * 100) / 100)))}>
                1/{totais.pessoas} por pessoa ({reais(Math.min(totais.falta, totais.total / totais.pessoas))})
              </button>
            )}
            <button className="botao-principal h-12 w-full text-[15px]" disabled={!sel || !totais || totais.falta <= 0 || ocupado}>
              Receber
              <kbd className="ml-auto rounded bg-white/20 px-1.5 text-[11px]">F4</kbd>
            </button>
          </form>
          <button className="botao h-10 w-full" disabled={!sel} onClick={() => void imprimirConta()}>
            <Printer className="h-4 w-4" />
            Imprimir conta
            <kbd className="ml-auto rounded border border-borda px-1.5 text-[11px] text-suave">F6</kbd>
          </button>
          <button className="botao h-10 w-full" disabled={!sel || ocupado} onClick={() => void fechar()}>
            Fechar conta
            <kbd className="ml-auto rounded border border-borda px-1.5 text-[11px] text-suave">F9</kbd>
          </button>
          {erro && <p className="rounded-lg bg-perigo/10 px-3 py-2 text-sm text-perigo">{erro}</p>}
          {ok && <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">{ok}</p>}
          {pagos.length > 0 && (
            <div>
              <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-suave">Pagamentos</p>
              <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie text-[13px]">
                {pagos.map((p) => (
                  <li key={p.id} className={clsx("flex justify-between px-3 py-2", p.situacao !== "aprovado" && "line-through opacity-60")}>
                    <span>{p.origem === "app" ? `${p.quem ?? "Cliente"} pelo app` : NOME_MEIO[p.meio ?? "outro"]}</span>
                    <span className="codigo">{reais(p.valor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {janela === "nova" && (
        <NovaComanda
          estab={estab}
          mesasLivres={mesas.filter((m) => !comandas.some((c) => c.mesa_id === m.id))}
          fechar={() => setJanela(null)}
          aberta={(id) => {
            setJanela(null);
            void carregar().then(() => {
              setSelId(id);
              setJanela("lancar");
            });
          }}
        />
      )}
      {janela === "lancar" && sel && (
        <Janela titulo={`Lançar item · ${nomeDa(sel)}`} fechar={() => setJanela(null)} largura="max-w-4xl">
          <FormularioPedido
            estab={estab}
            comanda={sel.id}
            comMesa={!!sel.mesa_id}
            lateral
            enviado={() => {
              setJanela(null);
              setOk("Pedido enviado para o preparo.");
              void carregar();
            }}
          />
        </Janela>
      )}
      {janela === "mais" && sel && (
        <Janela titulo={nomeDa(sel)} fechar={() => setJanela(null)} largura="max-w-3xl">
          <DetalheComanda
            comanda={sel}
            pedidos={pedidosSel}
            descontos={descontos.filter((d) => d.comanda_id === sel.id)}
            podeEntregar
            aoMudar={() => {
              void carregar();
              void carregarConta();
            }}
            aoErro={setErro}
            aoAviso={setOk}
          />
        </Janela>
      )}
    </Moldura>
  );
}

function NovaComanda({ estab, mesasLivres, fechar, aberta }: { estab: string; mesasLivres: Mesa[]; fechar: () => void; aberta: (id: string) => void }) {
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const abrir = async (mesa: string | null, n: string | null) => {
    setErro("");
    const { data, error } = await supabase.rpc("abrir_comanda", { p_estab: estab, p_mesa: mesa, p_nome: n });
    if (error) return setErro(mensagemDeErro(error));
    if (mesa) {
      const { data: c } = await supabase.from("comandas").select("id").eq("mesa_id", mesa).eq("situacao", "aberta").maybeSingle();
      aberta((c as { id: string } | null)?.id ?? (data as string));
    } else aberta(data as string);
  };
  return (
    <Janela titulo="Nova comanda" fechar={fechar} largura="max-w-xl">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (nome.trim()) void abrir(null, nome.trim());
        }}
      >
        <input autoFocus className="entrada flex-1" placeholder="Balcão: nome do cliente" value={nome} onChange={(e) => setNome(e.target.value)} />
        <button className="botao-principal" disabled={!nome.trim()}>
          Abrir no balcão
        </button>
      </form>
      {mesasLivres.length > 0 && (
        <>
          <p className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-wide text-suave">Ou uma mesa livre</p>
          <div className="grid grid-cols-6 gap-2">
            {mesasLivres.map((m) => (
              <button key={m.id} className="rounded-lg border border-borda py-3 text-lg font-semibold hover:border-marca hover:bg-destaque-suave" onClick={() => void abrir(m.id, null)}>
                {m.numero}
              </button>
            ))}
          </div>
        </>
      )}
      {erro && <p className="mt-3 text-sm text-perigo">{erro}</p>}
    </Janela>
  );
}

/** Janela interna (diálogo) do app de computador. */
export function Janela({ titulo, fechar, largura = "max-w-2xl", children }: { titulo: string; fechar: () => void; largura?: string; children: ReactNode }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [fechar]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-8" onClick={fechar}>
      <div className={clsx("flex max-h-full w-full flex-col overflow-hidden rounded-xl bg-superficie text-texto shadow-2xl", largura)} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-5 py-3">
          <h2 className="font-semibold">{titulo}</h2>
          <button className="rounded-full p-1.5 hover:bg-elevado" onClick={fechar} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

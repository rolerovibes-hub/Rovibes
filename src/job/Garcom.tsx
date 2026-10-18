import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, Armchair, ArrowRightLeft, CircleDollarSign, Combine, Hand, Plus, ReceiptText, Store, UserRound, Users, X } from "lucide-react";
import { usePermissoesJob } from "./permissoes";
import { useNomesEquipe } from "./fila";
import { reais } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { CAMPOS_PEDIDO, faltaAoFechar, normalizarPedidos, Pedido, useAoVivo } from "@/lib/salao";
import { DetalheComanda, Desconto, resumoDaComanda } from "./DetalheComanda";
import { FormularioPedido } from "./FormularioPedido";

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

type Selecao = { tipo: "mesa"; id: string } | { tipo: "comanda"; id: string };

/** Garçom: mesas, comandas, venda direta e fechamento. */
export function Garcom({ estab }: { estab: string }) {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [pedidos, setPedidos] = useState<(Pedido & { comanda_id: string })[]>([]);
  const [descontos, setDescontos] = useState<Desconto[]>([]);
  const [sel, setSel] = useState<Selecao | null>(null);
  const [vendendo, setVendendo] = useState(false);
  const [balcao, setBalcao] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const { eu, supervisor } = usePermissoesJob();
  const nomes = useNomesEquipe(estab);
  const [filtro, setFiltro] = useState<"minhas" | "todas">("todas");
  const [mover, setMover] = useState<"transferir" | "trocar" | "juntar" | null>(null);
  const [garcons, setGarcons] = useState<{ usuario_id: string; nome: string }[]>([]);

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
      supabase.from("comanda_descontos").select("comanda_id, titulo, valor").in("comanda_id", ids),
    ]);
    setPedidos(normalizarPedidos(p.data) as (Pedido & { comanda_id: string })[]);
    setDescontos(((d.data ?? []) as Desconto[]).map((x) => ({ ...x, valor: Number(x.valor) })));
  }, [estab]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useAoVivo("garcom", { itens: `estabelecimento_id=eq.${estab}`, comandas: `estabelecimento_id=eq.${estab}` }, () => void carregar());

  const resumo = useMemo(() => {
    const r = new Map<string, ReturnType<typeof resumoDaComanda>>();
    for (const c of comandas) r.set(c.id, resumoDaComanda(pedidos.filter((p) => p.comanda_id === c.id), descontos.filter((d) => d.comanda_id === c.id)));
    return r;
  }, [comandas, pedidos, descontos]);

  const daMesa = (m: string) => comandas.find((c) => c.mesa_id === m) ?? null;
  const comanda = sel?.tipo === "comanda" ? comandas.find((c) => c.id === sel.id) ?? null : sel ? daMesa(sel.id) : null;
  const mesa = sel?.tipo === "mesa" ? mesas.find((m) => m.id === sel.id) ?? null : comanda?.mesa_id ? mesas.find((m) => m.id === comanda.mesa_id) ?? null : null;
  const titulo = mesa ? `Mesa ${mesa.numero}` : comanda?.nome ?? "Comanda";
  const avulsas = comandas.filter((c) => !c.mesa_id);
  const pendentes = comandas.filter((c) => (resumo.get(c.id)?.prontos ?? 0) > 0);
  const minhas = comandas.filter((c) => c.responsavel_id === eu);
  const visivel = (c: Comanda | null) => filtro === "todas" || !c || c.responsavel_id === eu || !c.responsavel_id;
  const primeiroNome = (u: string | null) => (u ? (u === eu ? "Você" : nomes.get(u) ?? "Outro") : null);

  const executarRpc = async (fn: string, args: Record<string, unknown>, texto: string) => {
    setOcupado(true);
    setErro("");
    const { error } = await supabase.rpc(fn, args);
    setOcupado(false);
    setMover(null);
    if (error) return setErro(mensagemDeErro(error));
    setOk(texto);
    void carregar();
  };

  const abrirMover = async (tipo: "transferir" | "trocar" | "juntar") => {
    setMover(tipo);
    if (tipo === "transferir") {
      const { data } = await supabase.rpc("garcons", { p_estab: estab });
      setGarcons(((data ?? []) as { usuario_id: string; nome: string }[]).filter((g) => g.usuario_id !== comanda?.responsavel_id));
    }
  };

  const abrir = async (mesaId: string | null, nome: string | null) => {
    setOcupado(true);
    setErro("");
    const { data, error } = await supabase.rpc("abrir_comanda", { p_estab: estab, p_mesa: mesaId, p_nome: nome });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    await carregar();
    setSel(mesaId ? { tipo: "mesa", id: mesaId } : { tipo: "comanda", id: data as string });
    setVendendo(true);
  };

  const novaNoBalcao = (e: FormEvent) => {
    e.preventDefault();
    if (!balcao?.trim()) return;
    void abrir(null, balcao.trim());
    setBalcao(null);
  };

  const fecharConta = async (mesmoAssim = false) => {
    if (!comanda) return;
    if (!mesmoAssim && !window.confirm(`Fechar ${titulo}?`)) return;
    setOcupado(true);
    const { data, error } = await supabase.rpc("fechar_comanda", { p_comanda: comanda.id, p_cancelar: false, p_mesmo_assim: mesmoAssim });
    setOcupado(false);
    if (error) {
      const falta = faltaAoFechar(error.message);
      if (falta && window.confirm(`Ainda falta receber R$ ${falta}. Fechar mesmo assim (cortesia ou pagamento por fora)?`)) return void fecharConta(true);
      return setErro(falta ? `Ainda falta receber R$ ${falta}. Registre o pagamento em "Receber no caixa".` : mensagemDeErro(error));
    }
    setOk(`${titulo} fechada. Total: ${reais(Number(data ?? 0))}.`);
    setSel(null);
    void carregar();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button className="botao-principal h-12" onClick={() => setBalcao("")}>
          <Store className="h-4 w-4" />
          Venda no balcão
        </button>
        <div className="cartao flex flex-col justify-center px-3 text-[13px]">
          <span className="font-semibold">{comandas.length} abertas</span>
          <span className={clsx(pendentes.length ? "text-alerta" : "text-suave")}>
            {pendentes.length ? `${pendentes.length} com itens prontos` : "nada pronto esperando"}
          </span>
        </div>
      </div>

      {balcao !== null && (
        <form onSubmit={novaNoBalcao} className="cartao flex items-end gap-2 p-3">
          <label className="min-w-0 flex-1">
            <span className="rotulo mb-1 block">Nome do cliente</span>
            <input autoFocus className="entrada" value={balcao} onChange={(e) => setBalcao(e.target.value)} placeholder="Ex.: João" />
          </label>
          <button className="botao-principal h-10" disabled={!balcao.trim() || ocupado}>
            Abrir
          </button>
          <button type="button" className="botao h-10 w-10 px-0" onClick={() => setBalcao(null)} aria-label="Cancelar">
            <X className="h-4 w-4" />
          </button>
        </form>
      )}

      {erro && !sel && <p role="alert" className="rounded-cartao border border-perigo/40 bg-perigo/10 px-4 py-3 text-sm text-perigo">{erro}</p>}
      {ok && !sel && <p role="status" className="rounded-cartao border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{ok}</p>}

      <div className="grid grid-cols-2 gap-1 rounded-lg border border-borda bg-superficie p-1" role="tablist" aria-label="Mesas">
        {(["minhas", "todas"] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filtro === f}
            onClick={() => setFiltro(f)}
            className={clsx("rounded-md py-2 text-sm", filtro === f ? "bg-destaque-suave font-semibold text-destaque" : "text-suave")}
          >
            {f === "minhas" ? `Minhas mesas · ${minhas.length}` : "Todas"}
          </button>
        ))}
      </div>

      {mesas.length === 0 && avulsas.length === 0 ? (
        <div className="cartao px-6 py-12 text-center">
          <Armchair className="mx-auto h-8 w-8 text-suave" />
          <p className="mt-3 font-medium">Nenhuma mesa cadastrada</p>
          <p className="mt-1 text-sm text-suave">O gestor cadastra as mesas no Business, em Mesas e comandas.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {mesas.map((m) => {
            const c = daMesa(m.id);
            const r = c ? resumo.get(c.id) : null;
            if (!visivel(c)) return null;
            const resp = primeiroNome(c?.responsavel_id ?? null);
            return (
              <li key={m.id}>
                <button
                  onClick={() => {
                    setSel({ tipo: "mesa", id: m.id });
                    setVendendo(false);
                    setOk("");
                  }}
                  className={clsx("cartao w-full p-3 text-left", c && "border-l-4 border-l-marca", r?.prontos ? "bg-ok/10" : "")}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="text-lg font-semibold">{m.numero}</span>
                    {resp && <span className={clsx("truncate text-[11px]", resp === "Você" ? "font-semibold text-destaque" : "text-suave")}>{resp}</span>}
                  </span>
                  {c && r ? (
                    <>
                      <span className="codigo block text-[13px]">{reais(r.total)}</span>
                      <span className={clsx("block text-[11px]", r.prontos ? "font-semibold text-ok" : "text-suave")}>{r.prontos ? `${r.prontos} pronto${r.prontos > 1 ? "s" : ""}` : `${r.pendentes} pendente${r.pendentes === 1 ? "" : "s"}`}</span>
                    </>
                  ) : (
                    <span className="block text-[12px] text-suave">Livre</span>
                  )}
                </button>
              </li>
            );
          })}
          {avulsas.filter(visivel).map((c) => (
            <li key={c.id}>
              <button
                onClick={() => {
                  setSel({ tipo: "comanda", id: c.id });
                  setVendendo(false);
                  setOk("");
                }}
                className="cartao w-full border-dashed p-3 text-left"
              >
                <span className="block truncate font-semibold">{c.nome}</span>
                <span className="codigo block text-[13px]">{reais(resumo.get(c.id)?.total ?? 0)}</span>
                <span className="block text-[11px] text-suave">Balcão</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {sel && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-fundo" role="dialog" aria-modal="true" aria-label={titulo}>
          <header className="mx-auto flex w-full max-w-3xl items-center gap-2 border-b border-borda px-2 py-2.5">
            <button onClick={() => (vendendo ? setVendendo(false) : setSel(null))} className="rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="flex-1 font-semibold">
              {vendendo ? `Novo pedido · ${titulo}` : titulo}
              {comanda && !vendendo && (
                <span className="ml-2 inline-flex items-center gap-1 text-[13px] font-normal text-suave">
                  <Users className="h-3.5 w-3.5" />
                  {comanda.pessoas.length}
                </span>
              )}
            </h2>
          </header>
          <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-4">
            {erro && <p role="alert" className="mb-3 rounded-cartao border border-perigo/40 bg-perigo/10 px-4 py-3 text-sm text-perigo">{erro}</p>}
            {!comanda ? (
              <div className="py-10 text-center">
                <Armchair className="mx-auto h-8 w-8 text-suave" />
                <p className="mt-3 font-medium">Mesa livre</p>
                <button className="botao-principal mt-5 h-11 px-6" disabled={ocupado} onClick={() => mesa && void abrir(mesa.id, null)}>
                  <ReceiptText className="h-4 w-4" />
                  Abrir mesa e lançar pedido
                </button>
              </div>
            ) : vendendo ? (
              <FormularioPedido
                estab={estab}
                comanda={comanda.id}
                comMesa={!!comanda.mesa_id}
                lateral={false}
                enviado={() => {
                  setVendendo(false);
                  setOk("Pedido enviado para o preparo.");
                  void carregar();
                }}
              />
            ) : (
              <>
                {ok && <p role="status" className="mb-3 rounded-cartao border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{ok}</p>}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <UserRound className="h-4 w-4 text-suave" />
                    {comanda.responsavel_id ? <>Responsável: <strong>{primeiroNome(comanda.responsavel_id)}</strong></> : <span className="text-suave">Sem garçom responsável</span>}
                  </span>
                  <span className="ml-auto flex flex-wrap gap-2">
                    {comanda.responsavel_id !== eu && (!comanda.responsavel_id || supervisor) && (
                      <button className="botao h-9 px-3" disabled={ocupado} onClick={() => void executarRpc("assumir_comanda", { p_comanda: comanda.id, p_para: null }, `Você assumiu ${titulo}.`)}>
                        <Hand className="h-4 w-4" />
                        Assumir
                      </button>
                    )}
                    {(comanda.responsavel_id === eu || supervisor) && (
                      <button className="botao h-9 px-3" disabled={ocupado} onClick={() => void abrirMover("transferir")}>
                        <ArrowRightLeft className="h-4 w-4" />
                        Transferir
                      </button>
                    )}
                    <button className="botao h-9 px-3" disabled={ocupado} onClick={() => void abrirMover("trocar")}>
                      <Armchair className="h-4 w-4" />
                      Trocar de mesa
                    </button>
                    {comandas.length > 1 && (
                      <button className="botao h-9 px-3" disabled={ocupado} onClick={() => void abrirMover("juntar")}>
                        <Combine className="h-4 w-4" />
                        Juntar mesas
                      </button>
                    )}
                  </span>
                </div>
                {mover && (
                  <div className="cartao mb-4 flex flex-wrap items-end gap-2 p-3">
                    <label className="min-w-0 flex-1">
                      <span className="rotulo mb-1 block">
                        {mover === "transferir" ? "Transferir para o garçom" : mover === "juntar" ? `Trazer para ${titulo} a comanda de` : "Levar a comanda para a mesa"}
                      </span>
                      <select
                        className="entrada"
                        defaultValue=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          if (mover === "transferir") void executarRpc("assumir_comanda", { p_comanda: comanda.id, p_para: v }, `${titulo} transferida.`);
                          else if (mover === "juntar") {
                            const o = comandas.find((x) => x.id === v);
                            const nomeO = o?.mesa_id ? `Mesa ${mesas.find((m) => m.id === o.mesa_id)?.numero}` : o?.nome ?? "Comanda";
                            if (window.confirm(`Juntar ${nomeO} com ${titulo}? Pessoas, pedidos e pagamentos passam para ${titulo}.`))
                              void executarRpc("juntar_comandas", { p_destino: comanda.id, p_origem: v }, `${nomeO} juntada com ${titulo}.`);
                          } else void executarRpc("trocar_mesa", { p_comanda: comanda.id, p_mesa: v }, `Comanda levada para a mesa ${mesas.find((x) => x.id === v)?.numero}.`);
                        }}
                      >
                        <option value="">Escolha...</option>
                        {mover === "juntar"
                          ? comandas
                              .filter((x) => x.id !== comanda.id)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.mesa_id ? `Mesa ${mesas.find((m) => m.id === x.mesa_id)?.numero ?? ""}` : x.nome ?? "Balcão"}
                                </option>
                              ))
                          : mover === "transferir"
                          ? garcons.map((g) => (
                              <option key={g.usuario_id} value={g.usuario_id}>
                                {g.nome}
                              </option>
                            ))
                          : mesas
                              .filter((x) => !daMesa(x.id))
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  Mesa {x.numero}
                                  {x.area ? ` · ${x.area}` : ""}
                                </option>
                              ))}
                      </select>
                    </label>
                    <button className="botao h-10 w-10 px-0" onClick={() => setMover(null)} aria-label="Cancelar">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <DetalheComanda
                  supervisor={supervisor}
                  comanda={comanda}
                  pedidos={pedidos.filter((p) => p.comanda_id === comanda.id)}
                  descontos={descontos.filter((d) => d.comanda_id === comanda.id)}
                  podeEntregar
                  aoMudar={() => void carregar()}
                  aoErro={setErro}
                />
              </>
            )}
          </div>
          {comanda && !vendendo && (
            <footer className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-2 border-t border-borda px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              <button className="botao h-12" disabled={ocupado} onClick={() => void fecharConta(false)}>
                <CircleDollarSign className="h-4 w-4" />
                Fechar conta
              </button>
              <button className="botao-principal h-12" onClick={() => setVendendo(true)}>
                <Plus className="h-4 w-4" />
                Lançar pedido
              </button>
            </footer>
          )}
        </div>
      )}
    </div>
  );
}

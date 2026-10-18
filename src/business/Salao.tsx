import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import QRCode from "qrcode";
import { Armchair, Ban, CircleDollarSign, Pencil, Plus, Printer, ReceiptText, Send, Trash2, Users, X } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, reais, Secao } from "@/components/Formulario";
import { DetalheComanda, Desconto, resumoDaComanda } from "@/job/DetalheComanda";
import { FormularioPedido } from "@/job/FormularioPedido";
import { usePermissoesJob } from "@/job/permissoes";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useBusiness } from "@/lib/acessos";
import { CAMPOS_PEDIDO, faltaAoFechar, linkDaMesa, minutosDesde, normalizarPedidos, Pedido, useAoVivo } from "@/lib/salao";

interface Mesa {
  id: string;
  numero: string;
  area: string | null;
  lugares: number | null;
  codigo: string;
  ativa: boolean;
}

interface Comanda {
  id: string;
  mesa_id: string | null;
  nome: string | null;
  situacao: "aberta" | "fechada" | "cancelada";
  aberta_em: string;
  fechada_em: string | null;
  total: number | null;
  pessoas: { usuario_id: string }[];
}


type Aba = "salao" | "mesas" | "fechadas";

const ordenarMesas = (a: Mesa, b: Mesa) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true });

export function Salao() {
  const { atual } = useBusiness();
  const { supervisor } = usePermissoesJob();
  const id = atual?.estabelecimento_id;
  const [aba, setAba] = useState<Aba>("salao");
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [fechadas, setFechadas] = useState<Comanda[]>([]);
  const [pedidos, setPedidos] = useState<(Pedido & { comanda_id: string })[]>([]);
  const [descontos, setDescontos] = useState<Desconto[]>([]);
  const [selecao, setSelecao] = useState<{ tipo: "mesa" | "comanda"; id: string } | null>(null);
  const [lancando, setLancando] = useState(false);
  const [avulsa, setAvulsa] = useState<string | null>(null);
  const [rascunhoMesa, setRascunhoMesa] = useState<{ id?: string; numero: string; area: string; lugares: string; ate: string } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const [m, c, f] = await Promise.all([
      supabase.from("mesas").select("id, numero, area, lugares, codigo, ativa").eq("estabelecimento_id", id),
      supabase.from("comandas").select("id, mesa_id, nome, situacao, aberta_em, fechada_em, total, pessoas:comanda_pessoas(usuario_id)").eq("estabelecimento_id", id).eq("situacao", "aberta").order("aberta_em"),
      supabase
        .from("comandas")
        .select("id, mesa_id, nome, situacao, aberta_em, fechada_em, total, pessoas:comanda_pessoas(usuario_id)")
        .eq("estabelecimento_id", id)
        .neq("situacao", "aberta")
        .gte("fechada_em", inicioDia.toISOString())
        .order("fechada_em", { ascending: false }),
    ]);
    setMesas(((m.data ?? []) as Mesa[]).sort(ordenarMesas));
    const abertas = (c.data ?? []) as unknown as Comanda[];
    setComandas(abertas);
    setFechadas(((f.data ?? []) as unknown as Comanda[]).map((x) => ({ ...x, total: x.total == null ? null : Number(x.total) })));
    const ids = abertas.map((x) => x.id);
    if (ids.length) {
      const [p, d] = await Promise.all([
        supabase.from("pedidos").select(`comanda_id, ${CAMPOS_PEDIDO}`).in("comanda_id", ids).order("criado_em"),
        supabase.from("comanda_descontos").select("comanda_id, titulo, valor").in("comanda_id", ids),
      ]);
      setPedidos(normalizarPedidos(p.data) as (Pedido & { comanda_id: string })[]);
      setDescontos(((d.data ?? []) as Desconto[]).map((x) => ({ ...x, valor: Number(x.valor) })));
    } else {
      setPedidos([]);
      setDescontos([]);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useAoVivo("salao", { pedidos: `estabelecimento_id=eq.${id}`, itens: `estabelecimento_id=eq.${id}`, comandas: `estabelecimento_id=eq.${id}` }, () => void carregar(), !!id);

  const resumo = useMemo(() => {
    const r = new Map<string, ReturnType<typeof resumoDaComanda>>();
    for (const c of comandas) {
      r.set(c.id, resumoDaComanda(pedidos.filter((p) => p.comanda_id === c.id), descontos.filter((d) => d.comanda_id === c.id)));
    }
    return r;
  }, [comandas, pedidos, descontos]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const comandaDaMesa = (m: string) => comandas.find((c) => c.mesa_id === m) ?? null;
  const comanda =
    selecao?.tipo === "comanda" ? comandas.find((c) => c.id === selecao.id) ?? null : selecao?.tipo === "mesa" ? comandaDaMesa(selecao.id) : null;
  const mesaSel = selecao?.tipo === "mesa" ? mesas.find((m) => m.id === selecao.id) ?? null : comanda?.mesa_id ? mesas.find((m) => m.id === comanda.mesa_id) ?? null : null;
  const avulsas = comandas.filter((c) => !c.mesa_id);
  const titulo = (c: Comanda | null, m: Mesa | null) => (m ? `Mesa ${m.numero}` : c?.nome ? `Comanda ${c.nome}` : "Comanda");

  const executar = async (acao: () => Promise<void>, ok?: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await acao();
      if (ok) setAviso({ tipo: "ok", texto: ok });
    } catch (err) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(err) });
    } finally {
      setOcupado(false);
    }
  };

  const abrirNaMesa = () =>
    mesaSel &&
    void executar(async () => {
      const { error } = await supabase.rpc("abrir_comanda", { p_estab: id, p_mesa: mesaSel.id, p_nome: null });
      if (error) throw error;
      await carregar();
      setLancando(true);
    });

  const abrirAvulsa = (e: FormEvent) => {
    e.preventDefault();
    if (!avulsa?.trim()) return;
    void executar(async () => {
      const { data, error } = await supabase.rpc("abrir_comanda", { p_estab: id, p_mesa: null, p_nome: avulsa.trim() });
      if (error) throw error;
      setAvulsa(null);
      await carregar();
      setSelecao({ tipo: "comanda", id: data as string });
      setLancando(true);
    });
  };

  const fechar = (cancelar: boolean) =>
    comanda &&
    void executar(async () => {
      const pergunta = cancelar ? `Cancelar ${titulo(comanda, mesaSel)}? Use só para comanda aberta por engano, sem pedidos.` : `Fechar ${titulo(comanda, mesaSel)}?`;
      if (!window.confirm(pergunta)) return;
      let { data, error } = await supabase.rpc("fechar_comanda", { p_comanda: comanda.id, p_cancelar: cancelar });
      const falta = error ? faltaAoFechar(error.message) : null;
      if (falta) {
        if (!window.confirm(`Ainda falta receber R$ ${falta}. Fechar mesmo assim (cortesia ou pagamento por fora)?`)) return;
        ({ data, error } = await supabase.rpc("fechar_comanda", { p_comanda: comanda.id, p_cancelar: false, p_mesmo_assim: true }));
      }
      if (error) throw error;
      setLancando(false);
      await carregar();
      setAviso({ tipo: "ok", texto: cancelar ? "Comanda cancelada." : `Comanda fechada. Total recebido: ${reais(Number(data ?? 0))}.` });
    });

  const salvarMesa = (e: FormEvent) => {
    e.preventDefault();
    if (!rascunhoMesa) return;
    void executar(async () => {
      const r = rascunhoMesa;
      const lugares = r.lugares.trim() ? Math.round(Number(r.lugares)) : null;
      if (r.id) {
        const { error } = await supabase.from("mesas").update({ numero: r.numero.trim(), area: r.area.trim() || null, lugares }).eq("id", r.id);
        if (error) throw error;
      } else {
        const de = Number(r.numero);
        const ate = Number(r.ate);
        const lote =
          r.ate.trim() && Number.isInteger(de) && Number.isInteger(ate) && ate >= de
            ? Array.from({ length: Math.min(ate - de + 1, 200) }, (_, i) => String(de + i))
            : [r.numero.trim()];
        const existentes = new Set(mesas.map((m) => m.numero));
        const novas = lote.filter((n) => !existentes.has(n)).map((numero) => ({ estabelecimento_id: id, numero, area: r.area.trim() || null, lugares }));
        if (!novas.length) throw new Error("Essas mesas já existem.");
        const { error } = await supabase.from("mesas").insert(novas);
        if (error) throw error;
      }
      setRascunhoMesa(null);
      await carregar();
    }, "Mesas salvas.");
  };

  const mesaParaEditar = selecao?.tipo === "mesa" && aba === "mesas" ? mesas.find((m) => m.id === selecao.id) ?? null : null;

  const alternarMesa = () =>
    mesaParaEditar &&
    void executar(async () => {
      const { error } = await supabase.from("mesas").update({ ativa: !mesaParaEditar.ativa }).eq("id", mesaParaEditar.id);
      if (error) throw error;
      await carregar();
    });

  const excluirMesa = () =>
    mesaParaEditar &&
    void executar(async () => {
      if (comandaDaMesa(mesaParaEditar.id)) throw new Error("Feche a comanda desta mesa antes de excluir.");
      if (!window.confirm(`Excluir a mesa ${mesaParaEditar.numero}? O QR code impresso dela deixa de funcionar.`)) return;
      const { error } = await supabase.from("mesas").delete().eq("id", mesaParaEditar.id);
      if (error) throw error;
      setSelecao(null);
      await carregar();
    }, "Mesa excluída.");

  const imprimir = async (lista: Mesa[]) => {
    const janela = window.open("", "_blank");
    if (!janela) return setAviso({ tipo: "erro", texto: "O navegador bloqueou a janela de impressão. Permita pop-ups para este site." });
    janela.document.write("<p style='font-family:sans-serif'>Gerando QR codes...</p>");
    const cartoes = await Promise.all(
      lista.map(async (m) => {
        const qr = await QRCode.toDataURL(linkDaMesa(m.codigo), { margin: 1, width: 480, color: { dark: "#111318", light: "#FFFFFF" } });
        return `<div class="c"><img class="p" src="/marca/rovibes-pin.webp" alt=""><p class="l">${(atual?.estabelecimento.nome ?? "").replace(/</g, "&lt;")}</p><h1>Mesa ${m.numero.replace(/</g, "&lt;")}</h1><img class="q" src="${qr}" alt=""><p class="t">Leia com a câmera do celular para pedir pelo RoVibes</p><p class="k">${m.codigo}</p></div>`;
      }),
    );
    janela.document.open();
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>QR das mesas</title><style>
      @page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:'IBM Plex Sans',Arial,sans-serif;color:#1B2130}
      .g{display:grid;grid-template-columns:repeat(2,1fr);gap:10mm}.c{border:1px solid #DCE0E8;border-radius:10px;padding:8mm;text-align:center;break-inside:avoid}
      .p{height:14mm}.l{margin:2mm 0 0;font-size:11pt;color:#5D667A}h1{margin:1mm 0 4mm;font-size:22pt}.q{width:55mm;height:55mm}
      .t{margin:4mm 0 1mm;font-size:10pt}.k{margin:0;font:9pt monospace;color:#5D667A}</style></head>
      <body><div class="g">${cartoes.join("")}</div><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    janela.document.close();
  };

  const lista = aba === "mesas" ? mesas : mesas.filter((m) => m.ativa);

  return (
    <TelaUniversal
      acoes={
        aba === "mesas" ? (
          <>
            <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setRascunhoMesa({ numero: "", area: "", lugares: "", ate: "" })}>
              <Plus className="h-4 w-4" />
              Nova mesa
            </button>
            <button
              className="botao"
              disabled={!mesaParaEditar}
              onClick={() =>
                mesaParaEditar &&
                setRascunhoMesa({ id: mesaParaEditar.id, numero: mesaParaEditar.numero, area: mesaParaEditar.area ?? "", lugares: mesaParaEditar.lugares ? String(mesaParaEditar.lugares) : "", ate: "" })
              }
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
            <button className="botao" disabled={!mesaParaEditar || ocupado} onClick={alternarMesa}>
              <Ban className="h-4 w-4" />
              {mesaParaEditar && !mesaParaEditar.ativa ? "Reativar" : "Desativar"}
            </button>
            <hr className="col-span-full my-1 border-borda" />
            <button className="botao" disabled={!mesas.length} onClick={() => void imprimir(mesaParaEditar ? [mesaParaEditar] : mesas.filter((m) => m.ativa))}>
              <Printer className="h-4 w-4" />
              {mesaParaEditar ? "Imprimir QR desta" : "Imprimir QR codes"}
            </button>
          </>
        ) : (
          <>
            {comanda ? (
              <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setLancando(true)}>
                <Send className="h-4 w-4" />
                Lançar pedido
              </button>
            ) : (
              <button className="botao-principal col-span-2 sm:col-span-1" disabled={!mesaSel || ocupado} onClick={abrirNaMesa}>
                <ReceiptText className="h-4 w-4" />
                Abrir comanda
              </button>
            )}
            <button className="botao" disabled={!comanda || ocupado} onClick={() => fechar(false)}>
              <CircleDollarSign className="h-4 w-4" />
              Fechar comanda
            </button>
            <button className="botao" onClick={() => setAvulsa("")}>
              <Plus className="h-4 w-4" />
              Comanda avulsa
            </button>
          </>
        )
      }
      rodape={
        aba === "mesas" ? (
          <button className="botao w-full text-perigo" disabled={!mesaParaEditar || ocupado} onClick={excluirMesa}>
            <Trash2 className="h-4 w-4" />
            Excluir mesa
          </button>
        ) : (
          <button className="botao w-full text-perigo" disabled={!comanda || ocupado} onClick={() => fechar(true)}>
            <Ban className="h-4 w-4" />
            Cancelar comanda
          </button>
        )
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <section className="cartao flex gap-2 p-3" role="tablist" aria-label="Visão">
        {(
          [
            ["salao", "Salão"],
            ["mesas", "Cadastro de mesas"],
            ["fechadas", "Fechadas hoje"],
          ] as [Aba, string][]
        ).map(([a, nome]) => (
          <button
            key={a}
            role="tab"
            aria-selected={aba === a}
            onClick={() => {
              setAba(a);
              setSelecao(null);
              setLancando(false);
            }}
            className={clsx("rounded-lg px-3 py-1.5 text-sm", aba === a ? "bg-destaque-suave font-semibold text-destaque" : "text-suave hover:bg-elevado hover:text-texto")}
          >
            {nome}
          </button>
        ))}
      </section>

      {avulsa !== null && (
        <form onSubmit={abrirAvulsa} className="cartao flex flex-wrap items-end gap-3 p-4">
          <Campo rotulo="Nome da comanda avulsa (balcão)" className="min-w-[220px] flex-1">
            <input autoFocus className="entrada" placeholder="Ex.: João, Balcão 3" value={avulsa} onChange={(e) => setAvulsa(e.target.value)} />
          </Campo>
          <button type="submit" className="botao-principal h-10" disabled={ocupado || !avulsa.trim()}>
            Abrir
          </button>
          <button type="button" className="botao h-10" onClick={() => setAvulsa(null)}>
            Cancelar
          </button>
        </form>
      )}

      {aba === "salao" && (
        <>
          {lista.length === 0 && avulsas.length === 0 ? (
            <div className="cartao px-6 py-14 text-center">
              <Armchair className="mx-auto h-8 w-8 text-suave" />
              <p className="mt-3 font-medium">Nenhuma mesa cadastrada</p>
              <p className="mt-1 text-sm text-suave">Cadastre as mesas e imprima os QR codes na aba "Cadastro de mesas".</p>
              <button className="botao mt-5" onClick={() => setAba("mesas")}>
                Cadastrar mesas
              </button>
            </div>
          ) : (
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {lista.map((m) => {
                const c = comandaDaMesa(m.id);
                const r = c ? resumo.get(c.id) : null;
                const sel = selecao?.tipo === "mesa" && selecao.id === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelecao({ tipo: "mesa", id: m.id });
                      setLancando(false);
                    }}
                    aria-pressed={sel}
                    className={clsx("cartao p-3 text-left transition-colors", sel ? "border-marca bg-destaque-suave" : "hover:bg-elevado", c && !sel && "border-l-4 border-l-marca")}
                  >
                    <span className="flex items-center justify-between">
                      <span className="text-[17px] font-semibold">{m.numero}</span>
                      {c && <span className="flex items-center gap-1 text-[12px] text-suave"><Users className="h-3.5 w-3.5" />{c.pessoas.length}</span>}
                    </span>
                    <span className="block text-[12px] text-suave">{m.area ?? "Mesa"}</span>
                    {c && r ? (
                      <span className="mt-2 block">
                        <span className="codigo block text-sm font-semibold">{reais(r.total)}</span>
                        <span className={clsx("block text-[12px]", r.pendentes ? "text-alerta" : "text-suave")}>
                          {r.pendentes ? `${r.pendentes} em andamento` : `aberta há ${minutosDesde(c.aberta_em)} min`}
                        </span>
                      </span>
                    ) : (
                      <span className="mt-2 block text-[12px] text-ok">Livre</span>
                    )}
                  </button>
                );
              })}
              {avulsas.map((c) => {
                const r = resumo.get(c.id);
                const sel = selecao?.tipo === "comanda" && selecao.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelecao({ tipo: "comanda", id: c.id });
                      setLancando(false);
                    }}
                    aria-pressed={sel}
                    className={clsx("cartao border-dashed p-3 text-left", sel ? "border-marca bg-destaque-suave" : "hover:bg-elevado")}
                  >
                    <span className="block truncate font-semibold">{c.nome}</span>
                    <span className="block text-[12px] text-suave">Avulsa</span>
                    <span className="codigo mt-2 block text-sm font-semibold">{reais(r?.total ?? 0)}</span>
                  </button>
                );
              })}
            </section>
          )}

          {(comanda || mesaSel) && (
            <Secao
              titulo={titulo(comanda, mesaSel)}
              acao={
                <button className="botao h-8 w-8 px-0" onClick={() => setSelecao(null)} aria-label="Fechar">
                  <X className="h-4 w-4" />
                </button>
              }
            >
              {!comanda ? (
                <p className="text-sm text-suave">Mesa livre. Quando o cliente ler o QR code, a comanda abre sozinha. Você também pode abrir pela ação "Abrir comanda".</p>
              ) : (
                <>
                {comandas.length > 1 && (
                  <label className="mb-3 flex items-center gap-2 text-sm">
                    <span className="text-suave">Juntar com:</span>
                    <select
                      className="entrada h-9 max-w-[220px]"
                      value=""
                      onChange={(e) => {
                        const v = e.target.value;
                        const o = comandas.find((x) => x.id === v);
                        if (!o) return;
                        const nomeO = titulo(o, mesas.find((m) => m.id === o.mesa_id) ?? null);
                        if (!window.confirm(`Trazer ${nomeO} para ${titulo(comanda, mesaSel)}? Pessoas, pedidos e pagamentos passam para esta comanda.`)) return;
                        void executar(async () => {
                          const { error } = await supabase.rpc("juntar_comandas", { p_destino: comanda.id, p_origem: v });
                          if (error) throw error;
                          await carregar();
                          setAviso({ tipo: "ok", texto: `${nomeO} juntada com ${titulo(comanda, mesaSel)}.` });
                        });
                      }}
                    >
                      <option value="">Escolha a mesa...</option>
                      {comandas
                        .filter((x) => x.id !== comanda.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {titulo(x, mesas.find((m) => m.id === x.mesa_id) ?? null)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <DetalheComanda
                  comanda={comanda}
                  pedidos={pedidos.filter((p) => p.comanda_id === comanda.id)}
                  descontos={descontos.filter((d) => d.comanda_id === comanda.id)}
                  podeEntregar
                  supervisor={supervisor}
                  aoMudar={() => void carregar()}
                  aoErro={(t) => setAviso({ tipo: "erro", texto: t })}
                />
                </>
              )}
            </Secao>
          )}

          {comanda && lancando && (
            <LancarPedido
              estab={id}
              comanda={comanda.id}
              titulo={titulo(comanda, mesaSel)}
              comMesa={!!comanda.mesa_id}
              fechar={() => setLancando(false)}
              enviado={() => {
                setLancando(false);
                setAviso({ tipo: "ok", texto: "Pedido enviado para a fila." });
                void carregar();
              }}
            />
          )}
        </>
      )}

      {aba === "mesas" && (
        <>
          {rascunhoMesa && (
            <Secao
              titulo={rascunhoMesa.id ? "Editar mesa" : "Nova mesa"}
              acao={
                <button className="botao h-8 w-8 px-0" onClick={() => setRascunhoMesa(null)} aria-label="Fechar">
                  <X className="h-4 w-4" />
                </button>
              }
            >
              <form onSubmit={salvarMesa} className="flex flex-wrap items-end gap-3">
                <Campo rotulo={rascunhoMesa.id ? "Número" : "Número (ou de)"} className="w-32">
                  <input required autoFocus maxLength={12} className="entrada" value={rascunhoMesa.numero} onChange={(e) => setRascunhoMesa({ ...rascunhoMesa, numero: e.target.value })} />
                </Campo>
                {!rascunhoMesa.id && (
                  <Campo rotulo="Até (opcional)" className="w-32">
                    <input inputMode="numeric" className="entrada" placeholder="Ex.: 20" value={rascunhoMesa.ate} onChange={(e) => setRascunhoMesa({ ...rascunhoMesa, ate: e.target.value })} />
                  </Campo>
                )}
                <Campo rotulo="Área" className="w-44">
                  <input className="entrada" placeholder="Salão, Varanda..." value={rascunhoMesa.area} onChange={(e) => setRascunhoMesa({ ...rascunhoMesa, area: e.target.value })} />
                </Campo>
                <Campo rotulo="Lugares" className="w-28">
                  <input type="number" min={1} max={100} className="entrada" value={rascunhoMesa.lugares} onChange={(e) => setRascunhoMesa({ ...rascunhoMesa, lugares: e.target.value })} />
                </Campo>
                <button type="submit" className="botao-principal h-10" disabled={ocupado}>
                  Salvar
                </button>
                {!rascunhoMesa.id && <p className="w-full text-[13px] text-suave">Para criar várias de uma vez, use "de" e "até" (ex.: de 1 até 20).</p>}
              </form>
            </Secao>
          )}
          <section className="cartao overflow-hidden">
            {mesas.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <Armchair className="mx-auto h-8 w-8 text-suave" />
                <p className="mt-3 font-medium">Nenhuma mesa</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-borda bg-elevado/60">
                    <tr>
                      {["Mesa", "Área", "Lugares", "Código do QR", "Situação"].map((c) => (
                        <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mesas.map((m) => (
                      <tr
                        key={m.id}
                        onClick={() => setSelecao({ tipo: "mesa", id: m.id })}
                        aria-selected={selecao?.id === m.id}
                        className={clsx("cursor-pointer border-b border-borda last:border-0", selecao?.id === m.id ? "bg-destaque-suave" : "hover:bg-elevado")}
                      >
                        <td className="px-4 py-2.5 font-medium">{m.numero}</td>
                        <td className="px-4 py-2.5 text-suave">{m.area ?? "—"}</td>
                        <td className="codigo px-4 py-2.5 text-sm">{m.lugares ?? "—"}</td>
                        <td className="codigo px-4 py-2.5 text-sm text-suave">{m.codigo}</td>
                        <td className={clsx("px-4 py-2.5 font-medium", m.ativa ? "text-ok" : "text-suave")}>{m.ativa ? "Ativa" : "Desativada"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {aba === "fechadas" && (
        <section className="cartao overflow-hidden">
          {fechadas.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <ReceiptText className="mx-auto h-8 w-8 text-suave" />
              <p className="mt-3 font-medium">Nenhuma comanda fechada hoje</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-borda bg-elevado/60">
                    <tr>
                      {["Comanda", "Aberta", "Fechada", "Pessoas no App", "Total"].map((c) => (
                        <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fechadas.map((c) => {
                      const m = mesas.find((x) => x.id === c.mesa_id) ?? null;
                      const h = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");
                      return (
                        <tr key={c.id} className="border-b border-borda last:border-0">
                          <td className="px-4 py-2.5 font-medium">
                            {titulo(c, m)}
                            {c.situacao === "cancelada" && <span className="ml-2 text-[12px] font-normal text-perigo">cancelada</span>}
                          </td>
                          <td className="codigo px-4 py-2.5 text-sm">{h(c.aberta_em)}</td>
                          <td className="codigo px-4 py-2.5 text-sm">{h(c.fechada_em)}</td>
                          <td className="codigo px-4 py-2.5 text-sm">{c.pessoas.length}</td>
                          <td className="codigo px-4 py-2.5 text-sm font-semibold">{reais(c.total ?? 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="flex justify-between border-t border-borda px-4 py-3 text-sm font-semibold">
                <span>Total do dia</span>
                <span className="codigo">{reais(fechadas.reduce((s, c) => s + (c.total ?? 0), 0))}</span>
              </p>
            </>
          )}
        </section>
      )}
    </TelaUniversal>
  );
}

function LancarPedido({ estab, comanda, titulo, comMesa, fechar, enviado }: { estab: string; comanda: string; titulo: string; comMesa: boolean; fechar: () => void; enviado: () => void }) {
  return (
    <Secao
      titulo={`Lançar pedido · ${titulo}`}
      acao={
        <button className="botao h-8 w-8 px-0" onClick={fechar} aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>
      }
    >
      <FormularioPedido estab={estab} comanda={comanda} comMesa={comMesa} enviado={enviado} />
    </Secao>
  );
}

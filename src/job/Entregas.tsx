import { FormEvent, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, Clock, PackageCheck, ScanLine, Smartphone, Undo2, WifiOff, X } from "lucide-react";
import { LeitorQr } from "@/components/Qr";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { ItemFila, minutosDesde, mudarItens, origemDoItem } from "@/lib/salao";
import { bip, porPedido, useItensFila } from "./fila";

type Aba = "levar" | "caminho" | "retirada";

interface Conferencia {
  codigo: string;
  cliente: string;
  destino: string;
  itens: { item_id: string; numero: number; nome: string; quantidade: number; observacao: string | null; situacao: string }[];
  marcados: string[];
}

/** Fila do cumim: itens prontos, saída para entrega e confirmação pelo QR do cliente. */
export function FilaEntregas({ estab }: { estab: string }) {
  const [aba, setAba] = useState<Aba>("levar");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [lendo, setLendo] = useState(false);
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [digitado, setDigitado] = useState("");
  const { itens, carregar, conectado } = useItensFila(estab, ["pronto", "saiu"], bip);

  const todos = itens ?? [];
  const lista: Record<Aba, ItemFila[]> = {
    levar: todos.filter((i) => i.situacao === "pronto" && i.pedido!.modalidade === "mesa"),
    caminho: todos.filter((i) => i.situacao === "saiu"),
    retirada: todos.filter((i) => i.situacao === "pronto" && i.pedido!.modalidade === "retirada"),
  };
  const grupos = porPedido(lista[aba]);

  const agir = async (ids: string[], acao: "saiu" | "voltar" | "entregar", texto: string) => {
    setOcupado(true);
    setErro("");
    setOk("");
    const { error } = await mudarItens(ids, acao);
    setOcupado(false);
    if (error) setErro(mensagemDeErro(error));
    else setOk(texto);
    void carregar();
  };

  const conferir = async (texto: string) => {
    setLendo(false);
    setErro("");
    setOk("");
    const codigo = texto.trim().toUpperCase();
    const { data, error } = await supabase.rpc("conferir_codigo_entrega", { p_estab: estab, p_codigo: codigo });
    if (error) {
      navigator.vibrate?.([80, 60, 80]);
      return setErro(mensagemDeErro(error));
    }
    const linhas = (data ?? []) as (Conferencia["itens"][number] & { cliente: string; destino: string })[];
    if (!linhas.length) return setErro("Este cliente não tem itens prontos para entregar agora.");
    setConf({ codigo, cliente: linhas[0].cliente, destino: linhas[0].destino, itens: linhas, marcados: linhas.map((l) => l.item_id) });
  };

  const confirmar = async () => {
    if (!conf) return;
    setOcupado(true);
    const { data, error } = await supabase.rpc("confirmar_entrega", { p_estab: estab, p_codigo: conf.codigo, p_itens: conf.marcados });
    setOcupado(false);
    if (error) {
      setErro(mensagemDeErro(error));
      setConf(null);
      return;
    }
    navigator.vibrate?.(60);
    const n = Number(data ?? 0);
    const faltam = conf.itens.length - n;
    setOk(`${n} ${n === 1 ? "item entregue" : "itens entregues"} para ${conf.cliente}.${faltam > 0 ? ` ${faltam} continua${faltam === 1 ? "" : "m"} pendente${faltam === 1 ? "" : "s"}.` : ""}`);
    setConf(null);
    void carregar();
  };

  const enviarDigitado = (e: FormEvent) => {
    e.preventDefault();
    if (digitado.trim()) void conferir(digitado);
    setDigitado("");
  };

  return (
    <div className="space-y-4">
      <button className="botao-principal h-12 w-full rounded-full text-[15px]" onClick={() => setLendo(true)}>
        <ScanLine className="h-5 w-5" />
        Ler QR do cliente
      </button>

      <div className="grid grid-cols-3 gap-1 rounded-lg border border-borda bg-superficie p-1" role="tablist" aria-label="Entregas">
        {(
          [
            ["levar", "Para levar"],
            ["caminho", "A caminho"],
            ["retirada", "Retirada"],
          ] as [Aba, string][]
        ).map(([a, nome]) => (
          <button
            key={a}
            role="tab"
            aria-selected={aba === a}
            onClick={() => setAba(a)}
            className={clsx("rounded-md py-2 text-sm", aba === a ? "bg-destaque-suave font-semibold text-destaque" : "text-suave")}
          >
            {nome}
            <span className="codigo ml-1">{porPedido(lista[a]).length}</span>
          </button>
        ))}
      </div>

      {!conectado && (
        <p role="alert" className="flex items-center gap-2 rounded-cartao border border-alerta/40 bg-alerta/10 px-4 py-3 text-sm text-alerta">
          <WifiOff className="h-4 w-4" />
          Sem conexão. Nenhuma entrega é confirmada até a conexão voltar.
        </p>
      )}
      {erro && <p role="alert" className="rounded-cartao border border-perigo/40 bg-perigo/10 px-4 py-3 text-sm text-perigo">{erro}</p>}
      {ok && (
        <p role="status" className="flex items-center gap-2 rounded-cartao border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
          <CheckCircle2 className="h-4 w-4" />
          {ok}
        </p>
      )}

      {itens === null ? (
        <p className="py-10 text-center text-sm text-suave">Carregando...</p>
      ) : grupos.length === 0 ? (
        <div className="cartao px-6 py-12 text-center">
          <PackageCheck className="mx-auto h-8 w-8 text-suave" />
          <p className="mt-3 font-medium">{aba === "levar" ? "Nada pronto para levar" : aba === "caminho" ? "Nada a caminho" : "Nenhuma retirada aguardando"}</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {grupos.map((g) => {
            const p = g[0].pedido!;
            const desde = g.map((i) => (aba === "caminho" ? i.saiu_em : i.pronto_em) ?? p.criado_em).sort()[0];
            const ids = g.map((i) => i.id);
            const semApp = !p.usuario_id;
            return (
              <li key={p.id} className="cartao overflow-hidden">
                <header className="flex items-start justify-between gap-2 border-b border-borda px-4 py-3">
                  <p className="flex items-center gap-2">
                    <span className="codigo text-lg font-semibold">#{p.numero}</span>
                    <span className="text-[17px] font-semibold">{origemDoItem(g[0])}</span>
                  </p>
                  <span className={clsx("flex items-center gap-1 text-sm", minutosDesde(desde) >= 10 ? "font-semibold text-alerta" : "text-suave")}>
                    <Clock className="h-4 w-4" />
                    {minutosDesde(desde)} min
                  </span>
                </header>
                <ul className="divide-y divide-borda">
                  {g.map((i) => (
                    <li key={i.id} className="px-4 py-2 text-[15px]">
                      <span className="codigo font-semibold">{i.quantidade}×</span> {i.nome}
                      {i.observacao && <span className="block text-[13px] text-suave">{i.observacao}</span>}
                    </li>
                  ))}
                </ul>
                <p className="flex items-center gap-1.5 border-t border-borda px-4 py-2 text-[12px] text-suave">
                  {semApp ? "Cliente sem App: confirme a entrega com um toque" : (
                    <>
                      <Smartphone className="h-3.5 w-3.5" />
                      Cliente com App: confirme lendo o QR dele
                    </>
                  )}
                </p>
                <div className="flex gap-2 border-t border-borda p-3">
                  {aba === "levar" && (
                    <button className="botao-principal h-10 flex-1" disabled={ocupado} onClick={() => void agir(ids, "saiu", `Pedido #${p.numero} saiu para entrega.`)}>
                      Saiu para entrega
                    </button>
                  )}
                  {aba === "caminho" && (
                    <button className="botao h-10 px-3" disabled={ocupado} onClick={() => void agir(ids, "voltar", `Pedido #${p.numero} voltou para a fila.`)} title="Item não localizado ou cliente não encontrado">
                      <Undo2 className="h-4 w-4" />
                      Voltar à fila
                    </button>
                  )}
                  {semApp ? (
                    <button className={clsx("h-10 flex-1", aba === "levar" ? "botao" : "botao-principal")} disabled={ocupado} onClick={() => void agir(ids, "entregar", `Pedido #${p.numero} entregue.`)}>
                      Entregue
                    </button>
                  ) : (
                    aba !== "levar" && (
                      <button className="botao-principal h-10 flex-1" onClick={() => setLendo(true)}>
                        <ScanLine className="h-4 w-4" />
                        Ler QR
                      </button>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {lendo && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Ler QR do cliente" onClick={() => setLendo(false)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-superficie p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">QR de entrega do cliente</h2>
              <button onClick={() => setLendo(false)} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <LeitorQr aoLer={(t) => void conferir(t)} />
            <form onSubmit={enviarDigitado} className="mt-3 flex gap-2">
              <input className="entrada codigo uppercase" placeholder="ou digite o código" value={digitado} onChange={(e) => setDigitado(e.target.value)} />
              <button className="botao" type="submit">
                OK
              </button>
            </form>
          </div>
        </div>
      )}

      {conf && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Confirmar entrega">
          <div className="w-full max-w-sm rounded-t-2xl bg-superficie p-5 sm:rounded-2xl">
            <p className="text-sm text-suave">Entregar para</p>
            <p className="text-lg font-semibold">
              {conf.cliente} · {conf.destino}
            </p>
            <ul className="mt-4 space-y-2">
              {conf.itens.map((i) => (
                <li key={i.item_id}>
                  <label className="flex items-start gap-3 rounded-lg border border-borda px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-[rgb(var(--marca))]"
                      checked={conf.marcados.includes(i.item_id)}
                      onChange={() =>
                        setConf({ ...conf, marcados: conf.marcados.includes(i.item_id) ? conf.marcados.filter((x) => x !== i.item_id) : [...conf.marcados, i.item_id] })
                      }
                    />
                    <span className="text-[15px]">
                      <span className="codigo font-semibold">{i.quantidade}×</span> {i.nome}
                      <span className="block text-[12px] text-suave">
                        #{i.numero}
                        {i.observacao ? ` · ${i.observacao}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-suave">Desmarque o que não está sendo entregue agora. Esses itens continuam pendentes.</p>
            <div className="mt-4 flex gap-2">
              <button className="botao h-11 flex-1" onClick={() => setConf(null)}>
                Voltar
              </button>
              <button className="botao-principal h-11 flex-1" disabled={ocupado || !conf.marcados.length} onClick={() => void confirmar()}>
                Confirmar entrega
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

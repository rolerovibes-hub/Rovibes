import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ChefHat, Clock, Maximize2, Martini, Minimize2, Printer, Volume2, VolumeX } from "lucide-react";
import { mensagemDeErro } from "@/lib/supabase";
import { ItemFila, mudarItens, origemDoItem } from "@/lib/salao";
import { bip, porPedido, useItensFila } from "@/job/fila";
import { usePermissoesJob } from "@/job/permissoes";
import { useBusiness } from "@/lib/acessos";
import { avisar, dicaBandeja, telaCheia } from "../nativo";
import { cupomPedido, imprimir } from "../impressao";
import { Estacao } from "../estacao";
import { Moldura, useAtalhos } from "./Moldura";

const ATENCAO = 15;
const ATRASO = 25;

/** Telão da cozinha/bar: cartões grandes por pedido, cor pelo tempo de espera, som, aviso e impressão de pedido novo. */
export function Cozinha({ estacao, salvar, configurar }: { estacao: Estacao; salvar: (e: Estacao) => void; configurar?: () => void }) {
  const { atual } = useBusiness();
  const estab = atual?.estabelecimento_id;
  const { setores } = usePermissoesJob();
  const [filtro, setFiltro] = useState<"todos" | "novos" | "preparo">("todos");
  const [cheia, setCheia] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState(0);
  const [, setRelogio] = useState(0);
  const vistos = useRef<Set<string> | null>(null);

  const { itens, carregar, conectado } = useItensFila(estab, ["recebido", "preparo"]);

  // O cronômetro dos cartões anda sozinho.
  useEffect(() => {
    const t = window.setInterval(() => setRelogio((n) => n + 1), 15000);
    return () => window.clearInterval(t);
  }, []);

  const doSetor = useCallback(
    (i: ItemFila) => i.destino !== "sem_preparo" && setores.includes(i.destino) && (estacao.setor === "todos" || i.destino === estacao.setor),
    [setores, estacao.setor],
  );
  const meus = useMemo(() => (itens ?? []).filter(doSetor), [itens, doSetor]);

  // Pedido novo: som, aviso do Windows e (se ligado) impressão.
  useEffect(() => {
    if (!itens) return;
    const ids = new Set(meus.map((i) => i.id));
    if (vistos.current) {
      const novos = meus.filter((i) => !vistos.current!.has(i.id));
      if (novos.length) {
        if (estacao.som) bip();
        for (const g of porPedido(novos)) {
          const p = g[0].pedido!;
          void avisar(`Pedido novo · ${origemDoItem(g[0])}`, g.map((i) => `${i.quantidade}× ${i.nome}`).join(", "));
          if (estacao.imprimirPedidos && estacao.impressora)
            void imprimir(
              estacao.impressora,
              cupomPedido({
                origem: origemDoItem(g[0]),
                numero: p.numero,
                setor: estacao.setor === "bar" ? "Bar" : estacao.setor === "cozinha" ? "Cozinha" : g.every((i) => i.destino === "bar") ? "Bar" : "Cozinha",
                itens: g.map((i) => ({ quantidade: i.quantidade, nome: i.nome, observacao: i.observacao })),
                observacao: p.observacao,
                papel: estacao.papel,
              }),
            ).catch((e) => setErro((e as Error).message));
        }
      }
    }
    vistos.current = ids;
    void dicaBandeja(meus.length ? `RoVibes Business · ${porPedido(meus).length} pedidos na fila` : "RoVibes Business");
  }, [itens, meus, estacao]);

  const grupos = porPedido(meus).filter((g) =>
    filtro === "todos" ? true : filtro === "novos" ? g.some((i) => i.situacao === "recebido") : g.every((i) => i.situacao === "preparo"),
  );
  const novos = porPedido(meus).filter((g) => g.some((i) => i.situacao === "recebido")).length;

  const agir = async (chave: string, ids: string[], acao: "iniciar" | "liberar") => {
    setOcupado(chave);
    setErro("");
    const { error } = await mudarItens(ids, acao);
    if (error) setErro(mensagemDeErro(error));
    setOcupado(null);
    void carregar();
  };

  const proximaAcao = (g: ItemFila[]) => {
    const livres = g.filter((i) => !i.bloqueado);
    const recebidos = livres.filter((i) => i.situacao === "recebido");
    return recebidos.length ? { acao: "iniciar" as const, ids: recebidos.map((i) => i.id), nome: "Começar" } : { acao: "liberar" as const, ids: livres.map((i) => i.id), nome: "Pronto" };
  };

  const alternarTela = async () => {
    await telaCheia(!cheia).catch(() => undefined);
    setCheia(!cheia);
  };

  useAtalhos({
    ArrowRight: () => setSelecionado((s) => Math.min(grupos.length - 1, s + 1)),
    ArrowLeft: () => setSelecionado((s) => Math.max(0, s - 1)),
    Enter: () => {
      const g = grupos[selecionado];
      if (g) {
        const a = proximaAcao(g);
        if (a.ids.length) void agir(g[0].pedido!.id, a.ids, a.acao);
      }
    },
    F11: () => void alternarTela(),
  });

  return (
    <Moldura
      titulo={estacao.setor === "bar" ? "Bar" : estacao.setor === "cozinha" ? "Cozinha" : "Cozinha e bar"}
      estacao={estacao}
      configurar={configurar}
      escuro
      extra={
        <div className="ml-3 flex gap-1.5 text-[13px]">
          {(
            [
              ["todos", `Todos · ${porPedido(meus).length}`],
              ["novos", `Novos · ${novos}`],
              ["preparo", "Preparando"],
            ] as const
          ).map(([f, n]) => (
            <button key={f} onClick={() => setFiltro(f)} className={clsx("rounded-full px-3 py-1", filtro === f ? "bg-marca font-semibold text-white" : "bg-elevado text-suave")}>
              {n}
            </button>
          ))}
          <button
            className="ml-3 rounded-full bg-elevado px-3 py-1 text-suave"
            onClick={() => salvar({ ...estacao, som: !estacao.som })}
            title={estacao.som ? "Desligar som" : "Ligar som"}
          >
            {estacao.som ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button className="rounded-full bg-elevado px-3 py-1 text-suave" onClick={() => void alternarTela()} title="Tela cheia (F11)">
            {cheia ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      }
    >
      <div className="h-full overflow-y-auto p-4">
        {!conectado && <p className="mb-3 rounded-lg bg-perigo/15 px-4 py-2 text-sm text-perigo">Sem conexão: a fila pode estar desatualizada.</p>}
        {erro && <p className="mb-3 rounded-lg bg-perigo/15 px-4 py-2 text-sm text-perigo">{erro}</p>}
        {itens === null ? (
          <p className="py-20 text-center text-suave">Carregando...</p>
        ) : grupos.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-suave">
            <ChefHat className="h-14 w-14" />
            <p className="mt-3 text-lg">Nada para preparar</p>
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4">
            {grupos.map((g, n) => {
              const p = g[0].pedido!;
              const min = Math.max(0, Math.floor((Date.now() - Date.parse(p.criado_em)) / 60000));
              const novo = g.some((i) => i.situacao === "recebido");
              const a = proximaAcao(g);
              return (
                <li
                  key={p.id}
                  onClick={() => setSelecionado(n)}
                  className={clsx(
                    "flex flex-col overflow-hidden rounded-xl border-2 bg-superficie",
                    min >= ATRASO ? "border-perigo" : novo ? "border-marca" : min >= ATENCAO ? "border-alerta" : "border-borda",
                    selecionado === n && "ring-4 ring-white/30",
                  )}
                >
                  <div className={clsx("flex items-start justify-between px-4 py-3", min >= ATRASO ? "bg-perigo/25" : novo ? "bg-marca/25" : "bg-elevado")}>
                    <div>
                      <p className="text-xl font-bold">{origemDoItem(g[0])}</p>
                      <p className="text-[12px] text-suave">
                        #{p.numero} · {p.modalidade === "retirada" ? "retirada" : "mesa"}
                      </p>
                    </div>
                    <span className={clsx("flex items-center gap-1 text-lg font-bold tabular-nums", min >= ATRASO ? "text-perigo" : min >= ATENCAO ? "text-alerta" : "")}>
                      <Clock className="h-4 w-4" />
                      {min} min
                    </span>
                  </div>
                  <ul className="flex-1 px-4 py-2">
                    {g.map((i) => (
                      <li key={i.id} className={clsx("flex gap-2 border-b border-dashed border-borda py-2 text-[17px] last:border-0", i.situacao === "preparo" && "opacity-90")}>
                        <span className="font-bold text-destaque">{i.quantidade}×</span>
                        <span className="min-w-0 flex-1">
                          {i.nome}
                          {i.observacao && <span className="block text-[14px] font-semibold text-alerta">{i.observacao}</span>}
                          {i.refeito > 0 && <span className="block text-[12px] font-semibold text-magenta">Refazer</span>}
                          {i.bloqueado && <span className="block text-[12px] font-semibold text-alerta">Aguardando supervisão</span>}
                        </span>
                        {i.destino === "bar" ? <Martini className="mt-1 h-4 w-4 text-suave" /> : <ChefHat className="mt-1 h-4 w-4 text-suave" />}
                      </li>
                    ))}
                  </ul>
                  {p.observacao && <p className="border-t border-borda px-4 py-2 text-[14px] text-alerta">Obs.: {p.observacao}</p>}
                  <div className="flex gap-2 p-3">
                    <button
                      className={clsx("h-12 flex-1 rounded-lg text-[15px] font-semibold text-white disabled:opacity-50", a.acao === "iniciar" ? "bg-marca" : "bg-ok")}
                      disabled={!a.ids.length || ocupado === p.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void agir(p.id, a.ids, a.acao);
                      }}
                    >
                      {a.nome}
                    </button>
                    {estacao.impressora && (
                      <button
                        className="botao h-12 w-12 px-0"
                        title="Imprimir pedido"
                        onClick={(e) => {
                          e.stopPropagation();
                          void imprimir(
                            estacao.impressora,
                            cupomPedido({
                              origem: origemDoItem(g[0]),
                              numero: p.numero,
                              setor: g.every((i) => i.destino === "bar") ? "Bar" : "Cozinha",
                              itens: g.map((i) => ({ quantidade: i.quantidade, nome: i.nome, observacao: i.observacao })),
                              observacao: p.observacao,
                              papel: estacao.papel,
                            }),
                          ).catch((x) => setErro((x as Error).message));
                        }}
                      >
                        <Printer className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Moldura>
  );
}

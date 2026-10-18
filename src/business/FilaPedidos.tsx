import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Bell, BellOff, ChefHat, Clock, ListOrdered, Martini, RefreshCw } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useBusiness } from "@/lib/acessos";
import { ler, gravar } from "@/lib/armazenamento";
import { CAMPOS_PEDIDO, minutosDesde, NOME_SETOR, NOME_SITUACAO_PEDIDO, normalizarPedidos, Pedido, Setor, SituacaoPedido, useAoVivo } from "@/lib/salao";

type PedidoFila = Pedido & { comanda: { nome: string | null; mesa: { numero: string } | null } | null };

const COLUNAS: { situacao: SituacaoPedido; titulo: string; proximo: SituacaoPedido; acao: string }[] = [
  { situacao: "novo", titulo: "Novos", proximo: "preparo", acao: "Começar preparo" },
  { situacao: "preparo", titulo: "Em preparo", proximo: "pronto", acao: "Marcar pronto" },
  { situacao: "pronto", titulo: "Prontos para entregar", proximo: "entregue", acao: "Entregue" },
];

const ATRASO_MIN = 20;

/** Bip curto quando chega pedido novo (sem arquivo de som). */
function bip() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
    o.onended = () => void ctx.close();
  } catch {
    /* sem áudio */
  }
}

const origem = (p: PedidoFila) => (p.comanda?.mesa ? `Mesa ${p.comanda.mesa.numero}` : p.comanda?.nome ?? "Comanda");

export function FilaPedidos() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [setor, setSetor] = useState<Setor | "todos">(() => ler<Setor | "todos">("fila_setor", "todos"));
  const [som, setSom] = useState(() => ler("fila_som", true));
  const [ativos, setAtivos] = useState<PedidoFila[]>([]);
  const [recentes, setRecentes] = useState<PedidoFila[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const conhecidos = useRef<Set<string> | null>(null);
  const somRef = useRef(som);
  somRef.current = som;

  const carregar = useCallback(async () => {
    if (!id) return;
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const campos = `${CAMPOS_PEDIDO}, comanda:comandas(nome, mesa:mesas(numero))`;
    const [a, r] = await Promise.all([
      supabase.from("pedidos").select(campos).eq("estabelecimento_id", id).in("situacao", ["novo", "preparo", "pronto"]).order("criado_em"),
      supabase
        .from("pedidos")
        .select(campos)
        .eq("estabelecimento_id", id)
        .in("situacao", ["entregue", "cancelado"])
        .gte("atualizado_em", inicioDia.toISOString())
        .order("atualizado_em", { ascending: false })
        .limit(20),
    ]);
    const lista = normalizarPedidos(a.data) as PedidoFila[];
    const novos = lista.filter((p) => p.situacao === "novo").map((p) => p.id);
    if (conhecidos.current && somRef.current && novos.some((n) => !conhecidos.current!.has(n))) bip();
    conhecidos.current = new Set(novos);
    setAtivos(lista);
    setRecentes(normalizarPedidos(r.data) as PedidoFila[]);
  }, [id]);

  useEffect(() => {
    conhecidos.current = null;
    void carregar();
  }, [carregar]);

  useAoVivo("fila", { pedidos: `estabelecimento_id=eq.${id}` }, () => void carregar(), !!id);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const filtrar = (l: PedidoFila[]) => (setor === "todos" ? l : l.filter((p) => p.setor === setor));

  const mudar = async (p: PedidoFila, situacao: SituacaoPedido) => {
    let motivo: string | null = null;
    if (situacao === "cancelado") {
      motivo = window.prompt(`Motivo do cancelamento do pedido #${p.numero} (${origem(p)}):`);
      if (!motivo?.trim()) return;
    }
    setOcupado(p.id);
    setAviso(null);
    setAtivos((l) => (situacao === "cancelado" || situacao === "entregue" ? l.filter((x) => x.id !== p.id) : l.map((x) => (x.id === p.id ? { ...x, situacao } : x))));
    const { error } = await supabase.rpc("mudar_pedido", { p_pedido: p.id, p_situacao: situacao, p_motivo: motivo });
    setOcupado(null);
    if (error) setAviso(mensagemDeErro(error));
    void carregar();
  };

  const trocarSetor = (s: Setor | "todos") => {
    setSetor(s);
    gravar("fila_setor", s);
  };

  return (
    <TelaUniversal
      acoes={
        <>
          {(["todos", "cozinha", "bar"] as const).map((s) => (
            <button key={s} className={clsx("botao", setor === s && "border-marca bg-destaque-suave text-destaque")} aria-pressed={setor === s} onClick={() => trocarSetor(s)}>
              {s === "bar" ? <Martini className="h-4 w-4" /> : s === "cozinha" ? <ChefHat className="h-4 w-4" /> : <ListOrdered className="h-4 w-4" />}
              {s === "todos" ? "Todos os setores" : NOME_SETOR[s]}
            </button>
          ))}
          <hr className="col-span-full my-1 border-borda" />
          <button
            className="botao"
            onClick={() => {
              setSom(!som);
              gravar("fila_som", !som);
              if (!som) bip();
            }}
          >
            {som ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {som ? "Som ligado" : "Som desligado"}
          </button>
          <button className="botao" onClick={() => void carregar()}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </>
      }
    >
      {aviso && <Aviso tipo="erro">{aviso}</Aviso>}

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUNAS.map((col) => {
          const lista = filtrar(ativos.filter((p) => p.situacao === col.situacao));
          return (
            <section key={col.situacao} className="min-w-0 rounded-cartao border border-borda bg-elevado/40 p-3">
              <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">
                {col.titulo}
                <span className={clsx("codigo rounded-full px-2 py-0.5", lista.length ? "bg-marca text-marca-texto" : "bg-elevado text-suave")}>{lista.length}</span>
              </h2>
              {lista.length === 0 ? (
                <p className="px-1 py-6 text-center text-[13px] text-suave">Nada aqui.</p>
              ) : (
                <ul className="space-y-3">
                  {lista.map((p) => {
                    const min = minutosDesde(p.criado_em);
                    return (
                      <li key={p.id} className={clsx("cartao p-3", min >= ATRASO_MIN && "border-alerta")}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="flex items-center gap-2">
                              <span className="codigo text-base font-semibold">#{p.numero}</span>
                              <span className="font-semibold">{origem(p)}</span>
                            </p>
                            <p className="flex items-center gap-1.5 text-[12px] text-suave">
                              {p.setor === "bar" ? <Martini className="h-3.5 w-3.5" /> : <ChefHat className="h-3.5 w-3.5" />}
                              {NOME_SETOR[p.setor]} · {p.usuario_id ? "pelo App" : "equipe"}
                            </p>
                          </div>
                          <span className={clsx("flex items-center gap-1 text-[13px]", min >= ATRASO_MIN ? "font-semibold text-alerta" : "text-suave")}>
                            <Clock className="h-3.5 w-3.5" />
                            {min} min
                          </span>
                        </div>
                        <ul className="mt-2 space-y-1 text-sm">
                          {p.itens.map((i) => (
                            <li key={i.id}>
                              <span className="codigo font-semibold">{i.quantidade}×</span> {i.nome}
                              {i.observacao && <span className="block pl-6 text-[13px] text-alerta">{i.observacao}</span>}
                            </li>
                          ))}
                        </ul>
                        {p.observacao && <p className="mt-2 rounded-md bg-elevado px-2 py-1 text-[13px]">Obs.: {p.observacao}</p>}
                        <div className="mt-3 flex gap-2">
                          <button className="botao-principal h-9 flex-1" disabled={ocupado === p.id} onClick={() => void mudar(p, col.proximo)}>
                            {col.acao}
                          </button>
                          <button className="botao h-9 px-3 text-perigo" disabled={ocupado === p.id} onClick={() => void mudar(p, "cancelado")} aria-label={`Cancelar pedido ${p.numero}`}>
                            Cancelar
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {filtrar(recentes).length > 0 && (
        <section className="cartao overflow-hidden">
          <h2 className="border-b border-borda px-4 py-3 text-sm font-semibold">Finalizados hoje</h2>
          <ul className="divide-y divide-borda text-sm">
            {filtrar(recentes).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 px-4 py-2">
                <span className="codigo font-semibold">#{p.numero}</span>
                <span>{origem(p)}</span>
                <span className="min-w-0 flex-1 truncate text-suave">{p.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(", ")}</span>
                <span className={clsx("text-[12px] font-medium", p.situacao === "cancelado" ? "text-perigo" : "text-suave")}>{NOME_SITUACAO_PEDIDO[p.situacao]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </TelaUniversal>
  );
}

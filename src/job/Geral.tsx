import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, ChefHat, History, Martini, PackageCheck, RotateCcw, ShieldAlert, Truck } from "lucide-react";
import { reais } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { COR_SITUACAO_ITEM, minutosDesde, NOME_DESTINO, NOME_OCORRENCIA, NOME_SITUACAO_ITEM, origemDoItem, TipoOcorrencia, useAoVivo } from "@/lib/salao";
import { useItensFila, useNomesEquipe } from "./fila";
import { Historico } from "./Historico";

interface Ocorrencia {
  id: string;
  tipo: TipoOcorrencia;
  descricao: string | null;
  aberta_em: string;
  aberta_por: string | null;
  item: { id: string; nome: string; quantidade: number; situacao: string; destino: string } | null;
  pedido: { numero: number; usuario_id: string | null; comanda: { id: string; nome: string | null; mesa: { numero: string } | null } | null } | null;
}

interface Fechada {
  id: string;
  nome: string | null;
  total: number | null;
  fechada_em: string;
  mesa: { numero: string } | null;
}

type Acao = "cancelar" | "refazer" | "entregar" | "resolver" | "recusar";

/** Ocorrências abertas e comandas fechadas hoje: o que a supervisão precisa decidir. */
function PainelSupervisao({ estab }: { estab: string }) {
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [fechadas, setFechadas] = useState<Fechada[]>([]);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [historico, setHistorico] = useState<string | null>(null);
  const nomes = useNomesEquipe(estab);

  const carregar = useCallback(async () => {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    const [o, f] = await Promise.all([
      supabase
        .from("ocorrencias")
        .select("id, tipo, descricao, aberta_em, aberta_por, item:pedido_itens(id, nome, quantidade, situacao, destino), pedido:pedidos(numero, usuario_id, comanda:comandas(id, nome, mesa:mesas(numero)))")
        .eq("estabelecimento_id", estab)
        .eq("situacao", "aberta")
        .order("aberta_em"),
      supabase
        .from("comandas")
        .select("id, nome, total, fechada_em, mesa:mesas(numero)")
        .eq("estabelecimento_id", estab)
        .eq("situacao", "fechada")
        .gte("fechada_em", inicio.toISOString())
        .order("fechada_em", { ascending: false })
        .limit(50),
    ]);
    setOcorrencias((o.data ?? []) as unknown as Ocorrencia[]);
    setFechadas(((f.data ?? []) as unknown as Fechada[]).map((x) => ({ ...x, total: x.total == null ? null : Number(x.total) })));
  }, [estab]);

  useEffect(() => {
    void carregar();
  }, [carregar]);
  useAoVivo("supervisao", { itens: `estabelecimento_id=eq.${estab}`, comandas: `estabelecimento_id=eq.${estab}` }, () => void carregar());

  const resolver = async (o: Ocorrencia, acao: Acao) => {
    let nota: string | null = null;
    if (acao === "entregar" || acao === "recusar") {
      nota = window.prompt(acao === "entregar" ? "Por que a entrega está sendo confirmada sem QR?" : "Motivo da recusa (opcional):");
      if (acao === "entregar" && !nota?.trim()) return;
    }
    setOcupado(o.id);
    setErro("");
    setOk("");
    const { error } = await supabase.rpc("resolver_ocorrencia", { p_ocorrencia: o.id, p_acao: acao, p_nota: nota });
    setOcupado(null);
    if (error) setErro(mensagemDeErro(error));
    else setOk("Ocorrência resolvida.");
    void carregar();
  };

  const reabrir = async (c: Fechada) => {
    const motivo = window.prompt(`Motivo para reabrir ${c.mesa ? `a mesa ${c.mesa.numero}` : c.nome}:`);
    if (!motivo?.trim()) return;
    setOcupado(c.id);
    setErro("");
    const { error } = await supabase.rpc("reabrir_comanda", { p_comanda: c.id, p_motivo: motivo });
    setOcupado(null);
    if (error) setErro(mensagemDeErro(error));
    else setOk("Comanda reaberta. Ela voltou para o salão.");
    void carregar();
  };

  return (
    <div className="space-y-5">
      {erro && <p role="alert" className="rounded-cartao border border-perigo/40 bg-perigo/10 px-4 py-3 text-sm text-perigo">{erro}</p>}
      {ok && <p role="status" className="rounded-cartao border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{ok}</p>}

      <section className="cartao overflow-hidden">
        <h2 className="flex items-center gap-2 border-b border-borda px-4 py-3 font-semibold">
          <ShieldAlert className={clsx("h-4 w-4", ocorrencias.length ? "text-alerta" : "text-suave")} />
          Ocorrências para decidir ({ocorrencias.length})
        </h2>
        {ocorrencias.length === 0 ? (
          <p className="px-4 py-6 text-sm text-suave">Nenhuma ocorrência aberta.</p>
        ) : (
          <ul className="divide-y divide-borda">
            {ocorrencias.map((o) => {
              const origem = o.pedido?.comanda?.mesa ? `Mesa ${o.pedido.comanda.mesa.numero}` : o.pedido?.comanda?.nome ?? "Balcão";
              const deApp = !!o.pedido?.usuario_id;
              return (
                <li key={o.id} className="px-4 py-3">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-semibold text-alerta">{NOME_OCORRENCIA[o.tipo]}</span>
                    <span className="codigo">#{o.pedido?.numero}</span>
                    <span className="font-medium">{origem}</span>
                    <span className="text-suave">· {minutosDesde(o.aberta_em)} min</span>
                  </p>
                  <p className="text-[15px]">
                    {o.item?.quantidade}× {o.item?.nome}{" "}
                    <span className="text-[12px] text-suave">({o.item ? NOME_SITUACAO_ITEM[o.item.situacao as keyof typeof NOME_SITUACAO_ITEM] : ""})</span>
                  </p>
                  <p className="text-[13px] text-suave">
                    {o.aberta_por ? `${nomes.get(o.aberta_por) ?? "Equipe"}` : "Equipe"}
                    {o.descricao ? `: ${o.descricao}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="botao h-8 px-3 text-[13px] text-perigo" disabled={ocupado === o.id} onClick={() => void resolver(o, "cancelar")}>
                      Cancelar item
                    </button>
                    <button className="botao h-8 px-3 text-[13px]" disabled={ocupado === o.id} onClick={() => void resolver(o, "refazer")}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Refazer
                    </button>
                    {o.item?.situacao !== "recebido" && o.item?.situacao !== "preparo" && (
                      <button className="botao h-8 px-3 text-[13px]" disabled={ocupado === o.id} onClick={() => void resolver(o, "entregar")} title={deApp ? "Confirma sem o QR do cliente" : undefined}>
                        Entregue sem QR
                      </button>
                    )}
                    <button className="botao h-8 px-3 text-[13px]" disabled={ocupado === o.id} onClick={() => void resolver(o, "resolver")}>
                      Resolvido, seguir
                    </button>
                    {o.tipo === "cancelamento" && (
                      <button className="botao h-8 px-3 text-[13px]" disabled={ocupado === o.id} onClick={() => void resolver(o, "recusar")}>
                        Recusar
                      </button>
                    )}
                    {o.pedido?.comanda && (
                      <button className="botao h-8 px-3 text-[13px]" onClick={() => setHistorico(o.pedido!.comanda!.id)}>
                        <History className="h-3.5 w-3.5" />
                        Histórico
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="cartao overflow-hidden">
        <h2 className="border-b border-borda px-4 py-3 font-semibold">Comandas fechadas hoje</h2>
        {fechadas.length === 0 ? (
          <p className="px-4 py-6 text-sm text-suave">Nenhuma comanda fechada hoje.</p>
        ) : (
          <ul className="divide-y divide-borda text-sm">
            {fechadas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="font-medium">{c.mesa ? `Mesa ${c.mesa.numero}` : c.nome}</span>
                <span className="codigo text-suave">{new Date(c.fechada_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="codigo ml-auto font-semibold">{reais(c.total ?? 0)}</span>
                <button className="botao h-8 px-3 text-[13px]" onClick={() => setHistorico(c.id)} aria-label="Histórico">
                  <History className="h-3.5 w-3.5" />
                </button>
                <button className="botao h-8 px-3 text-[13px]" disabled={ocupado === c.id} onClick={() => void reabrir(c)}>
                  Reabrir
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {historico && <Historico comanda={historico} fechar={() => setHistorico(null)} />}
    </div>
  );
}

const ATRASO = 25;

/** Gerência: estado geral da operação e o que está parado. */
export function VisaoGeral({ estab }: { estab: string }) {
  const { itens } = useItensFila(estab, ["recebido", "preparo", "pronto", "saiu"]);
  const todos = itens ?? [];
  const contar = (f: (i: (typeof todos)[number]) => boolean) => todos.filter(f).length;

  const blocos = [
    { nome: "Cozinha: aguardando", valor: contar((i) => i.destino === "cozinha" && i.situacao === "recebido"), icone: ChefHat },
    { nome: "Cozinha: em preparo", valor: contar((i) => i.destino === "cozinha" && i.situacao === "preparo"), icone: ChefHat },
    { nome: "Bar: aguardando", valor: contar((i) => i.destino === "bar" && i.situacao === "recebido"), icone: Martini },
    { nome: "Bar: em preparo", valor: contar((i) => i.destino === "bar" && i.situacao === "preparo"), icone: Martini },
    { nome: "Prontos esperando entrega", valor: contar((i) => i.situacao === "pronto"), icone: PackageCheck },
    { nome: "A caminho", valor: contar((i) => i.situacao === "saiu"), icone: Truck },
  ];

  const atrasados = todos
    .map((i) => ({ i, min: minutosDesde(i.pedido!.criado_em) }))
    .filter((x) => x.min >= ATRASO)
    .sort((a, b) => b.min - a.min);

  return (
    <div className="space-y-5">
      <PainelSupervisao estab={estab} />
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {blocos.map((b) => (
          <li key={b.nome} className="cartao p-4">
            <b.icone className="h-4 w-4 text-suave" />
            <p className="codigo mt-2 text-2xl font-semibold">{itens === null ? "–" : b.valor}</p>
            <p className="text-[13px] text-suave">{b.nome}</p>
          </li>
        ))}
      </ul>

      <section className="cartao overflow-hidden">
        <h2 className="flex items-center gap-2 border-b border-borda px-4 py-3 font-semibold">
          <AlertTriangle className={clsx("h-4 w-4", atrasados.length ? "text-alerta" : "text-suave")} />
          Itens há mais de {ATRASO} min sem entrega ({atrasados.length})
        </h2>
        {atrasados.length === 0 ? (
          <p className="px-4 py-6 text-sm text-suave">Nada atrasado agora.</p>
        ) : (
          <ul className="divide-y divide-borda text-sm">
            {atrasados.map(({ i, min }) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5">
                <span className="codigo font-semibold">#{i.pedido!.numero}</span>
                <span className="font-medium">{origemDoItem(i)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {i.quantidade}× {i.nome} <span className="text-suave">· {NOME_DESTINO[i.destino]}</span>
                </span>
                <span className={clsx("text-[12px] font-semibold", COR_SITUACAO_ITEM[i.situacao])}>{NOME_SITUACAO_ITEM[i.situacao]}</span>
                <span className="codigo font-semibold text-alerta">{min} min</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

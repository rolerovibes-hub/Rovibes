import clsx from "clsx";
import { AlertTriangle, ChefHat, Martini, PackageCheck, Truck } from "lucide-react";
import { COR_SITUACAO_ITEM, minutosDesde, NOME_DESTINO, NOME_SITUACAO_ITEM, origemDoItem } from "@/lib/salao";
import { useItensFila } from "./fila";

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
      <p className="text-[12px] text-suave">Reatribuição de tarefas, divergências e histórico detalhado chegam na próxima etapa (5c).</p>
    </div>
  );
}

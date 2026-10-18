import { useState } from "react";
import clsx from "clsx";
import { BadgePercent, ChefHat, Martini, PackageCheck, Smartphone, Users } from "lucide-react";
import { reais } from "@/components/Formulario";
import { mensagemDeErro } from "@/lib/supabase";
import { COR_SITUACAO_ITEM, itemPendente, minutosDesde, mudarItens, NOME_MODALIDADE, NOME_SITUACAO_ITEM, Pedido, totalDoPedido } from "@/lib/salao";

export interface ComandaResumo {
  id: string;
  aberta_em: string;
  pessoas: { usuario_id: string }[];
}

export interface Desconto {
  comanda_id: string;
  titulo: string;
  valor: number;
}

export function resumoDaComanda(pedidos: Pedido[], descontos: Desconto[]) {
  const subtotal = pedidos.reduce((s, p) => s + totalDoPedido(p), 0);
  const desconto = Math.min(subtotal, descontos.reduce((s, d) => s + d.valor, 0));
  const itens = pedidos.flatMap((p) => p.itens);
  return {
    subtotal,
    desconto,
    total: subtotal - desconto,
    pendentes: itens.filter((i) => itemPendente(i.situacao)).length,
    prontos: itens.filter((i) => i.situacao === "pronto" || i.situacao === "saiu").length,
  };
}

/** Consumo da comanda com a situação de cada item. Usado no Job (garçom) e no Business. */
export function DetalheComanda({
  comanda,
  pedidos,
  descontos,
  podeEntregar,
  aoMudar,
  aoErro,
}: {
  comanda: ComandaResumo;
  pedidos: Pedido[];
  descontos: Desconto[];
  podeEntregar: boolean;
  aoMudar: () => void;
  aoErro: (t: string) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const r = resumoDaComanda(pedidos, descontos);

  const agir = async (ids: string[], acao: "entregar" | "cancelar") => {
    let motivo: string | undefined;
    if (acao === "cancelar") {
      motivo = window.prompt("Motivo do cancelamento:") ?? "";
      if (!motivo.trim()) return;
    }
    setOcupado(true);
    const { error } = await mudarItens(ids, acao, motivo);
    setOcupado(false);
    if (error) aoErro(mensagemDeErro(error));
    aoMudar();
  };

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-suave">
        <Users className="h-4 w-4" />
        {comanda.pessoas.length ? `${comanda.pessoas.length} ${comanda.pessoas.length === 1 ? "pessoa" : "pessoas"} pelo App` : "Ninguém pelo App"} · aberta há{" "}
        {minutosDesde(comanda.aberta_em)} min
      </p>
      {pedidos.length === 0 ? (
        <p className="text-sm text-suave">Nenhum pedido ainda.</p>
      ) : (
        <ul className="space-y-3">
          {[...pedidos].reverse().map((p) => {
            const prontosSemApp = !p.usuario_id ? p.itens.filter((i) => i.situacao === "pronto" || i.situacao === "saiu") : [];
            return (
              <li key={p.id} className="rounded-lg border border-borda">
                <p className="flex flex-wrap items-center gap-x-2 border-b border-borda px-3 py-2 text-[13px]">
                  <span className="codigo font-semibold">#{p.numero}</span>
                  <span className="text-suave">
                    {p.usuario_id ? (
                      <span className="inline-flex items-center gap-1">
                        <Smartphone className="h-3.5 w-3.5" />
                        pelo App
                      </span>
                    ) : (
                      "lançado pela equipe"
                    )}{" "}
                    · {NOME_MODALIDADE[p.modalidade]} · {new Date(p.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="codigo ml-auto">{reais(totalDoPedido(p))}</span>
                </p>
                <ul className="divide-y divide-borda">
                  {p.itens.map((i) => (
                    <li key={i.id} className={clsx("flex items-center gap-2.5 px-3 py-2 text-sm", i.situacao === "cancelado" && "opacity-60")}>
                      <span className="text-suave">{i.destino === "bar" ? <Martini className="h-4 w-4" /> : i.destino === "cozinha" ? <ChefHat className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}</span>
                      <span className={clsx("min-w-0 flex-1", i.situacao === "cancelado" && "line-through")}>
                        {i.quantidade}× {i.nome}
                        {i.observacao && <span className="text-suave"> · {i.observacao}</span>}
                        {i.motivo_cancelamento && <span className="block text-[12px] text-perigo no-underline">{i.motivo_cancelamento}</span>}
                      </span>
                      <span className={clsx("shrink-0 text-[12px] font-semibold", COR_SITUACAO_ITEM[i.situacao])}>{NOME_SITUACAO_ITEM[i.situacao]}</span>
                      {itemPendente(i.situacao) && (
                        <button className="shrink-0 rounded px-1.5 py-0.5 text-[12px] text-suave hover:bg-elevado hover:text-perigo" disabled={ocupado} onClick={() => void agir([i.id], "cancelar")}>
                          Cancelar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {podeEntregar && prontosSemApp.length > 0 && (
                  <button className="w-full border-t border-borda px-3 py-2 text-[13px] font-medium text-destaque hover:bg-elevado" disabled={ocupado} onClick={() => void agir(prontosSemApp.map((i) => i.id), "entregar")}>
                    Marcar {prontosSemApp.length} {prontosSemApp.length === 1 ? "item pronto" : "itens prontos"} como entregue
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="ml-auto max-w-xs space-y-1 text-sm">
        <p className="flex justify-between">
          <span className="text-suave">Itens</span>
          <span className="codigo">{reais(r.subtotal)}</span>
        </p>
        {descontos.map((d, i) => (
          <p key={i} className="flex justify-between text-ok">
            <span className="flex items-center gap-1">
              <BadgePercent className="h-3.5 w-3.5" />
              {d.titulo}
            </span>
            <span className="codigo">−{reais(d.valor)}</span>
          </p>
        ))}
        <p className="flex justify-between border-t border-borda pt-1 text-base font-semibold">
          <span>Total</span>
          <span className="codigo">{reais(r.total)}</span>
        </p>
      </div>
    </div>
  );
}

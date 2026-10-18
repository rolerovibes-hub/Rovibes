import { useState } from "react";
import clsx from "clsx";
import { ChefHat, History, Martini, PackageCheck, Smartphone, Users } from "lucide-react";
import { Historico } from "./Historico";
import { PagamentosComanda } from "./PagamentosComanda";
import { reais } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { cancelarOuPedir, COR_SITUACAO_ITEM, ItemPedido, itemPendente, minutosDesde, mudarItens, NOME_MODALIDADE, NOME_SITUACAO_ITEM, Pedido, totalDoPedido } from "@/lib/salao";

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
  supervisor = false,
  aoMudar,
  aoErro,
}: {
  comanda: ComandaResumo;
  pedidos: Pedido[];
  descontos: Desconto[];
  podeEntregar: boolean;
  supervisor?: boolean;
  aoMudar: () => void;
  aoErro: (t: string) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [historico, setHistorico] = useState(false);

  const entregar = async (ids: string[]) => {
    setOcupado(true);
    const { error } = await mudarItens(ids, "entregar");
    setOcupado(false);
    if (error) aoErro(mensagemDeErro(error));
    aoMudar();
  };

  const cancelar = async (i: ItemPedido) => {
    setOcupado(true);
    const res = await cancelarOuPedir(i, supervisor);
    setOcupado(false);
    if (res.error) aoErro(mensagemDeErro(res.error));
    aoMudar();
  };

  const estornar = async (i: ItemPedido) => {
    const motivo = window.prompt(`Motivo do estorno de ${i.quantidade}× ${i.nome}:`);
    if (!motivo?.trim()) return;
    setOcupado(true);
    const { error } = await supabase.rpc("estornar_item", { p_item: i.id, p_motivo: motivo });
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
        <button className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-destaque" onClick={() => setHistorico(true)}>
          <History className="h-3.5 w-3.5" />
          Histórico
        </button>
      </p>
      {historico && <Historico comanda={comanda.id} fechar={() => setHistorico(false)} />}
      {pedidos.length === 0 ? (
        <p className="text-sm text-suave">Nenhum pedido ainda.</p>
      ) : (
        <ul className="space-y-3">
          {[...pedidos].reverse().map((p) => {
            const prontosSemApp = !p.usuario_id ? p.itens.filter((i) => (i.situacao === "pronto" || i.situacao === "saiu") && !i.bloqueado) : [];
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
                      <span className={clsx("shrink-0 text-[12px] font-semibold", i.bloqueado ? "text-alerta" : COR_SITUACAO_ITEM[i.situacao])}>
                        {i.bloqueado ? "Aguardando supervisão" : i.estornado ? "Estornado" : NOME_SITUACAO_ITEM[i.situacao]}
                      </span>
                      {itemPendente(i.situacao) && !i.bloqueado && (
                        <button className="shrink-0 rounded px-1.5 py-0.5 text-[12px] text-suave hover:bg-elevado hover:text-perigo" disabled={ocupado} onClick={() => void cancelar(i)}>
                          {supervisor || i.situacao === "recebido" ? "Cancelar" : "Pedir cancelamento"}
                        </button>
                      )}
                      {supervisor && i.situacao === "entregue" && (
                        <button className="shrink-0 rounded px-1.5 py-0.5 text-[12px] text-suave hover:bg-elevado hover:text-perigo" disabled={ocupado} onClick={() => void estornar(i)}>
                          Estornar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {podeEntregar && prontosSemApp.length > 0 && (
                  <button className="w-full border-t border-borda px-3 py-2 text-[13px] font-medium text-destaque hover:bg-elevado" disabled={ocupado} onClick={() => void entregar(prontosSemApp.map((i) => i.id))}>
                    Marcar {prontosSemApp.length} {prontosSemApp.length === 1 ? "item pronto" : "itens prontos"} como entregue
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <PagamentosComanda comanda={comanda.id} descontos={descontos} supervisor={supervisor} aoMudar={aoMudar} aoErro={aoErro} />
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Clock, ShieldCheck, X } from "lucide-react";
import { mensagemDeErro, supabase } from "./supabase";

export type Operacao = "estornar_item" | "cancelar_pagamento" | "reabrir_comanda" | "desconto" | "tirar_servico" | "fechar_em_aberto" | "assumir_comanda";

export interface Autorizacao {
  id: string;
  operacao: Operacao;
  resumo: string;
  motivo: string;
  valor: number | null;
  situacao: "pendente" | "aprovada" | "recusada" | "cancelada" | "expirada";
  comanda_id: string | null;
  pedida_por: string;
  pedida_em: string;
  decidida_por: string | null;
  resposta: string | null;
  minha: boolean;
  posso_decidir: boolean;
}

const NOME_SITUACAO: Record<Autorizacao["situacao"], string> = {
  pendente: "Aguardando",
  aprovada: "Aprovado",
  recusada: "Recusado",
  cancelada: "Cancelado",
  expirada: "Expirou",
};

/**
 * Pede autorização a quem pode (gerente, líder do setor, dono). Pergunta o motivo antes.
 * Devolve o texto para mostrar na tela, ou null se a pessoa desistiu.
 */
export async function pedirAutorizacao(operacao: Operacao, alvo: string, pergunta: string, valor?: number): Promise<{ ok: string } | { erro: string } | null> {
  const motivo = window.prompt(`${pergunta}\n\nSua função não faz isso sozinha: o pedido vai para o gerente ou líder aprovar. Qual o motivo?`);
  if (!motivo?.trim()) return null;
  const { error } = await supabase.rpc("pedir_autorizacao", { p_operacao: operacao, p_alvo: alvo, p_valor: valor ?? null, p_motivo: motivo });
  if (error) {
    if (/function|schema cache/i.test(error.message)) return { erro: "Falta aplicar a atualização 039 do banco para pedir autorização." };
    return { erro: mensagemDeErro(error) };
  }
  return { ok: "Pedido enviado. Assim que alguém aprovar, a mudança aparece aqui." };
}

/** Pedidos de autorização do estabelecimento (os que eu posso responder e os meus), ao vivo. */
export function useAutorizacoes(estab: string | undefined, aoMudarMinha?: (a: Autorizacao) => void) {
  const [lista, setLista] = useState<Autorizacao[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const anteriores = useRef(new Map<string, string>());
  const avisar = useRef(aoMudarMinha);
  avisar.current = aoMudarMinha;

  const carregar = useCallback(async () => {
    if (!estab) return;
    const { data, error } = await supabase.rpc("autorizacoes_do_estab", { p_estab: estab });
    if (error) {
      if (/function|schema cache/i.test(error.message)) setDisponivel(false);
      return;
    }
    const nova = ((data ?? []) as Autorizacao[]).map((a) => ({ ...a, valor: a.valor == null ? null : Number(a.valor) }));
    for (const a of nova) {
      const antes = anteriores.current.get(a.id);
      if (a.minha && antes === "pendente" && a.situacao !== "pendente") avisar.current?.(a);
      anteriores.current.set(a.id, a.situacao);
    }
    setLista(nova);
  }, [estab]);

  useEffect(() => {
    if (!estab) return;
    void carregar();
    const canal = supabase
      .channel(`autorizacoes-${estab}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "autorizacoes", filter: `estabelecimento_id=eq.${estab}` }, () => void carregar())
      .subscribe();
    const reserva = window.setInterval(() => void carregar(), 15000);
    return () => {
      window.clearInterval(reserva);
      void supabase.removeChannel(canal);
    };
  }, [estab, carregar]);

  return {
    lista,
    disponivel,
    carregar,
    paraMim: lista.filter((a) => a.posso_decidir),
    meusPendentes: lista.filter((a) => a.minha && a.situacao === "pendente"),
  };
}

/** Lista de pedidos: quem pode aprova ou recusa; quem pediu acompanha e pode desistir. */
export function PainelAutorizacoes({ estab, compacto = false }: { estab: string; compacto?: boolean }) {
  const { lista, disponivel, carregar } = useAutorizacoes(estab);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  if (!disponivel) return <p className="text-sm text-suave">Os pedidos de autorização aparecem depois da atualização 039 do banco.</p>;

  const decidir = async (a: Autorizacao, aprovar: boolean) => {
    const resposta = aprovar ? null : window.prompt("Motivo da recusa (aparece para quem pediu):") ?? undefined;
    if (resposta === undefined) return;
    setOcupado(a.id);
    setErro("");
    const { error } = await supabase.rpc("decidir_autorizacao", { p_id: a.id, p_aprovar: aprovar, p_resposta: resposta });
    setOcupado(null);
    if (error) setErro(mensagemDeErro(error));
    void carregar();
  };
  const desistir = async (a: Autorizacao) => {
    setOcupado(a.id);
    const { error } = await supabase.rpc("cancelar_autorizacao", { p_id: a.id });
    setOcupado(null);
    if (error) setErro(mensagemDeErro(error));
    void carregar();
  };

  const paraMim = lista.filter((a) => a.posso_decidir);
  const meus = lista.filter((a) => a.minha);

  return (
    <div className="space-y-4">
      {erro && <p role="alert" className="rounded-cartao border border-perigo/40 bg-perigo/10 px-3 py-2 text-sm text-perigo">{erro}</p>}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-destaque" />
          Para você autorizar {paraMim.length > 0 && <span className="rounded-full bg-alerta/15 px-2 text-[12px] text-alerta">{paraMim.length}</span>}
        </h3>
        {paraMim.length === 0 ? (
          <p className="text-[13px] text-suave">Nenhum pedido esperando você.</p>
        ) : (
          <ul className="space-y-2">
            {paraMim.map((a) => (
              <li key={a.id} className="rounded-lg border border-alerta/40 bg-alerta/5 p-3">
                <p className="text-sm font-semibold">{a.resumo}</p>
                <p className="mt-0.5 text-[13px] text-suave">
                  {a.pedida_por.split(" ")[0]} · há {Math.max(1, Math.round((Date.now() - Date.parse(a.pedida_em)) / 60000))} min · “{a.motivo}”
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button className="botao h-9" disabled={ocupado === a.id} onClick={() => void decidir(a, false)}>
                    <X className="h-4 w-4" />
                    Recusar
                  </button>
                  <button className="botao-principal h-9" disabled={ocupado === a.id} onClick={() => void decidir(a, true)}>
                    <Check className="h-4 w-4" />
                    Autorizar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {(!compacto || meus.length > 0) && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Meus pedidos (últimas 12 h)</h3>
          {meus.length === 0 ? (
            <p className="text-[13px] text-suave">Você não pediu nenhuma autorização.</p>
          ) : (
            <ul className="divide-y divide-borda rounded-lg border border-borda">
              {meus.map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.resumo}</span>
                    {a.situacao !== "pendente" && (a.decidida_por || a.resposta) && (
                      <span className="block truncate text-suave">
                        {a.decidida_por?.split(" ")[0]}
                        {a.resposta ? ` · “${a.resposta}”` : ""}
                      </span>
                    )}
                  </span>
                  <span
                    className={clsx(
                      "inline-flex shrink-0 items-center gap-1 font-semibold",
                      a.situacao === "aprovada" ? "text-ok" : a.situacao === "pendente" ? "text-alerta" : "text-suave",
                      a.situacao === "recusada" && "text-perigo",
                    )}
                  >
                    {a.situacao === "pendente" && <Clock className="h-3.5 w-3.5" />}
                    {NOME_SITUACAO[a.situacao]}
                  </span>
                  {a.situacao === "pendente" && (
                    <button className="shrink-0 rounded px-1.5 text-suave hover:text-perigo" disabled={ocupado === a.id} onClick={() => void desistir(a)} aria-label="Desistir do pedido">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

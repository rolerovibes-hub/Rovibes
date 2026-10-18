import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { mensagemDeErro, supabase } from "@/lib/supabase";

interface Evento {
  criado_em: string;
  acao: string;
  detalhe: string | null;
  pessoa: string;
  numero: number | null;
  item: string | null;
}

const ACAO: Record<string, string> = {
  comanda_aberta: "Abriu a comanda",
  comanda_fechada: "Fechou a comanda",
  comanda_cancelada: "Cancelou a comanda",
  comanda_reaberta: "Reabriu a comanda",
  criado: "Fez o pedido",
  cupom: "Usou cupom",
  iniciar: "Iniciou o preparo",
  liberar: "Liberou (pronto)",
  saiu: "Saiu para entrega",
  voltar: "Voltou à fila",
  entregar: "Entregou",
  cancelar: "Cancelou",
  pegar: "Pegou a entrega",
  reatribuir: "Passou a entrega",
  ocorrencia: "Registrou ocorrência",
  supervisao_cancelar: "Supervisão cancelou",
  supervisao_refazer: "Supervisão mandou refazer",
  supervisao_entregar: "Supervisão confirmou entrega sem QR",
  supervisao_resolver: "Supervisão resolveu",
  supervisao_recusar: "Supervisão recusou o pedido",
  estorno: "Estornou",
  assumir: "Assumiu a mesa",
  transferir: "Transferiu a mesa",
  trocar_mesa: "Trocou de mesa",
};

/** Linha do tempo de uma comanda: quem fez o quê e quando. */
export function Historico({ comanda, fechar }: { comanda: string; fechar: () => void }) {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    supabase.rpc("historico", { p_comanda: comanda }).then(({ data, error }) => {
      if (error) setErro(mensagemDeErro(error));
      setEventos((data ?? []) as Evento[]);
    });
  }, [comanda]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Histórico" onClick={fechar}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-superficie sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-borda px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <History className="h-4 w-4 text-destaque" />
            Histórico da comanda
          </h2>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">
          {erro && <p className="text-sm text-perigo">{erro}</p>}
          {eventos === null ? (
            <p className="py-8 text-center text-sm text-suave">Carregando...</p>
          ) : eventos.length === 0 ? (
            <p className="py-8 text-center text-sm text-suave">Nada registrado ainda.</p>
          ) : (
            <ol className="relative space-y-3 border-l border-borda pl-4">
              {eventos.map((e, i) => (
                <li key={i} className="text-sm">
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-marca" />
                  <p>
                    <span className="codigo text-suave">{new Date(e.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>{" "}
                    <span className="font-medium">{ACAO[e.acao] ?? e.acao}</span>
                    {e.item && (
                      <span>
                        {" "}
                        · {e.item}
                      </span>
                    )}
                    {e.numero != null && <span className="codigo text-suave"> #{e.numero}</span>}
                  </p>
                  <p className="text-[12px] text-suave">
                    {e.pessoa || "Sistema"}
                    {e.detalhe ? ` · ${e.detalhe}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

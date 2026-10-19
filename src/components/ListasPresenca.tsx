import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { ClipboardList, Minus, Plus } from "lucide-react";
import { mensagemDeErro } from "@/lib/supabase";
import { ListaAberta, refGuardado, rpc } from "@/lib/promoters";

/** Listas de presença abertas (página do evento ou do lugar): entrar com acompanhantes ou sair. */
export function ListasPresenca({ estab, evento, className }: { estab: string; evento: string | null; className?: string }) {
  const [listas, setListas] = useState<ListaAberta[]>([]);
  const [escolhendo, setEscolhendo] = useState<string | null>(null);
  const [acomp, setAcomp] = useState(0);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    rpc<ListaAberta[]>("listas_abertas", { p_estab: estab, p_evento: evento })
      .then((l) => {
        // A lista do promoter que trouxe a pessoa aparece primeiro.
        const ref = refGuardado();
        setListas([...(l ?? [])].sort((a, b) => Number(b.promoter_codigo === ref) - Number(a.promoter_codigo === ref)));
      })
      .catch(() => setListas([]));
  }, [estab, evento]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!listas.length) return null;

  const entrar = async (l: ListaAberta) => {
    setOcupado(true);
    setErro("");
    try {
      await rpc("entrar_na_lista", { p_lista: l.id, p_acompanhantes: acomp, p_ref: refGuardado() });
      setEscolhendo(null);
      carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setOcupado(false);
  };
  const sair = async (l: ListaAberta) => {
    if (!window.confirm(`Sair da "${l.nome}"?`)) return;
    try {
      await rpc("sair_da_lista", { p_lista: l.id });
      carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  return (
    <section aria-label="Listas de presença" className={className}>
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <ClipboardList className="h-4 w-4 text-destaque" />
        Listas de presença
      </h2>
      <ul className="space-y-2">
        {listas.map((l) => (
          <li key={l.id} className={clsx("cartao p-4", l.eu_estou && "border-ok")}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{l.nome}</p>
                {l.beneficio && <p className="text-sm text-destaque">{l.beneficio}</p>}
                <p className="mt-0.5 text-[12px] text-suave">
                  {l.promoter ? `Promoter: ${l.promoter} · ` : ""}
                  {l.limite ? `${l.inscritos}/${l.limite} nomes` : `${l.inscritos} nomes`}
                  {l.encerra_em ? ` · até ${new Date(l.encerra_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
                </p>
              </div>
              {l.eu_estou ? (
                <button className="botao h-9 shrink-0 text-[13px]" onClick={() => void sair(l)}>
                  Na lista ✓
                </button>
              ) : (
                <button className="botao-principal h-9 shrink-0 text-[13px]" disabled={l.cheia} onClick={() => (setEscolhendo(l.id), setAcomp(0))}>
                  {l.cheia ? "Lista cheia" : "Colocar meu nome"}
                </button>
              )}
            </div>
            {escolhendo === l.id && (
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-borda pt-3">
                <span className="text-sm">Acompanhantes</span>
                <span className="inline-flex items-center gap-2">
                  <button className="botao h-8 w-8 px-0" onClick={() => setAcomp((a) => Math.max(0, a - 1))} aria-label="Menos">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="codigo w-6 text-center font-semibold">{acomp}</span>
                  <button className="botao h-8 w-8 px-0" onClick={() => setAcomp((a) => Math.min(10, a + 1))} aria-label="Mais">
                    <Plus className="h-4 w-4" />
                  </button>
                </span>
                <button className="botao-principal ml-auto h-9" disabled={ocupado} onClick={() => void entrar(l)}>
                  Confirmar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}
    </section>
  );
}

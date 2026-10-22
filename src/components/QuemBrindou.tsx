import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { Avatar } from "./Avatar";
import { IconeTaca } from "./Brindar";
import { supabase } from "@/lib/supabase";
import { tempoAtras } from "@/app/conteudo";

interface Pessoa {
  id: string;
  nome: string;
  usuario: string | null;
  foto_url: string | null;
  quando: string;
  sou_eu: boolean;
}

/** Lista de quem brindou uma publicação (toque no número de brindes). */
export function QuemBrindou({ tipo, id, fechar }: { tipo: "pessoa" | "lugar"; id: string; fechar: () => void }) {
  const [lista, setLista] = useState<Pessoa[] | null>(null);
  const [erro, setErro] = useState("");
  const navegar = useNavigate();

  useEffect(() => {
    supabase.rpc("quem_brindou", { p_tipo: tipo, p_id: id }).then(({ data, error }) => {
      if (error) setErro(/function|schema cache/i.test(error.message) ? "A lista aparece depois que a atualização 041 do banco for aplicada." : "Não foi possível carregar.");
      setLista((data ?? []) as Pessoa[]);
    });
  }, [tipo, id]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      fechar();
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [fechar]);

  return createPortal(
    <div
      className="fixed inset-0 z-[78] flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Quem brindou"
      onClick={(e) => {
        e.stopPropagation();
        fechar();
      }}
    >
      <div className="folha flex max-h-[75vh] w-full max-w-md flex-col rounded-t-2xl bg-superficie text-texto sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-borda px-4 py-3">
          <IconeTaca cheia className="h-5 w-5" />
          <h2 className="flex-1 font-semibold">
            Brindes{lista && lista.length > 0 ? ` · ${lista.length}` : ""}
          </h2>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-[max(12px,env(safe-area-inset-bottom))]">
          {lista === null ? (
            <p className="py-8 text-center text-sm text-suave">Carregando...</p>
          ) : erro ? (
            <p className="px-4 py-8 text-center text-sm text-suave">{erro}</p>
          ) : lista.length === 0 ? (
            <p className="py-8 text-center text-sm text-suave">Ninguém brindou ainda.</p>
          ) : (
            <ul className="divide-y divide-borda">
              {lista.map((p) => (
                <li key={p.id}>
                  <button
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-elevado"
                    onClick={() => {
                      fechar();
                      navegar(p.sou_eu ? "/perfil" : p.usuario ? `/p/${p.usuario}` : "/");
                    }}
                  >
                    <Avatar nome={p.nome || "?"} foto={p.foto_url} ampliar />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.sou_eu ? "Você" : p.usuario ?? p.nome}</span>
                      <span className="block truncate text-[12px] text-suave">{p.nome}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-suave">{tempoAtras(p.quando)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

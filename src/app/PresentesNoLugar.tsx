import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { ChevronRight, Lock, Users, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/lib/supabase";
import { haQuanto } from "@/lib/agora";

interface Presente {
  id: string;
  nome: string;
  usuario: string | null;
  foto_url: string | null;
  relacao: "voce" | "amigo" | "sigo" | "publico";
  desde: string;
}

const ROTULO: Record<Presente["relacao"], string> = { voce: "Você", amigo: "Amigo", sigo: "Você segue", publico: "Check-in público" };

/** Lista de quem está no lugar agora e deixou ver (público, ou amigos para quem se segue mutuamente). Toque abre o perfil. */
export function PresentesNoLugar({ estab, nome, fechar }: { estab: string; nome: string; fechar: () => void }) {
  const [dados, setDados] = useState<{ pessoas: Presente[]; outros: number } | null | undefined>(undefined);

  useEffect(() => {
    supabase.rpc("presentes_no_lugar", { p_estab: estab }).then(({ data, error }) => setDados(error ? null : (data as { pessoas: Presente[]; outros: number })));
  }, [estab]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [fechar]);

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={`Quem está em ${nome}`} onClick={fechar}>
      <div className="folha flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-superficie pb-[max(12px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pb-2 pt-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
            <Users className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-tight">Quem está aqui agora</h2>
            <p className="truncate text-[13px] text-suave">{nome}</p>
          </div>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {dados === undefined ? (
            <p className="px-5 py-6 text-sm text-suave">Carregando...</p>
          ) : dados === null ? (
            <p className="px-5 py-6 text-sm text-suave">Esta lista aparece depois que a atualização 033 do banco for aplicada.</p>
          ) : dados.pessoas.length === 0 ? (
            <p className="px-5 py-6 text-sm text-suave">
              {dados.outros > 0 ? `${dados.outros} ${dados.outros === 1 ? "pessoa está" : "pessoas estão"} aqui, mas sem mostrar o perfil.` : "Ninguém com check-in visível agora."}
            </p>
          ) : (
            <ul className="divide-y divide-borda">
              {dados.pessoas.map((p) => (
                <li key={p.id}>
                  <Link to={p.relacao === "voce" ? "/perfil" : `/p/${p.usuario}`} onClick={fechar} className="flex items-center gap-3 px-5 py-2.5 hover:bg-elevado">
                    <span className={clsx("rounded-full", p.relacao === "amigo" && "ring-2 ring-ok ring-offset-2 ring-offset-superficie")}>
                      <Avatar nome={p.nome} foto={p.foto_url} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.nome}</span>
                      <span className="block truncate text-[12px] text-suave">
                        {p.usuario ? `@${p.usuario} · ` : ""}chegou {haQuanto(p.desde)}
                      </span>
                    </span>
                    <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", p.relacao === "amigo" ? "bg-ok/15 text-ok" : "bg-elevado text-suave")}>
                      {ROTULO[p.relacao]}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-suave" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {dados && dados.pessoas.length > 0 && dados.outros > 0 && (
            <p className="flex items-center gap-1.5 px-5 py-3 text-[13px] text-suave">
              <Lock className="h-3.5 w-3.5" />E mais {dados.outros} {dados.outros === 1 ? "pessoa" : "pessoas"} sem mostrar o perfil.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

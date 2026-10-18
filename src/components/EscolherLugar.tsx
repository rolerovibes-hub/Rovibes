import { useMemo, useState } from "react";
import { Search, Store, X } from "lucide-react";
import { Lugar } from "@/app/dados";

const sem = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Folha para escolher um lugar do RoVibes (compartilhar na conversa ou propor um rolê). */
export function EscolherLugar({
  titulo,
  lugares,
  escolher,
  fechar,
}: {
  titulo: string;
  lugares: Lugar[];
  escolher: (l: Lugar) => void;
  fechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const lista = useMemo(() => {
    const t = sem(busca.trim());
    return lugares.filter((l) => !t || sem(`${l.nome} ${l.bairro ?? ""} ${l.categoria?.nome ?? ""}`).includes(t)).slice(0, 40);
  }, [lugares, busca]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label={titulo} onClick={fechar}>
      <div className="folha flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-superficie pb-[env(safe-area-inset-bottom)] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="font-semibold">{titulo}</h2>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="relative mx-5 block">
          <span className="sr-only">Buscar lugar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Bar, restaurante, bairro..."
            className="h-10 w-full rounded-lg bg-elevado pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-marca"
          />
        </label>
        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto pb-3">
          {lista.map((l) => {
            const img = l.capa_url ?? l.logo_url;
            return (
              <li key={l.id}>
                <button onClick={() => escolher(l)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-elevado">
                  {img ? (
                    <img src={img} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-elevado text-suave">
                      <Store className="h-5 w-5" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{l.nome}</span>
                    <span className="block truncate text-[13px] text-suave">{[l.categoria?.nome, l.bairro].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {lista.length === 0 && <li className="px-5 py-6 text-center text-sm text-suave">Nenhum lugar encontrado.</li>}
        </ul>
      </div>
    </div>
  );
}

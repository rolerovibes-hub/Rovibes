import { useCallback, useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { mensagemDeErro } from "@/lib/supabase";
import { ListaGerir, rpc } from "@/lib/promoters";
import { NomesLista } from "@/app/AreaPromoter";

/** Portaria (Job e T5005): conferir os nomes das listas de presença na entrada. */
export function Portaria({ estab }: { estab: string }) {
  const [listas, setListas] = useState<ListaGerir[] | null>(null);
  const [aberta, setAberta] = useState<ListaGerir | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    rpc<ListaGerir[]>("listas_para_gerir", { p_estab: estab })
      .then((l) => setListas((l ?? []).filter((x) => x.ativa || x.inscritos > 0)))
      .catch((e) => {
        setErro(mensagemDeErro(e));
        setListas([]);
      });
  }, [estab]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!listas) return <Carregando />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-lg font-semibold">Listas de presença</h1>
      {erro && <p className="text-sm text-perigo">{erro}</p>}
      {listas.length === 0 ? (
        <p className="cartao px-4 py-8 text-center text-sm text-suave">Nenhuma lista para hoje. Os promoters e a gestão criam as listas pelos eventos.</p>
      ) : (
        <ul className="cartao divide-y divide-borda">
          {listas.map((l) => (
            <li key={l.id}>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevado" onClick={() => setAberta(l)}>
                <ClipboardList className="h-5 w-5 text-destaque" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{l.nome}</span>
                  <span className="block truncate text-[12px] text-suave">
                    {l.evento ? `${l.evento.nome} · ` : ""}
                    {l.promoter ?? "Lista da casa"}
                    {l.beneficio ? ` · ${l.beneficio}` : ""}
                  </span>
                </span>
                <span className="codigo shrink-0 text-right text-sm">
                  <span className="block font-semibold">
                    {l.chegaram}/{l.inscritos}
                  </span>
                  <span className="block text-[11px] text-suave">chegaram</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {aberta && (
        <NomesLista
          lista={aberta}
          portaria
          fechar={() => {
            setAberta(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

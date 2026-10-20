import clsx from "clsx";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { useEnvios } from "@/lib/envios";

/** Faixa discreta no topo mostrando as publicações sendo enviadas (o app continua livre para usar). */
export function BarraEnvios() {
  const { envios, tentarDeNovo, descartar } = useEnvios();
  if (!envios.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[60px] z-[65] mx-auto flex max-w-xl flex-col gap-1.5 px-3">
      {envios.map((e) => (
        <div key={e.id} role="status" className="pointer-events-auto folha flex items-center gap-2.5 overflow-hidden rounded-xl border border-borda bg-superficie/95 p-2 pr-2.5 shadow-lg backdrop-blur">
          {e.previa ? (
            e.pedido.midia.tipo === "video" ? (
              <video src={e.previa} muted playsInline className="h-10 w-8 shrink-0 rounded-md bg-black object-cover" />
            ) : (
              <img src={e.previa} alt="" className="h-10 w-8 shrink-0 rounded-md object-cover" />
            )
          ) : (
            <span className="h-10 w-8 shrink-0 rounded-md bg-elevado" />
          )}
          <div className="min-w-0 flex-1">
            <p className={clsx("truncate text-[13px] font-medium", e.estado === "erro" && "text-perigo")}>
              {e.estado === "publicado"
                ? e.pedido.destino === "feed"
                  ? "Publicado no feed"
                  : "Story publicado"
                : e.estado === "erro"
                  ? e.erro ?? "Não foi possível publicar"
                  : e.estado === "preparando" && e.pedido.midia.tipo === "video" && e.pedido.midia.regravar
                    ? "Preparando o vídeo..."
                    : "Publicando..."}
            </p>
            {e.estado !== "erro" && (
              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-elevado">
                <span className={clsx("block h-full rounded-full transition-[width] duration-300", e.estado === "publicado" ? "bg-ok" : "bg-marca")} style={{ width: `${Math.round(e.progresso * 100)}%` }} />
              </span>
            )}
          </div>
          {e.estado === "publicado" ? (
            <Check className="h-5 w-5 shrink-0 text-ok" />
          ) : e.estado === "erro" ? (
            <>
              <button onClick={() => tentarDeNovo(e.id)} className="rounded-full p-1.5 text-destaque hover:bg-elevado" aria-label="Tentar de novo">
                <RotateCcw className="h-4 w-4" />
              </button>
              <button onClick={() => descartar(e.id)} className="rounded-full p-1.5 text-suave hover:bg-elevado" aria-label="Descartar">
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-suave" />
          )}
        </div>
      ))}
    </div>
  );
}

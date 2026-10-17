import { useState } from "react";
import clsx from "clsx";
import { Bookmark, MapPin, Search, Users } from "lucide-react";
import { MedidorMovimento } from "@/components/Marca";
import { EVENTOS, FILTROS, LUGARES } from "./exemplos";

export function Descobrir() {
  const [filtro, setFiltro] = useState("Hoje");

  return (
    <div className="space-y-7 py-4">
      <div className="space-y-3 px-4">
        <h1 className="text-[22px] font-semibold leading-tight">Para onde hoje?</h1>
        <label className="relative block">
          <span className="sr-only">Buscar lugares e eventos</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-suave" />
          <input
            placeholder="Bar, evento, bairro"
            className="h-11 w-full rounded-cartao border border-borda bg-superficie pl-10 pr-3 placeholder:text-suave focus:border-marca focus:outline-none"
          />
        </label>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Filtros">
        {FILTROS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filtro === f}
            onClick={() => setFiltro(f)}
            className={clsx(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              filtro === f ? "border-marca bg-marca font-medium text-marca-texto" : "border-borda bg-superficie hover:bg-elevado",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <section className="px-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Movimento agora</h2>
          <span className="text-[13px] text-suave">Uberlândia</span>
        </div>
        <ul className="space-y-3">
          {LUGARES.map((l) => (
            <li key={l.id} className="cartao flex gap-3.5 p-3.5">
              <div className="h-[72px] w-[72px] shrink-0 rounded-lg bg-elevado" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{l.nome}</h3>
                    <p className="truncate text-[13px] text-suave">
                      {l.categoria} · {l.bairro} · {l.aberto}
                    </p>
                  </div>
                  <button className="-mr-1 -mt-1 rounded p-1.5 text-suave hover:bg-elevado hover:text-texto" aria-label={`Salvar ${l.nome}`}>
                    <Bookmark className="h-[18px] w-[18px]" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <MedidorMovimento nivel={l.movimento} />
                  <span className="inline-flex items-center gap-1 text-[13px] text-suave">
                    <MapPin className="h-3.5 w-3.5" />
                    {l.distancia}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {l.vibes.map((v) => (
                    <span key={v} className="rounded-md bg-destaque-suave px-2 py-0.5 text-[12px] font-medium text-destaque">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 px-4 font-semibold">Eventos</h2>
        <ul className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {EVENTOS.map((e) => (
            <li key={e.id} className="cartao w-60 shrink-0 overflow-hidden">
              <div className="h-24 bg-elevado" aria-hidden="true" />
              <div className="p-3.5">
                <p className="text-[13px] font-medium text-destaque">{e.quando}</p>
                <h3 className="mt-0.5 font-semibold">{e.nome}</h3>
                <p className="text-[13px] text-suave">{e.lugar}</p>
                <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-suave">
                  <Users className="h-3.5 w-3.5" />
                  {e.confirmados} confirmados
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="px-4 text-center text-xs text-suave">Lugares e eventos de exemplo, só para avaliar o visual.</p>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { CalendarDays, MapPin, Search, Store } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { abertoAgora, resumoHorario } from "@/lib/horarios";
import { distanciaKm, ehHoje, km, Lugar, nomesVibes, pedirLocalizacao, quando, useVitrine } from "./dados";

const sem = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function Descobrir() {
  const { lugares, eventos, carregando, erro } = useVitrine();
  const [filtro, setFiltro] = useState("Tudo");
  const [busca, setBusca] = useState("");
  const [eu, setEu] = useState<[number, number] | null>(null);
  const [avisoLocal, setAvisoLocal] = useState("");

  // Filtros: fixos + as vibes que existem nos lugares.
  const filtros = useMemo(() => {
    const vibes = new Set(lugares.flatMap(nomesVibes));
    return ["Tudo", "Perto de mim", "Aberto agora", "Eventos hoje", ...[...vibes].sort()];
  }, [lugares]);

  const escolher = async (f: string) => {
    setFiltro(f);
    setAvisoLocal("");
    if (f === "Perto de mim" && !eu) {
      try {
        setEu(await pedirLocalizacao());
      } catch (e) {
        setAvisoLocal((e as Error).message);
      }
    }
  };

  const distancia = (l: Lugar) => (eu && l.latitude != null && l.longitude != null ? distanciaKm(eu, [l.latitude, l.longitude]) : null);

  const visiveis = useMemo(() => {
    const t = sem(busca.trim());
    let lista = lugares.filter(
      (l) => !t || sem(`${l.nome} ${l.bairro ?? ""} ${l.categoria?.nome ?? ""} ${nomesVibes(l).join(" ")}`).includes(t),
    );
    if (filtro === "Aberto agora") lista = lista.filter((l) => abertoAgora(l.horarios));
    else if (filtro === "Eventos hoje") {
      const comEvento = new Set(eventos.filter((e) => ehHoje(e.inicio)).map((e) => e.estabelecimento?.id));
      lista = lista.filter((l) => comEvento.has(l.id));
    } else if (!["Tudo", "Perto de mim"].includes(filtro)) lista = lista.filter((l) => nomesVibes(l).includes(filtro));
    if (filtro === "Perto de mim" && eu) {
      lista = [...lista].sort((a, b) => (distancia(a) ?? 9e9) - (distancia(b) ?? 9e9));
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lugares, eventos, filtro, busca, eu]);

  const eventosVisiveis = useMemo(() => {
    const t = sem(busca.trim());
    return eventos
      .filter((e) => !t || sem(`${e.nome} ${e.estabelecimento?.nome ?? ""}`).includes(t))
      .filter((e) => filtro !== "Eventos hoje" || ehHoje(e.inicio));
  }, [eventos, busca, filtro]);

  return (
    <div className="space-y-7 py-4">
      <div className="space-y-3 px-4">
        <h1 className="text-[22px] font-semibold leading-tight">Para onde hoje?</h1>
        <label className="relative block">
          <span className="sr-only">Buscar lugares e eventos</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-suave" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Bar, evento, bairro, vibe"
            className="h-11 w-full rounded-cartao border border-borda bg-superficie pl-10 pr-3 placeholder:text-suave focus:border-marca focus:outline-none"
          />
        </label>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Filtros">
        {filtros.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filtro === f}
            onClick={() => void escolher(f)}
            className={clsx(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              filtro === f ? "border-marca bg-marca font-medium text-marca-texto" : "border-borda bg-superficie hover:bg-elevado",
            )}
          >
            {f}
          </button>
        ))}
      </div>
      {avisoLocal && <p className="px-4 text-sm text-alerta">{avisoLocal}</p>}

      {carregando ? (
        <Carregando />
      ) : erro ? (
        <p className="px-4 text-sm text-perigo">Não foi possível carregar agora. Verifique a conexão e tente de novo.</p>
      ) : (
        <>
          {eventosVisiveis.length > 0 && (
            <section>
              <h2 className="mb-3 px-4 font-semibold">Próximos eventos</h2>
              <ul className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {eventosVisiveis.map((e) => (
                  <li key={e.id} className="w-60 shrink-0">
                    <Link to={`/evento/${e.id}`} className="cartao block overflow-hidden hover:bg-elevado">
                      {e.capa_url ? (
                        <img src={e.capa_url} alt="" className="h-28 w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-28 items-center justify-center bg-elevado text-suave" aria-hidden="true">
                          <CalendarDays className="h-6 w-6" />
                        </div>
                      )}
                      <div className="p-3.5">
                        <p className={clsx("text-[13px] font-medium", ehHoje(e.inicio) ? "text-magenta" : "text-destaque")}>{quando(e.inicio)}</p>
                        <h3 className="mt-0.5 truncate font-semibold">{e.nome}</h3>
                        <p className="truncate text-[13px] text-suave">{e.estabelecimento?.nome}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="px-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-semibold">Lugares</h2>
              <span className="text-[13px] text-suave">Uberlândia</span>
            </div>
            {visiveis.length === 0 ? (
              <div className="cartao px-6 py-12 text-center">
                <Store className="mx-auto h-7 w-7 text-suave" />
                <p className="mt-3 font-medium">{lugares.length === 0 ? "Os primeiros lugares estão chegando" : "Nada com esse filtro"}</p>
                <p className="mt-1 text-sm text-suave">
                  {lugares.length === 0 ? "Assim que os estabelecimentos forem aprovados, eles aparecem aqui." : "Tente outro filtro ou outra busca."}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {visiveis.map((l) => {
                  const d = distancia(l);
                  const horario = resumoHorario(l.horarios);
                  return (
                    <li key={l.id}>
                      <Link to={`/lugar/${l.id}`} className="cartao flex gap-3.5 p-3.5 hover:bg-elevado">
                        {l.capa_url ? (
                          <img src={l.capa_url} alt="" className="h-[76px] w-[76px] shrink-0 rounded-lg object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-lg bg-elevado text-suave" aria-hidden="true">
                            <Store className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold">{l.nome}</h3>
                          <p className="truncate text-[13px] text-suave">
                            {[l.categoria?.nome, l.bairro, l.faixa_preco ? "$".repeat(l.faixa_preco) : null].filter(Boolean).join(" · ")}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                            {horario && <span className={abertoAgora(l.horarios) ? "font-medium text-ok" : "text-suave"}>{horario}</span>}
                            {d != null && (
                              <span className="inline-flex items-center gap-1 text-suave">
                                <MapPin className="h-3.5 w-3.5" />
                                {km(d)}
                              </span>
                            )}
                          </div>
                          {nomesVibes(l).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {nomesVibes(l).map((v) => (
                                <span key={v} className="rounded-md bg-destaque-suave px-2 py-0.5 text-[12px] font-medium text-destaque">
                                  {v}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

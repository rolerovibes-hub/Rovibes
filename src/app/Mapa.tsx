import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { CircleMarker } from "react-leaflet";
import { LocateFixed, X } from "lucide-react";
import { MapaBase, PinMapa, Recentralizar, TamanhoPin, UBERLANDIA, corDoTema } from "@/components/MapaBase";
import { abertoAgora, resumoHorario } from "@/lib/horarios";
import { MedidorMovimento } from "@/components/Marca";
import { useResumos } from "./presenca";
import { NotaCompacta } from "./Avaliacoes";
import { atendeFiltro, FILTROS_FIXOS, nomesVibes, pedirLocalizacao, useVitrine } from "./dados";

export function Mapa() {
  const { lugares, eventos } = useVitrine();
  const { resumos } = useResumos(null);
  const [filtro, setFiltro] = useState("Tudo");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [eu, setEu] = useState<[number, number] | null>(null);
  const [aviso, setAviso] = useState("");

  const comLocal = lugares.filter((l) => l.latitude != null && l.longitude != null);
  const lugar = comLocal.find((l) => l.id === selecionado) ?? null;
  const filtros = useMemo(() => [...FILTROS_FIXOS, ...[...new Set(lugares.flatMap(nomesVibes))].sort()], [lugares]);
  const quantos = comLocal.filter((l) => atendeFiltro(l, filtro, eventos, (x) => abertoAgora(x.horarios))).length;

  // Tamanho do pin: selecionado > atende ao filtro > fora do filtro.
  const tamanho = (id: string, atende: boolean): TamanhoPin => {
    if (id === selecionado) return "foco";
    if (filtro === "Tudo") return "medio";
    return atende ? "grande" : "pequeno";
  };

  const localizar = async () => {
    setAviso("");
    try {
      setEu(await pedirLocalizacao());
    } catch (e) {
      setAviso((e as Error).message);
    }
  };

  return (
    <div className="relative h-[calc(100dvh-56px-64px)] min-h-[420px]">
      <MapaBase centro={UBERLANDIA} zoom={13} className="h-full w-full" aoClicar={() => setSelecionado(null)}>
        <Recentralizar centro={eu} zoom={15} />
        {comLocal.map((l) => (
          <PinMapa
            key={l.id}
            posicao={[l.latitude!, l.longitude!]}
            titulo={l.nome}
            tamanho={tamanho(l.id, atendeFiltro(l, filtro, eventos, (x) => abertoAgora(x.horarios)))}
            aoClicar={() => setSelecionado(l.id)}
          />
        ))}
        {eu && <CircleMarker center={eu} radius={7} pathOptions={{ color: "#fff", weight: 3, fillColor: corDoTema("azul"), fillOpacity: 1 }} />}
      </MapaBase>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] space-y-2 p-3">
        <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1 pr-12 [scrollbar-width:none]" role="tablist" aria-label="Filtros do mapa">
          {filtros.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filtro === f}
              onClick={() => setFiltro(f)}
              className={clsx(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm shadow-sm transition-colors",
                filtro === f ? "border-marca bg-marca font-medium text-marca-texto" : "border-borda bg-superficie hover:bg-elevado",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        {filtro !== "Tudo" && (
          <p className="pointer-events-auto inline-block rounded-md bg-superficie/95 px-2.5 py-1 text-[13px] text-suave shadow-sm">
            {quantos === 0 ? "Nenhum lugar com esse filtro" : `${quantos} ${quantos === 1 ? "lugar" : "lugares"} em destaque`}
          </p>
        )}
        {aviso && <p className="cartao pointer-events-auto px-3 py-2 text-sm text-alerta">{aviso}</p>}
      </div>

      <button
        onClick={() => void localizar()}
        className="botao absolute bottom-4 right-4 z-[500] h-11 w-11 px-0 shadow-sm"
        style={lugar ? { bottom: "11.5rem" } : undefined}
        aria-label="Mostrar minha localização"
      >
        <LocateFixed className="h-[18px] w-[18px]" />
      </button>

      {lugar ? (
        <div className="cartao absolute inset-x-4 bottom-4 z-[500] p-4 shadow-sm">
          <div className="flex items-start gap-3">
            {lugar.logo_url ? (
              <img src={lugar.logo_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold">{lugar.nome}</h2>
              <p className="truncate text-[13px] text-suave">{[lugar.categoria?.nome, lugar.bairro].filter(Boolean).join(" · ")}</p>
              {lugar.horarios.length > 0 && (
                <p className={abertoAgora(lugar.horarios) ? "mt-0.5 text-[13px] font-medium text-ok" : "mt-0.5 text-[13px] text-suave"}>
                  {resumoHorario(lugar.horarios)}
                </p>
              )}
              {resumos.get(lugar.id) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <NotaCompacta nota={resumos.get(lugar.id)!.nota} total={resumos.get(lugar.id)!.avaliacoes} />
                  {resumos.get(lugar.id)!.movimento && <MedidorMovimento nivel={resumos.get(lugar.id)!.movimento!} />}
                </p>
              )}
            </div>
            <button onClick={() => setSelecionado(null)} className="rounded p-1 text-suave hover:text-texto" aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>
          {nomesVibes(lugar).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {nomesVibes(lugar).map((v) => (
                <span key={v} className="rounded-md bg-destaque-suave px-2 py-0.5 text-[12px] font-medium text-destaque">
                  {v}
                </span>
              ))}
            </div>
          )}
          <Link to={`/lugar/${lugar.id}`} className="botao-principal mt-3 w-full">
            Ver lugar
          </Link>
        </div>
      ) : (
        comLocal.length === 0 && (
          <p className="cartao absolute inset-x-4 bottom-4 z-[500] p-4 text-center text-sm text-suave">
            Os lugares aprovados aparecem aqui assim que marcarem a localização.
          </p>
        )
      )}
    </div>
  );
}

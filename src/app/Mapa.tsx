import { useState } from "react";
import { Link } from "react-router-dom";
import { CircleMarker } from "react-leaflet";
import { LocateFixed, X } from "lucide-react";
import { MapaBase, Recentralizar, UBERLANDIA, corDaMarca, corDoTema } from "@/components/MapaBase";
import { abertoAgora, resumoHorario } from "@/lib/horarios";
import { useTema } from "@/lib/tema";
import { nomesVibes, pedirLocalizacao, useVitrine } from "./dados";

export function Mapa() {
  const { lugares } = useVitrine();
  const { escuro } = useTema();
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [eu, setEu] = useState<[number, number] | null>(null);
  const [aviso, setAviso] = useState("");
  const comLocal = lugares.filter((l) => l.latitude != null && l.longitude != null);
  const lugar = comLocal.find((l) => l.id === selecionado) ?? null;
  const cor = corDaMarca();
  const contorno = escuro ? "#1A1F2B" : "#FFFFFF";

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
          <CircleMarker
            key={l.id}
            center={[l.latitude!, l.longitude!]}
            radius={l.id === selecionado ? 11 : 8}
            bubblingMouseEvents={false}
            pathOptions={{ color: contorno, weight: 3, fillColor: cor, fillOpacity: abertoAgora(l.horarios) ? 1 : 0.55 }}
            eventHandlers={{ click: () => setSelecionado(l.id) }}
          />
        ))}
        {eu && <CircleMarker center={eu} radius={7} pathOptions={{ color: "#fff", weight: 3, fillColor: corDoTema("azul"), fillOpacity: 1 }} />}
      </MapaBase>

      <button onClick={() => void localizar()} className="botao absolute right-4 top-4 z-[500] h-10 w-10 px-0 shadow-sm" aria-label="Mostrar minha localização">
        <LocateFixed className="h-[18px] w-[18px]" />
      </button>
      {aviso && <p className="cartao absolute left-4 right-16 top-4 z-[500] px-3 py-2 text-sm text-alerta">{aviso}</p>}

      {lugar ? (
        <div className="cartao absolute inset-x-4 bottom-4 z-[500] p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-semibold">{lugar.nome}</h2>
              <p className="truncate text-[13px] text-suave">{[lugar.categoria?.nome, lugar.bairro].filter(Boolean).join(" · ")}</p>
              <p className={abertoAgora(lugar.horarios) ? "mt-1 text-[13px] font-medium text-ok" : "mt-1 text-[13px] text-suave"}>
                {resumoHorario(lugar.horarios)}
              </p>
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

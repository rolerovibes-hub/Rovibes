import { useMemo, useState } from "react";
import clsx from "clsx";
import { CircleMarker } from "react-leaflet";
import { LocateFixed } from "lucide-react";
import { Navegacao } from "./Navegacao";
import { MapaBase, PinMapa, Recentralizar, TamanhoPin, UBERLANDIA, corDoTema } from "@/components/MapaBase";
import { abertoAgora } from "@/lib/horarios";
import { useSessao } from "@/lib/sessao";
import { usePresencaAmigos } from "@/lib/agora";
import { atendeFiltro, distanciaKm, FILTROS_FIXOS, Lugar, nomesVibes, pedirLocalizacao, useVitrine } from "./dados";
import { CartaoLugarAgora } from "./CartaoLugarAgora";

export function Mapa() {
  const { lugares, eventos } = useVitrine();
  const { sessao } = useSessao();
  const [filtro, setFiltro] = useState("Tudo");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [eu, setEu] = useState<[number, number] | null>(null);
  const [aviso, setAviso] = useState("");
  const [navegando, setNavegando] = useState(false);

  const comLocal = lugares.filter((l) => l.latitude != null && l.longitude != null);
  const lugar = comLocal.find((l) => l.id === selecionado) ?? null;
  const amigos = usePresencaAmigos(
    comLocal.map((l) => l.id),
    sessao?.user.id ?? "",
  );
  const comAmigos = (id: string) => {
    const a = amigos.get(id);
    return !!a && (a.identificados > 0 || a.anonimos > 0);
  };
  const temAlgumAmigo = comLocal.some((l) => comAmigos(l.id));
  const filtros = useMemo(
    () => [FILTROS_FIXOS[0], ...(temAlgumAmigo ? ["Amigos agora"] : []), ...FILTROS_FIXOS.slice(1), ...[...new Set(lugares.flatMap(nomesVibes))].sort()],
    [lugares, temAlgumAmigo],
  );
  const atende = (l: Lugar) => (filtro === "Amigos agora" ? comAmigos(l.id) : atendeFiltro(l, filtro, eventos, (x) => abertoAgora(x.horarios)));
  const quantos = comLocal.filter(atende).length;

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
            tamanho={tamanho(l.id, atende(l))}
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
        style={lugar ? { bottom: "15.5rem" } : undefined}
        aria-label="Mostrar minha localização"
      >
        <LocateFixed className="h-[18px] w-[18px]" />
      </button>

      {lugar ? (
        <div className="absolute inset-x-3 bottom-3 z-[500]">
          <CartaoLugarAgora
            key={lugar.id}
            lugar={lugar}
            distanciaKm={eu ? distanciaKm(eu, [lugar.latitude!, lugar.longitude!]) : null}
            amigos={amigos.get(lugar.id)}
            fechar={() => setSelecionado(null)}
            comoChegar={() => setNavegando(true)}
          />
        </div>
      ) : (
        comLocal.length === 0 && (
          <p className="cartao absolute inset-x-4 bottom-4 z-[500] p-4 text-center text-sm text-suave">
            Os lugares aprovados aparecem aqui assim que marcarem a localização.
          </p>
        )
      )}
      {navegando && lugar && <Navegacao destino={{ nome: lugar.nome, lat: lugar.latitude!, lng: lugar.longitude! }} fechar={() => setNavegando(false)} />}
    </div>
  );
}

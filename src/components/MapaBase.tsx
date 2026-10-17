import { ReactNode, useEffect } from "react";
import * as L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export const UBERLANDIA: [number, number] = [-18.9186, -48.2772];

/** Mapa OpenStreetMap; no tema escuro o mapa é escurecido por filtro (sem precisar de chave). */
export function MapaBase({
  centro = UBERLANDIA,
  zoom = 13,
  children,
  aoClicar,
  className,
}: {
  centro?: [number, number];
  zoom?: number;
  children?: ReactNode;
  aoClicar?: (lat: number, lng: number) => void;
  className?: string;
}) {
  return (
    <MapContainer center={centro} zoom={zoom} className={className} zoomControl={false} attributionControl>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        className="mapa-ladrilhos"
        maxZoom={19}
      />
      {aoClicar && <Clique aoClicar={aoClicar} />}
      {children}
    </MapContainer>
  );
}

function Clique({ aoClicar }: { aoClicar: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => aoClicar(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Move o mapa quando o centro muda. */
export function Recentralizar({ centro, zoom }: { centro: [number, number] | null; zoom?: number }) {
  const mapa = useMap();
  useEffect(() => {
    if (centro) mapa.setView(centro, zoom ?? mapa.getZoom());
  }, [centro, zoom, mapa]);
  return null;
}

/** Cor do tema lida das variáveis CSS, para os marcadores do mapa. */
export function corDoTema(nome: "marca" | "azul" | "magenta" = "marca") {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${nome}`).trim();
  return v ? `rgb(${v.split(" ").join(",")})` : "#6D28D9";
}

export const corDaMarca = () => corDoTema("marca");

// Marcador no formato do pin da logo. O tamanho comunica relevância:
// "foco" = selecionado, "grande" = atende ao filtro, "medio" = normal, "pequeno" = fora do filtro.
export type TamanhoPin = "foco" | "grande" | "medio" | "pequeno";

const ALTURA: Record<TamanhoPin, number> = { foco: 58, grande: 46, medio: 36, pequeno: 24 };
const icones = new Map<TamanhoPin, L.DivIcon>();

export function iconePin(tamanho: TamanhoPin) {
  let icone = icones.get(tamanho);
  if (!icone) {
    const h = ALTURA[tamanho];
    const w = Math.round(h * 0.75);
    icone = L.divIcon({
      className: `pin-rovibes pin-${tamanho}`,
      html: `<img src="/marca/rovibes-pin.webp" alt="" width="${w}" height="${h}" draggable="false" />`,
      iconSize: [w, h],
      iconAnchor: [w / 2, h],
    });
    icones.set(tamanho, icone);
  }
  return icone;
}

/** Pin da marca num ponto do mapa. */
export function PinMapa({
  posicao,
  tamanho = "medio",
  aoClicar,
  titulo,
}: {
  posicao: [number, number];
  tamanho?: TamanhoPin;
  aoClicar?: () => void;
  titulo?: string;
}) {
  const ordem: Record<TamanhoPin, number> = { foco: 1000, grande: 500, medio: 100, pequeno: 0 };
  return (
    <Marker
      position={posicao}
      icon={iconePin(tamanho)}
      title={titulo}
      zIndexOffset={ordem[tamanho]}
      bubblingMouseEvents={false}
      eventHandlers={aoClicar ? { click: aoClicar } : undefined}
    />
  );
}

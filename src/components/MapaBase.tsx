import { ReactNode, useEffect } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
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

/** Cor da marca lida das variáveis do tema, para os marcadores. */
export function corDaMarca() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--marca").trim();
  return v ? `rgb(${v.split(" ").join(",")})` : "#5A3DD8";
}

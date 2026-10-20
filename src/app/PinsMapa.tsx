import { useMemo, useState } from "react";
import L from "leaflet";
import { Marker, useMapEvents } from "react-leaflet";
import type { Amigos } from "@/lib/agora";
import type { Lugar } from "./dados";

/** Altura do pin conforme as presenças (check-ins válidos agora): proporcional, entre o mínimo e o máximo. */
export const PIN_MIN = 26;
export const PIN_MAX = 64;
const BOLA = 28; // círculo de amigo e quadrado da logo têm o mesmo tamanho

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const iniciais = (nome: string) =>
  nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export function alturaPin(checkins: number, maximo: number) {
  if (maximo <= 0 || checkins <= 0) return PIN_MIN;
  return Math.round(PIN_MIN + (PIN_MAX - PIN_MIN) * Math.min(1, checkins / maximo));
}

// Posições dos círculos de amigos ao redor do pin (em relação ao topo-centro do pin), do lado esquerdo e em cima.
const POSICOES = [
  { x: -1.05, y: 0.15 },
  { x: -0.75, y: -0.55 },
  { x: -0.05, y: -0.95 },
  { x: -1.35, y: 0.75 },
];

const cacheIcones = new Map<string, L.DivIcon>();

function montarIcone(l: Lugar, h: number, amigos: Amigos | undefined, opts: { foco: boolean; apagado: boolean; comNome: boolean }) {
  const chave = [l.id, l.logo_url, l.nome, h, opts.foco, opts.apagado, opts.comNome, amigos?.identificados, amigos?.anonimos, ...(amigos?.pessoas ?? []).map((p) => p.id)].join("|");
  const pronto = cacheIcones.get(chave);
  if (pronto) return pronto;
  if (cacheIcones.size > 800) cacheIcones.clear();
  const icone = criarIcone(l, h, amigos, opts);
  cacheIcones.set(chave, icone);
  return icone;
}

function criarIcone(l: Lugar, h: number, amigos: Amigos | undefined, opts: { foco: boolean; apagado: boolean; comNome: boolean }) {
  const w = Math.round(h * 0.75);
  const pessoas = amigos?.pessoas ?? [];
  const extra = (amigos ? amigos.identificados - Math.min(pessoas.length, 3) + amigos.anonimos : 0);
  const bolas: string[] = pessoas.slice(0, 3).map((p) =>
    p.foto_url
      ? `<img src="${esc(p.foto_url)}" alt="" draggable="false" />`
      : `<span class="pin-inicial">${esc(iniciais(p.nome) || "?")}</span>`,
  );
  if (extra > 0) bolas.push(`<span class="pin-mais">+${extra > 99 ? 99 : extra}</span>`);
  const raio = Math.max(h * 0.55, 30);
  const htmlAmigos = bolas
    .map((b, i) => {
      const p = POSICOES[i];
      const left = w / 2 + p.x * raio - BOLA / 2;
      const top = p.y * raio + h * 0.2 - BOLA / 2;
      return `<span class="pin-amigo" style="left:${left.toFixed(0)}px;top:${top.toFixed(0)}px;animation-delay:${(i * 0.45).toFixed(2)}s">${b}</span>`;
    })
    .join("");
  const logo = l.logo_url ? `<img src="${esc(l.logo_url)}" alt="" draggable="false" />` : `<span class="pin-inicial">${esc(iniciais(l.nome))}</span>`;
  const etiqueta = `<span class="pin-etiqueta" style="left:${w + 2}px;top:${Math.round(h * 0.18 - BOLA / 2)}px"><span class="pin-logo">${logo}</span>${
    opts.comNome ? `<span class="pin-nome">${esc(l.nome)}</span>` : ""
  }</span>`;
  return L.divIcon({
    className: `pin-rovibes pin-lugar${opts.foco ? " pin-foco" : ""}${opts.apagado ? " pin-apagado" : ""}`,
    html: `<img class="pin-marca" src="/marca/rovibes-pin.webp" alt="" width="${w}" height="${h}" draggable="false" />${htmlAmigos}${etiqueta}`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
  });
}

/**
 * Pins dos lugares: o tamanho acompanha quantas pessoas estão lá agora (check-ins válidos),
 * com os amigos flutuando em volta e uma etiqueta com a logo e o nome (o nome aparece com mais zoom).
 */
export function PinsLugares({
  lugares,
  amigos,
  selecionado,
  apagado,
  aoClicar,
  aoClicarAmigos,
}: {
  lugares: Lugar[];
  amigos: Map<string, Amigos>;
  selecionado: string | null;
  apagado: (l: Lugar) => boolean;
  aoClicar: (id: string) => void;
  /** Toque nos círculos de amigos: abre a lista de quem está lá. */
  aoClicarAmigos: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(13);
  useMapEvents({ zoomend: (e) => setZoom(e.target.getZoom()) });
  const comNome = zoom >= 14;
  const maximo = useMemo(() => Math.max(0, ...lugares.map((l) => amigos.get(l.id)?.presentes ?? 0)), [lugares, amigos]);

  return (
    <>
      {lugares.map((l) => {
        const a = amigos.get(l.id);
        const foco = l.id === selecionado;
        const h = alturaPin(a?.presentes ?? 0, maximo) + (foco ? 8 : 0);
        const icone = montarIcone(l, h, a, { foco, apagado: apagado(l), comNome: comNome || foco });
        return (
          <Marker
            key={l.id}
            position={[l.latitude!, l.longitude!]}
            icon={icone}
            title={l.nome}
            zIndexOffset={foco ? 2000 : Math.round(h * 10)}
            bubblingMouseEvents={false}
            eventHandlers={{
              click: (e) => {
                const alvo = (e.originalEvent?.target ?? null) as HTMLElement | null;
                if (alvo?.closest?.(".pin-amigo")) aoClicarAmigos(l.id);
                else aoClicar(l.id);
              },
            }}
          />
        );
      })}
    </>
  );
}

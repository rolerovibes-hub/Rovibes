import type { StyleSpecification } from "maplibre-gl";

// Mapa urbano minimalista do RoVibes (vetorial, OpenFreeMap / OpenMapTiles).
// A cidade fica neutra; roxo e rosa ficam só nos pins, filtros e estados ativos.

interface Cores {
  fundo: string;
  agua: string;
  verde: string;
  predio: string;
  ruaLocal: string;
  viaPrincipal: string;
  contornoVia: string;
  trilho: string;
  rotulo: string;
  rotuloForte: string;
  halo: string;
}

const NOTURNO: Cores = {
  fundo: "#151923",
  agua: "#111A28",
  verde: "#202A30",
  predio: "#1A1F29",
  ruaLocal: "#29303D",
  viaPrincipal: "#41495A",
  contornoVia: "#151923",
  trilho: "#232A36",
  rotulo: "#6E7689",
  rotuloForte: "#9AA2B4",
  halo: "#151923",
};

// Modo claro: fundo claro e ruas, avenidas e nomes em cinza para dar contraste.
const DIURNO: Cores = {
  fundo: "#EEF0F4",
  agua: "#BCCDE3",
  verde: "#D3E2D6",
  predio: "#DADEE5",
  ruaLocal: "#C4CAD4",
  viaPrincipal: "#A8B0BD",
  contornoVia: "#8F98A7",
  trilho: "#AEB4BF",
  rotulo: "#525A6B",
  rotuloForte: "#2F3645",
  halo: "#EEF0F4",
};

const linha = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const area = ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false];
const classe = (...c: string[]) => ["match", ["get", "class"], c, true, false];
const largura = (pares: [number, number][]) => ["interpolate", ["exponential", 1.5], ["zoom"], ...pares.flat()];
const nome = ["coalesce", ["get", "name:pt"], ["get", "name"]];

export const ATRIBUICAO =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

export function estiloMapa(escuro: boolean): StyleSpecification {
  const c = escuro ? NOTURNO : DIURNO;
  const camadas: unknown[] = [
    { id: "fundo", type: "background", paint: { "background-color": c.fundo } },
    { id: "verde", type: "fill", source: "omt", "source-layer": "park", filter: area, paint: { "fill-color": c.verde } },
    {
      id: "vegetacao",
      type: "fill",
      source: "omt",
      "source-layer": "landcover",
      filter: ["all", area, classe("wood", "grass")],
      paint: { "fill-color": c.verde, "fill-opacity": 0.8 },
    },
    { id: "agua", type: "fill", source: "omt", "source-layer": "water", filter: area, paint: { "fill-color": c.agua } },
    {
      id: "rios",
      type: "line",
      source: "omt",
      "source-layer": "waterway",
      paint: { "line-color": c.agua, "line-width": largura([[10, 0.5], [16, 3]]) },
    },
    {
      id: "predios",
      type: "fill",
      source: "omt",
      "source-layer": "building",
      minzoom: 15,
      paint: { "fill-color": c.predio, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, 1] },
    },
    {
      id: "trilhos",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      minzoom: 12,
      filter: ["all", linha, classe("rail", "transit")],
      paint: { "line-color": c.trilho, "line-width": 1, "line-dasharray": [3, 3] },
    },
    {
      id: "ruas-locais",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      minzoom: 12,
      filter: ["all", linha, classe("minor", "service")],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": c.ruaLocal,
        "line-width": largura([[12, 0.4], [14, 1.2], [16, 4], [18, 10]]),
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.5, 14, 1],
      },
    },
    {
      id: "vias-contorno",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["all", linha, classe("primary", "secondary", "tertiary", "trunk", "motorway")],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": c.contornoVia, "line-width": largura([[10, 1], [14, 4], [16, 9], [18, 20]]) },
    },
    {
      id: "vias-principais",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["all", linha, classe("primary", "secondary", "tertiary", "trunk", "motorway")],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": c.viaPrincipal, "line-width": largura([[10, 0.6], [14, 2.5], [16, 7], [18, 16]]) },
    },
    {
      id: "nome-vias",
      type: "symbol",
      source: "omt",
      "source-layer": "transportation_name",
      minzoom: 15,
      filter: classe("primary", "secondary", "tertiary", "trunk", "motorway"),
      layout: {
        "symbol-placement": "line",
        "text-field": nome,
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-max-angle": 30,
        "symbol-spacing": 400,
      },
      paint: { "text-color": c.rotulo, "text-halo-color": c.halo, "text-halo-width": 1.5 },
    },
    {
      id: "nome-ruas",
      type: "symbol",
      source: "omt",
      "source-layer": "transportation_name",
      minzoom: 17,
      filter: classe("minor"),
      layout: {
        "symbol-placement": "line",
        "text-field": nome,
        "text-font": ["Noto Sans Regular"],
        "text-size": 10.5,
        "symbol-spacing": 500,
      },
      paint: { "text-color": c.rotulo, "text-halo-color": c.halo, "text-halo-width": 1.5 },
    },
    {
      id: "bairros",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      minzoom: 12,
      filter: classe("suburb", "neighbourhood", "quarter"),
      layout: {
        "text-field": nome,
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10.5, 16, 13],
        "text-padding": 24,
        "text-max-width": 8,
      },
      paint: { "text-color": c.rotulo, "text-halo-color": c.halo, "text-halo-width": 1.5 },
    },
    {
      id: "cidades",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      maxzoom: 13,
      filter: classe("city", "town"),
      layout: { "text-field": nome, "text-font": ["Noto Sans Regular"], "text-size": 14 },
      paint: { "text-color": c.rotuloForte, "text-halo-color": c.halo, "text-halo-width": 1.5 },
    },
  ];

  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: { omt: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
    layers: camadas as StyleSpecification["layers"],
  };
}

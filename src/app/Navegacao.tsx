import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import L from "leaflet";
import { CircleMarker, Polyline, useMap, useMapEvents } from "react-leaflet";
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Car,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Footprints,
  LocateFixed,
  RotateCw,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { MapaBase, PinMapa, corDoTema } from "@/components/MapaBase";
import { gravar, ler } from "@/lib/armazenamento";

type Modo = "carro" | "pe";
type Ponto = [number, number];

interface Passo {
  texto: string;
  tipo: string;
  modificador: string;
  local: Ponto;
  distancia: number;
}

interface Rota {
  linha: Ponto[];
  passos: Passo[];
  distancia: number;
  duracao: number;
}

const SERVIDORES: Record<Modo, string[]> = {
  carro: ["https://routing.openstreetmap.de/routed-car/route/v1/driving", "https://router.project-osrm.org/route/v1/driving"],
  pe: ["https://routing.openstreetmap.de/routed-foot/route/v1/foot"],
};

// ---------- geometria ----------
const R = 6371000;
const rad = (g: number) => (g * Math.PI) / 180;
export function distanciaM(a: Ponto, b: Ponto) {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Distância do ponto até a linha da rota (aproximação plana, boa para trechos curtos). */
function distanciaAteLinha(p: Ponto, linha: Ponto[]) {
  const kx = Math.cos(rad(p[0])) * 111320;
  const ky = 110540;
  let melhor = Infinity;
  for (let i = 0; i < linha.length - 1; i++) {
    const ax = (linha[i][1] - p[1]) * kx, ay = (linha[i][0] - p[0]) * ky;
    const bx = (linha[i + 1][1] - p[1]) * kx, by = (linha[i + 1][0] - p[0]) * ky;
    const dx = bx - ax, dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
    melhor = Math.min(melhor, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return melhor;
}

// ---------- instruções em português ----------
const LADO: Record<string, string> = {
  left: "à esquerda",
  right: "à direita",
  "slight left": "levemente à esquerda",
  "slight right": "levemente à direita",
  "sharp left": "fechado à esquerda",
  "sharp right": "fechado à direita",
  straight: "em frente",
  uturn: "e faça o retorno",
};

function instrucao(tipo: string, mod: string, nome: string, saida?: number) {
  const via = nome ? ` na ${nome}` : "";
  const lado = LADO[mod] ?? "";
  switch (tipo) {
    case "depart":
      return nome ? `Siga pela ${nome}` : "Siga em frente";
    case "arrive":
      return "Você chegou ao destino";
    case "roundabout":
    case "rotary":
    case "roundabout turn":
      return `Na rotatória, pegue a ${saida ?? 1}ª saída${via}`;
    case "fork":
      return `Na bifurcação, mantenha-se ${lado || "em frente"}${via}`;
    case "end of road":
      return `No fim da via, vire ${lado}${via}`;
    case "merge":
      return `Entre ${lado}${via}`.trim();
    case "on ramp":
    case "off ramp":
      return `Pegue o acesso ${lado}${via}`.trim();
    case "new name":
      return `Continue${via}`;
    case "continue":
      return mod === "uturn" ? "Faça o retorno" : `Continue ${lado === "em frente" ? "em frente" : lado}${via}`.replace(/\s+/g, " ");
    default:
      return mod === "uturn" ? "Faça o retorno" : mod === "straight" ? `Siga em frente${via}` : `Vire ${lado}${via}`;
  }
}

function IconeManobra({ tipo, mod, className }: { tipo: string; mod: string; className?: string }) {
  if (tipo === "arrive") return <Flag className={className} />;
  if (tipo.includes("roundabout") || tipo === "rotary") return <RotateCw className={className} />;
  if (mod === "uturn") return <Undo2 className={className} />;
  if (mod === "left" || mod === "sharp left") return <CornerUpLeft className={className} />;
  if (mod === "right" || mod === "sharp right") return <CornerUpRight className={className} />;
  if (mod === "slight left") return <ArrowUpLeft className={className} />;
  if (mod === "slight right") return <ArrowUpRight className={className} />;
  return <ArrowUp className={className} />;
}

const metros = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);
const minutos = (s: number) => {
  const m = Math.max(1, Math.round(s / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

async function buscarRota(modo: Modo, de: Ponto, para: Ponto): Promise<Rota> {
  let ultimoErro: unknown;
  for (const base of SERVIDORES[modo]) {
    try {
      const url = `${base}/${de[1]},${de[0]};${para[1]},${para[0]}?overview=full&geometries=geojson&steps=true`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const rota = j.routes?.[0];
      if (!rota) throw new Error("sem rota");
      type Step = { distance: number; name: string; maneuver: { type: string; modifier?: string; location: [number, number]; exit?: number } };
      const passos: Passo[] = (rota.legs[0].steps as Step[]).map((s) => ({
        texto: instrucao(s.maneuver.type, s.maneuver.modifier ?? "straight", s.name, s.maneuver.exit),
        tipo: s.maneuver.type,
        modificador: s.maneuver.modifier ?? "straight",
        local: [s.maneuver.location[1], s.maneuver.location[0]],
        distancia: s.distance,
      }));
      return {
        linha: (rota.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
        passos,
        distancia: rota.distance,
        duracao: rota.duration,
      };
    } catch (e) {
      ultimoErro = e;
    }
  }
  throw ultimoErro ?? new Error("sem rota");
}

function falar(texto: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "pt-BR";
    window.speechSynthesis.speak(u);
  } catch {
    /* sem voz */
  }
}

/** Mantém o mapa no usuário enquanto "seguir" estiver ligado; arrastar desliga. */
function Acompanhar({ posicao, seguir, aoSoltar, linha }: { posicao: Ponto | null; seguir: boolean; aoSoltar: () => void; linha: Ponto[] }) {
  const mapa = useMap();
  const enquadrou = useRef(false);
  useMapEvents({ dragstart: aoSoltar });
  useEffect(() => {
    if (!enquadrou.current && linha.length > 1) {
      enquadrou.current = true;
      mapa.fitBounds(L.latLngBounds(linha), { padding: [40, 40] });
      return;
    }
    if (seguir && posicao) mapa.setView(posicao, Math.max(mapa.getZoom(), 17), { animate: true });
  }, [mapa, posicao, seguir, linha]);
  return null;
}

/** Navegação dentro do RoVibes: rota, posição em tempo real e instruções de cada manobra. */
export function Navegacao({ destino, fechar }: { destino: { nome: string; lat: number; lng: number }; fechar: () => void }) {
  const alvo: Ponto = useMemo(() => [destino.lat, destino.lng], [destino.lat, destino.lng]);
  const [modo, setModo] = useState<Modo>(() => ler<Modo>("navegacao_modo", "carro"));
  const [voz, setVoz] = useState(() => ler("navegacao_voz", true));
  const [posicao, setPosicao] = useState<Ponto | null>(null);
  const [precisao, setPrecisao] = useState<number | null>(null);
  const [rota, setRota] = useState<Rota | null>(null);
  const [passo, setPasso] = useState(1);
  const [seguir, setSeguir] = useState(true);
  const [erro, setErro] = useState("");
  const [calculando, setCalculando] = useState(false);
  const [chegou, setChegou] = useState(false);
  const ultimoCalculo = useRef(0);
  const foraDaRota = useRef(0);
  const avisado = useRef<string>("");

  // GPS contínuo.
  useEffect(() => {
    if (!navigator.geolocation) {
      setErro("Este aparelho não informa a localização.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setErro("");
        setPosicao([p.coords.latitude, p.coords.longitude]);
        setPrecisao(p.coords.accuracy);
      },
      (e) =>
        setErro(
          e.code === e.PERMISSION_DENIED
            ? "A localização está bloqueada para o RoVibes. Libere nas configurações do celular (Apps → RoVibes → Permissões → Localização) ou do navegador."
            : "Procurando o sinal do GPS... Verifique se a localização está ligada.",
        ),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Tela acesa durante a navegação.
  useEffect(() => {
    let trava: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((t) => (trava = t)).catch(() => undefined);
    return () => {
      void trava?.release().catch(() => undefined);
      window.speechSynthesis?.cancel();
    };
  }, []);

  const calcular = useCallback(
    async (de: Ponto, m: Modo) => {
      ultimoCalculo.current = Date.now();
      setCalculando(true);
      try {
        const r = await buscarRota(m, de, alvo);
        setRota(r);
        setPasso(1);
        foraDaRota.current = 0;
        avisado.current = "";
        setErro("");
      } catch {
        setErro("Não foi possível calcular a rota agora. Verifique a internet e tente de novo.");
      } finally {
        setCalculando(false);
      }
    },
    [alvo],
  );

  // Primeira rota quando o GPS responde; nova rota ao trocar o modo.
  useEffect(() => {
    if (posicao && !rota && !calculando && Date.now() - ultimoCalculo.current > 5000) void calcular(posicao, modo);
  }, [posicao, rota, calculando, calcular, modo]);

  const trocarModo = (m: Modo) => {
    setModo(m);
    gravar("navegacao_modo", m);
    setRota(null);
    if (posicao) void calcular(posicao, m);
  };

  // Acompanhamento: avança as manobras, recalcula se sair da rota, detecta a chegada.
  useEffect(() => {
    if (!posicao || !rota || chegou) return;
    const ate = distanciaM(posicao, alvo);
    if (ate < 35) {
      setChegou(true);
      if (voz) falar(`Você chegou a ${destino.nome}`);
      return;
    }
    const raio = modo === "carro" ? 30 : 15;
    let k = passo;
    while (k < rota.passos.length - 1 && distanciaM(posicao, rota.passos[k].local) < raio) k++;
    if (k !== passo) setPasso(k);
    const prox = rota.passos[k];
    const d = distanciaM(posicao, prox.local);
    const chave = `${k}`;
    if (voz && avisado.current !== chave && d < (modo === "carro" ? 180 : 60)) {
      avisado.current = chave;
      falar(d > 40 ? `Em ${metros(d)}, ${prox.texto.charAt(0).toLowerCase()}${prox.texto.slice(1)}` : prox.texto);
    }
    const desvio = distanciaAteLinha(posicao, rota.linha);
    const limite = Math.max(modo === "carro" ? 60 : 35, (precisao ?? 0) * 1.5);
    foraDaRota.current = desvio > limite ? foraDaRota.current + 1 : 0;
    if (foraDaRota.current >= 3 && Date.now() - ultimoCalculo.current > 15000 && !calculando) {
      if (voz) falar("Recalculando a rota");
      void calcular(posicao, modo);
    }
  }, [posicao, rota, passo, alvo, modo, voz, precisao, chegou, calculando, calcular, destino.nome]);

  const prox = rota?.passos[Math.min(passo, (rota?.passos.length ?? 1) - 1)];
  const distProx = posicao && prox ? distanciaM(posicao, prox.local) : null;
  const restante = rota && posicao && prox ? (distProx ?? 0) + rota.passos.slice(passo).reduce((s, p) => s + p.distancia, 0) : rota?.distancia ?? 0;
  const tempoRestante = rota ? (rota.duracao * restante) / Math.max(1, rota.distancia) : 0;
  const chegada = new Date(Date.now() + tempoRestante * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const depois = rota?.passos[passo + 1];
  const externo = `https://www.google.com/maps/dir/?api=1&destination=${destino.lat},${destino.lng}&travelmode=${modo === "carro" ? "driving" : "walking"}`;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-fundo" role="dialog" aria-modal="true" aria-label={`Navegação até ${destino.nome}`}>
      {/* Próxima manobra */}
      <div className="z-[600] bg-marca px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] text-marca-texto shadow-md">
        {chegou ? (
          <div className="flex items-center gap-3 py-1">
            <Flag className="h-9 w-9 shrink-0" />
            <div>
              <p className="text-lg font-semibold">Você chegou</p>
              <p className="text-sm opacity-90">{destino.nome}</p>
            </div>
          </div>
        ) : prox ? (
          <div className="flex items-center gap-3">
            <IconeManobra tipo={prox.tipo} mod={prox.modificador} className="h-10 w-10 shrink-0" />
            <div className="min-w-0 flex-1">
              {distProx != null && <p className="codigo text-2xl font-semibold leading-tight">{metros(distProx)}</p>}
              <p className="text-[15px] font-medium leading-snug">{prox.texto}</p>
              {depois && depois.tipo !== "arrive" && <p className="mt-0.5 truncate text-[12px] opacity-80">Depois: {depois.texto}</p>}
            </div>
          </div>
        ) : (
          <p className="py-2 text-[15px] font-medium">{erro || (calculando ? "Calculando a rota..." : "Procurando sua localização...")}</p>
        )}
      </div>

      <div className="relative flex-1">
        <MapaBase centro={posicao ?? alvo} zoom={15} className="h-full w-full">
          <Acompanhar posicao={posicao} seguir={seguir} aoSoltar={() => setSeguir(false)} linha={rota?.linha ?? []} />
          {rota && <Polyline positions={rota.linha} pathOptions={{ color: corDoTema("marca"), weight: 7, opacity: 0.9, lineCap: "round", lineJoin: "round" }} />}
          <PinMapa posicao={alvo} tamanho="grande" titulo={destino.nome} />
          {posicao && (
            <>
              {precisao != null && precisao > 25 && (
                <CircleMarker center={posicao} radius={Math.min(40, precisao / 3)} pathOptions={{ stroke: false, fillColor: corDoTema("azul"), fillOpacity: 0.15 }} />
              )}
              <CircleMarker center={posicao} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: corDoTema("azul"), fillOpacity: 1 }} />
            </>
          )}
        </MapaBase>

        {erro && prox && <p className="cartao absolute inset-x-3 top-3 z-[500] px-3 py-2 text-sm text-alerta">{erro}</p>}

        <div className="absolute right-3 top-3 z-[500] flex flex-col gap-2">
          <button
            className="botao h-11 w-11 px-0 shadow-sm"
            aria-label={voz ? "Desligar voz" : "Ligar voz"}
            onClick={() => {
              setVoz(!voz);
              gravar("navegacao_voz", !voz);
              if (voz) window.speechSynthesis?.cancel();
            }}
          >
            {voz ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
          </button>
        </div>
        {!seguir && (
          <button className="botao-principal absolute bottom-4 left-1/2 z-[500] -translate-x-1/2 rounded-full shadow-md" onClick={() => setSeguir(true)}>
            <LocateFixed className="h-4 w-4" />
            Centralizar
          </button>
        )}
      </div>

      {/* Resumo e controles */}
      <div className="z-[600] border-t border-borda bg-superficie px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {rota && !chegou ? (
              <>
                <p className="text-lg font-semibold">
                  {minutos(tempoRestante)} <span className="text-[15px] font-normal text-suave">· {metros(restante)}</span>
                </p>
                <p className="truncate text-[13px] text-suave">
                  Chegada às {chegada} · {destino.nome}
                </p>
              </>
            ) : (
              <p className="truncate font-semibold">{destino.nome}</p>
            )}
          </div>
          <button className="botao h-11 px-4 text-perigo" onClick={fechar}>
            <X className="h-4 w-4" />
            {chegou ? "Fechar" : "Encerrar"}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg border border-borda p-1" role="radiogroup" aria-label="Como você vai">
            {(
              [
                ["carro", "Carro", Car],
                ["pe", "A pé", Footprints],
              ] as const
            ).map(([m, nome, Icone]) => (
              <button
                key={m}
                role="radio"
                aria-checked={modo === m}
                onClick={() => modo !== m && trocarModo(m)}
                className={clsx("flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm", modo === m ? "bg-destaque-suave font-semibold text-destaque" : "text-suave")}
              >
                <Icone className="h-4 w-4" />
                {nome}
              </button>
            ))}
          </div>
          <a href={externo} target="_blank" rel="noreferrer" className="shrink-0 px-1 text-[12px] text-suave underline underline-offset-2">
            Outro app
          </a>
        </div>
        <p className="mt-2 text-[10px] text-suave">Rotas: OSRM · dados © OpenStreetMap. Respeite a sinalização e as leis de trânsito.</p>
      </div>
    </div>
  );
}

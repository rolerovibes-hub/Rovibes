import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Music2, Pause, Play, Search } from "lucide-react";
import { listarMusicas, Musica } from "@/lib/midia";

// Um só áudio de prévia no app: tocar outra música para a anterior.
let previa: HTMLAudioElement | null = null;
let ouvintes: ((url: string | null) => void)[] = [];
const avisar = (url: string | null) => ouvintes.forEach((f) => f(url));

export function tocarPrevia(url: string | null) {
  if (!previa) {
    previa = new Audio();
    previa.loop = true;
  }
  if (!url || previa.src === new URL(url, window.location.href).href) {
    previa.pause();
    previa.removeAttribute("src");
    avisar(null);
    return;
  }
  previa.src = url;
  void previa.play().catch(() => avisar(null));
  avisar(url);
}

export function pararPrevia() {
  if (previa?.src) tocarPrevia(null);
}

function useTocando() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    ouvintes.push(setUrl);
    return () => {
      ouvintes = ouvintes.filter((f) => f !== setUrl);
    };
  }, []);
  return (u: string) => !!url && new URL(u, window.location.href).href === new URL(url, window.location.href).href;
}

/** Escolha de música da biblioteca do RoVibes, por estilo, com prévia. */
export function EscolherMusica({ valor, mudar }: { valor: Musica | null; mudar: (m: Musica | null) => void }) {
  const [lista, setLista] = useState<Musica[] | null | undefined>(undefined);
  const [estilo, setEstilo] = useState("");
  const [busca, setBusca] = useState("");
  const tocando = useTocando();
  useEffect(() => {
    void listarMusicas().then(setLista);
    return () => pararPrevia();
  }, []);

  const estilos = useMemo(() => [...new Set((lista ?? []).map((m) => m.estilo).filter((e): e is string => !!e))].sort(), [lista]);
  const t = busca.trim().toLowerCase();
  const vis = (lista ?? []).filter((m) => (!estilo || m.estilo === estilo) && (!t || `${m.titulo} ${m.artista ?? ""} ${m.estilo ?? ""}`.toLowerCase().includes(t)));

  if (lista === undefined) return <p className="text-[13px] text-suave">Carregando músicas...</p>;
  if (lista === null || lista.length === 0) return <p className="text-[13px] text-suave">Nenhuma música disponível.</p>;

  return (
    <div className="space-y-2">
      {estilos.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {["", ...estilos].map((e) => (
            <button
              key={e || "todas"}
              onClick={() => setEstilo(e)}
              className={clsx("shrink-0 rounded-full border px-3 py-1 text-[12px]", estilo === e ? "border-marca bg-marca text-marca-texto" : "border-borda text-suave")}
            >
              {e || "Todas"}
            </button>
          ))}
        </div>
      )}
      {lista.length > 8 && (
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
          <input className="h-9 w-full rounded-lg border border-borda bg-fundo pl-9 pr-3 text-sm focus:border-marca focus:outline-none" placeholder="Buscar música" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      )}
      <ul className="max-h-56 divide-y divide-borda overflow-y-auto overscroll-contain rounded-lg border border-borda">
        {vis.map((m) => {
          const escolhida = valor?.id === m.id;
          return (
            <li key={m.id} className={clsx("flex items-center gap-2 px-2 py-1.5", escolhida && "bg-destaque-suave")}>
              <button
                onClick={() => tocarPrevia(m.arquivo_url)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elevado"
                aria-label={tocando(m.arquivo_url) ? "Pausar" : `Ouvir ${m.titulo}`}
              >
                {tocando(m.arquivo_url) ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => mudar(escolhida ? null : m)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.titulo}</span>
                  <span className="block truncate text-[11.5px] text-suave">{[m.artista, m.estilo].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={clsx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border", escolhida ? "border-marca bg-marca text-marca-texto" : "border-borda")}>
                  {escolhida && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            </li>
          );
        })}
        {vis.length === 0 && <li className="px-3 py-3 text-sm text-suave">Nada encontrado.</li>}
      </ul>
    </div>
  );
}

/** Música de uma publicação de fotos: toque para ouvir. */
export function ChipMusica({ musica, claro }: { musica: { titulo: string; artista: string | null; arquivo_url: string }; claro?: boolean }) {
  const tocando = useTocando();
  const ativo = tocando(musica.arquivo_url);
  const ref = useRef(ativo);
  ref.current = ativo;
  // Saiu da tela tocando: para a música.
  useEffect(
    () => () => {
      if (ref.current) pararPrevia();
    },
    [],
  );
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        tocarPrevia(musica.arquivo_url);
      }}
      className={clsx("inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", claro ? "bg-white/15 text-white backdrop-blur" : "bg-elevado")}
      aria-label={ativo ? "Pausar música" : "Ouvir música"}
    >
      {ativo ? <Pause className="h-3.5 w-3.5 shrink-0" /> : <Music2 className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">
        {musica.titulo}
        {musica.artista ? ` · ${musica.artista}` : ""}
      </span>
    </button>
  );
}


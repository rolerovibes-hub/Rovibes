import { ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Store, X } from "lucide-react";
import { GrupoStories, marcarVisto, tempoAtras } from "./conteudo";

const DURACAO = 5000;

/** Visualizador de stories em tela cheia: toque à direita avança, à esquerda volta. */
export function VisorStories({
  grupos,
  inicio,
  usuario,
  fechar,
}: {
  grupos: GrupoStories[];
  inicio: number;
  usuario: string;
  fechar: () => void;
}) {
  const [g, setG] = useState(inicio);
  const [s, setS] = useState(0);
  const [pausado, setPausado] = useState(false);
  const grupo = grupos[g];
  const story = grupo?.stories[s];

  const avancar = () => {
    if (!grupo) return fechar();
    if (s < grupo.stories.length - 1) setS(s + 1);
    else if (g < grupos.length - 1) {
      setG(g + 1);
      setS(0);
    } else fechar();
  };
  const voltar = () => {
    if (s > 0) setS(s - 1);
    else if (g > 0) {
      setG(g - 1);
      setS(grupos[g - 1].stories.length - 1);
    }
  };

  useEffect(() => {
    if (story) void marcarVisto(story.id, usuario);
  }, [story, usuario]);

  useEffect(() => {
    if (pausado || !story) return;
    const t = window.setTimeout(avancar, DURACAO);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, s, pausado]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
      if (e.key === "ArrowRight") avancar();
      if (e.key === "ArrowLeft") voltar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  if (!grupo || !story) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label={`Stories de ${grupo.autor.nome}`}>
      <div className="relative h-full w-full max-w-md">
        <img src={story.foto_url} alt={story.legenda ?? ""} className="absolute inset-0 h-full w-full object-contain" />

        <div className="absolute inset-x-0 top-0 space-y-3 bg-gradient-to-b from-black/60 to-transparent p-3 pt-[max(12px,env(safe-area-inset-top))]">
          <div key={g} className="flex gap-1">
            {grupo.stories.map((x, i) => (
              <span key={x.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                <span
                  className="block h-full bg-white"
                  style={{
                    width: i < s ? "100%" : i > s ? "0%" : undefined,
                    animation: i === s && !pausado ? `progresso-story ${DURACAO}ms linear forwards` : undefined,
                  }}
                />
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2.5 text-white">
            <Link to={`/lugar/${grupo.autor.id}`} onClick={fechar} className="flex min-w-0 flex-1 items-center gap-2.5">
              {grupo.autor.logo_url ? (
                <img src={grupo.autor.logo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  <Store className="h-4 w-4" />
                </span>
              )}
              <span className="truncate text-sm font-semibold">{grupo.autor.nome}</span>
              <span className="text-[13px] text-white/70">{tempoAtras(story.criado_em)}</span>
            </Link>
            <button onClick={fechar} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <button className="absolute bottom-24 left-0 top-24 w-1/3" aria-label="Story anterior" onClick={voltar} />
        <button
          className="absolute bottom-24 right-0 top-24 w-2/3"
          aria-label="Próximo story"
          onClick={avancar}
          onPointerDown={() => setPausado(true)}
          onPointerUp={() => setPausado(false)}
          onPointerLeave={() => setPausado(false)}
        />

        {story.legenda && (
          <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-10 text-center text-[15px] text-white">
            {story.legenda}
          </p>
        )}
      </div>
    </div>
  );
}

/** Círculo do lugar na barra de stories: anel magenta enquanto houver story não visto. */
export function AnelStory({ visto, children }: { visto: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex rounded-full p-[2.5px] ${visto ? "bg-borda" : "bg-magenta"}`}>
      <span className="inline-flex rounded-full bg-fundo p-[2px]">{children}</span>
    </span>
  );
}

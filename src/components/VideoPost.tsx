import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { ProgressoVideo } from "./ProgressoVideo";

/** Vídeo de publicação: toca sozinho (mudo) quando aparece na tela e pausa quando sai; toque liga o som (ou abre em tela cheia, com `aoAbrir`). */
export function VideoPost({
  src,
  capa,
  className,
  aoAbrir,
  somNoTopo,
  mudo: mudoFora,
  semBotaoSom,
}: {
  src: string;
  capa?: string | null;
  className?: string;
  aoAbrir?: () => void;
  somNoTopo?: boolean;
  /** Som controlado por fora (botão de som na barra de ações do Feed). */
  mudo?: boolean;
  semBotaoSom?: boolean;
}) {
  const v = useRef<HTMLVideoElement>(null);
  const [mudoProprio, setMudo] = useState(true);
  const mudo = mudoFora ?? mudoProprio;

  useEffect(() => {
    const el = v.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && e.intersectionRatio > 0.6) void el.play().catch(() => undefined);
        else el.pause();
      },
      { threshold: [0, 0.6, 1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="relative bg-black">
      <video
        ref={v}
        src={src}
        poster={capa ?? undefined}
        muted={mudo}
        loop
        playsInline
        preload="metadata"
        onClick={() => (aoAbrir ? aoAbrir() : setMudo((m) => !m))}
        className={className ?? "max-h-[520px] w-full object-cover"}
      />
      <ProgressoVideo video={v} className="bottom-0" />
      {!semBotaoSom && (
      <button onClick={() => setMudo((m) => !m)} className={clsx("absolute right-3 z-10 rounded-full bg-black/55 p-2 text-white", somNoTopo ? "top-16" : "bottom-3")} aria-label={mudo ? "Ligar o som" : "Tirar o som"}>
        {mudo ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      )}
    </div>
  );
}

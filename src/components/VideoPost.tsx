import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

/** Vídeo de publicação: toca sozinho (mudo) quando aparece na tela e pausa quando sai; toque liga o som (ou abre em tela cheia, com `aoAbrir`). */
export function VideoPost({ src, capa, className, aoAbrir }: { src: string; capa?: string | null; className?: string; aoAbrir?: () => void }) {
  const v = useRef<HTMLVideoElement>(null);
  const [mudo, setMudo] = useState(true);

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
      <button onClick={() => setMudo((m) => !m)} className="absolute bottom-3 right-3 rounded-full bg-black/55 p-2 text-white" aria-label={mudo ? "Ligar o som" : "Tirar o som"}>
        {mudo ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

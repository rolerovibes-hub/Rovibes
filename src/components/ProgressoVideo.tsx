import { RefObject, useEffect, useRef } from "react";
import clsx from "clsx";

/** Barra fina de progresso do vídeo (como a dos stories): mostra quanto falta para acabar. */
export function ProgressoVideo({ video, className }: { video: RefObject<HTMLVideoElement>; className?: string }) {
  const barra = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let quadro = 0;
    const atualizar = () => {
      const v = video.current;
      const b = barra.current;
      if (v && b) {
        const total = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
        b.style.transform = `scaleX(${total ? Math.min(1, v.currentTime / total) : 0})`;
      }
      quadro = requestAnimationFrame(atualizar);
    };
    quadro = requestAnimationFrame(atualizar);
    return () => cancelAnimationFrame(quadro);
  }, [video]);
  return (
    <span className={clsx("pointer-events-none absolute inset-x-0 z-10 block h-[3px] overflow-hidden bg-white/25", className)} aria-hidden="true">
      <span ref={barra} className="block h-full origin-left bg-white" style={{ transform: "scaleX(0)" }} />
    </span>
  );
}

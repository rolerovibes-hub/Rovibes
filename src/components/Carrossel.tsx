import { useRef, useState } from "react";
import clsx from "clsx";

/** Fotos lado a lado: arrasta para o lado, com pontinhos e contador. */
export function Carrossel({
  fotos,
  aoTocar,
  cheio,
  className,
}: {
  fotos: string[];
  aoTocar?: (i: number) => void;
  /** Tela cheia (visor): foto inteira, sem cortar. */
  cheio?: boolean;
  className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const aoRolar = () => {
    const el = caixa.current;
    if (el) setAtual(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  return (
    <div className={clsx("relative", className)}>
      <div
        ref={caixa}
        onScroll={aoRolar}
        data-rolagem
        className={clsx("flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", cheio && "touch-pan-x")}
      >
        {fotos.map((f, i) => (
          <button
            key={`${f}-${i}`}
            type="button"
            onClick={(e) => {
              if (!aoTocar) return;
              e.stopPropagation();
              aoTocar(i);
            }}
            className={clsx("block w-full shrink-0 snap-center snap-always", cheio ? "flex h-full items-center justify-center" : "")}
            aria-label={`Foto ${i + 1} de ${fotos.length}`}
            tabIndex={aoTocar ? 0 : -1}
          >
            <img src={f} alt="" draggable={false} loading={i > 1 ? "lazy" : undefined} className={cheio ? "max-h-full w-full object-contain" : "aspect-[4/5] max-h-[520px] w-full object-cover"} />
          </button>
        ))}
      </div>
      {fotos.length > 1 && (
        <>
          <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[12px] font-semibold text-white">
            {atual + 1}/{fotos.length}
          </span>
          <span className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1">
            {fotos.map((_, i) => (
              <span key={i} className={clsx("h-1.5 rounded-full transition-all", i === atual ? "w-4 bg-white" : "w-1.5 bg-white/55")} />
            ))}
          </span>
        </>
      )}
    </div>
  );
}

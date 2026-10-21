import { MouseEvent, ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Foto de perfil em tamanho maior: quadrado com cantos arredondados, 80% da tela. Toque fora fecha. */
export function FotoAmpliada({ src, nome, fechar }: { src: string; nome?: string; fechar: () => void }) {
  useEffect(() => {
    // Fecha só a foto (e não a publicação aberta por baixo).
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      fechar();
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [fechar]);

  return createPortal(
    <div
      className="surgir fixed inset-0 z-[95] flex flex-col items-center justify-center gap-3 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={nome ? `Foto de ${nome}` : "Foto"}
      onClick={(e) => {
        e.stopPropagation();
        fechar();
      }}
    >
      <img src={src} alt={nome ? `Foto de ${nome}` : ""} className="aspect-square w-[80vmin] max-w-[560px] rounded-3xl object-cover shadow-2xl" onClick={(e) => e.stopPropagation()} />
      {nome && <p className="max-w-[80vmin] truncate text-[15px] font-semibold text-white">{nome}</p>}
      <button className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] rounded-full bg-white/15 p-2 text-white" aria-label="Fechar" onClick={fechar}>
        <X className="h-5 w-5" />
      </button>
    </div>,
    document.body,
  );
}

/** Envolve uma foto de perfil: o toque amplia a foto (e não abre o link em volta). */
export function Ampliavel({ src, nome, children, className }: { src: string | null | undefined; nome?: string; children: ReactNode; className?: string }) {
  const [aberta, setAberta] = useState(false);
  if (!src) return <>{children}</>;
  const abrir = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAberta(true);
  };
  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={nome ? `Ampliar foto de ${nome}` : "Ampliar foto"}
        className={className ?? "inline-flex shrink-0 cursor-zoom-in"}
        onClick={abrir}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setAberta(true);
          }
        }}
      >
        {children}
      </span>
      {aberta && <FotoAmpliada src={src} nome={nome} fechar={() => setAberta(false)} />}
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { RotateCw } from "lucide-react";

const LIMITE = 80;
const MAXIMO = 130;

/** O toque começou em algo que já tem o próprio arrasto (mapa, janela, lista que rola, hub)? */
function temArrastoProprio(alvo: EventTarget | null) {
  let el = alvo instanceof Element ? alvo : null;
  if (!el || el.closest("input, textarea, select, canvas, [contenteditable], [data-sem-puxar], .maplibregl-map, .leaflet-container")) return true;
  while (el && el !== document.body && el !== document.documentElement) {
    const s = getComputedStyle(el);
    if (s.position === "fixed") return true;
    if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Puxar a tela para baixo (já no topo) e soltar recarrega o app.
 * Não atrapalha mapas, janelas abertas, listas que rolam por dentro nem o VibeCut.
 */
export function PuxarParaAtualizar() {
  const [puxado, setPuxado] = useState(0);
  const [recarregando, setRecarregando] = useState(false);
  const inicio = useRef<{ x: number; y: number; decidido: boolean } | null>(null);
  const valor = useRef(0);
  const vibrou = useRef(false);
  const recarregandoRef = useRef(false);

  useEffect(() => {
    const mudar = (v: number) => {
      valor.current = v;
      setPuxado(v);
    };
    const comecar = (e: TouchEvent) => {
      inicio.current = null;
      if (e.touches.length !== 1 || recarregandoRef.current) return;
      if ((document.scrollingElement?.scrollTop ?? window.scrollY) > 0) return;
      if (document.body.style.overflow === "hidden" || document.querySelector('[aria-modal="true"]')) return;
      if (temArrastoProprio(e.target)) return;
      inicio.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, decidido: false };
      vibrou.current = false;
    };
    const mover = (e: TouchEvent) => {
      const s = inicio.current;
      if (!s) return;
      if (e.defaultPrevented || e.touches.length !== 1) {
        inicio.current = null;
        return mudar(0);
      }
      const dy = e.touches[0].clientY - s.y;
      const dx = e.touches[0].clientX - s.x;
      if (!s.decidido) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (dy <= 0 || Math.abs(dx) > dy) {
          inicio.current = null;
          return;
        }
        s.decidido = true;
      }
      if ((document.scrollingElement?.scrollTop ?? 0) > 0 || dy <= 0) return mudar(0);
      const v = Math.min(MAXIMO, dy * 0.5);
      if (v >= LIMITE && !vibrou.current) {
        vibrou.current = true;
        try {
          navigator.vibrate?.(10);
        } catch {
          /* sem vibração */
        }
      } else if (v < LIMITE) vibrou.current = false;
      mudar(v);
    };
    const soltar = () => {
      if (!inicio.current) return;
      inicio.current = null;
      if (valor.current >= LIMITE) {
        recarregandoRef.current = true;
        setRecarregando(true);
        mudar(LIMITE * 0.75);
        window.setTimeout(() => window.location.reload(), 250);
      } else mudar(0);
    };
    window.addEventListener("touchstart", comecar, { passive: true });
    window.addEventListener("touchmove", mover, { passive: true });
    window.addEventListener("touchend", soltar);
    window.addEventListener("touchcancel", soltar);
    return () => {
      window.removeEventListener("touchstart", comecar);
      window.removeEventListener("touchmove", mover);
      window.removeEventListener("touchend", soltar);
      window.removeEventListener("touchcancel", soltar);
    };
  }, []);

  if (!puxado && !recarregando) return null;
  const pronto = puxado >= LIMITE || recarregando;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center"
      style={{ transform: `translateY(${puxado - 44}px)`, transition: inicio.current ? "none" : "transform 200ms ease-out" }}
      aria-live="polite"
    >
      <span
        className={clsx(
          "mt-[env(safe-area-inset-top)] flex h-10 w-10 items-center justify-center rounded-full shadow-lg ring-1 ring-borda transition-colors",
          pronto ? "bg-marca text-marca-texto" : "bg-superficie text-suave",
        )}
        style={{ opacity: Math.min(1, puxado / 40) || 1 }}
      >
        <RotateCw className={clsx("h-5 w-5", recarregando && "animate-spin")} style={recarregando ? undefined : { transform: `rotate(${(puxado / LIMITE) * 300}deg)` }} />
      </span>
      <span className="sr-only">{recarregando ? "Atualizando" : pronto ? "Solte para atualizar" : "Puxe para atualizar"}</span>
    </div>
  );
}

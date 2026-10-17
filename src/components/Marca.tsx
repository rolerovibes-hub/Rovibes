import clsx from "clsx";

/** Símbolo RoVibes: três barras, como um medidor de movimento. */
export function Simbolo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx("h-7 w-7 shrink-0", className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-marca" />
      <rect x="8" y="17" width="4" height="7" rx="2" fill="#fff" />
      <rect x="14" y="11" width="4" height="13" rx="2" fill="#fff" />
      <rect x="20" y="14" width="4" height="10" rx="2" fill="#fff" opacity=".7" />
    </svg>
  );
}

export function Marca({ complemento }: { complemento?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Simbolo />
      <span className="text-[17px] font-semibold tracking-tight">
        RoVibes
        {complemento && <span className="ml-1.5 font-normal text-suave">{complemento}</span>}
      </span>
    </span>
  );
}

export type Movimento = "tranquilo" | "moderado" | "cheio";

const NIVEL: Record<Movimento, number> = { tranquilo: 1, moderado: 2, cheio: 3 };

/** Medidor de movimento: as mesmas três barras do símbolo, preenchidas pelo nível. */
export function MedidorMovimento({ nivel, rotulo = true }: { nivel: Movimento; rotulo?: boolean }) {
  const n = NIVEL[nivel];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-suave">
      <span className="inline-flex items-end gap-[3px]" aria-hidden="true">
        {[6, 10, 14].map((h, i) => (
          <span
            key={h}
            style={{ height: h }}
            className={clsx("w-[4px] rounded-full", i < n ? "bg-marca" : "bg-borda")}
          />
        ))}
      </span>
      {rotulo && <span className="capitalize">{nivel}</span>}
    </span>
  );
}

import clsx from "clsx";

/** Pin da marca (ícone). */
export function Simbolo({ className }: { className?: string }) {
  return <img src="/marca/rovibes-pin.webp" alt="" aria-hidden="true" className={clsx("h-7 w-auto shrink-0", className)} />;
}

/** Nome "RoVibes" da logo. Com complemento (ex.: Business), usa o pin + texto, mais discreto. */
export function Marca({ complemento, className }: { complemento?: string; className?: string }) {
  if (complemento) {
    return (
      <span className="inline-flex items-center gap-2">
        <Simbolo className="h-7" />
        <span className="text-[17px] font-semibold tracking-tight">
          RoVibes<span className="ml-1.5 font-normal text-suave">{complemento}</span>
        </span>
      </span>
    );
  }
  return <img src="/marca/rovibes-nome.webp" alt="RoVibes" className={clsx("h-8 w-auto", className)} />;
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

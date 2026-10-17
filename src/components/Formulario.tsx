import { ReactNode } from "react";
import clsx from "clsx";

export function Campo({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="rotulo mb-1 block">{rotulo}</span>
      {children}
    </label>
  );
}

export function Secao({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="cartao p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function Aviso({ tipo, children }: { tipo: "erro" | "ok"; children: ReactNode }) {
  return (
    <p
      role={tipo === "erro" ? "alert" : "status"}
      className={clsx(
        "rounded-cartao border px-4 py-3 text-sm",
        tipo === "erro" ? "border-perigo/40 bg-perigo/10 text-perigo" : "border-ok/40 bg-ok/10 text-ok",
      )}
    >
      {children}
    </p>
  );
}

export const reais = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

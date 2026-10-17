import { useState } from "react";
import clsx from "clsx";
import { MedidorMovimento } from "@/components/Marca";
import { LUGARES } from "./exemplos";

// Mapa ilustrativo. O mapa real de Uberlândia entra na fase 2.
export function Mapa() {
  const [selecionado, setSelecionado] = useState(LUGARES[0].id);
  const lugar = LUGARES.find((l) => l.id === selecionado) ?? LUGARES[0];

  return (
    <div className="relative h-[calc(100vh-56px-72px)] min-h-[420px] overflow-hidden">
      <div
        className="absolute inset-0 bg-elevado"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--borda)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--borda)) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
        aria-hidden="true"
      />
      {LUGARES.map((l) => (
        <button
          key={l.id}
          onClick={() => setSelecionado(l.id)}
          style={{ left: `${l.x}%`, top: `${l.y}%` }}
          className={clsx(
            "absolute -translate-x-1/2 -translate-y-full rounded-full border-2 px-2.5 py-1 text-[12px] font-semibold shadow-sm transition-colors",
            l.id === selecionado ? "border-marca bg-marca text-marca-texto" : "border-borda bg-superficie text-texto",
          )}
          aria-pressed={l.id === selecionado}
        >
          {l.nome}
        </button>
      ))}

      <div className="cartao absolute inset-x-4 bottom-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{lugar.nome}</h2>
            <p className="text-[13px] text-suave">
              {lugar.categoria} · {lugar.bairro} · {lugar.distancia}
            </p>
          </div>
          <MedidorMovimento nivel={lugar.movimento} />
        </div>
        <button className="botao-principal mt-3 w-full">Ver lugar</button>
      </div>
      <p className="absolute left-4 top-3 rounded-md bg-superficie/90 px-2 py-1 text-xs text-suave">Mapa ilustrativo</p>
    </div>
  );
}

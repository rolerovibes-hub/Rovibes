import clsx from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";
import { Tema, useTema } from "@/lib/tema";

const OPCOES: { valor: Tema; nome: string; icone: typeof Sun }[] = [
  { valor: "escuro", nome: "Escuro", icone: Moon },
  { valor: "claro", nome: "Claro", icone: Sun },
  { valor: "sistema", nome: "Seguir o aparelho", icone: Monitor },
];

export function SeletorTema() {
  const { tema, definir } = useTema();
  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">
      {OPCOES.map(({ valor, nome, icone: Icone }) => (
        <button
          key={valor}
          role="radio"
          aria-checked={tema === valor}
          onClick={() => definir(valor)}
          className={clsx(
            "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-[13px] transition-colors",
            tema === valor ? "border-marca bg-destaque-suave font-semibold" : "border-borda hover:bg-elevado",
          )}
        >
          <Icone className={clsx("h-4 w-4", tema === valor ? "text-destaque" : "text-suave")} />
          {nome}
        </button>
      ))}
    </div>
  );
}

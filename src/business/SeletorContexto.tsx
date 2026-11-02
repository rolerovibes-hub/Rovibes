import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";
import { NOME_PAPEL, useBusiness } from "@/lib/acessos";

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** Contexto ativo (estabelecimento) sempre visível no topo, com troca explícita. */
export function SeletorContexto() {
  const negocio = useBusiness();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => caixa.current && !caixa.current.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const atual = negocio.atual;
  if (!atual) return null;
  const varios = negocio.vinculos.length > 1;

  return (
    <div ref={caixa} className="relative min-w-0">
      <button
        type="button"
        onClick={() => varios && setAberto((a) => !a)}
        aria-expanded={aberto}
        className={clsx(
          "flex min-w-0 items-center gap-2.5 rounded-xl border bg-superficie py-1 pl-1 pr-3 text-left",
          aberto ? "border-marca ring-2 ring-marca/20" : "border-borda",
          varios ? "hover:bg-elevado" : "cursor-default",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-marca to-magenta text-[12px] font-bold text-white">
          {iniciais(atual.estabelecimento.nome)}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-suave">Estabelecimento</span>
          <span className="block truncate text-[14px] font-semibold">{atual.estabelecimento.nome}</span>
        </span>
        {varios && <ChevronDown className={clsx("ml-1 h-4 w-4 shrink-0 text-suave transition", aberto && "rotate-180")} />}
      </button>

      {aberto && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(360px,calc(100vw-32px))] rounded-2xl border border-borda bg-superficie p-2 shadow-2xl">
          <p className="px-2.5 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-wider text-suave">Estabelecimentos</p>
          {negocio.vinculos.map((v) => {
            const ativo = v.estabelecimento_id === atual.estabelecimento_id;
            return (
              <button
                key={v.estabelecimento_id}
                type="button"
                onClick={() => {
                  if (!ativo) negocio.escolherEstabelecimento(v.estabelecimento_id);
                  setAberto(false);
                }}
                className={clsx("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left", ativo ? "bg-destaque-suave" : "hover:bg-elevado")}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevado text-[12px] font-bold">{iniciais(v.estabelecimento.nome)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{v.estabelecimento.nome}</span>
                  <span className="block truncate text-[12px] text-suave">{v.cargo || NOME_PAPEL[v.papel]}</span>
                </span>
                {ativo && <Check className="h-4 w-4 shrink-0 text-destaque" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

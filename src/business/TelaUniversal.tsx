import { ReactNode } from "react";

/** Esqueleto de toda tela do Business: área de trabalho à esquerda, ações à direita. */
export function TelaUniversal({ acoes, rodape, children }: { acoes: ReactNode; rodape?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0 space-y-4">{children}</div>
      <aside aria-label="Ações" className="cartao order-first p-3 xl:sticky xl:top-24 xl:order-none">
        <h2 className="rotulo mb-2 px-1">Ações</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-1">{acoes}</div>
        {rodape && <div className="mt-3 border-t border-borda pt-3">{rodape}</div>}
      </aside>
    </div>
  );
}

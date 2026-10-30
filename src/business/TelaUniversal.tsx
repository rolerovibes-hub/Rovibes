import { createContext, ReactNode, useContext, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";

/** App de computador: lugar (coluna da direita) onde as ações da tela aberta aparecem. */
export const LugarDasAcoes = createContext<{ alvo: HTMLElement | null; registrar: (tem: boolean) => void } | null>(null);

/** Esqueleto de toda tela do Business: área de trabalho à esquerda, ações à direita.
 *  Na Gestão, as ações viram uma barra compacta acima do conteúdo.
 *  No app de computador, as ações vão para a coluna "Menu", na seção "Ações". */
export function TelaUniversal({ acoes, rodape, children }: { acoes?: ReactNode; rodape?: ReactNode; children: ReactNode }) {
  const gestao = useLocation().pathname.startsWith("/gestao");
  const desktop = useContext(LugarDasAcoes);
  const tem = !!(acoes || rodape);
  useEffect(() => {
    if (!desktop) return;
    desktop.registrar(tem);
    return () => desktop.registrar(false);
  }, [desktop, tem]);

  if (desktop) {
    return (
      <div className="min-w-0 space-y-4">
        {children}
        {desktop.alvo &&
          tem &&
          createPortal(
            <div className="flex flex-col gap-2 [&>*]:w-full [&_hr]:my-1">
              {acoes}
              {rodape && <div className="mt-2 border-t border-borda pt-3 [&>*]:w-full">{rodape}</div>}
            </div>,
            desktop.alvo,
          )}
      </div>
    );
  }
  if (gestao) {
    return (
      <div className="min-w-0 space-y-4">
        {(acoes || rodape) && (
          <div className="flex flex-wrap items-center gap-2 [&_hr]:hidden [&>*]:w-auto [&_.botao-principal]:h-9 [&_.botao]:h-9">
            {acoes}
            {rodape && <span className="ml-auto flex gap-2">{rodape}</span>}
          </div>
        )}
        {children}
      </div>
    );
  }
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

import clsx from "clsx";
import { UtensilsCrossed, X } from "lucide-react";
import { reais } from "./Formulario";

export interface ItemVisual {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number | null;
  foto_url: string | null;
  esgotado?: boolean;
}

/** Linha do item no cardápio do app (a mesma usada na prévia da Biblioteca). */
export function LinhaItemCardapio({ item, aoAbrir }: { item: ItemVisual; aoAbrir?: () => void }) {
  const conteudo = (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {item.nome}
          {item.esgotado && <span className="ml-2 rounded bg-elevado px-1.5 py-0.5 text-[11px] font-semibold text-suave">Esgotado</span>}
        </p>
        {item.descricao && <p className="mt-0.5 line-clamp-2 text-[13px] text-suave">{item.descricao}</p>}
        {item.preco != null && <p className="codigo mt-1 text-sm text-destaque">{reais(item.preco)}</p>}
      </div>
      {item.foto_url && <img src={item.foto_url} alt="" className="h-20 w-20 shrink-0 rounded-lg bg-white object-cover" loading="lazy" />}
    </>
  );
  const classe = clsx("flex w-full gap-3 px-4 py-3 text-left", item.esgotado && "opacity-60");
  return aoAbrir ? (
    <button type="button" onClick={aoAbrir} className={clsx(classe, "hover:bg-elevado")}>
      {conteudo}
    </button>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

/** Detalhe do item (aberto ao tocar no item do cardápio). `embutido` desenha sem a camada escura, para a prévia. */
export function DetalheItemCardapio({ item, lugar, fechar, embutido }: { item: ItemVisual; lugar?: string; fechar: () => void; embutido?: boolean }) {
  const folha = (
    <div className={clsx("w-full overflow-hidden bg-superficie", embutido ? "rounded-t-2xl" : "folha max-h-[92vh] max-w-lg overflow-y-auto rounded-t-2xl pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-2xl")} onClick={(e) => e.stopPropagation()}>
      <div className="relative">
        {item.foto_url ? (
          <img src={item.foto_url} alt={item.nome} className="aspect-square w-full bg-white object-cover" />
        ) : (
          <div className="flex aspect-[2/1] w-full items-center justify-center bg-elevado text-suave">
            <UtensilsCrossed className="h-8 w-8" />
          </div>
        )}
        <button type="button" onClick={fechar} className="absolute right-3 top-3 rounded-full bg-black/45 p-2 text-white backdrop-blur" aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="space-y-2 px-5 pb-5 pt-4">
        <h2 className="text-xl font-semibold leading-tight">{item.nome}</h2>
        {item.descricao && <p className="text-[15px] text-suave">{item.descricao}</p>}
        <div className="flex items-center justify-between pt-1">
          {item.preco != null ? <p className="codigo text-lg font-semibold text-destaque">{reais(item.preco)}</p> : <span />}
          {item.esgotado && <span className="rounded bg-elevado px-2 py-1 text-[12px] font-semibold text-suave">Esgotado</span>}
        </div>
        <p className="pt-2 text-[13px] text-suave">{lugar ? `Peça em ${lugar} pela sua comanda ou com a equipe.` : "Peça pela sua comanda ou com a equipe."}</p>
      </div>
    </div>
  );
  if (embutido) return folha;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label={item.nome} onClick={fechar}>
      {folha}
    </div>
  );
}

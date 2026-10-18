import { useMemo, useState } from "react";
import clsx from "clsx";
import { Minus, Plus, Search, UtensilsCrossed } from "lucide-react";
import { reais } from "./Formulario";
import { supabase } from "@/lib/supabase";

export interface ItemParaPedido {
  id: string;
  nome: string;
  descricao?: string | null;
  preco: number | null;
  foto_url?: string | null;
  categoria: string;
  esgotado?: boolean;
}

export interface Escolha {
  quantidade: number;
  observacao: string;
}

export type Carrinho = Record<string, Escolha>;

export const totalDoCarrinho = (c: Carrinho, itens: ItemParaPedido[]) =>
  Object.entries(c).reduce((s, [id, e]) => s + (itens.find((i) => i.id === id)?.preco ?? 0) * e.quantidade, 0);

export const qtdNoCarrinho = (c: Carrinho) => Object.values(c).reduce((s, e) => s + e.quantidade, 0);

export const carrinhoParaBanco = (c: Carrinho) =>
  Object.entries(c)
    .filter(([, e]) => e.quantidade > 0)
    .map(([item_id, e]) => ({ item_id, quantidade: e.quantidade, observacao: e.observacao.trim() || null }));

/** Lista do cardápio com quantidades, usada no App (cliente) e no Business (equipe lançando). */
export function MontarPedido({ itens, carrinho, mudar, compacto }: { itens: ItemParaPedido[]; carrinho: Carrinho; mudar: (c: Carrinho) => void; compacto?: boolean }) {
  const [busca, setBusca] = useState("");
  const grupos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const mapa = new Map<string, ItemParaPedido[]>();
    for (const i of itens) {
      if (i.preco == null) continue;
      if (t && !i.nome.toLowerCase().includes(t)) continue;
      mapa.set(i.categoria, [...(mapa.get(i.categoria) ?? []), i]);
    }
    return [...mapa.entries()];
  }, [itens, busca]);

  const ajustar = (id: string, delta: number) => {
    const atual = carrinho[id] ?? { quantidade: 0, observacao: "" };
    const q = Math.max(0, Math.min(50, atual.quantidade + delta));
    const novo = { ...carrinho };
    if (q === 0) delete novo[id];
    else novo[id] = { ...atual, quantidade: q };
    mudar(novo);
  };

  return (
    <div className="space-y-4">
      <label className="relative block">
        <span className="sr-only">Buscar no cardápio</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
        <input className="entrada pl-9" placeholder="Buscar no cardápio" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </label>
      {grupos.length === 0 && <p className="py-6 text-center text-sm text-suave">Nenhum item disponível.</p>}
      {grupos.map(([nome, lista]) => (
        <section key={nome}>
          <h3 className="rotulo mb-1.5">{nome}</h3>
          <ul className="cartao divide-y divide-borda">
            {lista.map((i) => {
              const e = carrinho[i.id];
              return (
                <li key={i.id} className={clsx("px-3", compacto ? "py-2" : "py-2.5", i.esgotado && "opacity-60")}>
                  <div className="flex items-center gap-3">
                    {!compacto &&
                      (i.foto_url ? (
                        <img src={i.foto_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" loading="lazy" />
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-elevado text-suave">
                          <UtensilsCrossed className="h-4 w-4" />
                        </span>
                      ))}
                    <button type="button" className="min-w-0 flex-1 text-left" disabled={i.esgotado} onClick={() => ajustar(i.id, 1)}>
                      <span className="block truncate text-sm font-medium">{i.nome}</span>
                      <span className="codigo block text-[13px] text-destaque">{reais(i.preco)}</span>
                    </button>
                    {i.esgotado ? (
                      <span className="shrink-0 rounded bg-elevado px-2 py-1 text-[12px] font-semibold text-suave">Esgotado</span>
                    ) : e ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <button type="button" className="botao h-8 w-8 px-0" onClick={() => ajustar(i.id, -1)} aria-label={`Tirar um ${i.nome}`}>
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="codigo w-6 text-center text-sm font-semibold">{e.quantidade}</span>
                        <button type="button" className="botao h-8 w-8 px-0" onClick={() => ajustar(i.id, 1)} aria-label={`Mais um ${i.nome}`}>
                          <Plus className="h-4 w-4" />
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="botao h-8 shrink-0 px-3 text-[13px]" onClick={() => ajustar(i.id, 1)}>
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar
                      </button>
                    )}
                  </div>
                  {e && (
                    <input
                      className="entrada mt-2 h-8 text-[13px]"
                      placeholder="Observação (ex.: sem gelo)"
                      maxLength={200}
                      value={e.observacao}
                      onChange={(ev) => mudar({ ...carrinho, [i.id]: { ...e, observacao: ev.target.value } })}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Carrega os itens disponíveis do cardápio já com o nome da categoria. */
export async function carregarItensParaPedido(estab: string): Promise<ItemParaPedido[]> {
  const sb = supabase;
  const itens = (campos: string) => sb.from("cardapio_itens").select(campos).eq("estabelecimento_id", estab).eq("disponivel", true).order("ordem");
  const [c, primeiro] = await Promise.all([
    sb.from("cardapio_categorias").select("id, nome, ordem").eq("estabelecimento_id", estab).order("ordem"),
    itens("id, categoria_id, nome, descricao, preco, foto_url, ordem, esgotado"),
  ]);
  // Sem a atualização 011 do banco não existe "esgotado": busca sem ele.
  const i = primeiro.error ? await itens("id, categoria_id, nome, descricao, preco, foto_url, ordem") : primeiro;
  const cats = (c.data ?? []) as { id: string; nome: string; ordem: number }[];
  const ordem = new Map(cats.map((x, n) => [x.id, n]));
  const nome = new Map(cats.map((x) => [x.id, x.nome]));
  return ((i.data ?? []) as unknown as { id: string; categoria_id: string | null; nome: string; descricao: string | null; preco: number | null; foto_url: string | null; esgotado: boolean }[])
    .sort((a, b) => (ordem.get(a.categoria_id ?? "") ?? 999) - (ordem.get(b.categoria_id ?? "") ?? 999))
    .map((x) => ({ ...x, preco: x.preco == null ? null : Number(x.preco), categoria: nome.get(x.categoria_id ?? "") ?? "Outros" }));
}

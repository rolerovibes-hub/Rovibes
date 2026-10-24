import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChefHat, Package, Trash2 } from "lucide-react";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { formatarQtd, lerNumero } from "@/lib/estoque";

interface Linha {
  produto_id: string;
  quantidade: number;
}
interface ProdutoMin {
  id: string;
  nome: string;
  unidade: string;
  saldo: number;
}

/** Ligação do item do cardápio com o estoque: produto vendido direto (1 un) ou receita de um produto montado. */
export function ReceitaItem({ estab, item, nomeItem }: { estab: string; item: string; nomeItem: string }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [produtos, setProdutos] = useState<ProdutoMin[]>([]);
  const [produto, setProduto] = useState("");
  const [qtd, setQtd] = useState("");
  const [erro, setErro] = useState("");
  const [semAcesso, setSemAcesso] = useState(false);

  const carregar = useCallback(async () => {
    const [f, p] = await Promise.all([
      supabase.from("ficha_tecnica").select("produto_id, quantidade").eq("item_id", item),
      supabase.from("estoque_produtos").select("id, nome, unidade, saldo").eq("estabelecimento_id", estab).eq("ativo", true).order("nome"),
    ]);
    if (p.error) setSemAcesso(true);
    setLinhas(((f.data ?? []) as Linha[]).map((x) => ({ ...x, quantidade: Number(x.quantidade) })));
    setProdutos(((p.data ?? []) as ProdutoMin[]).map((x) => ({ ...x, saldo: Number(x.saldo) })));
  }, [estab, item]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const adicionar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    const q = lerNumero(qtd);
    if (!produto || !q || q <= 0) return setErro("Escolha o produto e quanto é usado em cada unidade vendida.");
    const { error } = await supabase.from("ficha_tecnica").upsert({ item_id: item, produto_id: produto, quantidade: q });
    if (error) return setErro(mensagemDeErro(error));
    setProduto("");
    setQtd("");
    void carregar();
  };

  const remover = async (p: string) => {
    const { error } = await supabase.from("ficha_tecnica").delete().eq("item_id", item).eq("produto_id", p);
    if (error) return setErro(mensagemDeErro(error));
    void carregar();
  };

  const nome = (id: string) => produtos.find((p) => p.id === id);
  const unidadeSel = produtos.find((p) => p.id === produto)?.unidade;

  if (semAcesso) return null;

  return (
    <section className="mt-4 rounded-lg border border-borda p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <ChefHat className="h-4 w-4 text-destaque" />
        Estoque e receita de "{nomeItem}"
      </h3>
      <p className="mt-0.5 text-[13px] text-suave">
        Cada unidade vendida baixa do estoque o que estiver aqui, no ponto de consumo do setor. Produto vendido direto (ex.: lata) = 1 un do produto. Produto montado (drink, lanche) = a receita completa.
      </p>

      {linhas.length > 0 ? (
        <ul className="mt-3 divide-y divide-borda rounded-lg bg-elevado/50">
          {linhas.map((l) => {
            const p = nome(l.produto_id);
            return (
              <li key={l.produto_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Package className="h-4 w-4 text-suave" />
                <span className="min-w-0 flex-1 truncate">{p?.nome ?? "Produto desativado"}</span>
                <span className="codigo font-semibold">
                  {formatarQtd(l.quantidade)} {p?.unidade}
                </span>
                <button type="button" onClick={() => void remover(l.produto_id)} className="rounded p-1 text-suave hover:text-perigo" aria-label="Remover da receita">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg bg-elevado/50 px-3 py-2 text-[13px] text-suave">Este item ainda não baixa nada do estoque.</p>
      )}

      {produtos.length === 0 ? (
        <p className="mt-3 text-[13px]">
          Nenhum produto no estoque.{" "}
          <Link to="/business/area/produtos-estoque/G4003" className="font-semibold text-destaque">
            Adicionar produtos
          </Link>
        </p>
      ) : (
        <form onSubmit={(e) => void adicionar(e)} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[180px] flex-1">
            <span className="rotulo mb-1 block">Produto do estoque</span>
            <select className="entrada" value={produto} onChange={(e) => setProduto(e.target.value)}>
              <option value="">Escolha...</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} ({formatarQtd(p.saldo)} {p.unidade})
                </option>
              ))}
            </select>
          </label>
          <label className="w-36">
            <span className="rotulo mb-1 block">Usa por unidade</span>
            <span className="relative block">
              <input value={qtd} onChange={(e) => setQtd(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" placeholder={unidadeSel === "un" ? "1" : ""} className="entrada pr-10" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-suave">{unidadeSel ?? ""}</span>
            </span>
          </label>
          <button type="submit" className="botao h-10">
            Adicionar
          </button>
        </form>
      )}
      {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}
    </section>
  );
}

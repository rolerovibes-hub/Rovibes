import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChefHat, Package, ScanBarcode, Search, X } from "lucide-react";
import { LeitorBarras } from "@/components/LeitorBarras";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { carregarEstoque, formatarQtd, LocalEstoque, ProdutoEstoque, SETORES } from "@/lib/estoque";

interface Categoria {
  id: string;
  nome: string;
  setor: "cozinha" | "bar" | "sem_preparo";
}

/**
 * Novo item do cardápio a partir do estoque: busca o produto (nome ou código de barras, inclusive pela câmera),
 * define nome, categoria e preço, e escolhe de qual local o saldo sai na venda.
 * Itens montados (drink, lanche) seguem pelo formulário com receita.
 */
export function NovoItemCardapio({
  estab,
  categorias,
  categoriaInicial,
  jaNoCardapio,
  fechar,
  criado,
  montado,
}: {
  estab: string;
  categorias: Categoria[];
  categoriaInicial: string | null;
  jaNoCardapio: Set<string>;
  fechar: () => void;
  criado: (texto: string) => void;
  montado: () => void;
}) {
  const [produtos, setProdutos] = useState<ProdutoEstoque[] | null>(null);
  const [locais, setLocais] = useState<LocalEstoque[]>([]);
  const [saldos, setSaldos] = useState<Map<string, number>>(new Map());
  const [busca, setBusca] = useState("");
  const [camera, setCamera] = useState(false);
  const [produto, setProduto] = useState<ProdutoEstoque | null>(null);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState(categoriaInicial ?? "");
  const [preco, setPreco] = useState("");
  const [local, setLocal] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    carregarEstoque(estab).then((r) => {
      setProdutos(r.produtos.filter((p) => p.ativo));
      setLocais(r.locais.filter((l) => l.ativo));
      setSaldos(r.saldos);
      if (r.erro) setErro("Não foi possível ler o estoque. Confira se a atualização 019/020 do banco foi aplicada e se você tem acesso.");
    });
  }, [estab]);

  const resultados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return (produtos ?? []).slice(0, 30);
    return (produtos ?? []).filter((p) => p.ean === t || (p.codigo ?? "").toLowerCase() === t || `${p.nome} ${p.ean ?? ""} ${p.codigo ?? ""}`.toLowerCase().includes(t)).slice(0, 30);
  }, [produtos, busca]);

  const escolher = (p: ProdutoEstoque) => {
    setProduto(p);
    // A descrição da biblioteca é o nome amigável (o nome da NF costuma vir abreviado).
    const amigavel = p.descricao?.trim() ?? "";
    setNome(amigavel && amigavel.length <= 80 ? amigavel : p.nome);
    setCamera(false);
    setErro("");
    // Sugere o local onde o produto tem saldo e que não é depósito (ex.: refrigerador do bar).
    const comSaldo = locais.filter((l) => (saldos.get(`${p.id}:${l.id}`) ?? 0) > 0);
    setLocal((comSaldo.find((l) => l.tipo !== "deposito") ?? comSaldo[0])?.id ?? "");
  };

  // Leitor USB/Bluetooth digita o código e tecla Enter: com um resultado exato, já seleciona.
  const aoEnter = () => {
    const t = busca.trim();
    const exato = (produtos ?? []).find((p) => p.ean === t || (p.codigo ?? "").toLowerCase() === t.toLowerCase());
    if (exato) escolher(exato);
    else if (resultados.length === 1) escolher(resultados[0]);
  };

  const lido = (codigo: string) => {
    setBusca(codigo);
    const exato = (produtos ?? []).find((p) => p.ean === codigo || p.codigo === codigo);
    if (exato) escolher(exato);
    else {
      setCamera(false);
      setErro(`Nenhum produto do estoque com o código ${codigo}. Inclua o produto no estoque pela Biblioteca RoVibes (Meus produtos ou Estoque → Entrada) primeiro.`);
    }
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!produto) return;
    const valor = Number(preco.replace(/\./g, "").replace(",", "."));
    if (!nome.trim()) return setErro("Informe o nome que aparece no cardápio.");
    if (!preco.trim() || !Number.isFinite(valor) || valor < 0) return setErro("Informe o preço de venda.");
    setOcupado(true);
    const { error } = await supabase.from("cardapio_itens").insert({
      estabelecimento_id: estab,
      nome: nome.trim(),
      categoria_id: categoria || null,
      preco: valor,
      disponivel: true,
      produto_id: produto.id,
      local_consumo_id: local || null,
      foto_url: produto.foto_url ?? null,
    });
    setOcupado(false);
    if (error) return setErro(/produto_id|local_consumo_id/.test(error.message) ? "Falta aplicar a atualização 020 do banco." : mensagemDeErro(error));
    criado(`"${nome.trim()}" entrou no cardápio. Cada venda baixa 1 ${produto.unidade} de ${produto.nome}${local ? ` do ${locais.find((l) => l.id === local)?.nome}` : ""}.`);
  };

  const setorCat = categorias.find((c) => c.id === categoria)?.setor;
  const pontoSetor = setorCat ? locais.find((l) => l.consumo_setor === setorCat) : undefined;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Novo item do cardápio" onClick={fechar}>
      <div className="folha max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-superficie p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Novo item do cardápio</h2>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!produto ? (
          <>
            <p className="mt-1 text-sm text-suave">Busque o produto do estoque pelo nome ou leia o código de barras.</p>
            <div className="mt-3 flex gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Buscar produto do estoque</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
                <input
                  ref={campo}
                  autoFocus
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), aoEnter())}
                  placeholder="Nome, código ou código de barras"
                  className="entrada pl-9"
                />
              </label>
              <button type="button" onClick={() => setCamera(!camera)} aria-pressed={camera} className="botao h-10 px-3" aria-label="Ler código de barras pela câmera">
                <ScanBarcode className="h-5 w-5" />
              </button>
            </div>
            {camera && (
              <div className="mt-3">
                <LeitorBarras aoLer={lido} />
              </div>
            )}
            {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}
            {produtos === null ? (
              <p className="py-6 text-center text-sm text-suave">Carregando o estoque...</p>
            ) : (
              <ul className="mt-3 max-h-[44vh] divide-y divide-borda overflow-y-auto rounded-lg border border-borda">
                {resultados.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => escolher(p)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-elevado">
                      <Package className="h-4 w-4 shrink-0 text-suave" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.nome}</span>
                        <span className="codigo block truncate text-[12px] text-suave">{[p.codigo, p.ean].filter(Boolean).join(" · ") || p.categoria || ""}</span>
                      </span>
                      <span className="codigo shrink-0 text-right text-[13px]">
                        {formatarQtd(p.saldo)} {p.unidade}
                        {jaNoCardapio.has(p.id) && <span className="block text-[11px] text-alerta">já no cardápio</span>}
                      </span>
                    </button>
                  </li>
                ))}
                {resultados.length === 0 && (
                  <li className="px-3 py-5 text-center text-sm text-suave">
                    Nenhum produto encontrado.{" "}
                    <Link to="/business/app/G4003" className="font-semibold text-destaque">
                      Adicionar da biblioteca
                    </Link>
                  </li>
                )}
              </ul>
            )}
            <button onClick={montado} className="mt-4 flex w-full items-center gap-3 rounded-lg border border-dashed border-borda px-3 py-3 text-left text-sm hover:bg-elevado">
              <ChefHat className="h-5 w-5 text-destaque" />
              <span>
                <span className="block font-medium">Item montado (drink, lanche, porção)</span>
                <span className="block text-[12px] text-suave">Criar o item e cadastrar a receita com os produtos que ele consome</span>
              </span>
            </button>
          </>
        ) : (
          <form onSubmit={(e) => void salvar(e)} className="mt-3 space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-marca bg-destaque-suave px-3 py-2 text-sm">
              <Package className="h-4 w-4 text-destaque" />
              <span className="min-w-0 flex-1 truncate">
                <strong>{produto.nome}</strong> <span className="text-suave">· total {formatarQtd(produto.saldo)} {produto.unidade}</span>
              </span>
              <button type="button" className="text-[13px] font-semibold text-destaque" onClick={() => setProduto(null)}>
                Trocar
              </button>
            </div>
            <label className="block">
              <span className="rotulo mb-1 block">Nome no cardápio</span>
              <input value={nome} onChange={(e) => setNome(e.target.value.slice(0, 80))} className="entrada" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="rotulo mb-1 block">Categoria</span>
                <select className="entrada" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="rotulo mb-1 block">Preço de venda (R$)</span>
                <input autoFocus value={preco} onChange={(e) => setPreco(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" className="entrada codigo" />
              </label>
            </div>
            <div>
              <span className="rotulo mb-1 block">De qual estoque sai na venda?</span>
              <ul className="space-y-1.5">
                <li>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-borda px-3 py-2 text-sm has-[:checked]:border-marca has-[:checked]:bg-destaque-suave">
                    <input type="radio" name="local" checked={local === ""} onChange={() => setLocal("")} className="accent-[rgb(var(--marca))]" />
                    <span className="min-w-0 flex-1">
                      Automático
                      <span className="block text-[12px] text-suave">
                        {pontoSetor
                          ? `Ponto de consumo do ${SETORES.find((s) => s.id === setorCat)?.nome}: ${pontoSetor.nome}`
                          : "Ponto de consumo do setor da categoria (ou o local padrão do produto)"}
                      </span>
                    </span>
                  </label>
                </li>
                {locais.map((l) => {
                  const q = saldos.get(`${produto.id}:${l.id}`);
                  return (
                    <li key={l.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-borda px-3 py-2 text-sm has-[:checked]:border-marca has-[:checked]:bg-destaque-suave">
                        <input type="radio" name="local" checked={local === l.id} onChange={() => setLocal(l.id)} className="accent-[rgb(var(--marca))]" />
                        <span className="min-w-0 flex-1">{l.nome}</span>
                        <span className="codigo text-[13px] text-suave">
                          {q === undefined ? "sem saldo" : `${formatarQtd(q)} ${produto.unidade}`}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            {erro && <p className="text-sm text-perigo">{erro}</p>}
            <button type="submit" className="botao-principal h-11 w-full" disabled={ocupado}>
              {ocupado ? "Salvando..." : "Adicionar ao cardápio"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

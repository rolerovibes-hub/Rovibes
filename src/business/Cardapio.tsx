import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Eye, EyeOff, FolderPlus, ImagePlus, Pencil, Plus, Search, Star, Trash2, UtensilsCrossed, X } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, reais, Secao } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { apagarFoto, caminhoDaUrl, enviarFoto } from "@/lib/imagens";
import { useBusiness } from "@/lib/acessos";
import { ReceitaItem } from "./ReceitaItem";
import { NovoItemCardapio } from "./NovoItemCardapio";
import { LocalEstoque } from "@/lib/estoque";

interface Categoria {
  id: string;
  nome: string;
  ordem: number;
  setor: "cozinha" | "bar" | "sem_preparo";
}

interface Item {
  id: string;
  categoria_id: string | null;
  nome: string;
  descricao: string | null;
  preco: number | null;
  foto_url: string | null;
  disponivel: boolean;
  destaque: boolean;
  ordem: number;
  produto_id?: string | null;
  local_consumo_id?: string | null;
}

type Rascunho = Omit<Item, "id" | "ordem"> & { id?: string };

const VAZIO: Rascunho = { categoria_id: null, nome: "", descricao: "", preco: null, foto_url: null, disponivel: true, destaque: false };

export function Cardapio() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [filtro, setFiltro] = useState<string | "todas">("todas");
  const [soIndisponiveis, setSoIndisponiveis] = useState(false);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [novaCategoria, setNovaCategoria] = useState<string | null>(null);
  const [novoSetor, setNovoSetor] = useState<"cozinha" | "bar" | "sem_preparo">("cozinha");
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const seletorFoto = useRef<HTMLInputElement>(null);
  const [novoDoEstoque, setNovoDoEstoque] = useState(false);
  const [locais, setLocais] = useState<LocalEstoque[]>([]);

  const carregar = useCallback(async () => {
    if (!id) return;
    const [c, i] = await Promise.all([
      supabase.from("cardapio_categorias").select("id, nome, ordem, setor").eq("estabelecimento_id", id).order("ordem"),
      supabase
        .from("cardapio_itens")
        .select("id, categoria_id, nome, descricao, preco, foto_url, disponivel, destaque, ordem, produto_id, local_consumo_id")
        .eq("estabelecimento_id", id)
        .order("ordem")
        .then(async (r) =>
          r.error
            ? // Antes da atualização 020 do banco não há produto/local no item.
              await supabase.from("cardapio_itens").select("id, categoria_id, nome, descricao, preco, foto_url, disponivel, destaque, ordem").eq("estabelecimento_id", id).order("ordem")
            : r,
        ),
    ]);
    supabase
      .from("estoque_locais")
      .select("id, nome, tipo, consumo_setor, ativo, ordem")
      .eq("estabelecimento_id", id)
      .eq("ativo", true)
      .order("ordem")
      .then(({ data }) => setLocais((data ?? []) as LocalEstoque[]));
    setCategorias((c.data ?? []) as Categoria[]);
    setItens(((i.data ?? []) as Item[]).map((x) => ({ ...x, preco: x.preco == null ? null : Number(x.preco) })));
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const item = itens.find((x) => x.id === selecionado) ?? null;
  // Uma linha por categoria (estilo vitrine), com busca e filtro de indisponíveis.
  const termo = busca.trim().toLowerCase();
  const filtrando = soIndisponiveis || !!termo;
  const passa = (x: Item) => (!soIndisponiveis || !x.disponivel) && (!termo || x.nome.toLowerCase().includes(termo));
  const linhas = [
    ...categorias.map((c) => ({ id: c.id, nome: c.nome, categoria: c as Categoria | null, itens: itens.filter((x) => x.categoria_id === c.id && passa(x)) })),
    { id: "sem", nome: "Sem categoria", categoria: null as Categoria | null, itens: itens.filter((x) => !x.categoria_id && passa(x)) },
  ].filter((l) => l.itens.length > 0 || (!filtrando && l.categoria));

  const executar = async (acao: () => Promise<void>, ok?: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await acao();
      if (ok) setAviso({ tipo: "ok", texto: ok });
    } catch (err) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(err) });
    } finally {
      setOcupado(false);
    }
  };

  const salvarItem = (e: FormEvent) => {
    e.preventDefault();
    if (!rascunho) return;
    void executar(async () => {
      const valores = {
        categoria_id: rascunho.categoria_id,
        nome: rascunho.nome.trim(),
        descricao: rascunho.descricao?.trim() || null,
        preco: rascunho.preco,
        foto_url: rascunho.foto_url,
        disponivel: rascunho.disponivel,
        destaque: rascunho.destaque,
        ...(locais.length ? { local_consumo_id: rascunho.local_consumo_id || null } : {}),
      };
      const { error } = rascunho.id
        ? await supabase.from("cardapio_itens").update(valores).eq("id", rascunho.id)
        : await supabase.from("cardapio_itens").insert({ ...valores, estabelecimento_id: id, ordem: itens.length });
      if (error) throw error;
      setRascunho(null);
      await carregar();
    }, "Item salvo.");
  };

  const salvarCategoria = (e: FormEvent) => {
    e.preventDefault();
    if (!novaCategoria?.trim()) return;
    void executar(async () => {
      const { error } = await supabase
        .from("cardapio_categorias")
        .insert({ estabelecimento_id: id, nome: novaCategoria.trim(), ordem: categorias.length, setor: novoSetor });
      if (error) throw error;
      setNovaCategoria(null);
      await carregar();
    });
  };

  const trocarSetor = (c: Categoria) =>
    void executar(async () => {
      const setor = c.setor === "cozinha" ? "bar" : c.setor === "bar" ? "sem_preparo" : "cozinha";
      const { error } = await supabase.from("cardapio_categorias").update({ setor }).eq("id", c.id);
      if (error) throw error;
      await carregar();
    }, `Os pedidos de "${c.nome}" agora ${c.setor === "cozinha" ? "vão para o Bar" : c.setor === "bar" ? "vão direto para a entrega (sem preparo)" : "vão para a Cozinha"}.`);

  const excluirCategoria = (c: Categoria) =>
    void executar(async () => {
      if (!window.confirm(`Excluir a categoria "${c.nome}"? Os itens dela ficam sem categoria.`)) return;
      const { error } = await supabase.from("cardapio_categorias").delete().eq("id", c.id);
      if (error) throw error;
      if (filtro === c.id) setFiltro("todas");
      await carregar();
    });

  const alternarDisponivel = () =>
    item &&
    void executar(async () => {
      const { error } = await supabase.from("cardapio_itens").update({ disponivel: !item.disponivel }).eq("id", item.id);
      if (error) throw error;
      await carregar();
    });

  const alternarDestaque = () =>
    item &&
    void executar(async () => {
      const { error } = await supabase.from("cardapio_itens").update({ destaque: !item.destaque }).eq("id", item.id);
      if (error) throw error;
      await carregar();
    });

  const excluirItem = () =>
    item &&
    void executar(async () => {
      if (!window.confirm(`Excluir "${item.nome}" do cardápio?`)) return;
      const { error } = await supabase.from("cardapio_itens").delete().eq("id", item.id);
      if (error) throw error;
      const caminho = caminhoDaUrl(item.foto_url);
      if (caminho) await apagarFoto(caminho);
      setSelecionado(null);
      await carregar();
    }, "Item excluído.");

  const trocarFoto = (arquivos: FileList | null) => {
    const arquivo = arquivos?.[0];
    if (!arquivo || !rascunho) return;
    void executar(async () => {
      const { url } = await enviarFoto(id, arquivo, "cardapio");
      setRascunho((r) => (r ? { ...r, foto_url: url } : r));
    });
    if (seletorFoto.current) seletorFoto.current.value = "";
  };

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => { setFiltro("todas"); setNovoDoEstoque(true); }}>
            <Plus className="h-4 w-4" />
            Novo item
          </button>
          <button className="botao" disabled={!item} onClick={() => item && setRascunho({ ...item })}>
            <Pencil className="h-4 w-4" />
            Editar
          </button>
          <button className="botao" disabled={!item || ocupado} onClick={alternarDestaque}>
            <Star className="h-4 w-4" />
            {item?.destaque ? "Tirar destaque" : "Destacar"}
          </button>
          <button className="botao" disabled={!item || ocupado} onClick={alternarDisponivel}>
            {item && !item.disponivel ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {item && !item.disponivel ? "Disponível" : "Indisponível"}
          </button>
          <hr className="col-span-full my-1 border-borda" />
          <button className="botao" onClick={() => setNovaCategoria("")}>
            <FolderPlus className="h-4 w-4" />
            Nova categoria
          </button>
        </>
      }
      rodape={
        <button className="botao w-full text-perigo" disabled={!item || ocupado} onClick={excluirItem}>
          <Trash2 className="h-4 w-4" />
          Excluir item
        </button>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      {novaCategoria !== null && (
        <form onSubmit={salvarCategoria} className="cartao flex flex-wrap items-end gap-3 p-4">
          <Campo rotulo="Nome da categoria" className="min-w-[220px] flex-1">
            <input autoFocus className="entrada" placeholder="Ex.: Drinks, Petiscos" value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} />
          </Campo>
          <Campo rotulo="Pedidos vão para" className="w-52">
            <select className="entrada" value={novoSetor} onChange={(e) => setNovoSetor(e.target.value as "cozinha" | "bar" | "sem_preparo")}>
              <option value="cozinha">Cozinha</option>
              <option value="bar">Bar</option>
              <option value="sem_preparo">Sem preparo (lata, água...)</option>
            </select>
          </Campo>
          <button type="submit" className="botao-principal h-10" disabled={ocupado || !novaCategoria.trim()}>
            Criar
          </button>
          <button type="button" className="botao h-10" onClick={() => setNovaCategoria(null)}>
            Cancelar
          </button>
        </form>
      )}

      {novoDoEstoque && (
        <NovoItemCardapio
          estab={id}
          categorias={categorias}
          categoriaInicial={filtro !== "todas" && filtro !== "sem" ? filtro : null}
          jaNoCardapio={new Set(itens.map((x) => x.produto_id).filter((x): x is string => !!x))}
          fechar={() => setNovoDoEstoque(false)}
          criado={(t) => {
            setNovoDoEstoque(false);
            setAviso({ tipo: "ok", texto: t });
            void carregar();
          }}
          montado={() => {
            setNovoDoEstoque(false);
            setRascunho({ ...VAZIO, categoria_id: filtro !== "todas" && filtro !== "sem" ? filtro : null });
          }}
        />
      )}

      {rascunho && (
        <Secao
          titulo={rascunho.id ? "Editar item" : "Novo item"}
          acao={
            <button className="botao h-8 w-8 px-0" onClick={() => setRascunho(null)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          }
        >
          <form onSubmit={salvarItem} className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Nome" className="sm:col-span-2">
                <input required autoFocus className="entrada" value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} />
              </Campo>
              <Campo rotulo="Categoria">
                <select
                  className="entrada"
                  value={rascunho.categoria_id ?? ""}
                  onChange={(e) => setRascunho({ ...rascunho, categoria_id: e.target.value || null })}
                >
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Preço (R$)">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="entrada codigo"
                  value={rascunho.preco ?? ""}
                  onChange={(e) => setRascunho({ ...rascunho, preco: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </Campo>
              <Campo rotulo="Descrição" className="sm:col-span-2">
                <textarea rows={2} maxLength={240} className="entrada" value={rascunho.descricao ?? ""} onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })} />
              </Campo>
              <label className="flex items-center gap-2.5 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[rgb(var(--marca))]"
                  checked={rascunho.disponivel}
                  onChange={(e) => setRascunho({ ...rascunho, disponivel: e.target.checked })}
                />
                Disponível para pedir
              </label>
              <label className="flex items-center gap-2.5 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[rgb(var(--marca))]"
                  checked={rascunho.destaque}
                  onChange={(e) => setRascunho({ ...rascunho, destaque: e.target.checked })}
                />
                Mostrar em "Os mais pedidos"
              </label>
              {locais.length > 0 && (
                <Campo rotulo="De qual estoque sai na venda?" className="sm:col-span-2">
                  <select className="entrada" value={rascunho.local_consumo_id ?? ""} onChange={(e) => setRascunho({ ...rascunho, local_consumo_id: e.target.value || null })}>
                    <option value="">Automático (ponto de consumo do setor da categoria)</option>
                    {locais.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
              )}
            </div>
            <div>
              <span className="rotulo mb-1 block">Foto</span>
              <button
                type="button"
                onClick={() => seletorFoto.current?.click()}
                className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-borda bg-fundo text-suave hover:bg-elevado"
              >
                {rascunho.foto_url ? <img src={rascunho.foto_url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}
              </button>
              <input ref={seletorFoto} type="file" accept="image/*" className="hidden" onChange={(e) => trocarFoto(e.target.files)} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className="botao-principal" disabled={ocupado}>
                Salvar item
              </button>
              <button type="button" className="botao" onClick={() => setRascunho(null)}>
                Cancelar
              </button>
            </div>
          </form>
          {rascunho.id && id ? (
            <ReceitaItem estab={id} item={rascunho.id} nomeItem={rascunho.nome} />
          ) : (
            <p className="mt-4 text-[13px] text-suave">Depois de salvar o item, você liga ele ao estoque (produto vendido direto ou receita).</p>
          )}
        </Secao>
      )}

      <section className="flex flex-wrap items-center gap-2" aria-label="Filtros">
        {(
          [
            [false, "Todas as categorias"],
            [true, "Só indisponíveis"],
          ] as const
        ).map(([v, nome]) => (
          <button
            key={nome}
            onClick={() => setSoIndisponiveis(v)}
            aria-pressed={soIndisponiveis === v}
            className={clsx("rounded-full border px-3.5 py-1.5 text-sm", soIndisponiveis === v ? "border-texto bg-texto text-fundo" : "border-borda bg-superficie text-suave hover:text-texto")}
          >
            {nome}
          </button>
        ))}
        <label className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
          <input className="entrada pl-9" placeholder="Buscar no cardápio" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar no cardápio" />
        </label>
      </section>

      {itens.length === 0 && categorias.length === 0 ? (
        <div className="cartao px-6 py-14 text-center">
          <UtensilsCrossed className="mx-auto h-8 w-8 text-suave" />
          <p className="mt-3 font-medium">Nenhum item aqui</p>
        </div>
      ) : (
        linhas.map((l) => (
          <LinhaCategoria
            key={l.id}
            nome={l.nome}
            itens={l.itens}
            setor={l.categoria?.setor}
            selecionado={selecionado}
            selecionar={setSelecionado}
            editar={(x) => setRascunho({ ...x })}
            novo={() => {
              setFiltro(l.categoria ? l.categoria.id : "sem");
              setNovoDoEstoque(true);
            }}
            trocarSetor={l.categoria ? () => trocarSetor(l.categoria!) : undefined}
            excluir={l.categoria ? () => excluirCategoria(l.categoria!) : undefined}
          />
        ))
      )}
    </TelaUniversal>
  );
}

const NOME_SETOR: Record<string, string> = { cozinha: "Cozinha", bar: "Bar", sem_preparo: "Sem preparo" };

/** Uma categoria do cardápio: itens em quadrados numa linha que rola para o lado (9 à vista em tela grande). */
function LinhaCategoria({
  nome,
  itens,
  setor,
  selecionado,
  selecionar,
  editar,
  novo,
  trocarSetor,
  excluir,
}: {
  nome: string;
  itens: Item[];
  setor?: string;
  selecionado: string | null;
  selecionar: (id: string) => void;
  editar: (x: Item) => void;
  novo: () => void;
  trocarSetor?: () => void;
  excluir?: () => void;
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const [lados, setLados] = useState({ esq: false, dir: false });
  const medir = useCallback(() => {
    const t = trilho.current;
    if (t) setLados({ esq: t.scrollLeft > 4, dir: t.scrollLeft + t.clientWidth < t.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [medir, itens.length]);
  const rolar = (sentido: 1 | -1) => trilho.current?.scrollBy({ left: sentido * trilho.current.clientWidth * 0.9, behavior: "smooth" });
  const largura = "w-[max(130px,calc((100%-96px)/9))]";

  return (
    <section aria-label={nome}>
      <div className="mb-2 flex items-baseline gap-2 px-0.5">
        <h3 className="text-[15px] font-semibold">{nome}</h3>
        <span className="text-[12px] text-suave">
          {itens.length} {itens.length === 1 ? "item" : "itens"}
        </span>
        {trocarSetor && (
          <button onClick={trocarSetor} className="rounded px-1.5 text-[12px] text-suave hover:bg-elevado hover:text-texto" title="Trocar o setor que recebe os pedidos desta categoria">
            → {NOME_SETOR[setor ?? "cozinha"]}
          </button>
        )}
        {excluir && (
          <button onClick={excluir} className="rounded p-0.5 text-suave hover:text-perigo" aria-label={`Excluir categoria ${nome}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="relative">
        <div ref={trilho} onScroll={medir} className="flex gap-3 overflow-x-auto scroll-smooth px-0.5 pb-1 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {itens.map((x) => (
            <button
              key={x.id}
              onClick={() => selecionar(x.id)}
              onDoubleClick={() => editar(x)}
              aria-pressed={selecionado === x.id}
              className={clsx(
                "shrink-0 overflow-hidden rounded-xl border bg-superficie text-left",
                largura,
                selecionado === x.id ? "border-marca ring-2 ring-marca/25" : "border-borda hover:border-suave",
              )}
            >
              <span className="relative block aspect-square bg-elevado">
                {x.foto_url ? (
                  <img src={x.foto_url} alt="" className={clsx("h-full w-full object-cover", !x.disponivel && "opacity-45 grayscale")} loading="lazy" />
                ) : (
                  <UtensilsCrossed className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-suave" />
                )}
                {x.destaque && (
                  <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-destaque shadow">
                    <Star className="h-3.5 w-3.5 fill-current" aria-label="Em destaque" />
                  </span>
                )}
                {!x.disponivel && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10.5px] font-bold text-white">Indisponível</span>}
              </span>
              <span className={clsx("block px-2.5 pb-2.5 pt-2", !x.disponivel && "opacity-60")}>
                <span className="line-clamp-2 block min-h-[2.4em] text-[12.5px] font-semibold leading-tight">{x.nome}</span>
                <span className="codigo mt-1 block text-[13px] font-bold text-destaque">{reais(x.preco)}</span>
              </span>
            </button>
          ))}
          <button onClick={novo} className={clsx("shrink-0 overflow-hidden rounded-xl border-2 border-dashed border-borda text-left text-suave hover:border-marca hover:text-destaque", largura)}>
            <span className="flex aspect-square items-center justify-center">
              <Plus className="h-8 w-8" />
            </span>
            <span className="block px-2.5 pb-2.5 pt-2 text-[12.5px] font-semibold">Novo item</span>
          </button>
        </div>
        {lados.esq && (
          <button onClick={() => rolar(-1)} className="absolute inset-y-0 left-0 flex w-11 items-center justify-center rounded-l-xl bg-gradient-to-r from-black/60 to-transparent text-white" aria-label="Voltar">
            <ChevronLeft className="h-7 w-7" />
          </button>
        )}
        {lados.dir && (
          <button onClick={() => rolar(1)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl bg-gradient-to-l from-black/60 to-transparent text-white" aria-label="Ver mais">
            <ChevronRight className="h-7 w-7" />
          </button>
        )}
      </div>
    </section>
  );
}

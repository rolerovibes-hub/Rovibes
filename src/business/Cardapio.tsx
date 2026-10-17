import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Eye, EyeOff, FolderPlus, ImagePlus, Pencil, Plus, Trash2, UtensilsCrossed, X } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, reais, Secao } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { apagarFoto, caminhoDaUrl, enviarFoto } from "@/lib/imagens";
import { useBusiness } from "@/lib/acessos";

interface Categoria {
  id: string;
  nome: string;
  ordem: number;
}

interface Item {
  id: string;
  categoria_id: string | null;
  nome: string;
  descricao: string | null;
  preco: number | null;
  foto_url: string | null;
  disponivel: boolean;
  ordem: number;
}

type Rascunho = Omit<Item, "id" | "ordem"> & { id?: string };

const VAZIO: Rascunho = { categoria_id: null, nome: "", descricao: "", preco: null, foto_url: null, disponivel: true };

export function Cardapio() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [filtro, setFiltro] = useState<string | "todas">("todas");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [novaCategoria, setNovaCategoria] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const seletorFoto = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    const [c, i] = await Promise.all([
      supabase.from("cardapio_categorias").select("id, nome, ordem").eq("estabelecimento_id", id).order("ordem"),
      supabase
        .from("cardapio_itens")
        .select("id, categoria_id, nome, descricao, preco, foto_url, disponivel, ordem")
        .eq("estabelecimento_id", id)
        .order("ordem"),
    ]);
    setCategorias((c.data ?? []) as Categoria[]);
    setItens(((i.data ?? []) as Item[]).map((x) => ({ ...x, preco: x.preco == null ? null : Number(x.preco) })));
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const item = itens.find((x) => x.id === selecionado) ?? null;
  const visiveis = filtro === "todas" ? itens : itens.filter((x) => (filtro === "sem" ? !x.categoria_id : x.categoria_id === filtro));
  const nomeCategoria = (cid: string | null) => categorias.find((c) => c.id === cid)?.nome ?? "Sem categoria";

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
        .insert({ estabelecimento_id: id, nome: novaCategoria.trim(), ordem: categorias.length });
      if (error) throw error;
      setNovaCategoria(null);
      await carregar();
    });
  };

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
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setRascunho({ ...VAZIO, categoria_id: filtro !== "todas" && filtro !== "sem" ? filtro : null })}>
            <Plus className="h-4 w-4" />
            Novo item
          </button>
          <button className="botao" disabled={!item} onClick={() => item && setRascunho({ ...item })}>
            <Pencil className="h-4 w-4" />
            Editar
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
          <button type="submit" className="botao-principal h-10" disabled={ocupado || !novaCategoria.trim()}>
            Criar
          </button>
          <button type="button" className="botao h-10" onClick={() => setNovaCategoria(null)}>
            Cancelar
          </button>
        </form>
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
        </Secao>
      )}

      <section className="cartao flex flex-wrap items-center gap-2 p-3" aria-label="Categorias">
        {[{ id: "todas", nome: `Todas (${itens.length})` }, ...categorias.map((c) => ({ id: c.id, nome: c.nome })), { id: "sem", nome: "Sem categoria" }].map((c) => (
          <span key={c.id} className="inline-flex items-center">
            <button
              onClick={() => setFiltro(c.id)}
              aria-pressed={filtro === c.id}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-sm",
                filtro === c.id ? "bg-destaque-suave font-semibold text-destaque" : "text-suave hover:bg-elevado hover:text-texto",
              )}
            >
              {c.nome}
            </button>
            {filtro === c.id && c.id !== "todas" && c.id !== "sem" && (
              <button
                onClick={() => {
                  const cat = categorias.find((x) => x.id === c.id);
                  if (cat) excluirCategoria(cat);
                }}
                className="rounded p-1 text-suave hover:text-perigo"
                aria-label={`Excluir categoria ${c.nome}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ))}
      </section>

      <section className="cartao overflow-hidden">
        {visiveis.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <UtensilsCrossed className="mx-auto h-8 w-8 text-suave" />
            <p className="mt-3 font-medium">Nenhum item aqui</p>
            <p className="mt-1 text-sm text-suave">Use "Novo item" para montar o cardápio.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-borda bg-elevado/60">
                <tr>
                  {["Item", "Categoria", "Preço", "Situação"].map((c) => (
                    <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((x) => (
                  <tr
                    key={x.id}
                    onClick={() => setSelecionado(x.id)}
                    onDoubleClick={() => setRascunho({ ...x })}
                    aria-selected={selecionado === x.id}
                    className={clsx("cursor-pointer border-b border-borda last:border-0", selecionado === x.id ? "bg-destaque-suave" : "hover:bg-elevado")}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        {x.foto_url ? (
                          <img src={x.foto_url} alt="" className="h-9 w-9 rounded-md object-cover" loading="lazy" />
                        ) : (
                          <span className="h-9 w-9 rounded-md bg-elevado" />
                        )}
                        <span className="font-medium">{x.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-suave">{nomeCategoria(x.categoria_id)}</td>
                    <td className="codigo whitespace-nowrap px-4 py-2.5 text-sm">{reais(x.preco)}</td>
                    <td className={clsx("whitespace-nowrap px-4 py-2.5 font-medium", x.disponivel ? "text-ok" : "text-suave")}>
                      {x.disponivel ? "Disponível" : "Indisponível"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </TelaUniversal>
  );
}

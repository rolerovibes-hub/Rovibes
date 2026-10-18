import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowDownToLine, ArrowUpFromLine, Ban, Boxes, ClipboardCheck, Pencil, Plus, Trash2, X } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, reais, Secao } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useBusiness } from "@/lib/acessos";

type Unidade = "un" | "kg" | "g" | "l" | "ml" | "cx" | "dose";
const UNIDADES: { id: Unidade; nome: string }[] = [
  { id: "un", nome: "unidade" },
  { id: "kg", nome: "kg" },
  { id: "g", nome: "g" },
  { id: "l", nome: "litro" },
  { id: "ml", nome: "ml" },
  { id: "cx", nome: "caixa" },
  { id: "dose", nome: "dose" },
];

interface Produto {
  id: string;
  nome: string;
  unidade: Unidade;
  saldo: number;
  minimo: number | null;
  custo: number | null;
  validade: string | null;
  ativo: boolean;
}

interface ItemCardapio {
  id: string;
  nome: string;
  esgotado: boolean;
  disponivel: boolean;
}

interface Linha {
  item_id: string;
  produto_id: string;
  quantidade: number;
}

interface Movimento {
  id: number;
  criado_em: string;
  produto: string;
  unidade: string;
  tipo: "entrada" | "saida" | "ajuste" | "consumo";
  quantidade: number;
  saldo_depois: number;
  motivo: string | null;
  pessoa: string;
}

type Aba = "produtos" | "fichas" | "movimentos";
type TipoMov = "entrada" | "saida" | "ajuste";

const NOME_MOV: Record<Movimento["tipo"], string> = { entrada: "Entrada", saida: "Saída", ajuste: "Ajuste", consumo: "Venda" };

const num = (v: number | null | undefined, casas = 3) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: casas }));
const lerNumero = (t: string) => {
  const s = t.trim();
  if (!s) return null;
  const v = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(v) ? v : null;
};
const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function situacao(p: Produto) {
  if (!p.ativo) return { texto: "Desativado", cor: "text-suave" };
  if (p.saldo <= 0) return { texto: "Zerado", cor: "text-perigo" };
  if (p.validade && p.validade < hoje()) return { texto: "Vencido", cor: "text-perigo" };
  if (p.minimo != null && p.saldo <= p.minimo) return { texto: "Baixo", cor: "text-alerta" };
  if (p.validade && Date.parse(p.validade) - Date.now() <= 7 * 86400000) return { texto: "Vence logo", cor: "text-alerta" };
  return { texto: "OK", cor: "text-ok" };
}

export function Estoque() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [aba, setAba] = useState<Aba>("produtos");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [itens, setItens] = useState<ItemCardapio[]>([]);
  const [fichas, setFichas] = useState<Linha[]>([]);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [itemFicha, setItemFicha] = useState<string>("");
  const [novaLinha, setNovaLinha] = useState({ produto: "", quantidade: "" });
  const [rascunho, setRascunho] = useState<{ id?: string; nome: string; unidade: Unidade; minimo: string; custo: string; validade: string } | null>(null);
  const [mov, setMov] = useState<{ tipo: TipoMov; quantidade: string; motivo: string; validade: string } | null>(null);
  const [busca, setBusca] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    const [p, i] = await Promise.all([
      supabase.from("estoque_produtos").select("id, nome, unidade, saldo, minimo, custo, validade, ativo").eq("estabelecimento_id", id).order("nome"),
      supabase.from("cardapio_itens").select("id, nome, esgotado, disponivel").eq("estabelecimento_id", id).order("nome"),
    ]);
    const lista = ((p.data ?? []) as Produto[]).map((x) => ({
      ...x,
      saldo: Number(x.saldo),
      minimo: x.minimo == null ? null : Number(x.minimo),
      custo: x.custo == null ? null : Number(x.custo),
    }));
    setProdutos(lista);
    const its = (i.data ?? []) as ItemCardapio[];
    setItens(its);
    if (its.length) {
      const { data } = await supabase.from("ficha_tecnica").select("item_id, produto_id, quantidade").in("item_id", its.map((x) => x.id));
      setFichas(((data ?? []) as Linha[]).map((x) => ({ ...x, quantidade: Number(x.quantidade) })));
    }
  }, [id]);

  const carregarMovimentos = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.rpc("movimentos_estoque", { p_estab: id, p_produto: null });
    setMovimentos(((data ?? []) as Movimento[]).map((m) => ({ ...m, quantidade: Number(m.quantidade), saldo_depois: Number(m.saldo_depois) })));
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);
  useEffect(() => {
    if (aba === "movimentos") void carregarMovimentos();
  }, [aba, carregarMovimentos]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return produtos.filter((p) => !t || p.nome.toLowerCase().includes(t));
  }, [produtos, busca]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const produto = produtos.find((p) => p.id === selecionado) ?? null;
  const alertas = {
    baixos: produtos.filter((p) => p.ativo && p.saldo > 0 && p.minimo != null && p.saldo <= p.minimo).length,
    zerados: produtos.filter((p) => p.ativo && p.saldo <= 0).length,
    vencendo: produtos.filter((p) => p.ativo && p.validade && Date.parse(p.validade) - Date.now() <= 7 * 86400000).length,
  };
  const unidadeDe = (u: string) => UNIDADES.find((x) => x.id === u)?.id ?? u;

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

  const salvarProduto = (e: FormEvent) => {
    e.preventDefault();
    if (!rascunho) return;
    void executar(async () => {
      const valores = {
        nome: rascunho.nome.trim(),
        unidade: rascunho.unidade,
        minimo: lerNumero(rascunho.minimo),
        custo: lerNumero(rascunho.custo),
        validade: rascunho.validade || null,
      };
      const { error } = rascunho.id
        ? await supabase.from("estoque_produtos").update(valores).eq("id", rascunho.id)
        : await supabase.from("estoque_produtos").insert({ ...valores, estabelecimento_id: id });
      if (error) throw /duplicate key/i.test(error.message) ? new Error("Já existe um produto com esse nome.") : error;
      setRascunho(null);
      await carregar();
    }, rascunho.id ? "Produto salvo." : "Produto criado. Use Entrada para lançar o saldo inicial.");
  };

  const salvarMov = (e: FormEvent) => {
    e.preventDefault();
    if (!mov || !produto) return;
    void executar(async () => {
      const q = lerNumero(mov.quantidade);
      if (q == null) throw new Error("Informe a quantidade.");
      const { data, error } = await supabase.rpc("movimentar_estoque", {
        p_produto: produto.id,
        p_tipo: mov.tipo,
        p_quantidade: q,
        p_motivo: mov.motivo.trim() || null,
        p_validade: mov.validade || null,
      });
      if (error) throw error;
      setMov(null);
      await carregar();
      setAviso({ tipo: "ok", texto: `Saldo de ${produto.nome}: ${num(Number(data))} ${unidadeDe(produto.unidade)}.` });
    });
  };

  const alternarAtivo = () =>
    produto &&
    void executar(async () => {
      const { error } = await supabase.from("estoque_produtos").update({ ativo: !produto.ativo }).eq("id", produto.id);
      if (error) throw error;
      await carregar();
    });

  const excluir = () =>
    produto &&
    void executar(async () => {
      if (!window.confirm(`Excluir "${produto.nome}"? O histórico de movimentos dele também será apagado. Para guardar o histórico, use Desativar.`)) return;
      const { error } = await supabase.from("estoque_produtos").delete().eq("id", produto.id);
      if (error) throw error;
      setSelecionado(null);
      await carregar();
    }, "Produto excluído.");

  const fichaDoItem = fichas.filter((f) => f.item_id === itemFicha);
  const adicionarLinha = (e: FormEvent) => {
    e.preventDefault();
    void executar(async () => {
      const q = lerNumero(novaLinha.quantidade);
      if (!itemFicha || !novaLinha.produto || !q || q <= 0) throw new Error("Escolha o produto e a quantidade usada em cada unidade vendida.");
      const { error } = await supabase.from("ficha_tecnica").upsert({ item_id: itemFicha, produto_id: novaLinha.produto, quantidade: q });
      if (error) throw error;
      setNovaLinha({ produto: "", quantidade: "" });
      await carregar();
    });
  };
  const removerLinha = (l: Linha) =>
    void executar(async () => {
      const { error } = await supabase.from("ficha_tecnica").delete().eq("item_id", l.item_id).eq("produto_id", l.produto_id);
      if (error) throw error;
      await carregar();
    });

  const abaBotao = (a: Aba, nome: string) => (
    <button
      key={a}
      role="tab"
      aria-selected={aba === a}
      onClick={() => setAba(a)}
      className={clsx("rounded-lg px-3 py-1.5 text-sm", aba === a ? "bg-destaque-suave font-semibold text-destaque" : "text-suave hover:bg-elevado hover:text-texto")}
    >
      {nome}
    </button>
  );

  return (
    <TelaUniversal
      acoes={
        aba === "produtos" ? (
          <>
            <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setRascunho({ nome: "", unidade: "un", minimo: "", custo: "", validade: "" })}>
              <Plus className="h-4 w-4" />
              Novo produto
            </button>
            <button className="botao" disabled={!produto} onClick={() => produto && setMov({ tipo: "entrada", quantidade: "", motivo: "", validade: "" })}>
              <ArrowDownToLine className="h-4 w-4" />
              Entrada
            </button>
            <button className="botao" disabled={!produto} onClick={() => produto && setMov({ tipo: "saida", quantidade: "", motivo: "", validade: "" })}>
              <ArrowUpFromLine className="h-4 w-4" />
              Saída
            </button>
            <button className="botao" disabled={!produto} onClick={() => produto && setMov({ tipo: "ajuste", quantidade: String(produto.saldo).replace(".", ","), motivo: "", validade: "" })}>
              <ClipboardCheck className="h-4 w-4" />
              Ajuste (contagem)
            </button>
            <hr className="col-span-full my-1 border-borda" />
            <button
              className="botao"
              disabled={!produto}
              onClick={() =>
                produto &&
                setRascunho({
                  id: produto.id,
                  nome: produto.nome,
                  unidade: produto.unidade,
                  minimo: produto.minimo == null ? "" : String(produto.minimo).replace(".", ","),
                  custo: produto.custo == null ? "" : String(produto.custo).replace(".", ","),
                  validade: produto.validade ?? "",
                })
              }
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
            <button className="botao" disabled={!produto || ocupado} onClick={alternarAtivo}>
              <Ban className="h-4 w-4" />
              {produto && !produto.ativo ? "Reativar" : "Desativar"}
            </button>
          </>
        ) : (
          <button className="botao col-span-2 sm:col-span-1" onClick={() => setAba("produtos")}>
            <Boxes className="h-4 w-4" />
            Ver produtos
          </button>
        )
      }
      rodape={
        aba === "produtos" ? (
          <button className="botao w-full text-perigo" disabled={!produto || ocupado} onClick={excluir}>
            <Trash2 className="h-4 w-4" />
            Excluir
          </button>
        ) : undefined
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { nome: "Abaixo do mínimo", valor: alertas.baixos, cor: "text-alerta" },
          { nome: "Zerados", valor: alertas.zerados, cor: "text-perigo" },
          { nome: "Vencidos ou vencendo em 7 dias", valor: alertas.vencendo, cor: "text-alerta" },
        ].map((a) => (
          <div key={a.nome} className="cartao p-4">
            <p className={clsx("codigo text-2xl font-semibold", a.valor ? a.cor : "text-suave")}>{a.valor}</p>
            <p className="text-[13px] text-suave">{a.nome}</p>
          </div>
        ))}
      </div>

      <section className="cartao flex flex-wrap gap-2 p-3" role="tablist" aria-label="Estoque">
        {abaBotao("produtos", "Produtos")}
        {abaBotao("fichas", "Ficha dos itens do cardápio")}
        {abaBotao("movimentos", "Movimentos")}
      </section>

      {aba === "produtos" && (
        <>
          {rascunho && (
            <Secao
              titulo={rascunho.id ? "Editar produto" : "Novo produto"}
              acao={
                <button className="botao h-8 w-8 px-0" onClick={() => setRascunho(null)} aria-label="Fechar">
                  <X className="h-4 w-4" />
                </button>
              }
            >
              <form onSubmit={salvarProduto} className="grid gap-4 sm:grid-cols-6">
                <Campo rotulo="Produto" className="sm:col-span-3">
                  <input required minLength={2} autoFocus className="entrada" placeholder="Ex.: Cachaça, Limão, Batata congelada" value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} />
                </Campo>
                <Campo rotulo="Unidade" className="sm:col-span-1">
                  <select className="entrada" value={rascunho.unidade} onChange={(e) => setRascunho({ ...rascunho, unidade: e.target.value as Unidade })}>
                    {UNIDADES.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo rotulo="Estoque mínimo" className="sm:col-span-2">
                  <input inputMode="decimal" className="entrada" placeholder="Avisa quando chegar nele" value={rascunho.minimo} onChange={(e) => setRascunho({ ...rascunho, minimo: e.target.value })} />
                </Campo>
                <Campo rotulo="Custo por unidade (R$, opcional)" className="sm:col-span-3">
                  <input inputMode="decimal" className="entrada" value={rascunho.custo} onChange={(e) => setRascunho({ ...rascunho, custo: e.target.value })} />
                </Campo>
                <Campo rotulo="Próxima validade (opcional)" className="sm:col-span-3">
                  <input type="date" className="entrada" value={rascunho.validade} onChange={(e) => setRascunho({ ...rascunho, validade: e.target.value })} />
                </Campo>
                <div className="sm:col-span-6">
                  <button type="submit" className="botao-principal" disabled={ocupado}>
                    Salvar produto
                  </button>
                </div>
              </form>
            </Secao>
          )}

          {mov && produto && (
            <Secao
              titulo={`${mov.tipo === "entrada" ? "Entrada" : mov.tipo === "saida" ? "Saída" : "Ajuste por contagem"} · ${produto.nome}`}
              acao={
                <button className="botao h-8 w-8 px-0" onClick={() => setMov(null)} aria-label="Fechar">
                  <X className="h-4 w-4" />
                </button>
              }
            >
              <form onSubmit={salvarMov} className="flex flex-wrap items-end gap-3">
                <Campo rotulo={mov.tipo === "ajuste" ? `Quantidade contada (${unidadeDe(produto.unidade)})` : `Quantidade (${unidadeDe(produto.unidade)})`} className="w-48">
                  <input required autoFocus inputMode="decimal" className="entrada" value={mov.quantidade} onChange={(e) => setMov({ ...mov, quantidade: e.target.value })} />
                </Campo>
                <Campo rotulo={mov.tipo === "saida" ? "Motivo (perda, quebra, uso interno...)" : "Observação (opcional)"} className="min-w-[220px] flex-1">
                  <input required={mov.tipo === "saida"} className="entrada" placeholder={mov.tipo === "entrada" ? "Ex.: Nota fiscal 1234" : ""} value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} />
                </Campo>
                {mov.tipo === "entrada" && (
                  <Campo rotulo="Validade deste lote" className="w-44">
                    <input type="date" className="entrada" value={mov.validade} onChange={(e) => setMov({ ...mov, validade: e.target.value })} />
                  </Campo>
                )}
                <button type="submit" className="botao-principal h-10" disabled={ocupado}>
                  Lançar
                </button>
                <p className="w-full text-[13px] text-suave">
                  Saldo atual: {num(produto.saldo)} {unidadeDe(produto.unidade)}.
                  {mov.tipo === "ajuste" ? " O ajuste troca o saldo pelo que foi contado e registra a diferença." : ""}
                </p>
              </form>
            </Secao>
          )}

          <section className="cartao p-3">
            <input className="entrada" placeholder="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </section>

          <section className="cartao overflow-hidden">
            {visiveis.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <Boxes className="mx-auto h-8 w-8 text-suave" />
                <p className="mt-3 font-medium">Nenhum produto no estoque</p>
                <p className="mt-1 text-sm text-suave">Cadastre os produtos e lance a entrada do saldo inicial.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-borda bg-elevado/60">
                    <tr>
                      {["Produto", "Saldo", "Mínimo", "Validade", "Custo", "Situação"].map((c, n) => (
                        <th key={c} scope="col" className={clsx("whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave", n > 0 && n < 5 && "text-right")}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((p) => {
                      const s = situacao(p);
                      return (
                        <tr
                          key={p.id}
                          onClick={() => setSelecionado(p.id)}
                          aria-selected={selecionado === p.id}
                          className={clsx("cursor-pointer border-b border-borda last:border-0", selecionado === p.id ? "bg-destaque-suave" : "hover:bg-elevado", !p.ativo && "text-suave")}
                        >
                          <td className="px-4 py-2.5 font-medium">{p.nome}</td>
                          <td className="codigo whitespace-nowrap px-4 py-2.5 text-right text-sm">
                            {num(p.saldo)} <span className="text-suave">{unidadeDe(p.unidade)}</span>
                          </td>
                          <td className="codigo px-4 py-2.5 text-right text-sm text-suave">{num(p.minimo)}</td>
                          <td className="codigo whitespace-nowrap px-4 py-2.5 text-right text-sm">{p.validade ? p.validade.split("-").reverse().join("/") : "—"}</td>
                          <td className="codigo px-4 py-2.5 text-right text-sm text-suave">{p.custo == null ? "—" : reais(p.custo)}</td>
                          <td className={clsx("whitespace-nowrap px-4 py-2.5 font-medium", s.cor)}>{s.texto}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {aba === "fichas" && (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="cartao max-h-[560px] overflow-y-auto">
            <ul className="divide-y divide-borda">
              {itens.map((i) => {
                const n = fichas.filter((f) => f.item_id === i.id).length;
                return (
                  <li key={i.id}>
                    <button
                      onClick={() => setItemFicha(i.id)}
                      className={clsx("flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm", itemFicha === i.id ? "bg-destaque-suave" : "hover:bg-elevado")}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{i.nome}</span>
                      {i.esgotado && <span className="text-[11px] font-semibold text-perigo">Esgotado</span>}
                      <span className="codigo text-[12px] text-suave">{n ? `${n} prod.` : "sem ficha"}</span>
                    </button>
                  </li>
                );
              })}
              {itens.length === 0 && <li className="px-4 py-6 text-sm text-suave">Cadastre itens no Cardápio primeiro.</li>}
            </ul>
          </section>

          {itemFicha ? (
            <Secao titulo={`Ficha de ${itens.find((i) => i.id === itemFicha)?.nome ?? ""}`}>
              <p className="mb-4 text-[13px] text-suave">
                Quanto de cada produto sai do estoque a cada unidade vendida. A baixa acontece quando o item é entregue. Se algum produto não der para uma unidade, o item aparece como
                esgotado no App.
              </p>
              {fichaDoItem.length > 0 && (
                <ul className="mb-4 divide-y divide-borda rounded-lg border border-borda">
                  {fichaDoItem.map((l) => {
                    const p = produtos.find((x) => x.id === l.produto_id);
                    return (
                      <li key={l.produto_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{p?.nome ?? "Produto"}</span>
                        <span className="codigo">
                          {num(l.quantidade)} {p ? unidadeDe(p.unidade) : ""}
                        </span>
                        {p && p.saldo < l.quantidade && <span className="text-[12px] font-semibold text-perigo">sem saldo</span>}
                        <button className="rounded p-1 text-suave hover:text-perigo" disabled={ocupado} onClick={() => removerLinha(l)} aria-label={`Remover ${p?.nome}`}>
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <form onSubmit={adicionarLinha} className="flex flex-wrap items-end gap-3">
                <Campo rotulo="Produto" className="min-w-[200px] flex-1">
                  <select className="entrada" value={novaLinha.produto} onChange={(e) => setNovaLinha({ ...novaLinha, produto: e.target.value })}>
                    <option value="">Escolha...</option>
                    {produtos
                      .filter((p) => p.ativo)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome} ({unidadeDe(p.unidade)})
                        </option>
                      ))}
                  </select>
                </Campo>
                <Campo rotulo="Usa por unidade" className="w-40">
                  <input inputMode="decimal" className="entrada" placeholder="Ex.: 50" value={novaLinha.quantidade} onChange={(e) => setNovaLinha({ ...novaLinha, quantidade: e.target.value })} />
                </Campo>
                <button type="submit" className="botao-principal h-10" disabled={ocupado}>
                  <Plus className="h-4 w-4" />
                  Adicionar
                </button>
              </form>
            </Secao>
          ) : (
            <div className="cartao px-6 py-14 text-center text-sm text-suave">Escolha um item do cardápio para montar a ficha.</div>
          )}
        </div>
      )}

      {aba === "movimentos" && (
        <section className="cartao overflow-hidden">
          {movimentos.length === 0 ? (
            <p className="px-6 py-14 text-center text-sm text-suave">Nenhum movimento ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-borda bg-elevado/60">
                  <tr>
                    {["Quando", "Produto", "Tipo", "Quantidade", "Saldo depois", "Motivo", "Quem"].map((c) => (
                      <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movimentos.map((m) => (
                    <tr key={m.id} className="border-b border-borda last:border-0">
                      <td className="codigo whitespace-nowrap px-4 py-2 text-sm">
                        {new Date(m.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2 font-medium">{m.produto}</td>
                      <td className="px-4 py-2">{NOME_MOV[m.tipo]}</td>
                      <td className={clsx("codigo whitespace-nowrap px-4 py-2 text-sm", m.quantidade < 0 ? "text-perigo" : "text-ok")}>
                        {m.quantidade > 0 ? "+" : ""}
                        {num(m.quantidade)} {m.unidade}
                      </td>
                      <td className="codigo px-4 py-2 text-sm">{num(m.saldo_depois)}</td>
                      <td className="px-4 py-2 text-suave">{m.motivo ?? ""}</td>
                      <td className="px-4 py-2 text-suave">{m.pessoa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </TelaUniversal>
  );
}

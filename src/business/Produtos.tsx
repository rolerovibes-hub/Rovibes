import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Ban, BookOpen, Boxes, Lock, Package, Save, Search, Snowflake, Trash2, Warehouse } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso } from "@/components/Formulario";
import { BuscaBiblioteca } from "@/components/BuscaBiblioteca";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useBusiness } from "@/lib/acessos";
import { SITUACAO_BIBLIOTECA } from "@/lib/biblioteca";
import { carregarEstoque, CAMPOS_PRODUTO, CONSERVACOES, formatarQtd, lerNumero, LocalEstoque, normalizarProduto, paraCampo, ProdutoEstoque, UNIDADES, Unidade } from "@/lib/estoque";

/** Campos que o estabelecimento ajusta. Nome, EAN, foto, marca, categoria e descrição vêm da biblioteca. */
interface Ajustes {
  codigo: string;
  unidade: Unidade;
  embalagem_nome: string;
  embalagem_fator: string;
  minimo: string;
  custo: string;
  controla_validade: boolean;
  conservacao: ProdutoEstoque["conservacao"];
  ncm: string;
  local_padrao_id: string;
  ativo: boolean;
  // Só para produtos sem vínculo com a biblioteca (recusados ou antigos).
  nome: string;
  ean: string;
  marca: string;
  categoria: string;
}

const ajustesDe = (p: ProdutoEstoque): Ajustes => ({
  codigo: p.codigo ?? "",
  unidade: p.unidade,
  embalagem_nome: p.embalagem_nome ?? "",
  embalagem_fator: paraCampo(p.embalagem_fator),
  minimo: paraCampo(p.minimo),
  custo: paraCampo(p.custo),
  controla_validade: p.controla_validade,
  conservacao: p.conservacao,
  ncm: p.ncm ?? "",
  local_padrao_id: p.local_padrao_id ?? "",
  ativo: p.ativo,
  nome: p.nome,
  ean: p.ean ?? "",
  marca: p.marca ?? "",
  categoria: p.categoria ?? "",
});

function Grade({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
function C({ rotulo, span, children }: { rotulo: string; span?: number; children: ReactNode }) {
  return (
    <label className={clsx("block min-w-0", span === 2 && "sm:col-span-2")}>
      <span className="rotulo mb-1 block">{rotulo}</span>
      {children}
    </label>
  );
}
function Bloco({ icone: Icone, titulo, children }: { icone: typeof Package; titulo: string; children: ReactNode }) {
  return (
    <section className="cartao p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <Icone className="h-4 w-4 text-destaque" />
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Foto({ url, tamanho = "h-11 w-11" }: { url?: string | null; tamanho?: string }) {
  return url ? (
    <img src={url} alt="" className={clsx(tamanho, "shrink-0 rounded-lg object-cover")} />
  ) : (
    <span className={clsx(tamanho, "flex shrink-0 items-center justify-center rounded-lg bg-elevado text-suave")}>
      <Package className="h-5 w-5" />
    </span>
  );
}

/** G4003 — Meus produtos: os produtos do estoque do estabelecimento. Os dados do produto vêm da Biblioteca RoVibes. */
export function Produtos() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [produtos, setProdutos] = useState<ProdutoEstoque[] | null>(null);
  const [locais, setLocais] = useState<LocalEstoque[]>([]);
  const [situacoes, setSituacoes] = useState<Map<string, { situacao: string; motivo: string | null }>>(new Map());
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<ProdutoEstoque | null>(null);
  const [form, setForm] = useState<Ajustes | null>(null);
  const [biblioteca, setBiblioteca] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    const r = await carregarEstoque(id);
    if (r.erro) setAviso({ tipo: "erro", texto: /relation|column|does not exist/i.test(r.erro.message) ? "Falta aplicar a atualização 019 do banco." : mensagemDeErro(r.erro) });
    setProdutos(r.produtos);
    setLocais(r.locais.filter((l) => l.ativo));
    const ids = r.produtos.map((p) => p.biblioteca_id).filter(Boolean) as string[];
    if (ids.length) {
      const { data } = await supabase.from("biblioteca_produtos").select("id, situacao, motivo").in("id", ids);
      setSituacoes(new Map(((data ?? []) as { id: string; situacao: string; motivo: string | null }[]).map((x) => [x.id, x])));
    }
    return r.produtos;
  }, [id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrir = (p: ProdutoEstoque) => {
    setSel(p);
    setForm(ajustesDe(p));
    setAviso(null);
  };

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (produtos ?? []).filter((p) => !t || `${p.nome} ${p.codigo ?? ""} ${p.ean ?? ""} ${p.marca ?? ""}`.toLowerCase().includes(t));
  }, [produtos, busca]);

  const set = <K extends keyof Ajustes>(k: K, v: Ajustes[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const ligado = !!sel?.biblioteca_id;
  const alterado = !!sel && !!form && JSON.stringify(form) !== JSON.stringify(ajustesDe(sel));

  const salvar = async () => {
    if (!sel || !form) return;
    const fator = lerNumero(form.embalagem_fator);
    if (form.embalagem_nome.trim() && (!fator || fator <= 0)) return setAviso({ tipo: "erro", texto: `Informe quantos ${form.unidade} vêm em cada ${form.embalagem_nome.toLowerCase()}.` });
    if (!ligado && form.nome.trim().length < 2) return setAviso({ tipo: "erro", texto: "Informe o nome do produto." });
    if (!ligado && form.ean && !/^\d{8,14}$/.test(form.ean)) return setAviso({ tipo: "erro", texto: "O código de barras (EAN) deve ter de 8 a 14 números." });
    const valores: Record<string, unknown> = {
      codigo: form.codigo.trim() || null,
      unidade: form.unidade,
      embalagem_nome: form.embalagem_nome.trim() || null,
      embalagem_fator: form.embalagem_nome.trim() ? fator : null,
      minimo: lerNumero(form.minimo),
      custo: lerNumero(form.custo),
      controla_validade: form.controla_validade,
      conservacao: form.conservacao,
      ncm: form.ncm.trim() || null,
      local_padrao_id: form.local_padrao_id || null,
      ativo: form.ativo,
    };
    if (!ligado) Object.assign(valores, { nome: form.nome.trim(), ean: form.ean.trim() || null, marca: form.marca.trim() || null, categoria: form.categoria.trim() || null });
    setOcupado(true);
    const r = await supabase.from("estoque_produtos").update(valores).eq("id", sel.id).select(CAMPOS_PRODUTO).single();
    setOcupado(false);
    if (r.error) {
      const m = r.error.message;
      return setAviso({ tipo: "erro", texto: /codigo_unico/.test(m) ? "Já existe um produto com esse código interno." : /ean_unico/.test(m) ? "Já existe um produto com esse código de barras." : mensagemDeErro(r.error) });
    }
    const p = normalizarProduto(r.data as Record<string, unknown>);
    setProdutos((l) => (l ?? []).map((x) => (x.id === p.id ? p : x)));
    abrir(p);
    setAviso({ tipo: "ok", texto: "Produto salvo." });
  };

  const excluir = async () => {
    if (!sel || !window.confirm(`Tirar "${sel.nome}" do seu estoque? O histórico dele também será apagado. Para guardar o histórico, desative.`)) return;
    const { error } = await supabase.from("estoque_produtos").delete().eq("id", sel.id);
    if (error) return setAviso({ tipo: "erro", texto: /foreign key|violates/i.test(error.message) ? "Este produto está em receitas ou no cardápio. Desative em vez de excluir." : mensagemDeErro(error) });
    setProdutos((l) => (l ?? []).filter((x) => x.id !== sel.id));
    setSel(null);
    setForm(null);
    setAviso({ tipo: "ok", texto: "Produto retirado do estoque." });
  };

  const daBiblioteca = async (produtoId: string) => {
    setBiblioteca(false);
    const l = await carregar();
    const p = l?.find((x) => x.id === produtoId);
    if (p) {
      abrir(p);
      setAviso({ tipo: "ok", texto: "Produto no seu estoque. Ajuste mínimo, custo e local padrão, e lance o saldo em Estoque → Entrada." });
    }
  };

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const texto = (k: keyof Ajustes, opts?: { mono?: boolean; max?: number; numerico?: boolean; placeholder?: string }) => (
    <input
      value={(form?.[k] as string) ?? ""}
      onChange={(e) => set(k, (opts?.numerico ? e.target.value.replace(/[^\d,.]/g, "") : e.target.value.slice(0, opts?.max ?? 120)) as never)}
      inputMode={opts?.numerico ? "decimal" : undefined}
      placeholder={opts?.placeholder}
      className={clsx("entrada", opts?.mono && "codigo")}
    />
  );
  const sit = sel?.biblioteca_id ? situacoes.get(sel.biblioteca_id) : undefined;

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setBiblioteca(true)}>
            <BookOpen className="h-4 w-4" />
            Adicionar da biblioteca
          </button>
          <button className="botao" disabled={!sel || !alterado || ocupado} onClick={() => void salvar()}>
            <Save className="h-4 w-4" />
            Salvar
          </button>
          <button className="botao" disabled={!form || ocupado} onClick={() => set("ativo", !form?.ativo)}>
            <Ban className="h-4 w-4" />
            {form && !form.ativo ? "Reativar" : "Desativar"}
          </button>
        </>
      }
      rodape={
        <button className="botao w-full text-perigo" disabled={!sel || ocupado} onClick={() => void excluir()}>
          <Trash2 className="h-4 w-4" />
          Tirar do estoque
        </button>
      }
    >
      <section className="cartao p-4">
        <p className="mb-3 text-sm text-suave">Aqui ficam só os produtos do seu estoque. Para incluir um novo, use “Adicionar da biblioteca” (busca por nome ou código de barras).</p>
        <label className="relative block">
          <span className="sr-only">Buscar nos meus produtos</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nos meus produtos (nome, código ou EAN)" className="entrada pl-9" />
        </label>
        {produtos && (
          <ul className="mt-3 max-h-80 divide-y divide-borda overflow-y-auto rounded-lg border border-borda">
            {lista.map((p) => {
              const s = p.biblioteca_id ? situacoes.get(p.biblioteca_id) : undefined;
              const info = s ? SITUACAO_BIBLIOTECA[s.situacao] : undefined;
              return (
                <li key={p.id}>
                  <button onClick={() => abrir(p)} className={clsx("flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-elevado", sel?.id === p.id && "bg-elevado")}>
                    <Foto url={p.foto_url} />
                    <span className="min-w-0 flex-1">
                      <span className={clsx("block truncate font-medium", !p.ativo && "text-suave line-through")}>{p.nome}</span>
                      <span className="codigo block truncate text-[12px] text-suave">{[p.codigo, p.ean].filter(Boolean).join(" · ") || "sem código"}</span>
                    </span>
                    <span className="shrink-0 text-right text-[12px]">
                      <span className="codigo block">
                        {formatarQtd(p.saldo)} {p.unidade}
                      </span>
                      {info ? <span className={clsx("block font-semibold", info.cor)}>{info.nome}</span> : <span className="block text-suave">Fora da biblioteca</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {lista.length === 0 && <li className="px-3 py-6 text-center text-sm text-suave">{produtos.length ? "Nenhum produto encontrado." : "Seu estoque ainda não tem produtos. Use “Adicionar da biblioteca”."}</li>}
          </ul>
        )}
      </section>

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      {sel && form && (
        <>
          <Bloco icone={BookOpen} titulo="Dados do produto">
            <div className="flex gap-4">
              <Foto url={sel.foto_url} tamanho="h-24 w-24" />
              {ligado ? (
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="font-semibold">{sel.nome}</p>
                  {sel.descricao && <p className="text-suave">{sel.descricao}</p>}
                  <p className="codigo text-[12px] text-suave">{[sel.ean && `EAN ${sel.ean}`, sel.marca, sel.categoria].filter(Boolean).join(" · ")}</p>
                  <p className="flex items-center gap-1.5 pt-1 text-[12px] text-suave">
                    <Lock className="h-3.5 w-3.5" />
                    Vem da Biblioteca RoVibes{sit ? ` · ${SITUACAO_BIBLIOTECA[sit.situacao]?.nome ?? sit.situacao}` : ""}. Para corrigir, fale com a equipe RoVibes.
                  </p>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <Grade>
                    <C rotulo="Nome" span={2}>
                      {texto("nome", { max: 160 })}
                    </C>
                    <C rotulo="EAN">{texto("ean", { mono: true, max: 14 })}</C>
                    <C rotulo="Marca">{texto("marca", { max: 60 })}</C>
                    <C rotulo="Categoria" span={2}>
                      {texto("categoria", { max: 60 })}
                    </C>
                  </Grade>
                  <p className="mt-2 text-[12px] text-suave">Este produto não está ligado à biblioteca{sit?.motivo ? ` (recusado: ${sit.motivo})` : ""}.</p>
                </div>
              )}
            </div>
          </Bloco>

          <Bloco icone={Boxes} titulo="Unidade e embalagem">
            <Grade>
              <C rotulo="Código interno">{texto("codigo", { mono: true, max: 30 })}</C>
              <C rotulo="Unidade de controle">
                <select className="entrada" value={form.unidade} onChange={(e) => set("unidade", e.target.value as Unidade)}>
                  {UNIDADES.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </C>
              <C rotulo="Embalagem de compra">{texto("embalagem_nome", { max: 30, placeholder: "Ex.: Fardo, Caixa" })}</C>
              <C rotulo={`Quantidade (${form.unidade}) por embalagem`}>{texto("embalagem_fator", { numerico: true, placeholder: "Ex.: 12" })}</C>
            </Grade>
          </Bloco>

          <Bloco icone={Warehouse} titulo="Estoque">
            <Grade>
              <C rotulo={`Estoque mínimo (${form.unidade})`}>{texto("minimo", { numerico: true })}</C>
              <C rotulo={`Custo por ${form.unidade} (R$)`}>{texto("custo", { numerico: true })}</C>
              <C rotulo="Local padrão">
                <select className="entrada" value={form.local_padrao_id} onChange={(e) => set("local_padrao_id", e.target.value)}>
                  <option value="">Depósito principal</option>
                  {locais.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </select>
              </C>
              <C rotulo="Controla validade">
                <select className="entrada" value={form.controla_validade ? "s" : "n"} onChange={(e) => set("controla_validade", e.target.value === "s")}>
                  <option value="n">Não</option>
                  <option value="s">Sim</option>
                </select>
              </C>
            </Grade>
          </Bloco>

          <Bloco icone={Snowflake} titulo="Conservação e fiscal">
            <Grade>
              <C rotulo="Conservação">
                <select className="entrada" value={form.conservacao} onChange={(e) => set("conservacao", e.target.value as Ajustes["conservacao"])}>
                  {CONSERVACOES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </C>
              <C rotulo="NCM (opcional)">{texto("ncm", { mono: true, max: 10 })}</C>
              <p className="self-end pb-2 text-[12px] text-suave sm:col-span-2">
                {alterado ? <strong className="text-alerta">Alteração não salva.</strong> : form.ativo ? "Ativo." : "Desativado: não aparece para novos itens do cardápio."}
              </p>
            </Grade>
          </Bloco>
        </>
      )}

      {biblioteca && <BuscaBiblioteca estab={id} escolhido={(pid) => void daBiblioteca(pid)} fechar={() => setBiblioteca(false)} />}
    </TelaUniversal>
  );
}

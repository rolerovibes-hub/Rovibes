import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Ban, Barcode, Boxes, Download, Package, Plus, Save, Search, Snowflake, Trash2, Upload, Warehouse } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useBusiness } from "@/lib/acessos";
import { CAMPOS_PRODUTO, CONSERVACOES, formatarQtd, lerNumero, LocalEstoque, normalizarProduto, paraCampo, ProdutoEstoque, UNIDADES, Unidade } from "@/lib/estoque";

interface Form {
  id?: string;
  nome: string;
  codigo: string;
  ean: string;
  marca: string;
  grupo: string;
  categoria: string;
  unidade: Unidade;
  embalagem_nome: string;
  embalagem_fator: string;
  minimo: string;
  custo: string;
  controla_validade: boolean;
  conservacao: "ambiente" | "refrigerado" | "congelado";
  ncm: string;
  local_padrao_id: string;
  ativo: boolean;
}

const vazio = (): Form => ({
  nome: "",
  codigo: "",
  ean: "",
  marca: "",
  grupo: "",
  categoria: "",
  unidade: "un",
  embalagem_nome: "",
  embalagem_fator: "",
  minimo: "",
  custo: "",
  controla_validade: false,
  conservacao: "ambiente",
  ncm: "",
  local_padrao_id: "",
  ativo: true,
});

const doProduto = (p: ProdutoEstoque): Form => ({
  id: p.id,
  nome: p.nome,
  codigo: p.codigo ?? "",
  ean: p.ean ?? "",
  marca: p.marca ?? "",
  grupo: p.grupo ?? "",
  categoria: p.categoria ?? "",
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
});

// Colunas aceitas na planilha (a primeira linha deve ter estes nomes).
const COLUNAS: Record<string, string[]> = {
  nome: ["descricao", "descrição", "nome", "produto"],
  codigo: ["codigo", "código", "sku", "codigo interno", "código interno"],
  ean: ["ean", "gtin", "codigo de barras", "código de barras"],
  marca: ["marca"],
  grupo: ["grupo"],
  categoria: ["categoria"],
  unidade: ["unidade", "un"],
  embalagem_nome: ["embalagem"],
  embalagem_fator: ["fator", "qtd embalagem", "quantidade por embalagem"],
  minimo: ["minimo", "mínimo", "estoque minimo", "estoque mínimo"],
  custo: ["custo", "custo unitario", "custo unitário"],
  ncm: ["ncm"],
};
const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function Grade({ colunas = 4, children }: { colunas?: number; children: ReactNode }) {
  return <div className={clsx("grid gap-3", colunas === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : colunas === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>{children}</div>;
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

/** G4003 — Cadastro de produtos (padrão Expedição CD): busca por código/EAN/nome, cadastro completo e importação de planilha. */
export function Produtos() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [form, setForm] = useState<Form>(vazio());
  const [salvo, setSalvo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ProdutoEstoque[] | null>(null);
  const [locais, setLocais] = useState<LocalEstoque[]>([]);
  const [saldo, setSaldo] = useState<number | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const campoBusca = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("estoque_locais")
      .select("id, nome, tipo, consumo_setor, ativo, ordem")
      .eq("estabelecimento_id", id)
      .eq("ativo", true)
      .order("ordem")
      .then(({ data }) => setLocais((data ?? []) as LocalEstoque[]));
  }, [id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const alterado = salvo !== null && salvo !== JSON.stringify(form);

  const abrir = useCallback((p: ProdutoEstoque) => {
    const f = doProduto(p);
    setForm(f);
    setSalvo(JSON.stringify(f));
    setSaldo(p.saldo);
    setResultados(null);
    setBusca("");
    setAviso(null);
  }, []);

  const pesquisar = async () => {
    const t = busca.trim().replace(/[,()%*]/g, " ").trim();
    if (!t || !id) return;
    const filtro = /^\d{8,14}$/.test(t) ? `ean.eq.${t},codigo.ilike.${t}` : `nome.ilike.%${t}%,codigo.ilike.%${t}%,ean.ilike.%${t}%`;
    const { data, error } = await supabase.from("estoque_produtos").select(CAMPOS_PRODUTO).eq("estabelecimento_id", id).or(filtro).order("nome").limit(50);
    if (error) return setAviso({ tipo: "erro", texto: /column/i.test(error.message) ? "Falta aplicar a atualização 019 do banco." : mensagemDeErro(error) });
    const lista = ((data ?? []) as Record<string, unknown>[]).map(normalizarProduto);
    if (lista.length === 1) return abrir(lista[0]);
    if (lista.length === 0) {
      // Não encontrou: começa um cadastro novo com o que foi digitado.
      const f = vazio();
      if (/^\d{8,14}$/.test(t)) f.ean = t;
      else if (!/\s/.test(t) && t.length <= 20) f.codigo = t.toUpperCase();
      else f.nome = t;
      setForm(f);
      setSalvo(null);
      setSaldo(null);
      setResultados(null);
      setBusca("");
      setAviso({ tipo: "ok", texto: "Produto não encontrado. Preencha o cadastro e salve." });
      return;
    }
    setResultados(lista);
  };

  const novo = () => {
    setForm(vazio());
    setSalvo(null);
    setSaldo(null);
    setResultados(null);
    setAviso(null);
    campoBusca.current?.focus();
  };

  const salvar = async () => {
    if (!id) return;
    if (form.nome.trim().length < 2) return setAviso({ tipo: "erro", texto: "Informe a descrição do produto." });
    if (form.ean && !/^\d{8,14}$/.test(form.ean)) return setAviso({ tipo: "erro", texto: "O código de barras (EAN) deve ter de 8 a 14 números." });
    const fator = lerNumero(form.embalagem_fator);
    if (form.embalagem_nome.trim() && (!fator || fator <= 0)) return setAviso({ tipo: "erro", texto: `Informe quantos ${form.unidade} vêm em cada ${form.embalagem_nome.toLowerCase()}.` });
    const valores = {
      nome: form.nome.trim(),
      codigo: form.codigo.trim() || null,
      ean: form.ean.trim() || null,
      marca: form.marca.trim() || null,
      grupo: form.grupo.trim() || null,
      categoria: form.categoria.trim() || null,
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
    setOcupado(true);
    const r = form.id
      ? await supabase.from("estoque_produtos").update(valores).eq("id", form.id).select(CAMPOS_PRODUTO).single()
      : await supabase
          .from("estoque_produtos")
          .insert({ ...valores, estabelecimento_id: id })
          .select(CAMPOS_PRODUTO)
          .single();
    setOcupado(false);
    if (r.error) {
      const m = r.error.message;
      return setAviso({
        tipo: "erro",
        texto: /codigo_unico/.test(m)
          ? "Já existe um produto com esse código interno."
          : /ean_unico/.test(m)
            ? "Já existe um produto com esse código de barras."
            : /estab.*nome|nome_key|duplicate/.test(m)
              ? "Já existe um produto com essa descrição."
              : mensagemDeErro(r.error),
      });
    }
    const p = normalizarProduto(r.data as Record<string, unknown>);
    abrir(p);
    setAviso({ tipo: "ok", texto: form.id ? "Produto salvo." : "Produto cadastrado. Lance o saldo inicial em Estoque → Entrada." });
  };

  const excluir = async () => {
    if (!form.id || !window.confirm(`Excluir "${form.nome}"? O histórico dele também será apagado. Para guardar o histórico, desative.`)) return;
    const { error } = await supabase.from("estoque_produtos").delete().eq("id", form.id);
    if (error) return setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    novo();
    setAviso({ tipo: "ok", texto: "Produto excluído." });
  };

  const importar = async (f: File) => {
    if (!id) return;
    setOcupado(true);
    setAviso(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer());
      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (!linhas.length) throw new Error("A planilha está vazia.");
      const cabecalhos = Object.keys(linhas[0]);
      const mapa: Record<string, string> = {};
      for (const [campo, nomes] of Object.entries(COLUNAS)) {
        const achado = cabecalhos.find((h) => nomes.includes(semAcento(h)));
        if (achado) mapa[campo] = achado;
      }
      if (!mapa.nome) throw new Error('A planilha precisa ter a coluna "Descrição" (ou "Nome").');
      const registros = linhas.map((l) => Object.fromEntries(Object.entries(mapa).map(([campo, col]) => [campo, String(l[col] ?? "").trim().replace(/^(\d+),(\d+)$/, "$1.$2")])));
      const { data, error } = await supabase.rpc("importar_produtos", { p_estab: id, p_linhas: registros });
      if (error) throw error;
      const r = ((data ?? []) as { gravados: number; erros: string[] }[])[0];
      setAviso({
        tipo: r.erros.length ? "erro" : "ok",
        texto: `${r.gravados} produtos gravados de ${f.name}.${r.erros.length ? ` Não gravados: ${r.erros.slice(0, 5).join("; ")}${r.erros.length > 5 ? "…" : ""}` : ""}`,
      });
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
    } finally {
      setOcupado(false);
      if (arquivo.current) arquivo.current.value = "";
    }
  };

  const baixarModelo = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["Descrição", "Código", "EAN", "Marca", "Grupo", "Categoria", "Unidade", "Embalagem", "Fator", "Mínimo", "Custo", "NCM"],
      ["Cerveja Heineken lata 350ml", "CERV001", "7896045504862", "Heineken", "Bebidas", "Cervejas", "un", "Fardo", 12, 24, 4.5, "22030000"],
      ["Gin Tanqueray 750ml", "GIN001", "", "Tanqueray", "Bebidas", "Destilados", "ml", "Garrafa", 750, 1500, 0.16, ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produtos");
    XLSX.writeFile(wb, "modelo-produtos-rovibes.xlsx");
  };

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const texto = (k: keyof Form, opts?: { mono?: boolean; max?: number; numerico?: boolean; placeholder?: string }) => (
    <input
      value={form[k] as string}
      onChange={(e) => set(k, (opts?.numerico ? e.target.value.replace(/[^\d,.]/g, "") : e.target.value.slice(0, opts?.max ?? 120)) as never)}
      inputMode={opts?.numerico ? "decimal" : undefined}
      placeholder={opts?.placeholder}
      className={clsx("entrada", opts?.mono && "codigo")}
    />
  );

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" disabled={ocupado} onClick={() => void salvar()}>
            <Save className="h-4 w-4" />
            Salvar
          </button>
          <button className="botao" disabled={ocupado} onClick={novo}>
            <Plus className="h-4 w-4" />
            Novo produto
          </button>
          <button className="botao" disabled={ocupado} onClick={() => arquivo.current?.click()}>
            <Upload className="h-4 w-4" />
            Importar planilha
          </button>
          <button className="botao" onClick={() => void baixarModelo()}>
            <Download className="h-4 w-4" />
            Modelo da planilha
          </button>
          <input ref={arquivo} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && void importar(e.target.files[0])} />
          <hr className="col-span-full my-1 border-borda" />
          <button className="botao" disabled={!form.id || ocupado} onClick={() => set("ativo", !form.ativo)}>
            <Ban className="h-4 w-4" />
            {form.ativo ? "Desativar" : "Reativar"}
          </button>
        </>
      }
      rodape={
        <button className="botao w-full text-perigo" disabled={!form.id || ocupado} onClick={() => void excluir()}>
          <Trash2 className="h-4 w-4" />
          Excluir
        </button>
      }
    >
      <section className="cartao p-4">
        <label className="block">
          <span className="rotulo mb-1 block">Código de barras (EAN) / código interno / descrição</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
            <input
              ref={campoBusca}
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void pesquisar()}
              placeholder="Digite ou leia o código e tecle Enter"
              className="entrada pl-9"
            />
          </span>
        </label>
        {resultados && (
          <ul className="mt-3 max-h-72 divide-y divide-borda overflow-y-auto rounded-lg border border-borda">
            {resultados.map((r) => (
              <li key={r.id}>
                <button onClick={() => abrir(r)} className="grid w-full grid-cols-[110px_minmax(0,1fr)_auto] gap-3 px-3 py-2 text-left text-sm hover:bg-elevado">
                  <span className="codigo truncate text-suave">{r.codigo ?? "—"}</span>
                  <span className="truncate">{r.nome}</span>
                  <span className="codigo text-suave">
                    {formatarQtd(r.saldo)} {r.unidade}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <p className="flex flex-wrap items-center gap-2 text-sm">
        <strong>{form.id ? `${form.codigo ? `${form.codigo} · ` : ""}${form.nome}` : "Novo produto"}</strong>
        <span className={clsx("rounded-full px-2 py-0.5 text-[12px] font-semibold", !form.id || alterado ? "bg-alerta/15 text-alerta" : form.ativo ? "bg-ok/15 text-ok" : "bg-elevado text-suave")}>
          {!form.id ? "Inclusão" : alterado ? "Alteração não salva" : form.ativo ? "Ativo" : "Desativado"}
        </span>
        {saldo != null && (
          <span className="text-suave">
            · Saldo total: <strong className="codigo text-texto">{formatarQtd(saldo)}</strong> {form.unidade}
          </span>
        )}
      </p>

      <Bloco icone={Barcode} titulo="Identificação">
        <Grade>
          <C rotulo="Descrição" span={2}>
            {texto("nome", { max: 120, placeholder: "Ex.: Cerveja Heineken lata 350ml" })}
          </C>
          <C rotulo="Código interno">{texto("codigo", { mono: true, max: 30 })}</C>
          <C rotulo="Código de barras (EAN)">{texto("ean", { mono: true, max: 14 })}</C>
          <C rotulo="Marca">{texto("marca", { max: 60 })}</C>
          <C rotulo="Grupo">{texto("grupo", { max: 60, placeholder: "Ex.: Bebidas" })}</C>
          <C rotulo="Categoria" span={2}>
            {texto("categoria", { max: 60, placeholder: "Ex.: Cervejas" })}
          </C>
        </Grade>
      </Bloco>

      <Bloco icone={Boxes} titulo="Unidade e embalagem">
        <Grade>
          <C rotulo="Unidade de controle">
            <select className="entrada" value={form.unidade} onChange={(e) => set("unidade", e.target.value as Unidade)}>
              {UNIDADES.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </C>
          <C rotulo="Embalagem de compra">{texto("embalagem_nome", { max: 30, placeholder: "Ex.: Fardo, Caixa, Garrafa" })}</C>
          <C rotulo={`Quantidade (${form.unidade}) por embalagem`}>{texto("embalagem_fator", { numerico: true, placeholder: "Ex.: 12" })}</C>
          <p className="self-end pb-2 text-[12px] text-suave">
            {form.embalagem_nome && lerNumero(form.embalagem_fator) ? `1 ${form.embalagem_nome.toLowerCase()} = ${form.embalagem_fator} ${form.unidade}. A entrada pode ser lançada em ${form.embalagem_nome.toLowerCase()}s.` : "O estoque conta sempre na unidade de controle."}
          </p>
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
            <select className="entrada" value={form.conservacao} onChange={(e) => set("conservacao", e.target.value as Form["conservacao"])}>
              {CONSERVACOES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </C>
          <C rotulo="NCM (opcional)">{texto("ncm", { mono: true, max: 10 })}</C>
        </Grade>
      </Bloco>
    </TelaUniversal>
  );
}

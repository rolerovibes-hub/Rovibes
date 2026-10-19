import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Ban, Check, Download, GitMerge, Package, Plus, RefreshCw, Save, Search, Upload, X } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso } from "@/components/Formulario";
import { dadosParaBanco, FormularioBiblioteca } from "@/components/FormularioBiblioteca";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { dadosVazios, DadosBiblioteca, SITUACAO_BIBLIOTECA } from "@/lib/biblioteca";

interface Linha {
  id: string;
  ean: string | null;
  nome: string;
  descricao: string | null;
  foto_url: string | null;
  marca: string | null;
  grupo: string | null;
  categoria: string | null;
  unidade: string;
  embalagem_nome: string | null;
  embalagem_fator: number | null;
  industrializado: boolean;
  situacao: "aprovado" | "pendente" | "recusado" | "inativo";
  motivo: string | null;
  enviado_por: string | null;
  enviado_estab: string | null;
  criado_em: string;
  estoques: number;
}

const paraForm = (l: Linha): DadosBiblioteca => ({
  ean: l.ean ?? "",
  nome: l.nome,
  descricao: l.descricao ?? "",
  foto_url: l.foto_url,
  marca: l.marca ?? "",
  grupo: l.grupo ?? "",
  categoria: l.categoria ?? "",
  unidade: l.unidade,
  embalagem_nome: l.embalagem_nome ?? "",
  embalagem_fator: l.embalagem_fator == null ? "" : String(l.embalagem_fator).replace(".", ","),
  industrializado: l.industrializado,
});

// Colunas aceitas na planilha (primeira linha).
const COLUNAS: Record<string, string[]> = {
  nome: ["nome", "nome nf", "descricao nf", "produto"],
  descricao: ["descricao", "descrição"],
  ean: ["ean", "gtin", "codigo de barras", "código de barras"],
  marca: ["marca"],
  grupo: ["grupo"],
  categoria: ["categoria"],
  unidade: ["unidade", "un"],
  embalagem_nome: ["embalagem"],
  embalagem_fator: ["fator", "qtd embalagem", "quantidade por embalagem"],
  foto_url: ["foto", "foto url", "imagem"],
};
const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

type Filtro = "pendente" | "aprovado" | "todos";
const FILTROS: { id: Filtro; nome: string }[] = [
  { id: "pendente", nome: "Em análise" },
  { id: "aprovado", nome: "Aprovados" },
  { id: "todos", nome: "Todos" },
];

/** A1005 — Biblioteca de produtos: a equipe RoVibes aprova, corrige, junta duplicados e importa. */
export function BibliotecaAdmin() {
  const [filtro, setFiltro] = useState<Filtro>("pendente");
  const [termo, setTermo] = useState("");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [sel, setSel] = useState<Linha | null>(null);
  const [form, setForm] = useState<DadosBiblioteca | null>(null);
  const [juntar, setJuntar] = useState(false);
  const [alvoBusca, setAlvoBusca] = useState("");
  const [alvos, setAlvos] = useState<Linha[]>([]);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("biblioteca_admin", { p_situacao: filtro === "todos" ? null : filtro, p_termo: termo.trim() || null });
    if (error) {
      setAviso({ tipo: "erro", texto: /function|schema cache/i.test(error.message) ? "Falta aplicar a atualização 021 do banco." : mensagemDeErro(error) });
      return setLinhas([]);
    }
    setLinhas((data ?? []) as Linha[]);
  }, [filtro, termo]);
  useEffect(() => {
    const t = window.setTimeout(() => void carregar(), 300);
    return () => window.clearTimeout(t);
  }, [carregar]);

  // Busca do produto certo para juntar.
  useEffect(() => {
    if (!juntar || alvoBusca.trim().length < 2) return setAlvos([]);
    const t = window.setTimeout(async () => {
      const { data } = await supabase.rpc("biblioteca_admin", { p_situacao: null, p_termo: alvoBusca.trim() });
      setAlvos(((data ?? []) as Linha[]).filter((l) => l.id !== sel?.id && (l.situacao === "aprovado" || l.situacao === "pendente")));
    }, 300);
    return () => window.clearTimeout(t);
  }, [alvoBusca, juntar, sel?.id]);

  const abrir = (l: Linha) => {
    setSel(l);
    setForm(paraForm(l));
    setJuntar(false);
    setAviso(null);
  };
  const novo = () => {
    setSel(null);
    setForm(dadosVazios());
    setJuntar(false);
    setAviso(null);
  };

  const executar = async (acao: () => PromiseLike<{ error: unknown }>, ok: string, limpar = false) => {
    setOcupado(true);
    setAviso(null);
    const { error } = await acao();
    setOcupado(false);
    if (error) return setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    setAviso({ tipo: "ok", texto: ok });
    if (limpar) {
      setSel(null);
      setForm(null);
      setJuntar(false);
    }
    void carregar();
  };

  const salvar = (aprovar: boolean) =>
    form &&
    void executar(
      () => supabase.rpc("salvar_biblioteca", { p_id: sel?.id ?? null, p_dados: dadosParaBanco(form), p_aprovar: aprovar || !sel }),
      aprovar ? "Produto aprovado. Os estoques ligados foram atualizados." : sel ? "Alterações salvas." : "Produto cadastrado e aprovado.",
      true,
    );

  const recusar = () => {
    if (!sel) return;
    const motivo = window.prompt("Motivo da recusa (o estabelecimento verá):");
    if (!motivo?.trim()) return;
    void executar(() => supabase.rpc("recusar_biblioteca", { p_id: sel.id, p_motivo: motivo.trim() }), "Produto recusado. Ele continua no estoque de quem enviou, sem vínculo.", true);
  };

  const ativar = () => sel && void executar(() => supabase.rpc("desativar_biblioteca", { p_id: sel.id, p_ativo: sel.situacao === "inativo" }), sel.situacao === "inativo" ? "Produto reativado." : "Produto desativado.", true);

  const juntarCom = (destino: Linha) => {
    if (!sel || !window.confirm(`Juntar "${sel.nome}" em "${destino.nome}"? Os estoques, saldos, receitas e itens do cardápio passam para o produto escolhido.`)) return;
    void executar(() => supabase.rpc("juntar_biblioteca", { p_origem: sel.id, p_destino: destino.id }), `Juntado em "${destino.nome}".`, true);
  };

  const importar = async (f: File) => {
    setOcupado(true);
    setAviso(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer());
      const dados = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (!dados.length) throw new Error("A planilha está vazia.");
      const cab = Object.keys(dados[0]);
      const mapa: Record<string, string> = {};
      for (const [campo, nomes] of Object.entries(COLUNAS)) {
        const achado = cab.find((h) => nomes.includes(semAcento(h)));
        if (achado) mapa[campo] = achado;
      }
      if (!mapa.nome) throw new Error('A planilha precisa ter a coluna "Nome" (nome conforme a NF).');
      const registros = dados.map((l) => Object.fromEntries(Object.entries(mapa).map(([campo, col]) => [campo, String(l[col] ?? "").trim().replace(/^(\d+),(\d+)$/, "$1.$2")])));
      const { data, error } = await supabase.rpc("importar_biblioteca", { p_linhas: registros });
      if (error) throw error;
      const r = ((data ?? []) as { gravados: number; erros: string[] }[])[0];
      setAviso({
        tipo: r.erros.length ? "erro" : "ok",
        texto: `${r.gravados} produtos gravados de ${f.name}.${r.erros.length ? ` Não gravados: ${r.erros.slice(0, 5).join("; ")}${r.erros.length > 5 ? "…" : ""}` : ""}`,
      });
      void carregar();
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
      ["Nome", "Descrição", "EAN", "Marca", "Grupo", "Categoria", "Unidade", "Embalagem", "Fator", "Foto"],
      ["CERV HEINEKEN LT 350ML", "Cerveja Heineken lata 350 ml", "7896045504862", "Heineken", "Bebidas", "Cervejas", "un", "Fardo", 12, ""],
      ["LIMAO TAHITI KG", "Limão tahiti a granel", "", "", "Hortifrúti", "Frutas", "kg", "", "", ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Biblioteca");
    XLSX.writeFile(wb, "modelo-biblioteca-rovibes.xlsx");
  };

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" disabled={!form || ocupado} onClick={() => salvar(sel?.situacao === "pendente")}>
            {sel?.situacao === "pendente" ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {sel?.situacao === "pendente" ? "Aprovar" : "Salvar"}
          </button>
          {sel?.situacao === "pendente" && (
            <button className="botao" disabled={ocupado} onClick={() => salvar(false)}>
              <Save className="h-4 w-4" />
              Salvar sem aprovar
            </button>
          )}
          <button className="botao" disabled={!sel || ocupado || sel.situacao === "recusado" || sel.situacao === "inativo"} onClick={() => setJuntar(!juntar)}>
            <GitMerge className="h-4 w-4" />
            Juntar com…
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
          <button className="botao" disabled={!sel || ocupado || sel.situacao === "pendente" || sel.situacao === "recusado"} onClick={ativar}>
            {sel?.situacao === "inativo" ? <RefreshCw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            {sel?.situacao === "inativo" ? "Reativar" : "Desativar"}
          </button>
        </>
      }
      rodape={
        <button className="botao w-full text-perigo" disabled={!sel || sel.situacao !== "pendente" || ocupado} onClick={recusar}>
          <X className="h-4 w-4" />
          Recusar
        </button>
      }
    >
      <section className="cartao p-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Situação">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={clsx("rounded-full border px-3.5 py-1.5 text-sm", filtro === f.id ? "border-marca bg-marca font-medium text-marca-texto" : "border-borda bg-superficie")}
            >
              {f.nome}
            </button>
          ))}
        </div>
        <label className="relative mt-3 block">
          <span className="sr-only">Buscar na biblioteca</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
          <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Nome, marca ou EAN" className="entrada pl-9" />
        </label>
        {linhas && (
          <ul className="mt-3 max-h-80 divide-y divide-borda overflow-y-auto rounded-lg border border-borda">
            {linhas.map((l) => (
              <li key={l.id}>
                <button onClick={() => abrir(l)} className={clsx("flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-elevado", sel?.id === l.id && "bg-elevado")}>
                  {l.foto_url ? (
                    <img src={l.foto_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-elevado text-suave">
                      <Package className="h-5 w-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.nome}</span>
                    <span className="block truncate text-[12px] text-suave">
                      <span className="codigo">{l.ean ?? "sem EAN"}</span>
                      {l.enviado_estab ? ` · enviado por ${l.enviado_estab}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[12px]">
                    <span className={clsx("block font-semibold", SITUACAO_BIBLIOTECA[l.situacao]?.cor)}>{SITUACAO_BIBLIOTECA[l.situacao]?.nome}</span>
                    <span className="block text-suave">{l.estoques} estoque{l.estoques === 1 ? "" : "s"}</span>
                  </span>
                </button>
              </li>
            ))}
            {linhas.length === 0 && <li className="px-3 py-6 text-center text-sm text-suave">Nenhum produto aqui.</li>}
          </ul>
        )}
      </section>

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      {juntar && sel && (
        <section className="cartao p-4">
          <h2 className="mb-1 font-semibold">Juntar “{sel.nome}” com…</h2>
          <p className="mb-3 text-sm text-suave">Escolha o produto certo. Este some da biblioteca e os estoques passam para o escolhido (saldos somados).</p>
          <input autoFocus value={alvoBusca} onChange={(e) => setAlvoBusca(e.target.value)} placeholder="Buscar o produto certo" className="entrada" />
          <ul className="mt-2 divide-y divide-borda rounded-lg border border-borda">
            {alvos.map((a) => (
              <li key={a.id}>
                <button disabled={ocupado} onClick={() => juntarCom(a)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-elevado">
                  <span className="min-w-0 truncate">{a.nome}</span>
                  <span className="codigo shrink-0 text-[12px] text-suave">{a.ean ?? "sem EAN"}</span>
                </button>
              </li>
            ))}
            {alvoBusca.trim().length >= 2 && alvos.length === 0 && <li className="px-3 py-3 text-sm text-suave">Nada encontrado.</li>}
          </ul>
        </section>
      )}

      {form && (
        <section className="cartao p-4">
          <h2 className="mb-1 font-semibold">{sel ? sel.nome : "Novo produto na biblioteca"}</h2>
          {sel && (
            <p className="mb-3 text-[12px] text-suave">
              {SITUACAO_BIBLIOTECA[sel.situacao]?.nome}
              {sel.enviado_estab ? ` · enviado por ${sel.enviado_estab}${sel.enviado_por ? ` (${sel.enviado_por})` : ""}` : ""} · {new Date(sel.criado_em).toLocaleDateString("pt-BR")} · em {sel.estoques} estoque{sel.estoques === 1 ? "" : "s"}
              {sel.motivo ? ` · Motivo: ${sel.motivo}` : ""}
            </p>
          )}
          <FormularioBiblioteca dados={form} mudar={setForm} />
          <label className="mt-3 block">
            <span className="rotulo mb-1 block">Grupo</span>
            <input value={form.grupo} onChange={(e) => setForm({ ...form, grupo: e.target.value.slice(0, 60) })} placeholder="Ex.: Bebidas" className="entrada" />
          </label>
        </section>
      )}
    </TelaUniversal>
  );
}

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  GitMerge,
  History,
  ImageIcon,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Store,
  Trash2,
  Upload,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso } from "@/components/Formulario";
import { dadosParaBanco, FormularioBiblioteca } from "@/components/FormularioBiblioteca";
import { EditorImagem } from "@/components/EditorImagem";
import { PreviaProduto } from "@/components/PreviaProduto";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";
import { caminhoFotoBiblioteca, dadosVazios, DadosBiblioteca, enviarFotoBiblioteca, SITUACAO_BIBLIOTECA } from "@/lib/biblioteca";
import { abrirImagem, AlertaQualidade, analisarQualidade } from "@/lib/imagemProduto";
import { formatarQtd } from "@/lib/estoque";

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
  atualizado_em: string;
  estoques: number;
  total: number;
}

interface Painel {
  total: number;
  aprovado: number;
  pendente: number;
  recusado: number;
  inativo: number;
  sem_foto: number;
  sem_descricao: number;
  sem_categoria: number;
  duplicado: number;
  em_uso: number;
}

interface Uso {
  estabelecimento: string;
  produto: string;
  saldo: number;
  unidade: string;
  ativo: boolean;
  itens_cardapio: number;
}

interface Registro {
  acao: string;
  por: string | null;
  mudancas: Record<string, [unknown, unknown]> | null;
  em: string;
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

type Situacao = "ativos" | "pendente" | "aprovado" | "recusado" | "inativo" | "todos";
const SITUACOES: { id: Situacao; nome: string }[] = [
  { id: "pendente", nome: "Em análise" },
  { id: "aprovado", nome: "Aprovados" },
  { id: "ativos", nome: "Ativos" },
  { id: "recusado", nome: "Recusados" },
  { id: "inativo", nome: "Desativados" },
  { id: "todos", nome: "Todos" },
];
const PROBLEMAS = [
  { id: "", nome: "Qualquer" },
  { id: "sem_foto", nome: "Sem foto" },
  { id: "sem_descricao", nome: "Sem descrição" },
  { id: "sem_categoria", nome: "Sem categoria" },
  { id: "sem_ean", nome: "Sem EAN" },
  { id: "duplicado", nome: "Nome repetido" },
  { id: "sem_uso", nome: "Sem uso em estoques" },
];
const ORDENS = [
  { id: "recentes", nome: "Em análise primeiro, recentes" },
  { id: "alterados", nome: "Alterados por último" },
  { id: "nome", nome: "Nome (A–Z)" },
  { id: "uso", nome: "Mais usados" },
];
const NOME_ACAO: Record<string, string> = {
  criado: "Cadastrado pela equipe",
  enviado: "Enviado por estabelecimento",
  editado: "Editado",
  foto: "Foto trocada",
  aprovado: "Aprovado",
  recusado: "Recusado",
  desativado: "Desativado",
  reativado: "Reativado",
  juntado: "Juntado com outro",
  excluido: "Excluído",
};
const NOME_CAMPO: Record<string, string> = {
  nome: "Nome NF",
  descricao: "Descrição",
  ean: "EAN",
  foto_url: "Foto",
  marca: "Marca",
  grupo: "Grupo",
  categoria: "Categoria",
  unidade: "Unidade",
  embalagem_nome: "Embalagem",
  embalagem_fator: "Qtd. na embalagem",
  industrializado: "Industrializado",
  situacao: "Situação",
  motivo: "Motivo",
  juntado_em: "Juntado em",
};
const POR_PAGINA = 50;

type Aba = "dados" | "foto" | "previa" | "uso" | "historico";
const ABAS: { id: Aba; nome: string; icone: typeof Pencil }[] = [
  { id: "dados", nome: "Dados", icone: Pencil },
  { id: "foto", nome: "Foto", icone: ImageIcon },
  { id: "previa", nome: "Como o cliente vê", icone: Eye },
  { id: "uso", nome: "Onde é usado", icone: Store },
  { id: "historico", nome: "Histórico", icone: History },
];

function Indicador({ rotulo, valor, ativo, alerta, onClick }: { rotulo: string; valor: number | undefined; ativo?: boolean; alerta?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={clsx("cartao min-w-0 px-3 py-2.5 text-left transition-colors hover:bg-elevado", ativo && "border-marca ring-1 ring-marca")}
    >
      <span className="block truncate text-[12px] text-suave">{rotulo}</span>
      <span className={clsx("codigo block text-xl font-semibold", alerta && (valor ?? 0) > 0 && "text-alerta")}>{valor ?? "—"}</span>
    </button>
  );
}

function Miniatura({ url, classe = "h-11 w-11" }: { url: string | null; classe?: string }) {
  return url ? (
    <img src={url} alt="" className={clsx(classe, "shrink-0 rounded-lg border border-borda bg-white object-cover")} loading="lazy" />
  ) : (
    <span className={clsx(classe, "flex shrink-0 items-center justify-center rounded-lg bg-elevado text-suave")}>
      <Package className="h-5 w-5" />
    </span>
  );
}

const valorTexto = (campo: string, v: unknown): ReactNode => {
  if (v === null || v === undefined || v === "") return <em className="text-suave">vazio</em>;
  if (campo === "foto_url") return <img src={String(v)} alt="" className="inline-block h-8 w-8 rounded border border-borda bg-white object-cover align-middle" />;
  if (campo === "situacao") return SITUACAO_BIBLIOTECA[String(v)]?.nome ?? String(v);
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v);
};

/** A1005 — Central da Biblioteca de produtos: a equipe RoVibes cadastra, corrige, trata fotos, aprova, junta, exclui e importa. */
export function BibliotecaAdmin() {
  const { sessao } = useSessao();
  const [painel, setPainel] = useState<Painel | null>(null);
  const [situacao, setSituacao] = useState<Situacao>("pendente");
  const [problema, setProblema] = useState("");
  const [categoria, setCategoria] = useState("");
  const [ordem, setOrdem] = useState("recentes");
  const [termo, setTermo] = useState("");
  const [categorias, setCategorias] = useState<{ categoria: string; produtos: number }[]>([]);
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Linha | null>(null);
  const [form, setForm] = useState<DadosBiblioteca | null>(null);
  const [aba, setAba] = useState<Aba>("dados");
  const [usos, setUsos] = useState<Uso[] | null>(null);
  const [historico, setHistorico] = useState<Registro[] | null>(null);
  const [qualidade, setQualidade] = useState<AlertaQualidade[] | null>(null);
  const [editarFoto, setEditarFoto] = useState<File | string | null>(null);
  const [juntar, setJuntar] = useState(false);
  const [alvoBusca, setAlvoBusca] = useState("");
  const [alvos, setAlvos] = useState<Linha[]>([]);
  const [emUso, setEmUso] = useState<number | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const arquivoFoto = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLDivElement>(null);

  const total = linhas?.[0]?.total ?? 0;
  const alterado = !!form && (sel ? JSON.stringify(form) !== JSON.stringify(paraForm(sel)) : true);

  const listar = useCallback(
    (inicio: number) =>
      supabase.rpc("biblioteca_lista", {
        p_situacao: situacao,
        p_termo: termo.trim() || null,
        p_problema: problema || null,
        p_categoria: categoria || null,
        p_ordem: ordem,
        p_limite: POR_PAGINA,
        p_inicio: inicio,
      }),
    [situacao, termo, problema, categoria, ordem],
  );

  const carregar = useCallback(async () => {
    const [l, p, c] = await Promise.all([listar(0), supabase.rpc("biblioteca_painel"), supabase.rpc("biblioteca_categorias")]);
    if (l.error) {
      setAviso({ tipo: "erro", texto: /function|schema cache/i.test(l.error.message) ? "Falta aplicar a atualização 022 do banco (Central da biblioteca)." : mensagemDeErro(l.error) });
      return setLinhas([]);
    }
    setLinhas(((l.data ?? []) as Linha[]).map((x) => ({ ...x, total: Number(x.total) })));
    setMarcados(new Set());
    if (!p.error) setPainel(p.data as Painel);
    if (!c.error) setCategorias((c.data ?? []) as { categoria: string; produtos: number }[]);
  }, [listar]);
  useEffect(() => {
    const t = window.setTimeout(() => void carregar(), 300);
    return () => window.clearTimeout(t);
  }, [carregar]);

  const maisLinhas = async () => {
    const { data } = await listar(linhas?.length ?? 0);
    setLinhas((l) => [...(l ?? []), ...((data ?? []) as Linha[]).map((x) => ({ ...x, total: Number(x.total) }))]);
  };

  // Abas que buscam dados do produto aberto.
  useEffect(() => {
    if (!sel) return;
    if (aba === "uso") {
      setUsos(null);
      void supabase.rpc("biblioteca_usos", { p_id: sel.id }).then(({ data }) => setUsos((data ?? []) as Uso[]));
    }
    if (aba === "historico") {
      setHistorico(null);
      void supabase.rpc("biblioteca_historico_de", { p_id: sel.id }).then(({ data }) => setHistorico((data ?? []) as Registro[]));
    }
  }, [aba, sel]);

  // Qualidade da foto atual.
  const fotoAtual = form?.foto_url ?? null;
  useEffect(() => {
    setQualidade(null);
    if (!fotoAtual || aba !== "foto") return;
    let vivo = true;
    abrirImagem(fotoAtual)
      .then((i) => vivo && setQualidade(analisarQualidade(i, i.fonte)))
      .catch(() => vivo && setQualidade([{ nivel: "alerta", texto: "Não foi possível analisar a foto." }]));
    return () => {
      vivo = false;
    };
  }, [fotoAtual, aba]);

  const podeSair = () => !alterado || window.confirm("Há alterações não salvas neste produto. Descartar?");

  const abrir = (l: Linha) => {
    if (sel?.id === l.id || !podeSair()) return;
    setSel(l);
    setForm(paraForm(l));
    setJuntar(false);
    setEmUso(null);
    setAviso(null);
    setAba("dados");
    window.setTimeout(() => editor.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const novo = (base?: DadosBiblioteca) => {
    if (!podeSair()) return;
    setSel(null);
    setForm(base ?? dadosVazios());
    setJuntar(false);
    setEmUso(null);
    setAviso(null);
    setAba("dados");
    window.setTimeout(() => editor.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const fechar = () => {
    if (!podeSair()) return;
    setSel(null);
    setForm(null);
    setJuntar(false);
    setEmUso(null);
  };

  const executar = async (acao: () => PromiseLike<{ error: unknown; data?: unknown }>, ok: string, limpar = true) => {
    setOcupado(true);
    setAviso(null);
    const { error, data } = await acao();
    setOcupado(false);
    if (error) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
      return null;
    }
    setAviso({ tipo: "ok", texto: ok });
    if (limpar) {
      setSel(null);
      setForm(null);
      setJuntar(false);
      setEmUso(null);
    }
    void carregar();
    return data ?? true;
  };

  const salvar = async (aprovar: boolean) => {
    if (!form) return;
    if (form.nome.trim().length < 2) return setAviso({ tipo: "erro", texto: "Informe o nome conforme a NF." });
    if (form.industrializado && !/^\d{8,14}$/.test(form.ean)) return setAviso({ tipo: "erro", texto: "Produto industrializado precisa do EAN (8 a 14 números)." });
    const id = (await executar(
      () => supabase.rpc("salvar_biblioteca", { p_id: sel?.id ?? null, p_dados: dadosParaBanco(form), p_aprovar: aprovar || !sel }),
      aprovar ? "Produto aprovado. Os estoques ligados foram atualizados." : sel ? "Alterações salvas. Os estoques ligados foram atualizados." : "Produto cadastrado e aprovado.",
      false,
    )) as string | null;
    if (!id) return;
    // Reabre o produto salvo com os dados do banco.
    const { data } = await supabase.rpc("biblioteca_lista", { p_situacao: "todos", p_termo: form.ean || form.nome.trim(), p_problema: null, p_categoria: null, p_ordem: "alterados", p_limite: 20, p_inicio: 0 });
    const salvo = ((data ?? []) as Linha[]).find((x) => x.id === id);
    if (salvo) {
      setSel(salvo);
      setForm(paraForm(salvo));
    }
  };

  const recusar = () => {
    if (!sel) return;
    const motivo = window.prompt("Motivo da recusa (o estabelecimento verá):");
    if (!motivo?.trim()) return;
    void executar(() => supabase.rpc("recusar_biblioteca", { p_id: sel.id, p_motivo: motivo.trim() }), "Produto recusado. Ele continua no estoque de quem enviou, sem vínculo.");
  };

  const ativar = () =>
    sel && void executar(() => supabase.rpc("desativar_biblioteca", { p_id: sel.id, p_ativo: sel.situacao === "inativo" }), sel.situacao === "inativo" ? "Produto reativado." : "Produto desativado: não aparece mais na busca dos estabelecimentos.");

  const excluir = async () => {
    if (!sel || !window.confirm(`Excluir "${sel.nome}" da biblioteca de vez? Isso não pode ser desfeito.`)) return;
    setOcupado(true);
    setAviso(null);
    const { data, error } = await supabase.rpc("excluir_biblioteca", { p_id: sel.id });
    setOcupado(false);
    if (error) {
      const m = /EM_USO:(\d+)/.exec(error.message);
      if (m) return setEmUso(Number(m[1]));
      return setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    }
    const caminho = caminhoFotoBiblioteca(data as string | null);
    if (caminho) await supabase.storage.from("biblioteca").remove([caminho]);
    setAviso({ tipo: "ok", texto: `"${sel.nome}" excluído da biblioteca.` });
    setSel(null);
    setForm(null);
    void carregar();
  };

  // Busca do produto certo para juntar.
  useEffect(() => {
    if (!juntar || alvoBusca.trim().length < 2) return setAlvos([]);
    const t = window.setTimeout(async () => {
      const { data } = await supabase.rpc("biblioteca_lista", { p_situacao: "ativos", p_termo: alvoBusca.trim(), p_problema: null, p_categoria: null, p_ordem: "nome", p_limite: 20, p_inicio: 0 });
      setAlvos(((data ?? []) as Linha[]).filter((l) => l.id !== sel?.id));
    }, 300);
    return () => window.clearTimeout(t);
  }, [alvoBusca, juntar, sel?.id]);

  const juntarCom = (destino: Linha) => {
    if (!sel || !window.confirm(`Juntar "${sel.nome}" em "${destino.nome}"? Estoques, saldos, receitas e itens do cardápio passam para o produto escolhido.`)) return;
    void executar(() => supabase.rpc("juntar_biblioteca", { p_origem: sel.id, p_destino: destino.id }), `Juntado em "${destino.nome}".`);
  };

  const emLote = (acao: "aprovar" | "desativar" | "reativar") => {
    const ids = [...marcados];
    if (!ids.length) return;
    const nome = { aprovar: "Aprovar", desativar: "Desativar", reativar: "Reativar" }[acao];
    if (!window.confirm(`${nome} ${ids.length} produto(s)?`)) return;
    void executar(() => supabase.rpc("biblioteca_em_lote", { p_ids: ids, p_acao: acao }), `${nome}: feito nos produtos selecionados que estavam na situação certa.`, false);
  };

  // Foto: toda nova foto passa pelo editor; o resultado vai para o formulário (salve para gravar).
  const usarFoto = async (blob: Blob) => {
    if (!sessao || !form) return;
    const url = await enviarFotoBiblioteca(sessao.user.id, blob, true);
    setForm((f) => (f ? { ...f, foto_url: url } : f));
    setEditarFoto(null);
    setAviso({ tipo: "ok", texto: "Foto tratada. Clique em Salvar (ou Aprovar) para gravar." });
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

  const exportar = async () => {
    setOcupado(true);
    try {
      const todas: Linha[] = [];
      for (let inicio = 0; inicio < 20000; inicio += 500) {
        const { data, error } = await supabase.rpc("biblioteca_lista", {
          p_situacao: situacao,
          p_termo: termo.trim() || null,
          p_problema: problema || null,
          p_categoria: categoria || null,
          p_ordem: "nome",
          p_limite: 500,
          p_inicio: inicio,
        });
        if (error) throw error;
        const lote = (data ?? []) as Linha[];
        todas.push(...lote);
        if (lote.length < 500) break;
      }
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(
        todas.map((l) => ({
          Nome: l.nome,
          Descrição: l.descricao ?? "",
          EAN: l.ean ?? "",
          Marca: l.marca ?? "",
          Grupo: l.grupo ?? "",
          Categoria: l.categoria ?? "",
          Unidade: l.unidade,
          Embalagem: l.embalagem_nome ?? "",
          Fator: l.embalagem_fator ?? "",
          Foto: l.foto_url ?? "",
          Situação: SITUACAO_BIBLIOTECA[l.situacao]?.nome ?? l.situacao,
          Estoques: l.estoques,
          "Enviado por": l.enviado_estab ?? "",
        })),
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Biblioteca");
      XLSX.writeFile(wb, `biblioteca-rovibes-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setAviso({ tipo: "ok", texto: `${todas.length} produtos exportados.` });
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
    }
    setOcupado(false);
  };

  const filtrarPor = (s: Situacao, p = "") => {
    setSituacao(s);
    setProblema(p);
  };
  const todosMarcados = !!linhas?.length && linhas.every((l) => marcados.has(l.id));
  const pendente = sel?.situacao === "pendente";

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" disabled={!form || ocupado || (!!sel && !alterado && !pendente)} onClick={() => void salvar(pendente)}>
            {pendente ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {pendente ? "Aprovar" : sel ? "Salvar" : "Cadastrar"}
          </button>
          {pendente && (
            <button className="botao" disabled={ocupado || !alterado} onClick={() => void salvar(false)}>
              <Save className="h-4 w-4" />
              Salvar sem aprovar
            </button>
          )}
          <button className="botao" disabled={ocupado} onClick={() => novo()}>
            <Plus className="h-4 w-4" />
            Novo produto
          </button>
          <button className="botao" disabled={!form || ocupado} onClick={() => form && novo({ ...form, ean: "", industrializado: form.industrializado })}>
            <Copy className="h-4 w-4" />
            Duplicar
          </button>
          <button className="botao" disabled={!sel || ocupado || sel.situacao === "recusado" || sel.situacao === "inativo"} onClick={() => setJuntar(!juntar)}>
            <GitMerge className="h-4 w-4" />
            Juntar com…
          </button>
          <button className="botao" disabled={!sel || ocupado || pendente || sel.situacao === "recusado"} onClick={ativar}>
            {sel?.situacao === "inativo" ? <RefreshCw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            {sel?.situacao === "inativo" ? "Reativar" : "Desativar"}
          </button>
          <button className="botao text-perigo" disabled={!pendente || ocupado} onClick={recusar}>
            <X className="h-4 w-4" />
            Recusar
          </button>
          <hr className="col-span-full my-1 border-borda" />
          <button className="botao" disabled={ocupado} onClick={() => arquivo.current?.click()}>
            <Upload className="h-4 w-4" />
            Importar planilha
          </button>
          <button className="botao" disabled={ocupado} onClick={() => void exportar()}>
            <FileSpreadsheet className="h-4 w-4" />
            Exportar lista
          </button>
          <button className="botao" onClick={() => void baixarModelo()}>
            <Download className="h-4 w-4" />
            Modelo da planilha
          </button>
          <input ref={arquivo} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && void importar(e.target.files[0])} />
        </>
      }
      rodape={
        <button className="botao w-full text-perigo" disabled={!sel || ocupado} onClick={() => void excluir()}>
          <Trash2 className="h-4 w-4" />
          Excluir de vez
        </button>
      }
    >
      {/* Painel */}
      <section aria-label="Resumo da biblioteca" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Indicador rotulo="Ativos" valor={painel?.total} ativo={situacao === "ativos" && !problema} onClick={() => filtrarPor("ativos")} />
        <Indicador rotulo="Em análise" valor={painel?.pendente} alerta ativo={situacao === "pendente" && !problema} onClick={() => filtrarPor("pendente")} />
        <Indicador rotulo="Aprovados" valor={painel?.aprovado} ativo={situacao === "aprovado" && !problema} onClick={() => filtrarPor("aprovado")} />
        <Indicador rotulo="Em estoques" valor={painel?.em_uso} onClick={() => filtrarPor("ativos")} />
        <Indicador rotulo="Sem foto" valor={painel?.sem_foto} alerta ativo={problema === "sem_foto"} onClick={() => filtrarPor("ativos", "sem_foto")} />
        <Indicador rotulo="Sem descrição" valor={painel?.sem_descricao} alerta ativo={problema === "sem_descricao"} onClick={() => filtrarPor("ativos", "sem_descricao")} />
        <Indicador rotulo="Sem categoria" valor={painel?.sem_categoria} alerta ativo={problema === "sem_categoria"} onClick={() => filtrarPor("ativos", "sem_categoria")} />
        <Indicador rotulo="Nome repetido" valor={painel?.duplicado} alerta ativo={problema === "duplicado"} onClick={() => filtrarPor("ativos", "duplicado")} />
      </section>

      {/* Lista */}
      <section className="cartao p-4">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Situação">
          {SITUACOES.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={situacao === f.id}
              onClick={() => setSituacao(f.id)}
              className={clsx("shrink-0 rounded-full border px-3.5 py-1.5 text-sm", situacao === f.id ? "border-marca bg-marca font-medium text-marca-texto" : "border-borda bg-superficie")}
            >
              {f.nome}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <label className="relative block">
            <span className="sr-only">Buscar na biblioteca</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
            <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Nome, descrição, marca ou EAN" className="entrada pl-9" />
          </label>
          <label className="block">
            <span className="sr-only">Pendência</span>
            <select className="entrada" value={problema} onChange={(e) => setProblema(e.target.value)} aria-label="Pendência">
              {PROBLEMAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id ? p.nome : "Pendência: qualquer"}
                </option>
              ))}
            </select>
          </label>
          <select className="entrada" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            <option value="-">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.categoria} value={c.categoria}>
                {c.categoria} ({c.produtos})
              </option>
            ))}
          </select>
          <select className="entrada" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label="Ordem">
            {ORDENS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--marca))]"
              checked={todosMarcados}
              onChange={() => setMarcados(todosMarcados ? new Set() : new Set((linhas ?? []).map((l) => l.id)))}
              aria-label="Selecionar todos desta página"
            />
            <span className="text-suave">{linhas ? `${total} produto${total === 1 ? "" : "s"}` : "Carregando..."}</span>
          </label>
          {marcados.size > 0 && (
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <span className="font-medium">{marcados.size} selecionado(s):</span>
              <button className="botao h-8" disabled={ocupado} onClick={() => emLote("aprovar")}>
                <Check className="h-4 w-4" />
                Aprovar
              </button>
              <button className="botao h-8" disabled={ocupado} onClick={() => emLote("desativar")}>
                <Ban className="h-4 w-4" />
                Desativar
              </button>
              <button className="botao h-8" disabled={ocupado} onClick={() => emLote("reativar")}>
                <RefreshCw className="h-4 w-4" />
                Reativar
              </button>
            </span>
          )}
        </div>

        {linhas && (
          <ul className="mt-2 max-h-[28rem] divide-y divide-borda overflow-y-auto rounded-lg border border-borda">
            {linhas.map((l) => (
              <li key={l.id} className={clsx("flex items-center gap-2 pl-3", sel?.id === l.id && "bg-elevado")}>
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-[rgb(var(--marca))]"
                  checked={marcados.has(l.id)}
                  onChange={() =>
                    setMarcados((m) => {
                      const n = new Set(m);
                      if (n.has(l.id)) n.delete(l.id);
                      else n.add(l.id);
                      return n;
                    })
                  }
                  aria-label={`Selecionar ${l.nome}`}
                />
                <button onClick={() => abrir(l)} className="flex min-w-0 flex-1 items-center gap-3 py-2 pr-3 text-left text-sm hover:bg-elevado">
                  <Miniatura url={l.foto_url} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.nome}</span>
                    <span className="block truncate text-[12px] text-suave">
                      <span className="codigo">{l.ean ?? "sem EAN"}</span>
                      {l.categoria ? ` · ${l.categoria}` : ""}
                      {l.enviado_estab ? ` · enviado por ${l.enviado_estab}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[12px]">
                    <span className={clsx("block font-semibold", SITUACAO_BIBLIOTECA[l.situacao]?.cor)}>{SITUACAO_BIBLIOTECA[l.situacao]?.nome}</span>
                    <span className="block text-suave">
                      {l.estoques} estoque{l.estoques === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {linhas.length === 0 && <li className="px-3 py-6 text-center text-sm text-suave">Nenhum produto com esses filtros.</li>}
          </ul>
        )}
        {linhas && linhas.length < total && (
          <button className="botao mt-2 w-full" onClick={() => void maisLinhas()}>
            Carregar mais ({total - linhas.length} restantes)
          </button>
        )}
      </section>

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      {emUso !== null && sel && (
        <section role="alert" className="cartao border-alerta/50 bg-alerta/10 p-4">
          <p className="flex gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alerta" />
            <span>
              <strong>Não dá para excluir:</strong> “{sel.nome}” está no estoque de {emUso} estabelecimento{emUso === 1 ? "" : "s"}. Junte com o produto certo (os estoques passam para ele) ou desative (some da busca, mas os estoques continuam).
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="botao h-9" onClick={() => (setJuntar(true), setEmUso(null))}>
              <GitMerge className="h-4 w-4" />
              Juntar com…
            </button>
            {sel.situacao === "aprovado" && (
              <button className="botao h-9" onClick={() => (setEmUso(null), ativar())}>
                <Ban className="h-4 w-4" />
                Desativar
              </button>
            )}
            <button className="botao h-9" onClick={() => (setEmUso(null), setAba("uso"))}>
              <Store className="h-4 w-4" />
              Ver onde é usado
            </button>
          </div>
        </section>
      )}

      {juntar && sel && (
        <section className="cartao p-4">
          <h2 className="mb-1 font-semibold">Juntar “{sel.nome}” com…</h2>
          <p className="mb-3 text-sm text-suave">Escolha o produto certo. Este sai da biblioteca e os estoques passam para o escolhido (saldos somados).</p>
          <input autoFocus value={alvoBusca} onChange={(e) => setAlvoBusca(e.target.value)} placeholder="Buscar o produto certo" className="entrada" />
          <ul className="mt-2 divide-y divide-borda rounded-lg border border-borda">
            {alvos.map((a) => (
              <li key={a.id}>
                <button disabled={ocupado} onClick={() => juntarCom(a)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-elevado">
                  <Miniatura url={a.foto_url} classe="h-9 w-9" />
                  <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                  <span className="codigo shrink-0 text-[12px] text-suave">{a.ean ?? "sem EAN"}</span>
                </button>
              </li>
            ))}
            {alvoBusca.trim().length >= 2 && alvos.length === 0 && <li className="px-3 py-3 text-sm text-suave">Nada encontrado.</li>}
          </ul>
        </section>
      )}

      {/* Editor do produto */}
      {form && (
        <section ref={editor} className="cartao scroll-mt-24 overflow-hidden">
          <div className="flex items-start gap-3 border-b border-borda p-4">
            <Miniatura url={form.foto_url} classe="h-14 w-14" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold">{sel ? sel.nome : "Novo produto na biblioteca"}</h2>
              <p className="text-[12px] text-suave">
                {sel ? (
                  <>
                    <span className={clsx("font-semibold", SITUACAO_BIBLIOTECA[sel.situacao]?.cor)}>{SITUACAO_BIBLIOTECA[sel.situacao]?.nome}</span>
                    {sel.enviado_estab ? ` · enviado por ${sel.enviado_estab}${sel.enviado_por ? ` (${sel.enviado_por})` : ""}` : ""} · cadastrado em {new Date(sel.criado_em).toLocaleDateString("pt-BR")} · em {sel.estoques} estoque{sel.estoques === 1 ? "" : "s"}
                    {sel.motivo ? ` · Motivo: ${sel.motivo}` : ""}
                  </>
                ) : (
                  "Cadastrado pela equipe já entra como aprovado."
                )}
                {alterado && <strong className="ml-1 text-alerta">· Alteração não salva</strong>}
              </p>
            </div>
            <button type="button" onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar o produto">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto border-b border-borda px-2 [scrollbar-width:none]" role="tablist" aria-label="Seções do produto">
            {ABAS.filter((a) => sel || a.id === "dados" || a.id === "foto" || a.id === "previa").map((a) => (
              <button
                key={a.id}
                role="tab"
                aria-selected={aba === a.id}
                onClick={() => setAba(a.id)}
                className={clsx("flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm", aba === a.id ? "border-marca font-medium text-destaque" : "border-transparent text-suave hover:text-texto")}
              >
                <a.icone className="h-4 w-4" />
                {a.nome}
              </button>
            ))}
          </div>

          <div className="p-4">
            {aba === "dados" && (
              <div className="space-y-3">
                <FormularioBiblioteca dados={form} mudar={setForm} />
                <label className="block">
                  <span className="rotulo mb-1 block">Grupo</span>
                  <input value={form.grupo} onChange={(e) => setForm({ ...form, grupo: e.target.value.slice(0, 60) })} placeholder="Ex.: Bebidas" className="entrada" list="grupos-biblioteca" />
                </label>
                <p className="text-[12px] text-suave">A descrição é o nome amigável que o cliente vê no cardápio (até 80 letras). O nome conforme a NF ajuda o estabelecimento a achar o produto na nota.</p>
              </div>
            )}

            {aba === "foto" && (
              <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
                <div>
                  <div className="aspect-square w-full overflow-hidden rounded-xl border border-borda bg-white">
                    {form.foto_url ? <img src={form.foto_url} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-suave"><ImageIcon className="h-10 w-10" /></div>}
                  </div>
                  <input ref={arquivoFoto} type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setEditarFoto(f);
                      e.target.value = "";
                    }} />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" className="botao" onClick={() => arquivoFoto.current?.click()}>
                      <Upload className="h-4 w-4" />
                      {form.foto_url ? "Trocar" : "Enviar foto"}
                    </button>
                    <button type="button" className="botao" disabled={!form.foto_url} onClick={() => form.foto_url && setEditarFoto(form.foto_url)}>
                      <Wand2 className="h-4 w-4" />
                      Tratar
                    </button>
                    <button type="button" className="botao col-span-2 text-perigo" disabled={!form.foto_url} onClick={() => setForm({ ...form, foto_url: null })}>
                      <Trash2 className="h-4 w-4" />
                      Tirar a foto
                    </button>
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <section className="rounded-lg border border-borda p-3">
                    <h3 className="rotulo mb-2">Qualidade da foto atual</h3>
                    {!form.foto_url ? (
                      <p className="text-suave">Sem foto. Produtos com foto vendem mais e são encontrados mais rápido.</p>
                    ) : (
                      <ul className="space-y-1.5 text-[13px]">
                        {(qualidade ?? []).map((a) => (
                          <li key={a.texto} className="flex gap-2">
                            {a.nivel === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : a.nivel === "grave" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-perigo" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alerta" />}
                            <span>{a.texto}</span>
                          </li>
                        ))}
                        {!qualidade && <li className="text-suave">Analisando...</li>}
                      </ul>
                    )}
                  </section>
                  <section className="rounded-lg border border-borda p-3 text-[13px] text-suave">
                    <h3 className="rotulo mb-2">Padrão da foto RoVibes</h3>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>Quadrada (1000×1000), fundo branco, produto inteiro e centralizado.</li>
                      <li>Produto ocupando cerca de 85% do quadro (dentro da área tracejada do editor).</li>
                      <li>Bem iluminada, nítida, sem reflexos fortes, sem mãos ou outros objetos.</li>
                      <li>Rótulo de frente e legível.</li>
                    </ul>
                  </section>
                  {form.foto_url !== (sel?.foto_url ?? null) && <p className="font-medium text-alerta">Foto alterada. Clique em Salvar (ou Aprovar) para gravar.</p>}
                </div>
              </div>
            )}

            {aba === "previa" && (
              <PreviaProduto
                dados={{
                  nome: form.nome,
                  descricao: form.descricao,
                  foto_url: form.foto_url,
                  ean: form.ean,
                  marca: form.marca,
                  categoria: form.categoria,
                  unidade: form.unidade,
                  situacao: sel?.situacao ?? "aprovado",
                }}
              />
            )}

            {aba === "uso" && sel && (
              <div>
                {!usos ? (
                  <p className="text-sm text-suave">Carregando...</p>
                ) : usos.length === 0 ? (
                  <p className="text-sm text-suave">Nenhum estabelecimento tem este produto no estoque. Ele pode ser excluído de vez.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-borda text-left text-[12px] text-suave">
                          <th className="py-2 pr-3 font-medium">Estabelecimento</th>
                          <th className="py-2 pr-3 text-right font-medium">Saldo</th>
                          <th className="py-2 pr-3 text-right font-medium">Itens no cardápio</th>
                          <th className="py-2 font-medium">Situação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-borda">
                        {usos.map((u, i) => (
                          <tr key={i}>
                            <td className="py-2 pr-3">{u.estabelecimento}</td>
                            <td className="codigo py-2 pr-3 text-right">
                              {formatarQtd(Number(u.saldo))} {u.unidade}
                            </td>
                            <td className="codigo py-2 pr-3 text-right">{u.itens_cardapio}</td>
                            <td className="py-2">{u.ativo ? "Ativo" : <span className="text-suave">Desativado</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {aba === "historico" && sel && (
              <div>
                {!historico ? (
                  <p className="text-sm text-suave">Carregando...</p>
                ) : historico.length === 0 ? (
                  <p className="text-sm text-suave">Sem registros ainda (o histórico começa a contar a partir da atualização 022).</p>
                ) : (
                  <ol className="space-y-3">
                    {historico.map((h, i) => (
                      <li key={i} className="rounded-lg border border-borda p-3 text-sm">
                        <p>
                          <strong>{NOME_ACAO[h.acao] ?? h.acao}</strong>
                          <span className="text-suave">
                            {" "}
                            · {h.por ?? "sistema"} · {new Date(h.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        </p>
                        {h.mudancas && h.acao !== "criado" && h.acao !== "enviado" && (
                          <ul className="mt-1.5 space-y-1 text-[13px]">
                            {Object.entries(h.mudancas)
                              .filter(([k]) => NOME_CAMPO[k])
                              .map(([k, [antes, depois]]) => (
                                <li key={k} className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-suave">{NOME_CAMPO[k]}:</span>
                                  <span className="line-through decoration-suave/60">{valorTexto(k, antes)}</span>
                                  <span aria-hidden>→</span>
                                  <span>{valorTexto(k, depois)}</span>
                                </li>
                              ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <datalist id="grupos-biblioteca">
        {["Bebidas", "Alimentos", "Hortifrúti", "Carnes", "Laticínios", "Descartáveis", "Limpeza", "Tabacaria"].map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      {editarFoto && <EditorImagem origem={editarFoto} fechar={() => setEditarFoto(null)} usar={usarFoto} />}
    </TelaUniversal>
  );
}

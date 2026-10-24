import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, Plus, Search, Store, X } from "lucide-react";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { reais } from "@/components/Formulario";
import { AREAS_OPERACAO, codCon, nomeArea, useGestao } from "@/lib/gestao";
import { ListaSituacoes, NovaSituacao } from "./Situacoes";

const NOME_SIT: Record<string, string> = { aprovado: "Aprovado", pendente: "Em análise", recusado: "Recusado", suspenso: "Suspenso" };

// ============================================================
// Estabelecimentos
// ============================================================
interface Ficha {
  id: string;
  nome: string;
  codigo: string | null;
  bairro: string | null;
  situacao: string;
  motivo_situacao: string | null;
  criado_em: string;
  logo_url: string | null;
  telefone: string | null;
  usuarios_sistema: number;
  mp_conectado: boolean;
  vendas_30: number;
  pedidos_30: number;
  preparo_medio: number | null;
  nota: number | null;
  suporte_ativo: boolean;
  historico: { quando: string; tipo: string; texto: string; numero: number | null }[];
}

export function FichaEstabelecimento() {
  const { id = "" } = useParams();
  const { nivel } = useGestao();
  const [f, setF] = useState<Ficha | null | undefined>(undefined);
  const [erro, setErro] = useState("");
  const [nova, setNova] = useState(false);
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("ficha_estabelecimento", { p_estab: id });
    if (error) setErro(mensagemDeErro(error));
    setF((data as Ficha | null) ?? null);
  }, [id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (f === undefined) return <p className="cartao p-6 text-sm text-suave">Carregando...</p>;
  if (!f) return <p className="cartao p-6 text-sm text-perigo">{erro || "Estabelecimento não encontrado."}</p>;
  const podeAbrir = AREAS_OPERACAO.some((a) => nivel(a.id) >= 2);

  return (
    <div className="space-y-4">
      <button onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 text-sm text-suave hover:text-texto">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>
      <div className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <section className="cartao space-y-3 p-4">
          <div className="flex items-center gap-3">
            {f.logo_url ? (
              <img src={f.logo_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-elevado text-suave">
                <Store className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{f.nome}</h1>
              <p className="text-[12px] text-suave">
                <span className="codigo">{f.codigo}</span>
                {f.bairro ? ` · ${f.bairro}` : ""} · {NOME_SIT[f.situacao] ?? f.situacao}
              </p>
            </div>
          </div>
          <div className="space-y-1 text-sm">
            <L nome="No RoVibes desde" valor={new Date(f.criado_em).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })} />
            <L nome="Usuários do sistema" valor={String(f.usuarios_sistema)} />
            <L nome="Recebe pelo app" valor={f.mp_conectado ? "Mercado Pago conectado" : "Não"} />
            <L nome="Modo suporte" valor={f.suporte_ativo ? "Liberado agora" : "Não"} />
            {f.telefone && <L nome="Telefone" valor={f.telefone} />}
            {f.motivo_situacao && <L nome="Motivo" valor={f.motivo_situacao} />}
          </div>
          <DecisaoEstabelecimento id={f.id} situacao={f.situacao} nivel={nivel("estabelecimentos")} feito={() => void carregar()} />
          {podeAbrir && (
            <button className="botao w-full" onClick={() => setNova(true)}>
              <Plus className="h-4 w-4" />
              Abrir situação
            </button>
          )}
        </section>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <K valor={reais(Number(f.vendas_30)) || "R$ 0,00"} nome="vendas 30 dias" />
            <K valor={String(f.pedidos_30)} nome="pedidos 30 dias" />
            <K valor={f.preparo_medio != null ? `${f.preparo_medio} min` : "—"} nome="preparo médio" />
            <K valor={f.nota != null ? String(f.nota).replace(".", ",") : "—"} nome="nota" />
          </div>
          <ListaSituacoes estab={f.id} titulo="Situações" />
          <section className="cartao overflow-hidden">
            <h2 className="border-b border-borda px-4 py-2.5 font-semibold">Histórico</h2>
            <ul className="divide-y divide-borda">
              {f.historico.map((h, i) => (
                <li key={i} className="grid grid-cols-[86px_1fr] gap-3 px-4 py-2 text-[13px]">
                  <span className="text-suave">{new Date(h.quando).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })}</span>
                  {h.numero ? (
                    <Link to={`/gestao/situacao/${h.numero}`} className="truncate text-destaque">
                      {h.texto}
                    </Link>
                  ) : (
                    <span className="truncate">{h.texto}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      {nova && <NovaSituacao estab={f.id} fechar={() => setNova(false)} criada={() => void carregar()} />}
    </div>
  );
}

/** Aprovar/recusar (Decidir) e suspender/reativar (Autorizar). */
function DecisaoEstabelecimento({ id, situacao, nivel, feito }: { id: string; situacao: string; nivel: number; feito: () => void }) {
  const [pedindo, setPedindo] = useState<null | "recusado" | "suspenso">(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const decidir = async (nova: string) => {
    setOcupado(true);
    setErro("");
    const { error } = await supabase.rpc("decidir_estabelecimento", { p_estab: id, p_situacao: nova, p_motivo: motivo.trim() || null });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    setPedindo(null);
    setMotivo("");
    feito();
  };
  const botoes: { nome: string; acao: () => void; principal?: boolean; perigo?: boolean }[] = [];
  if (situacao === "pendente" && nivel >= 3) {
    botoes.push({ nome: "Aprovar", acao: () => void decidir("aprovado"), principal: true }, { nome: "Recusar", acao: () => setPedindo("recusado") });
  }
  if (situacao === "recusado" && nivel >= 3) botoes.push({ nome: "Aprovar", acao: () => void decidir("aprovado") });
  if (situacao === "aprovado" && nivel >= 4) botoes.push({ nome: "Suspender", acao: () => setPedindo("suspenso"), perigo: true });
  if (situacao === "suspenso" && nivel >= 4) botoes.push({ nome: "Reativar", acao: () => void decidir("aprovado"), principal: true });
  if (!botoes.length) return null;
  return (
    <div className="space-y-2">
      {pedindo ? (
        <form className="space-y-2" onSubmit={(e) => (e.preventDefault(), void decidir(pedindo))}>
          <input required autoFocus className="entrada" placeholder="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="flex gap-2">
            <button type="submit" className="botao flex-1 text-perigo" disabled={ocupado || !motivo.trim()}>
              {pedindo === "recusado" ? "Recusar" : "Suspender"}
            </button>
            <button type="button" className="botao" onClick={() => setPedindo(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          {botoes.map((b) => (
            <button key={b.nome} className={clsx("flex-1", b.principal ? "botao-principal" : "botao", b.perigo && "text-perigo")} disabled={ocupado} onClick={b.acao}>
              {b.nome}
            </button>
          ))}
        </div>
      )}
      {erro && <p className="text-sm text-perigo">{erro}</p>}
    </div>
  );
}

const FILTROS_ESTAB: [string, string][] = [
  ["todos", "Todos"],
  ["pendente", "Em análise"],
  ["com_situacao", "Com situação"],
  ["aprovado", "Aprovados"],
  ["suspenso", "Suspensos"],
  ["recusado", "Recusados"],
];

function L({ nome, valor }: { nome: string; valor: string }) {
  return (
    <p className="flex justify-between gap-3">
      <span className="text-suave">{nome}</span>
      <span className="truncate text-right">{valor}</span>
    </p>
  );
}
function K({ valor, nome }: { valor: string; nome: string }) {
  return (
    <span className="cartao px-3.5 py-2.5">
      <span className="block text-lg font-semibold leading-tight">{valor}</span>
      <span className="text-[12px] text-suave">{nome}</span>
    </span>
  );
}

export function FichasEstabelecimentos() {
  const [termo, setTermo] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [lista, setLista] = useState<{ id: string; nome: string; codigo: string | null; bairro: string | null; situacao: string; abertas: number }[] | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      supabase.rpc("buscar_estabelecimentos_gestao", { p_termo: termo, p_filtro: filtro }).then(({ data }) => setLista((data ?? []) as typeof lista));
    }, 250);
    return () => window.clearTimeout(t);
  }, [termo, filtro]);
  return (
    <section className="cartao overflow-hidden">
      <div className="space-y-2.5 border-b border-borda p-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
          <input className="entrada pl-9" placeholder="Buscar..." value={termo} onChange={(e) => setTermo(e.target.value)} aria-label="Buscar estabelecimento" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {FILTROS_ESTAB.map(([f, nome]) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={clsx("rounded-full border px-2.5 py-0.5 text-[12px]", filtro === f ? "border-marca bg-marca text-marca-texto" : "border-borda text-suave")}
            >
              {nome}
            </button>
          ))}
        </div>
      </div>
      {lista === null ? (
        <p className="p-6 text-center text-sm text-suave">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="p-10 text-center text-sm text-suave">Nenhum estabelecimento.</p>
      ) : (
        <ul className="divide-y divide-borda">
          {lista.map((e) => (
            <li key={e.id}>
              <Link to={`/gestao/estabelecimento/${e.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-elevado">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.nome}</span>
                  <span className="block text-[12px] text-suave">
                    <span className="codigo">{e.codigo}</span>
                    {e.bairro ? ` · ${e.bairro}` : ""} · {NOME_SIT[e.situacao] ?? e.situacao}
                  </span>
                </span>
                {e.abertas > 0 && <span className="rounded-full bg-alerta/15 px-2 py-0.5 text-[11px] font-bold text-alerta">{e.abertas}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ============================================================
// Suporte e usuários
// ============================================================
export function ModoSuporteAtivo() {
  const [lista, setLista] = useState<{ estabelecimento_id: string; nome: string; expira_em: string; motivo: string | null }[] | null>(null);
  useEffect(() => {
    supabase.rpc("estabelecimentos_em_suporte").then(({ data }) => setLista((data ?? []) as typeof lista));
  }, []);
  return (
    <section className="cartao overflow-hidden">
      {lista === null ? (
        <p className="p-6 text-center text-sm text-suave">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="p-10 text-center text-sm text-suave">Nenhum estabelecimento com modo suporte liberado.</p>
      ) : (
        <ul className="divide-y divide-borda">
          {lista.map((e) => (
            <li key={e.estabelecimento_id} className="flex items-center gap-3 px-4 py-2.5">
              <Link to={`/gestao/estabelecimento/${e.estabelecimento_id}`} className="min-w-0 flex-1">
                <span className="block truncate font-medium">{e.nome}</span>
                <span className="block text-[12px] text-suave">
                  até {new Date(e.expira_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {e.motivo ? ` · ${e.motivo}` : ""}
                </span>
              </Link>
              <a href="/business" target="_blank" rel="noreferrer" className="botao h-8 px-3 text-[13px]">
                Abrir no Business
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ContasEstabelecimentos() {
  const [termo, setTermo] = useState("");
  const [lista, setLista] = useState<{ login: string; criado_em: string; estabelecimento: { id: string; nome: string; codigo: string } | null }[] | null>(null);
  useEffect(() => {
    supabase
      .from("contas_sistema")
      .select("login, criado_em, estabelecimento:estabelecimentos(id, nome, codigo)")
      .order("criado_em", { ascending: false })
      .limit(500)
      .then(({ data }) => setLista((data ?? []) as unknown as typeof lista));
  }, []);
  const t = termo.trim().toLowerCase();
  const vis = (lista ?? []).filter((c) => !t || c.login.includes(t) || (c.estabelecimento?.nome ?? "").toLowerCase().includes(t) || (c.estabelecimento?.codigo ?? "").includes(t));
  return (
    <section className="cartao overflow-hidden">
      <label className="relative block border-b border-borda p-3">
        <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
        <input className="entrada pl-9" placeholder="Buscar usuário ou estabelecimento..." value={termo} onChange={(e) => setTermo(e.target.value)} aria-label="Buscar" />
      </label>
      <ul className="divide-y divide-borda">
        {vis.map((c, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="codigo min-w-0 flex-1 truncate">{c.login}</span>
            {c.estabelecimento && (
              <Link to={`/gestao/estabelecimento/${c.estabelecimento.id}`} className="truncate text-destaque">
                {c.estabelecimento.nome}
              </Link>
            )}
            <span className="w-20 text-right text-[12px] text-suave">{new Date(c.criado_em).toLocaleDateString("pt-BR")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ============================================================
// Conhecimento
// ============================================================
interface Conhecimento {
  id: string;
  numero: number;
  titulo: string;
  area: string;
  sintomas: string | null;
  causa: string | null;
  tratamento: string | null;
  palavras: string[];
  regra: string | null;
  ativo: boolean;
}
const REGRAS: { valor: string; nome: string }[] = [
  { valor: "", nome: "Nenhuma" },
  { valor: "aprovacao:", nome: "Aprovação parada" },
  { valor: "pagamentos:", nome: "Pagamentos falhando" },
  { valor: "atraso:", nome: "Pedidos parados no preparo" },
  { valor: "push:", nome: "Notificações atrasadas" },
];

export function BaseConhecimento() {
  const { nivel } = useGestao();
  const edita = nivel("conhecimento") >= 3;
  const [lista, setLista] = useState<Conhecimento[] | null>(null);
  const [termo, setTermo] = useState("");
  const [edicao, setEdicao] = useState<(Omit<Conhecimento, "id" | "numero" | "palavras"> & { id: string | null; palavras: string }) | null>(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    const { data } = await supabase.from("conhecimentos").select("id, numero, titulo, area, sintomas, causa, tratamento, palavras, regra, ativo").order("numero", { ascending: false });
    setLista((data ?? []) as Conhecimento[]);
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!edicao) return;
    setErro("");
    const { error } = await supabase.rpc("salvar_conhecimento", {
      p_id: edicao.id,
      p_dados: { ...edicao, palavras: edicao.palavras.split(",").map((x) => x.trim()).filter(Boolean) },
    });
    if (error) return setErro(mensagemDeErro(error));
    setEdicao(null);
    await carregar();
  };

  const t = termo.trim().toLowerCase();
  const vis = (lista ?? []).filter((c) => !t || `${c.titulo} ${c.sintomas ?? ""} ${c.palavras.join(" ")}`.toLowerCase().includes(t));
  return (
    <div className="space-y-4">
      {edicao && (
        <form onSubmit={(e) => void salvar(e)} className="cartao space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{edicao.id ? "Editar conhecimento" : "Novo conhecimento"}</h2>
            <button type="button" className="rounded-full p-1.5 hover:bg-elevado" onClick={() => setEdicao(null)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_200px_220px]">
            <input required minLength={3} className="entrada" placeholder="Título" value={edicao.titulo} onChange={(e) => setEdicao({ ...edicao, titulo: e.target.value })} />
            <select className="entrada" value={edicao.area} onChange={(e) => setEdicao({ ...edicao, area: e.target.value })} aria-label="Área">
              {AREAS_OPERACAO.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
            <select className="entrada" value={edicao.regra ?? ""} onChange={(e) => setEdicao({ ...edicao, regra: e.target.value || null })} aria-label="Reconhecer automaticamente">
              {REGRAS.map((r) => (
                <option key={r.valor} value={r.valor}>
                  Automática: {r.nome}
                </option>
              ))}
            </select>
          </div>
          <textarea rows={2} className="entrada" placeholder="Sintomas" value={edicao.sintomas ?? ""} onChange={(e) => setEdicao({ ...edicao, sintomas: e.target.value })} />
          <textarea rows={2} className="entrada" placeholder="Causa" value={edicao.causa ?? ""} onChange={(e) => setEdicao({ ...edicao, causa: e.target.value })} />
          <textarea rows={3} className="entrada" placeholder="Tratamento" value={edicao.tratamento ?? ""} onChange={(e) => setEdicao({ ...edicao, tratamento: e.target.value })} />
          <input className="entrada" placeholder="Palavras-chave (separadas por vírgula)" value={edicao.palavras} onChange={(e) => setEdicao({ ...edicao, palavras: e.target.value })} />
          {erro && <p className="text-sm text-perigo">{erro}</p>}
          <button type="submit" className="botao-principal h-10 px-6">
            Salvar
          </button>
        </form>
      )}
      <section className="cartao overflow-hidden">
        <div className="flex items-center gap-2 border-b border-borda p-3">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
            <input className="entrada pl-9" placeholder="Buscar..." value={termo} onChange={(e) => setTermo(e.target.value)} aria-label="Buscar conhecimento" />
          </label>
          {edita && (
            <button
              className="botao"
              onClick={() => setEdicao({ id: null, titulo: "", area: "suporte", sintomas: "", causa: "", tratamento: "", palavras: "", regra: null, ativo: true })}
            >
              <Plus className="h-4 w-4" />
              Novo
            </button>
          )}
        </div>
        {lista === null ? (
          <p className="p-6 text-center text-sm text-suave">Carregando...</p>
        ) : vis.length === 0 ? (
          <p className="p-10 text-center text-sm text-suave">Nada por aqui.</p>
        ) : (
          <ul className="divide-y divide-borda">
            {vis.map((c) => (
              <li key={c.id}>
                <button
                  className={clsx("block w-full px-4 py-3 text-left", edita && "hover:bg-elevado", !c.ativo && "opacity-50")}
                  disabled={!edita}
                  onClick={() => setEdicao({ ...c, palavras: c.palavras.join(", ") })}
                >
                  <span className="block font-medium">
                    <span className="codigo mr-2 text-[12px] text-suave">{codCon(c.numero)}</span>
                    {c.titulo}
                  </span>
                  <span className="block text-[12px] text-suave">
                    {nomeArea(c.area)}
                    {c.regra ? ` · reconhece: ${REGRAS.find((r) => r.valor === c.regra)?.nome ?? c.regra}` : ""}
                  </span>
                  {c.tratamento && <span className="mt-1 line-clamp-2 block text-[13px]">{c.tratamento}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ============================================================
// Inteligência (preparada, desligada)
// ============================================================
export function InteligenciaConfig() {
  const [ligada, setLigada] = useState<boolean | null>(null);
  useEffect(() => {
    supabase
      .from("config_gestao")
      .select("valor")
      .eq("chave", "inteligencia")
      .maybeSingle()
      .then(({ data }) => setLigada(!!(data as { valor?: { ligada?: boolean } } | null)?.valor?.ligada));
  }, []);
  return (
    <section className="cartao flex items-center justify-between gap-4 p-5">
      <div>
        <p className="font-semibold">Inteligência</p>
        <p className="text-sm text-suave">{ligada === null ? "…" : ligada ? "Ligada" : "Desligada · em breve"}</p>
      </div>
      <span role="switch" aria-checked={!!ligada} aria-disabled="true" className="relative h-[22px] w-[38px] rounded-full bg-borda opacity-60">
        <span className="absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full bg-white" />
      </span>
    </section>
  );
}

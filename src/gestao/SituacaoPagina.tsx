import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, Check, Link2, Lightbulb, Send } from "lucide-react";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";
import { codCon, codSit, ESTADOS, nomeArea, PRIORIDADES, tempoCurto, TIPOS, useGestao } from "@/lib/gestao";

interface Situacao {
  id: string;
  numero: number;
  titulo: string;
  descricao: string | null;
  area: string;
  tipo: string;
  prioridade: string;
  estado: string;
  origem: string;
  responsavel_id: string | null;
  resultado: string | null;
  criado_em: string;
  conhecimento_id: string | null;
  conhecimento: { id: string; numero: number; titulo: string; causa: string | null; tratamento: string | null } | null;
  chave: string | null;
  usuario_alvo: string | null;
  estabelecimento: { id: string; nome: string; codigo: string | null; situacao: string } | null;
}
interface Evento {
  id: number;
  tipo: string;
  texto: string | null;
  dados: { texto?: string | null } | null;
  autor_id: string | null;
  criado_em: string;
}
interface Pessoa {
  usuario_id: string;
  nome: string;
  cargo: string | null;
}
interface Sugestao {
  id: string;
  numero: number;
  titulo: string;
  causa: string | null;
  tratamento: string | null;
  semelhanca: number;
}

const ROTULO_EVENTO: Record<string, string> = { criada: "Abriu", comentario: "Comentou", responsavel: "", prioridade: "", estado: "", conhecimento: "", relacao: "" };

export function SituacaoPagina() {
  const { numero = "" } = useParams();
  const navegar = useNavigate();
  const { sessao } = useSessao();
  const eu = sessao?.user.id;
  const { nivel } = useGestao();
  const [s, setS] = useState<Situacao | null | undefined>(undefined);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [relacionadas, setRelacionadas] = useState<{ numero: number; titulo: string; estado: string }[]>([]);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [comentario, setComentario] = useState("");
  const [painel, setPainel] = useState<null | "resolver" | "passar" | "relacionar" | "conhecer">(null);
  const [valor, setValor] = useState("");
  const [texto, setTexto] = useState("");
  const [con, setCon] = useState({ titulo: "", sintomas: "", causa: "", tratamento: "", palavras: "" });
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from("situacoes")
      .select("id, numero, titulo, descricao, area, tipo, prioridade, estado, origem, responsavel_id, resultado, criado_em, conhecimento_id, chave, usuario_alvo, conhecimento:conhecimentos(id, numero, titulo, causa, tratamento), estabelecimento:estabelecimentos(id, nome, codigo, situacao)")
      .eq("numero", Number(numero))
      .maybeSingle();
    const sit = (data as unknown as Situacao | null) ?? null;
    setS(sit);
    if (!sit) return;
    const [ev, rel, sug] = await Promise.all([
      supabase.from("situacao_eventos").select("id, tipo, texto, dados, autor_id, criado_em").eq("situacao_id", sit.id).order("criado_em"),
      supabase.from("situacao_relacoes").select("a, b").or(`a.eq.${sit.id},b.eq.${sit.id}`),
      sit.conhecimento_id ? Promise.resolve({ data: [] }) : supabase.rpc("sugerir_conhecimentos", { p_situacao: sit.id }),
    ]);
    setEventos((ev.data ?? []) as Evento[]);
    setSugestoes(((sug.data ?? []) as Sugestao[]).filter((x) => x.semelhanca >= 0.25));
    const ids = ((rel.data ?? []) as { a: string; b: string }[]).map((r) => (r.a === sit.id ? r.b : r.a));
    if (ids.length) {
      const { data: rs } = await supabase.from("situacoes").select("numero, titulo, estado").in("id", ids);
      setRelacionadas((rs ?? []) as typeof relacionadas);
    } else setRelacionadas([]);
  }, [numero]);

  useEffect(() => {
    void carregar();
    supabase.rpc("pessoas_gestao").then(({ data }) => setPessoas((data ?? []) as Pessoa[]));
  }, [carregar]);

  if (s === undefined) return <p className="cartao p-6 text-sm text-suave">Carregando...</p>;
  if (s === null) return <p className="cartao p-6 text-sm text-suave">Situação não encontrada (ou sem acesso).</p>;

  const n = nivel(s.area);
  const atua = n >= 2 || s.responsavel_id === eu;
  const decide = n >= 3;
  const fechada = s.estado === "resolvida" || s.estado === "encerrada";
  const nomeDe = (id: string | null) => (id ? pessoas.find((p) => p.usuario_id === id)?.nome ?? (s.origem === "estabelecimento" ? s.estabelecimento?.nome ?? "Estabelecimento" : "Alguém") : "Sistema");

  const agir = async (acao: string, v?: string | null, t?: string | null) => {
    setOcupado(true);
    setErro("");
    const { error } = await supabase.rpc("agir_situacao", { p_id: s.id, p_acao: acao, p_valor: v ?? null, p_texto: t ?? null });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    setPainel(null);
    setValor("");
    setTexto("");
    await carregar();
  };

  const comentar = (e: FormEvent) => {
    e.preventDefault();
    if (!comentario.trim()) return;
    void agir("comentar", null, comentario.trim()).then(() => setComentario(""));
  };

  const registrar = async (e: FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setErro("");
    const { error } = await supabase.rpc("registrar_conhecimento", {
      p_situacao: s.id,
      p_titulo: con.titulo,
      p_sintomas: con.sintomas,
      p_causa: con.causa,
      p_tratamento: con.tratamento,
      p_palavras: con.palavras
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    setPainel(null);
    await carregar();
  };

  return (
    <div className="space-y-3">
      <button onClick={() => (window.history.length > 1 ? navegar(-1) : navegar("/gestao"))} className="inline-flex items-center gap-1.5 text-sm text-suave hover:text-texto">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="cartao overflow-hidden">
          <div className="border-b border-borda px-5 py-4">
            <p className="codigo text-[12px] text-suave">
              {codSit(s.numero)} · aberta {tempoCurto(s.criado_em)}
            </p>
            <h1 className="mt-1 text-lg font-semibold leading-snug">{s.titulo}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
              <span className={clsx("rounded-full px-2 py-0.5 font-semibold text-white", PRIORIDADES[s.prioridade]?.cor)}>{PRIORIDADES[s.prioridade]?.nome}</span>
              <span className="rounded-full border border-borda px-2 py-0.5">{nomeArea(s.area)}</span>
              <span className="rounded-full border border-borda px-2 py-0.5">{TIPOS[s.tipo] ?? s.tipo}</span>
              <span className="rounded-full border border-borda px-2 py-0.5">{ESTADOS[s.estado]}</span>
              {s.estabelecimento && (
                <Link to={`/gestao/estabelecimento/${s.estabelecimento.id}`} className="rounded-full border border-borda px-2 py-0.5 text-destaque">
                  {s.estabelecimento.nome}
                </Link>
              )}
            </div>
            {s.descricao && <p className="mt-3 whitespace-pre-line text-sm">{s.descricao}</p>}
            {s.resultado && fechada && (
              <p className="mt-3 rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">
                <strong>Resultado:</strong> {s.resultado}
              </p>
            )}
          </div>

          <ol className="px-5 py-3">
            {eventos.map((ev) => (
              <li key={ev.id} className="grid grid-cols-[18px_1fr] gap-2.5 py-2">
                <span className={clsx("mt-1.5 h-2.5 w-2.5 rounded-full", ev.tipo === "responsavel" ? "bg-marca" : ev.tipo === "estado" && ev.texto === "Resolvida" ? "bg-ok" : "bg-borda")} />
                <span className="min-w-0 text-sm">
                  <strong>{nomeDe(ev.autor_id)}</strong> {ROTULO_EVENTO[ev.tipo] && ev.tipo !== "comentario" ? <span className="text-suave">{ROTULO_EVENTO[ev.tipo].toLowerCase()}</span> : null}
                  <span className="text-[12px] text-suave"> · {new Date(ev.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  {ev.texto && <span className={clsx("mt-1 block whitespace-pre-line", ev.tipo === "comentario" ? "rounded-lg bg-elevado/70 px-3 py-2" : "text-suave")}>{ev.texto}</span>}
                  {ev.dados?.texto && <span className="mt-1 block whitespace-pre-line rounded-lg bg-elevado/70 px-3 py-2">{ev.dados.texto}</span>}
                </span>
              </li>
            ))}
          </ol>

          {atua && (
            <form onSubmit={comentar} className="flex gap-2 border-t border-borda px-5 py-3">
              <input className="entrada flex-1" placeholder="Escrever no histórico..." value={comentario} onChange={(e) => setComentario(e.target.value)} />
              <button type="submit" className="botao-principal h-10 w-10 shrink-0 px-0" disabled={ocupado || !comentario.trim()} aria-label="Enviar">
                <Send className="h-4 w-4" />
              </button>
            </form>
          )}
        </section>

        <aside className="cartao divide-y divide-borda overflow-hidden">
          {erro && <p className="px-4 py-2.5 text-sm text-perigo">{erro}</p>}
          {atua && (
            <div className="grid grid-cols-2 gap-2 p-3">
              {!s.responsavel_id || (s.responsavel_id !== eu && n >= 2) ? (
                <button className="botao-principal col-span-2" disabled={ocupado} onClick={() => void agir("assumir")}>
                  Assumir
                </button>
              ) : null}
              {!fechada ? (
                <>
                  <button className="botao-principal" disabled={ocupado} onClick={() => setPainel(painel === "resolver" ? null : "resolver")}>
                    Resolver
                  </button>
                  <button className="botao" disabled={ocupado} onClick={() => void agir(s.estado === "aguardando" ? "analisar" : "aguardar")}>
                    {s.estado === "aguardando" ? "Retomar" : "Aguardar"}
                  </button>
                  {(decide || s.responsavel_id === eu) && (
                    <button className="botao" onClick={() => setPainel(painel === "passar" ? null : "passar")}>
                      Passar para…
                    </button>
                  )}
                  {decide && (
                    <select className="entrada h-10" value={s.prioridade} onChange={(e) => void agir("prioridade", e.target.value)} aria-label="Prioridade" disabled={ocupado}>
                      {Object.entries(PRIORIDADES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.nome}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              ) : (
                <button className="botao col-span-2" disabled={ocupado} onClick={() => void agir("analisar")}>
                  Reabrir
                </button>
              )}
              <button className="botao col-span-2" onClick={() => setPainel(painel === "relacionar" ? null : "relacionar")}>
                <Link2 className="h-4 w-4" />
                Relacionar situação
              </button>
            </div>
          )}

          {painel === "resolver" && (
            <form className="space-y-2 p-3" onSubmit={(e) => (e.preventDefault(), void agir("resolver", null, texto))}>
              <textarea required rows={3} autoFocus className="entrada" placeholder="Como foi resolvida?" value={texto} onChange={(e) => setTexto(e.target.value)} />
              <div className="flex gap-2">
                <button type="submit" className="botao-principal flex-1" disabled={ocupado || !texto.trim()}>
                  Confirmar
                </button>
                {decide && (
                  <button type="button" className="botao" disabled={ocupado} onClick={() => void agir("encerrar", null, texto)}>
                    Encerrar sem resolver
                  </button>
                )}
              </div>
            </form>
          )}
          {painel === "passar" && (
            <form className="space-y-2 p-3" onSubmit={(e) => (e.preventDefault(), void agir("passar", valor, texto))}>
              <select required className="entrada" value={valor} onChange={(e) => setValor(e.target.value)} aria-label="Pessoa">
                <option value="">Escolha a pessoa</option>
                {pessoas
                  .filter((p) => p.usuario_id !== s.responsavel_id)
                  .map((p) => (
                    <option key={p.usuario_id} value={p.usuario_id}>
                      {p.nome} {p.cargo ? `· ${p.cargo}` : ""}
                    </option>
                  ))}
              </select>
              <input className="entrada" placeholder="Recado (opcional)" value={texto} onChange={(e) => setTexto(e.target.value)} />
              <button type="submit" className="botao-principal w-full" disabled={ocupado || !valor}>
                Passar
              </button>
            </form>
          )}
          {painel === "relacionar" && (
            <form className="flex gap-2 p-3" onSubmit={(e) => (e.preventDefault(), void agir("relacionar", valor))}>
              <input required autoFocus className="entrada codigo" placeholder="SIT-0001" value={valor} onChange={(e) => setValor(e.target.value)} />
              <button type="submit" className="botao" disabled={ocupado}>
                Ligar
              </button>
            </form>
          )}

          {!fechada && s.chave?.startsWith("aprovacao:") && s.estabelecimento?.situacao === "pendente" && (
            <AcoesAprovacao estab={s.estabelecimento.id} pode={nivel("estabelecimentos") >= 3} feito={() => void carregar()} />
          )}
          {s.chave?.startsWith("denuncia:") && <AcoesDenuncia situacao={s.id} nivel={nivel("seguranca")} feito={() => void carregar()} />}

          {/* Conhecimento */}
          {s.conhecimento ? (
            <div className="space-y-1.5 p-4 text-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ok">Conhecida · {codCon(s.conhecimento.numero)}</p>
              <p className="font-semibold">{s.conhecimento.titulo}</p>
              {s.conhecimento.causa && (
                <p>
                  <span className="text-suave">Causa: </span>
                  {s.conhecimento.causa}
                </p>
              )}
              {s.conhecimento.tratamento && (
                <p>
                  <span className="text-suave">Tratamento: </span>
                  {s.conhecimento.tratamento}
                </p>
              )}
              {atua && (
                <button className="text-[12px] text-suave underline" onClick={() => void agir("conhecimento", "")}>
                  Não é este caso
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2 bg-marca/10 p-4 text-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-destaque">Situação nova</p>
              {sugestoes.length > 0 && (
                <ul className="space-y-1.5">
                  {sugestoes.map((c) => (
                    <li key={c.id} className="rounded-lg border border-borda bg-superficie p-2.5">
                      <p className="flex items-center gap-1.5 font-medium">
                        <Lightbulb className="h-3.5 w-3.5 text-alerta" />
                        {codCon(c.numero)} · {c.titulo}
                      </p>
                      {c.tratamento && <p className="mt-0.5 text-[12px] text-suave">{c.tratamento}</p>}
                      {atua && (
                        <button className="mt-1.5 text-[12px] font-semibold text-destaque" onClick={() => void agir("conhecimento", c.id)}>
                          É este caso
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {atua && painel !== "conhecer" && (
                <button className="botao w-full" onClick={() => (setCon({ titulo: s.titulo, sintomas: s.descricao ?? "", causa: "", tratamento: s.resultado ?? "", palavras: "" }), setPainel("conhecer"))}>
                  Registrar como conhecida
                </button>
              )}
              {painel === "conhecer" && (
                <form onSubmit={(e) => void registrar(e)} className="space-y-2">
                  <input required minLength={3} className="entrada" placeholder="Título" value={con.titulo} onChange={(e) => setCon({ ...con, titulo: e.target.value })} />
                  <textarea rows={2} className="entrada" placeholder="Sintomas" value={con.sintomas} onChange={(e) => setCon({ ...con, sintomas: e.target.value })} />
                  <textarea rows={2} className="entrada" placeholder="Causa" value={con.causa} onChange={(e) => setCon({ ...con, causa: e.target.value })} />
                  <textarea rows={2} className="entrada" placeholder="Tratamento" value={con.tratamento} onChange={(e) => setCon({ ...con, tratamento: e.target.value })} />
                  <input className="entrada" placeholder="Palavras-chave (separadas por vírgula)" value={con.palavras} onChange={(e) => setCon({ ...con, palavras: e.target.value })} />
                  <button type="submit" className="botao-principal w-full" disabled={ocupado}>
                    Salvar conhecimento
                  </button>
                </form>
              )}
            </div>
          )}

          <div className="space-y-1 p-4 text-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-suave">Contexto</p>
            <Linha nome="Responsável" valor={s.responsavel_id ? nomeDe(s.responsavel_id) : "—"} />
            <Linha nome="Origem" valor={{ equipe: "Equipe", estabelecimento: "Estabelecimento", automatica: "Automática", inteligencia: "Inteligência" }[s.origem] ?? s.origem} />
            {s.estabelecimento && <Linha nome="Estabelecimento" valor={s.estabelecimento.nome} />}
            {relacionadas.map((r) => (
              <Link key={r.numero} to={`/gestao/situacao/${r.numero}`} className="block truncate text-[13px] text-destaque">
                {codSit(r.numero)} · {r.titulo}
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Ações do caso: cadastro aguardando aprovação. */
function AcoesAprovacao({ estab, pode, feito }: { estab: string; pode: boolean; feito: () => void }) {
  const [recusar, setRecusar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  if (!pode) return null;
  const decidir = async (situacao: string) => {
    setOcupado(true);
    setErro("");
    const { error } = await supabase.rpc("decidir_estabelecimento", { p_estab: estab, p_situacao: situacao, p_motivo: motivo.trim() || null });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    feito();
  };
  return (
    <div className="space-y-2 p-3">
      <Link to={`/gestao/estabelecimento/${estab}`} className="block text-[13px] text-destaque">
        Ver cadastro
      </Link>
      {recusar ? (
        <form className="space-y-2" onSubmit={(e) => (e.preventDefault(), void decidir("recusado"))}>
          <input required autoFocus className="entrada" placeholder="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="flex gap-2">
            <button type="submit" className="botao flex-1 text-perigo" disabled={ocupado || !motivo.trim()}>
              Recusar
            </button>
            <button type="button" className="botao" onClick={() => setRecusar(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button className="botao-principal" disabled={ocupado} onClick={() => void decidir("aprovado")}>
            <Check className="h-4 w-4" />
            Aprovar
          </button>
          <button className="botao" disabled={ocupado} onClick={() => setRecusar(true)}>
            Recusar
          </button>
        </div>
      )}
      {erro && <p className="text-sm text-perigo">{erro}</p>}
    </div>
  );
}

interface Denuncia {
  id: string;
  tipo_alvo: string;
  motivo: string;
  detalhe: string | null;
  criada_em: string;
  situacao: string;
  acao: string | null;
  denunciante: string | null;
  alvo_nome: string | null;
  alvo_usuario_nome: string | null;
  alvo_texto: string | null;
  alvo_imagem: string | null;
}
const TIPO_ALVO: Record<string, string> = { story: "Story", publicacao: "Publicação", post: "Post", mensagem: "Mensagem", comentario: "Comentário", perfil: "Perfil" };
const ACAO_FEITA: Record<string, string> = { ocultado: "Ocultado", advertido: "Advertido", suspenso: "Conta suspensa", arquivado: "Arquivada" };

/** Ações do caso: denúncias sobre a mesma pessoa ou conteúdo. */
function AcoesDenuncia({ situacao, nivel, feito }: { situacao: string; nivel: number; feito: () => void }) {
  const [lista, setLista] = useState<Denuncia[] | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("denuncias_da_situacao", { p_situacao: situacao });
    if (error) setErro(mensagemDeErro(error));
    setLista((data ?? []) as Denuncia[]);
  }, [situacao]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  if (nivel < 1 || !lista?.length) return erro ? <p className="p-3 text-sm text-perigo">{erro}</p> : null;

  const resolver = async (d: Denuncia, acao: string) => {
    setOcupado(true);
    setErro("");
    const { error } = await supabase.rpc("resolver_denuncia", { p_denuncia: d.id, p_acao: acao, p_nota: null });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    await carregar();
    feito();
  };
  return (
    <div className="space-y-2 p-3">
      {lista.map((d) => {
        const aberta = d.situacao === "aberta";
        return (
          <div key={d.id} className={clsx("space-y-1.5 rounded-lg border border-borda p-2.5 text-[13px]", !aberta && "opacity-60")}>
            <p className="flex items-center justify-between gap-2">
              <span className="font-semibold">{d.motivo}</span>
              <span className="text-[11px] text-suave">{TIPO_ALVO[d.tipo_alvo] ?? d.tipo_alvo}</span>
            </p>
            {(d.alvo_usuario_nome || d.alvo_nome) && <p className="text-suave">{d.alvo_usuario_nome || d.alvo_nome}</p>}
            {d.alvo_imagem && <img src={d.alvo_imagem} alt="" className="max-h-32 rounded-md object-cover" />}
            {d.alvo_texto && <p className="line-clamp-3 rounded-md bg-elevado/70 px-2 py-1.5">{d.alvo_texto}</p>}
            {d.detalhe && <p className="italic text-suave">“{d.detalhe}”</p>}
            {aberta ? (
              nivel >= 3 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {d.tipo_alvo !== "perfil" && (
                    <button className="botao h-8 px-2.5 text-[12px]" disabled={ocupado} onClick={() => void resolver(d, "ocultado")}>
                      Ocultar
                    </button>
                  )}
                  <button className="botao h-8 px-2.5 text-[12px]" disabled={ocupado} onClick={() => void resolver(d, "advertido")}>
                    Advertir
                  </button>
                  {nivel >= 4 && (
                    <button className="botao h-8 px-2.5 text-[12px] text-perigo" disabled={ocupado} onClick={() => void resolver(d, "suspenso")}>
                      Suspender conta
                    </button>
                  )}
                  <button className="botao h-8 px-2.5 text-[12px]" disabled={ocupado} onClick={() => void resolver(d, "arquivado")}>
                    Arquivar
                  </button>
                </div>
              )
            ) : (
              <p className="text-[12px] font-semibold text-ok">{ACAO_FEITA[d.acao ?? ""] ?? "Resolvida"}</p>
            )}
          </div>
        );
      })}
      {erro && <p className="text-sm text-perigo">{erro}</p>}
    </div>
  );
}

function Linha({ nome, valor }: { nome: string; valor: string }) {
  return (
    <p className="flex justify-between gap-3">
      <span className="text-suave">{nome}</span>
      <span className="truncate text-right">{valor}</span>
    </p>
  );
}

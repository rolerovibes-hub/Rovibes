import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import {
  ArrowLeft,
  BarChart3,
  Ban,
  Camera,
  Clock3,
  Lock,
  Megaphone,
  MapPin,
  MicOff,
  Music2,
  Pin,
  PinOff,
  Plus,
  Power,
  Radio,
  Send,
  Sparkles,
  Store,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Carregando } from "@/components/Carregando";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { abrirConversa, enviarMensagem } from "@/lib/chat";
import {
  EnqueteAoVivo,
  EntradaAoVivo,
  enquetesAoVivo,
  entrarAoVivo,
  enviarAoVivo,
  hora,
  MensagemAoVivo,
  mensagensAoVivo,
  movimentoPredominante,
  NOME_MOVIMENTO_AO_VIVO,
  PREVIA_MENSAGENS,
  ResumoAoVivo,
  resumoAoVivo,
  rpcAoVivo,
  urlFotoAoVivo,
} from "@/lib/aoVivo";
import { EscolherPessoas } from "./NovoRole";
import { CartaoDivulgacao } from "@/components/CartaoDivulgacao";
import { ListaGerir, rpc } from "@/lib/promoters";

function FotoAoVivo({ caminho, abrir }: { caminho: string; abrir: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void urlFotoAoVivo(caminho).then(setUrl);
  }, [caminho]);
  return url ? (
    <button type="button" onClick={() => abrir(url)} className="block">
      <img src={url} alt="Foto enviada no chat" className="max-h-80 w-full cursor-zoom-in object-cover" loading="lazy" />
    </button>
  ) : (
    <span className="block h-48 w-56 animate-pulse bg-borda" />
  );
}

function CartaoEnquete({ e, podeVotar, moderador, votar, encerrar }: { e: EnqueteAoVivo; podeVotar: boolean; moderador: boolean; votar: (i: number) => void; encerrar: () => void }) {
  const mostrar = !e.aberta || e.meu_voto !== null || !podeVotar;
  return (
    <div className="mx-auto my-3 w-full max-w-sm rounded-2xl border border-borda bg-superficie p-4">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-destaque">
        <BarChart3 className="h-3.5 w-3.5" />
        Enquete {e.aberta ? "" : "· encerrada"}
      </p>
      <p className="mt-1 font-semibold">{e.pergunta}</p>
      <ul className="mt-3 space-y-2">
        {e.opcoes.map((o, i) => {
          const pct = e.total ? Math.round((e.votos[i] / e.total) * 100) : 0;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={!podeVotar || !e.aberta}
                onClick={() => votar(i)}
                className={clsx("relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm", e.meu_voto === i ? "border-marca" : "border-borda", podeVotar && e.aberta && "hover:bg-elevado")}
              >
                {mostrar && <span className="absolute inset-y-0 left-0 bg-marca/15" style={{ width: `${pct}%` }} aria-hidden />}
                <span className="relative flex justify-between gap-2">
                  <span className={clsx(e.meu_voto === i && "font-semibold")}>{o}</span>
                  {mostrar && <span className="codigo text-suave">{pct}%</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 flex items-center justify-between text-[12px] text-suave">
        <span>
          {e.total} voto{e.total === 1 ? "" : "s"}
          {e.aberta && e.fecha_em ? ` · até ${hora(e.fecha_em)}` : ""}
        </span>
        {moderador && e.aberta && (
          <button type="button" onClick={encerrar} className="font-semibold text-destaque">
            Encerrar
          </button>
        )}
      </p>
    </div>
  );
}

const Folha = ({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: ReactNode }) => (
  <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={titulo} onClick={fechar}>
    <div className="folha max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <button type="button" onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

/** Chat ao vivo do estabelecimento (aberto no horário de funcionamento). */
export function AoVivoPagina() {
  const { estab = "" } = useParams();
  const navegar = useNavigate();
  const { sessao } = useSessao();
  const eu = sessao!.user.id;
  const [entrada, setEntrada] = useState<EntradaAoVivo | null>(null);
  const [msgs, setMsgs] = useState<MensagemAoVivo[]>([]);
  const [enquetes, setEnquetes] = useState<EnqueteAoVivo[]>([]);
  const [resumo, setResumo] = useState<ResumoAoVivo | null>(null);
  const [erro, setErro] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [folha, setFolha] = useState<null | "mais" | "musica" | "ambiente" | "enquete" | "convidar" | "divulgar">(null);
  const [menu, setMenu] = useState<MensagemAoVivo | null>(null);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const autores = useRef(new Map<string, { nome: string | null; usuario: string | null; foto_url: string | null }>());
  const lista = useRef<HTMLDivElement>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const noFim = useRef(true);

  const sala = entrada?.sala ?? null;
  const papel = entrada?.papel;
  const moderador = papel === "moderador";
  const participa = papel === "moderador" || papel === "participante";
  const previa = papel === "previa";
  const silenciado = entrada?.silenciado_ate && new Date(entrada.silenciado_ate).getTime() > agora;

  const carregar = useCallback(async () => {
    try {
      const e = await entrarAoVivo(estab);
      setEntrada(e);
      setErro("");
      if (!e.sala || !["moderador", "participante", "previa"].includes(e.papel)) {
        setMsgs([]);
        return;
      }
      const [m, q, r] = await Promise.all([mensagensAoVivo(e.sala, e.papel === "previa" ? PREVIA_MENSAGENS : 100), enquetesAoVivo(e.sala), resumoAoVivo(e.sala)]);
      for (const x of m) if (x.usuario_id) autores.current.set(x.usuario_id, { nome: x.nome, usuario: x.usuario, foto_url: x.foto_url });
      setMsgs(m);
      setEnquetes(q);
      setResumo(r);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }, [estab]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Relógio (prévia, silêncio e horário de fechamento).
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (previa && entrada?.previa_ate && new Date(entrada.previa_ate).getTime() <= agora) void carregar();
    if (entrada?.fecha_previsto && new Date(entrada.fecha_previsto).getTime() <= agora && sala) void carregar();
  }, [agora, previa, entrada, sala, carregar]);

  // Resumo a cada minuto.
  useEffect(() => {
    if (!sala) return;
    const t = window.setInterval(() => void resumoAoVivo(sala).then(setResumo), 60000);
    return () => window.clearInterval(t);
  }, [sala]);

  // Tempo real.
  useEffect(() => {
    if (!sala || !["moderador", "participante", "previa"].includes(papel ?? "")) return;
    let recarregarEnquetes: number | undefined;
    const atualizarEnquetes = () => {
      window.clearTimeout(recarregarEnquetes);
      recarregarEnquetes = window.setTimeout(() => void enquetesAoVivo(sala).then(setEnquetes).catch(() => undefined), 400);
    };
    const canal = supabase
      .channel(`ao-vivo-${sala}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens_ao_vivo", filter: `sala_id=eq.${sala}` }, async (p) => {
        const m = p.new as MensagemAoVivo & { apagada_em?: string | null };
        let a = m.usuario_id ? autores.current.get(m.usuario_id) : undefined;
        if (m.usuario_id && !a) {
          const { data } = await supabase.from("perfis_publicos").select("nome, usuario, foto_url").eq("id", m.usuario_id).maybeSingle();
          a = (data as { nome: string; usuario: string; foto_url: string | null } | null) ?? { nome: null, usuario: null, foto_url: null };
          autores.current.set(m.usuario_id, a);
        }
        const nova: MensagemAoVivo = { ...m, nome: a?.nome ?? null, usuario: a?.usuario ?? null, foto_url: a?.foto_url ?? null, moderador: false, apagada: false, dados: m.dados ?? {} };
        setMsgs((l) => (l.some((x) => x.id === nova.id) ? l : [...l, nova]));
        if (m.tipo === "enquete") atualizarEnquetes();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "mensagens_ao_vivo", filter: `sala_id=eq.${sala}` }, (p) => {
        const m = p.new as { id: string; apagada_em: string | null };
        if (m.apagada_em) setMsgs((l) => l.filter((x) => x.id !== m.id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "votos_ao_vivo" }, atualizarEnquetes)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "enquetes_ao_vivo", filter: `sala_id=eq.${sala}` }, atualizarEnquetes)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "salas_ao_vivo", filter: `id=eq.${sala}` }, (p) => {
        const s = p.new as { fixada_id: string | null; fechou_em: string | null };
        if (s.fechou_em) void carregar();
        else setEntrada((e) => (e ? { ...e, fixada_id: s.fixada_id } : e));
      })
      .subscribe();
    return () => {
      window.clearTimeout(recarregarEnquetes);
      void supabase.removeChannel(canal);
    };
  }, [sala, papel, carregar]);

  // Rola para o fim quando chega mensagem (se a pessoa já estava no fim).
  useEffect(() => {
    const el = lista.current;
    if (el && noFim.current) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  const visiveis = useMemo(() => (previa ? msgs.slice(-PREVIA_MENSAGENS) : msgs), [msgs, previa]);
  const fixada = entrada?.fixada_id ? msgs.find((m) => m.id === entrada.fixada_id) : undefined;
  const enquetePorId = useMemo(() => new Map(enquetes.map((e) => [e.id, e])), [enquetes]);

  const acao = async (f: () => Promise<unknown>) => {
    setErro("");
    try {
      await f();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  const mandar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!sala || !texto.trim()) return;
    setEnviando(true);
    await acao(async () => {
      await enviarAoVivo(sala, "texto", texto.trim());
      setTexto("");
      noFim.current = true;
    });
    setEnviando(false);
  };

  const mandarFoto = async (l: FileList | null) => {
    const f = l?.[0];
    if (seletor.current) seletor.current.value = "";
    if (!f || !sala) return;
    setFolha(null);
    setEnviando(true);
    await acao(() => enviarAoVivo(sala, "foto", texto.trim() || null, {}, f).then(() => setTexto("")));
    setEnviando(false);
  };

  if (!entrada && !erro) return <Carregando />;

  const restantePrevia = previa && entrada?.previa_ate ? Math.max(0, Math.round((new Date(entrada.previa_ate).getTime() - agora) / 1000)) : 0;
  const mov = movimentoPredominante(resumo);

  return (
    <div className="fixed inset-x-0 top-0 z-40 mx-auto flex h-[100dvh] max-w-xl flex-col bg-fundo sm:border-x sm:border-borda">
      <header className="shrink-0 border-b border-borda bg-fundo pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-2 px-2">
          <button onClick={() => (window.history.length > 1 ? navegar(-1) : navegar("/chats"))} className="rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Link to={`/lugar/${estab}`} className="flex min-w-0 flex-1 items-center gap-2.5">
            {entrada?.estab.logo_url ? (
              <img src={entrada.estab.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-elevado text-suave">
                <Store className="h-4 w-4" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-semibold leading-tight">{entrada?.estab.nome ?? "Chat ao vivo"}</span>
              <span className="flex items-center gap-1.5 text-[12px] text-suave">
                {sala ? (
                  <>
                    <span className="inline-flex items-center gap-1 font-semibold text-perigo">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-perigo" />
                      AO VIVO
                    </span>
                    {entrada?.fecha_previsto && <span>· até {hora(entrada.fecha_previsto)}</span>}
                    {resumo && (
                      <span className="inline-flex items-center gap-0.5">
                        · <Users className="h-3 w-3" /> {resumo.presentes}
                      </span>
                    )}
                  </>
                ) : (
                  "Fechado agora"
                )}
              </span>
            </span>
          </Link>
          {moderador && sala && (
            <button
              onClick={() => window.confirm("Encerrar o chat ao vivo agora? Ele só reabre no próximo horário de funcionamento (ou se a equipe abrir de novo).") && void acao(() => rpcAoVivo("fechar_ao_vivo", { p_estab: estab }).then(carregar))}
              className="rounded-full p-2 text-perigo hover:bg-elevado"
              aria-label="Encerrar chat ao vivo"
            >
              <Power className="h-5 w-5" />
            </button>
          )}
        </div>
        {sala && resumo && (participa || previa) && (
          <div className="flex gap-2 overflow-x-auto px-3 pb-2 text-[12px] [scrollbar-width:none]">
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-elevado px-2.5 py-1">
              <Music2 className="h-3.5 w-3.5 text-destaque" />
              {resumo.musica_agora ? <span className="max-w-[140px] truncate font-medium">{resumo.musica_agora}</span> : "Música"}
              <ThumbsUp className="h-3 w-3 text-ok" /> {resumo.musica_positivos}
              <ThumbsDown className="h-3 w-3 text-perigo" /> {resumo.musica_negativos}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-elevado px-2.5 py-1">
              <Sparkles className="h-3.5 w-3.5 text-destaque" />
              {mov ? NOME_MOVIMENTO_AO_VIVO[mov] : "Ambiente"}
              {resumo.vibe_media != null && <span className="text-suave">· vibe {String(resumo.vibe_media).replace(".", ",")}/5</span>}
            </span>
          </div>
        )}
        {fixada && (
          <div className="flex items-center gap-2 border-t border-borda bg-destaque-suave px-4 py-2 text-[13px]">
            <Pin className="h-3.5 w-3.5 shrink-0 text-destaque" />
            <span className="min-w-0 flex-1 truncate">
              <strong>{fixada.nome ?? "Equipe"}:</strong> {fixada.texto ?? "Foto"}
            </span>
            {moderador && sala && (
              <button onClick={() => void acao(() => rpcAoVivo("fixar_ao_vivo", { p_sala: sala, p_msg: null }))} aria-label="Desafixar" className="text-suave">
                <PinOff className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </header>

      {!sala || !["moderador", "participante", "previa"].includes(papel ?? "") ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destaque-suave text-destaque">
            {papel === "previa_encerrada" ? <Lock className="h-6 w-6" /> : papel === "expulso" ? <Ban className="h-6 w-6" /> : <Radio className="h-6 w-6" />}
          </span>
          {papel === "previa_encerrada" ? (
            <>
              <p className="mt-4 text-lg font-semibold">Sua prévia de hoje acabou</p>
              <p className="mt-1 text-sm text-suave">Faça check-in no lugar para entrar na conversa, avaliar a música e votar nas enquetes.</p>
              <Link to={`/lugar/${estab}?checkin=1`} className="botao-principal mt-5">
                <MapPin className="h-4 w-4" />
                Fazer check-in
              </Link>
            </>
          ) : papel === "expulso" ? (
            <>
              <p className="mt-4 text-lg font-semibold">Você foi removido deste chat</p>
              <p className="mt-1 text-sm text-suave">A moderação do lugar removeu você do chat ao vivo desta noite.</p>
            </>
          ) : papel === "equipe_fechado" ? (
            <>
              <p className="mt-4 text-lg font-semibold">O chat ao vivo está fechado</p>
              <p className="mt-1 text-sm text-suave">Ele abre sozinho no horário de funcionamento. Para um evento fora do horário, abra agora.</p>
              <button className="botao-principal mt-5" onClick={() => void acao(() => rpcAoVivo("abrir_ao_vivo", { p_estab: estab, p_horas: 6 }).then(carregar))}>
                <Radio className="h-4 w-4" />
                Abrir por 6 horas
              </button>
            </>
          ) : (
            <>
              <p className="mt-4 text-lg font-semibold">O chat ao vivo está fechado</p>
              <p className="mt-1 text-sm text-suave">Ele abre quando o lugar abrir. Siga o lugar para saber quando estiver rolando.</p>
            </>
          )}
          {erro && <p className="mt-4 text-sm text-perigo">{erro}</p>}
        </div>
      ) : (
        <>
          {previa && (
            <div className="flex items-center gap-3 border-b border-borda bg-alerta/10 px-4 py-2.5 text-[13px]">
              <Clock3 className="h-4 w-4 shrink-0 text-alerta" />
              <span className="min-w-0 flex-1">
                Prévia: <strong className="codigo">{Math.floor(restantePrevia / 60)}:{String(restantePrevia % 60).padStart(2, "0")}</strong> restantes. Faça check-in para participar.
              </span>
              <Link to={`/lugar/${estab}?checkin=1`} className="shrink-0 rounded-full bg-marca px-3 py-1 text-[12px] font-semibold text-marca-texto">
                Check-in
              </Link>
            </div>
          )}
          <div
            ref={lista}
            className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
            onScroll={(e) => {
              const el = e.currentTarget;
              noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
          >
            {visiveis.length === 0 && <p className="px-6 py-10 text-center text-sm text-suave">Ninguém falou ainda. Comece a conversa!</p>}
            <ul>
              {visiveis.map((m, i) => {
                const minha = m.usuario_id === eu;
                const anterior = visiveis[i - 1];
                const mesmo = anterior && anterior.usuario_id === m.usuario_id && ["texto", "foto"].includes(anterior.tipo) && ["texto", "foto"].includes(m.tipo);
                const abrirMenu = () => (moderador || minha) && m.tipo !== "sistema" && setMenu(m);
                if (m.tipo === "sistema") return <li key={m.id} className="my-2 text-center text-[12px] text-suave">{m.texto}</li>;
                if (m.tipo === "enquete") {
                  const q = m.dados.enquete_id ? enquetePorId.get(m.dados.enquete_id) : undefined;
                  return (
                    <li key={m.id}>
                      {q ? (
                        <CartaoEnquete
                          e={q}
                          podeVotar={participa}
                          moderador={moderador}
                          votar={(o) => void acao(() => rpcAoVivo("votar_enquete_ao_vivo", { p_enquete: q.id, p_opcao: o }).then(() => enquetesAoVivo(sala!).then(setEnquetes)))}
                          encerrar={() => void acao(() => rpcAoVivo("encerrar_enquete_ao_vivo", { p_enquete: q.id }))}
                        />
                      ) : (
                        <p className="my-2 text-center text-[12px] text-suave">Enquete: {m.texto}</p>
                      )}
                    </li>
                  );
                }
                if (m.tipo === "divulgacao" && m.dados.id && (m.dados.alvo === "evento" || m.dados.alvo === "lista")) {
                  return (
                    <li key={m.id} className="my-3 flex flex-col items-center gap-1">
                      <span className="flex items-center gap-1.5 text-[12px] text-suave">
                        <Megaphone className="h-3.5 w-3.5 text-destaque" />
                        <strong className="text-texto">{minha ? "Você" : m.nome ?? "Equipe"}</strong> divulgou
                      </span>
                      <button type="button" onClick={abrirMenu} onContextMenu={(e) => (e.preventDefault(), abrirMenu())} className="text-left">
                        <span onClick={(e) => e.stopPropagation()}>
                          <CartaoDivulgacao tipo={m.dados.alvo} id={m.dados.id} codigo={m.dados.ref} />
                        </span>
                      </button>
                      {m.texto && m.texto !== m.dados.titulo && <span className="max-w-[80%] text-center text-[13px]">{m.texto}</span>}
                    </li>
                  );
                }
                if (m.tipo === "musica" || m.tipo === "ambiente") {
                  return (
                    <li key={m.id} className="my-1.5 flex justify-center">
                      <button type="button" onClick={abrirMenu} className="inline-flex max-w-[90%] items-center gap-1.5 rounded-full bg-elevado px-3 py-1 text-[12px] text-suave">
                        {m.tipo === "musica" ? (
                          <>
                            {m.dados.voto === 1 ? <ThumbsUp className="h-3.5 w-3.5 text-ok" /> : <ThumbsDown className="h-3.5 w-3.5 text-perigo" />}
                            <span className="truncate">
                              <strong className="text-texto">{minha ? "Você" : m.nome ?? "Alguém"}</strong> {m.dados.voto === 1 ? "curtiu" : "não curtiu"} a música
                              {m.dados.musica ? ` · ${m.dados.musica}` : ""}
                            </span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5 text-destaque" />
                            <span className="truncate">
                              <strong className="text-texto">{minha ? "Você" : m.nome ?? "Alguém"}</strong>: {NOME_MOVIMENTO_AO_VIVO[m.dados.movimento ?? ""] ?? ""} · vibe {m.dados.vibe}/5
                            </span>
                          </>
                        )}
                      </button>
                    </li>
                  );
                }
                return (
                  <li key={m.id} className={clsx("flex items-end gap-2", minha ? "justify-end" : "justify-start", mesmo ? "mt-0.5" : "mt-3")}>
                    {!minha && (
                      <Link to={m.usuario ? `/p/${m.usuario}` : "#"} className="w-7 shrink-0">
                        {!mesmo && <Avatar nome={m.nome ?? "?"} foto={m.foto_url} tamanho="sm" />}
                      </Link>
                    )}
                    <div className={clsx("flex max-w-[78%] flex-col", minha ? "items-end" : "items-start")}>
                      {!minha && !mesmo && (
                        <span className="mb-0.5 flex items-center gap-1.5 px-3 text-[12px] font-semibold text-suave">
                          {m.nome ?? "Alguém"}
                          {m.moderador && <span className="rounded bg-destaque-suave px-1.5 text-[10px] font-bold uppercase text-destaque">Equipe</span>}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={abrirMenu}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          abrirMenu();
                        }}
                        className={clsx("overflow-hidden rounded-[20px] text-left text-[15px] leading-snug", minha ? "bg-marca text-marca-texto" : "bg-elevado")}
                      >
                        {m.foto_path && <FotoAoVivo caminho={m.foto_path} abrir={setAmpliada} />}
                        {m.texto && <span className="block whitespace-pre-wrap break-words px-3.5 py-2">{m.texto}</span>}
                      </button>
                      <span className="mt-0.5 px-2 text-[11px] text-suave">{hora(m.criado_em)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {participa ? (
            <form onSubmit={(e) => void mandar(e)} className="pb-seguro shrink-0 bg-fundo px-2 pt-1.5">
              {erro && (
                <p className="mb-1 flex items-center gap-2 px-2 text-[13px] text-perigo">
                  {erro}
                  <button type="button" onClick={() => setErro("")} aria-label="Fechar aviso">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </p>
              )}
              {silenciado ? (
                <p className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-suave">
                  <MicOff className="h-4 w-4" />
                  Você foi silenciado até {hora(entrada!.silenciado_ate!)}.
                </p>
              ) : (
                <div className="flex items-end gap-1.5 pb-2">
                  <input ref={seletor} type="file" accept="image/*" className="hidden" onChange={(e) => void mandarFoto(e.target.files)} />
                  <button type="button" onClick={() => setFolha("mais")} className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-suave hover:bg-elevado hover:text-texto" aria-label="Mais opções">
                    <Plus className="h-6 w-6" />
                  </button>
                  <textarea
                    rows={1}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value.slice(0, 1000))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void mandar();
                      }
                    }}
                    placeholder="Mensagem para todos"
                    className="max-h-32 min-h-[40px] flex-1 resize-none rounded-[20px] bg-elevado px-4 py-2 text-[15px] placeholder:text-suave focus:outline-none focus:ring-2 focus:ring-marca/60"
                  />
                  <button type="submit" disabled={!texto.trim() || enviando} className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca text-marca-texto disabled:opacity-30" aria-label="Enviar">
                    <Send className="h-[18px] w-[18px]" />
                  </button>
                </div>
              )}
            </form>
          ) : (
            <p className="pb-seguro shrink-0 bg-fundo px-4 py-4 text-center text-sm text-suave">Só lendo: faça check-in no lugar para participar.</p>
          )}
        </>
      )}

      {folha === "mais" && sala && (
        <Folha titulo="Ao vivo" fechar={() => setFolha(null)}>
          {[
            { icone: Camera, nome: "Foto", acao: () => seletor.current?.click() },
            { icone: Music2, nome: "Avaliar a música", acao: () => setFolha("musica") },
            { icone: Sparkles, nome: "Avaliar o ambiente", acao: () => setFolha("ambiente") },
            ...(moderador
              ? [
                  { icone: BarChart3, nome: "Criar enquete", acao: () => setFolha("enquete") },
                  { icone: Megaphone, nome: "Divulgar evento ou lista", acao: () => setFolha("divulgar") },
                ]
              : []),
            { icone: UserPlus, nome: "Convidar pessoas", acao: () => setFolha("convidar") },
          ].map((o) => (
            <button key={o.nome} type="button" onClick={o.acao} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-elevado">
              <o.icone className="h-5 w-5 text-destaque" />
              {o.nome}
            </button>
          ))}
        </Folha>
      )}

      {folha === "musica" && sala && <AvaliarMusica fechar={() => setFolha(null)} enviar={(voto, musica) => acao(() => enviarAoVivo(sala, "musica", null, { voto, musica }).then(() => setFolha(null)))} />}
      {folha === "ambiente" && sala && <AvaliarAmbiente fechar={() => setFolha(null)} enviar={(movimento, vibe) => acao(() => enviarAoVivo(sala, "ambiente", null, { movimento, vibe }).then(() => setFolha(null)))} />}
      {folha === "enquete" && sala && (
        <NovaEnquete
          fechar={() => setFolha(null)}
          criar={(pergunta, opcoes, minutos) => acao(() => rpcAoVivo("criar_enquete_ao_vivo", { p_sala: sala, p_pergunta: pergunta, p_opcoes: opcoes, p_minutos: minutos }).then(() => setFolha(null)))}
        />
      )}
      {folha === "divulgar" && sala && (
        <DivulgarAoVivo
          estab={estab}
          fechar={() => setFolha(null)}
          divulgar={(tipo, id, texto) => acao(() => rpcAoVivo("divulgar_ao_vivo", { p_sala: sala, p_tipo: tipo, p_id: id, p_texto: texto }).then(() => setFolha(null)))}
        />
      )}
      {folha === "convidar" && entrada && (
        <Folha titulo="Convidar pessoas" fechar={() => setFolha(null)}>
          <div className="px-1 pb-2">
            <EscolherPessoas
              textoBotao="Enviar convite"
              cancelar={() => setFolha(null)}
              confirmar={async (ids) => {
                for (const id of ids) {
                  const conversa = await abrirConversa(id);
                  await enviarMensagem(conversa, `Bora? O chat ao vivo do ${entrada.estab.nome} está rolando agora 🎶`, null, estab);
                }
                setFolha(null);
              }}
            />
          </div>
        </Folha>
      )}

      {menu && sala && (
        <Folha titulo="Mensagem" fechar={() => setMenu(null)}>
          {moderador && (menu.tipo === "texto" || menu.tipo === "foto") && (
            <button type="button" className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-elevado" onClick={() => void acao(() => rpcAoVivo("fixar_ao_vivo", { p_sala: sala, p_msg: menu.id })).then(() => setMenu(null))}>
              <Pin className="h-4 w-4" />
              Fixar no topo
            </button>
          )}
          {moderador && menu.usuario_id && menu.usuario_id !== eu && (
            <>
              <button type="button" className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-elevado" onClick={() => void acao(() => rpcAoVivo("silenciar_ao_vivo", { p_sala: sala, p_usuario: menu.usuario_id, p_minutos: 10, p_expulsar: false })).then(() => setMenu(null))}>
                <MicOff className="h-4 w-4" />
                Silenciar {menu.nome ?? ""} por 10 min
              </button>
              <button type="button" className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-elevado" onClick={() => void acao(() => rpcAoVivo("silenciar_ao_vivo", { p_sala: sala, p_usuario: menu.usuario_id, p_minutos: 60, p_expulsar: false })).then(() => setMenu(null))}>
                <MicOff className="h-4 w-4" />
                Silenciar por 1 hora
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-perigo hover:bg-elevado"
                onClick={() => window.confirm(`Remover ${menu.nome ?? "esta pessoa"} do chat ao vivo desta noite?`) && void acao(() => rpcAoVivo("silenciar_ao_vivo", { p_sala: sala, p_usuario: menu.usuario_id, p_minutos: 0, p_expulsar: true })).then(() => setMenu(null))}
              >
                <Ban className="h-4 w-4" />
                Remover do chat desta noite
              </button>
            </>
          )}
          {(moderador || menu.usuario_id === eu) && (
            <button
              type="button"
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-perigo hover:bg-elevado"
              onClick={() =>
                void acao(() => rpcAoVivo("apagar_ao_vivo", { p_msg: menu.id })).then(() => {
                  setMsgs((l) => l.filter((x) => x.id !== menu.id));
                  setMenu(null);
                })
              }
            >
              <Trash2 className="h-4 w-4" />
              Apagar mensagem
            </button>
          )}
        </Folha>
      )}

      {ampliada && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label="Foto" onClick={() => setAmpliada(null)}>
          <img src={ampliada} alt="Foto ampliada" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  );
}

function AvaliarMusica({ fechar, enviar }: { fechar: () => void; enviar: (voto: 1 | -1, musica: string | null) => Promise<void> }) {
  const [musica, setMusica] = useState("");
  return (
    <Folha titulo="Avaliar a música" fechar={fechar}>
      <div className="space-y-4 px-5 pb-2">
        <label className="block">
          <span className="rotulo mb-1 block">Qual está tocando? (opcional)</span>
          <input value={musica} onChange={(e) => setMusica(e.target.value.slice(0, 120))} placeholder="Ex.: Evidências" className="entrada" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="botao h-14 text-ok" onClick={() => void enviar(1, musica.trim() || null)}>
            <ThumbsUp className="h-5 w-5" />
            Curti
          </button>
          <button type="button" className="botao h-14 text-perigo" onClick={() => void enviar(-1, musica.trim() || null)}>
            <ThumbsDown className="h-5 w-5" />
            Não curti
          </button>
        </div>
      </div>
    </Folha>
  );
}

function AvaliarAmbiente({ fechar, enviar }: { fechar: () => void; enviar: (movimento: string, vibe: number) => Promise<void> }) {
  const [movimento, setMovimento] = useState<string | null>(null);
  const [vibe, setVibe] = useState(0);
  return (
    <Folha titulo="Como está o ambiente?" fechar={fechar}>
      <div className="space-y-4 px-5 pb-2">
        <div>
          <span className="rotulo mb-2 block">Movimento agora</span>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(NOME_MOVIMENTO_AO_VIVO).map(([id, nome]) => (
              <button key={id} type="button" onClick={() => setMovimento(id)} className={clsx("botao h-11", movimento === id && "border-marca bg-destaque-suave font-semibold text-destaque")}>
                {nome}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="rotulo mb-2 block">Vibe da noite</span>
          <div className="flex justify-between gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setVibe(n)} className={clsx("botao h-11 flex-1", vibe >= n && "border-marca bg-destaque-suave font-semibold text-destaque")} aria-label={`Vibe ${n} de 5`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="botao-principal h-11 w-full" disabled={!movimento || !vibe} onClick={() => movimento && void enviar(movimento, vibe)}>
          Enviar avaliação
        </button>
      </div>
    </Folha>
  );
}

function NovaEnquete({ fechar, criar }: { fechar: () => void; criar: (pergunta: string, opcoes: string[], minutos: number) => Promise<void> }) {
  const [pergunta, setPergunta] = useState("");
  const [opcoes, setOpcoes] = useState(["", ""]);
  const [minutos, setMinutos] = useState(30);
  const validas = opcoes.filter((o) => o.trim()).length;
  return (
    <Folha titulo="Nova enquete" fechar={fechar}>
      <div className="space-y-3 px-5 pb-2">
        <label className="block">
          <span className="rotulo mb-1 block">Pergunta</span>
          <input value={pergunta} onChange={(e) => setPergunta(e.target.value.slice(0, 200))} placeholder="Ex.: Qual a próxima música?" className="entrada" />
        </label>
        {opcoes.map((o, i) => (
          <label key={i} className="block">
            <span className="rotulo mb-1 block">Opção {i + 1}</span>
            <input value={o} onChange={(e) => setOpcoes((l) => l.map((x, j) => (j === i ? e.target.value.slice(0, 60) : x)))} className="entrada" />
          </label>
        ))}
        {opcoes.length < 6 && (
          <button type="button" className="text-sm font-semibold text-destaque" onClick={() => setOpcoes((l) => [...l, ""])}>
            + Adicionar opção
          </button>
        )}
        <label className="block">
          <span className="rotulo mb-1 block">Duração</span>
          <select className="entrada" value={minutos} onChange={(e) => setMinutos(Number(e.target.value))}>
            <option value={10}>10 minutos</option>
            <option value={30}>30 minutos</option>
            <option value={60}>1 hora</option>
            <option value={0}>Até encerrar</option>
          </select>
        </label>
        <button type="button" className="botao-principal h-11 w-full" disabled={pergunta.trim().length < 3 || validas < 2} onClick={() => void criar(pergunta.trim(), opcoes, minutos)}>
          Publicar enquete
        </button>
      </div>
    </Folha>
  );
}

/** Equipe e Promoters divulgam no chat ao vivo só eventos e listas DESTE lugar. */
function DivulgarAoVivo({ estab, fechar, divulgar }: { estab: string; fechar: () => void; divulgar: (tipo: "evento" | "lista", id: string, texto: string | null) => Promise<void> }) {
  const [eventos, setEventos] = useState<{ id: string; nome: string; inicio: string }[]>([]);
  const [listas, setListas] = useState<ListaGerir[]>([]);
  const [texto, setTexto] = useState("");
  useEffect(() => {
    supabase
      .from("eventos")
      .select("id, nome, inicio")
      .eq("estabelecimento_id", estab)
      .eq("situacao", "publicado")
      .gte("inicio", new Date(Date.now() - 8 * 3600000).toISOString())
      .order("inicio")
      .limit(20)
      .then(({ data }) => setEventos((data ?? []) as { id: string; nome: string; inicio: string }[]));
    rpc<ListaGerir[]>("listas_para_gerir", { p_estab: estab })
      .then((l) => setListas((l ?? []).filter((x) => x.ativa)))
      .catch(() => setListas([]));
  }, [estab]);
  return (
    <Folha titulo="Divulgar no chat ao vivo" fechar={fechar}>
      <div className="space-y-3 px-5 pb-2">
        <p className="text-[13px] text-suave">No chat ao vivo só vale divulgar este lugar e os eventos e listas dele.</p>
        <input value={texto} onChange={(e) => setTexto(e.target.value.slice(0, 200))} placeholder="Mensagem (opcional)" className="entrada" />
        {eventos.length > 0 && <p className="rotulo">Eventos</p>}
        <ul className="divide-y divide-borda rounded-lg border border-borda empty:hidden">
          {eventos.map((e) => (
            <li key={e.id}>
              <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-elevado" onClick={() => void divulgar("evento", e.id, texto.trim() || null)}>
                <span className="min-w-0 truncate font-medium">{e.nome}</span>
                <span className="shrink-0 text-[12px] text-suave">{hora(e.inicio)}</span>
              </button>
            </li>
          ))}
        </ul>
        {listas.length > 0 && <p className="rotulo">Listas de presença</p>}
        <ul className="divide-y divide-borda rounded-lg border border-borda empty:hidden">
          {listas.map((l) => (
            <li key={l.id}>
              <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-elevado" onClick={() => void divulgar("lista", l.id, texto.trim() || null)}>
                <span className="min-w-0 truncate font-medium">{l.nome}</span>
                <span className="shrink-0 text-[12px] text-suave">{l.evento?.nome ?? ""}</span>
              </button>
            </li>
          ))}
        </ul>
        {!eventos.length && !listas.length && <p className="py-4 text-center text-sm text-suave">Nenhum evento ou lista aberta para divulgar.</p>}
      </div>
    </Folha>
  );
}

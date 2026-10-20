import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { CartaoDivulgacao } from "./CartaoDivulgacao";
import { AlertCircle, Ban, Check, CheckCheck, Clock3, Copy, Flag, Image as ImagemIcone, MapPin, PartyPopper, Plus, RotateCw, Send, Store, Trash2, Users, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { Carregando } from "./Carregando";
import { JanelaDenuncia } from "./Denunciar";
import { EscolherLugar } from "./EscolherLugar";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import {
  apagarMensagem,
  DadosConversa,
  diaMensagem,
  enviarMensagem,
  linksDasFotos,
  MembroConversa,
  Mensagem,
  Plano,
  quandoPlano,
  rpcPlano,
  useMensagens,
} from "@/lib/chat";
import { Lugar, useVitrine } from "@/app/dados";

interface Pendente {
  id: string;
  texto: string;
  arquivo: File | null;
  previa: string | null;
  lugar: string | null;
  estado: "enviando" | "falhou";
  erro?: string;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * Corpo de uma conversa (mensagens + campo de escrever).
 * modo "app": quem escreve é a pessoa; modo "estab": a equipe responde em nome do lugar.
 */
export function CorpoConversa({
  dados,
  eu,
  membros,
  modo = "app",
  aoMudar,
  nomeEstab,
  planos = [],
  abrirPlano,
}: {
  dados: DadosConversa;
  eu: string;
  membros: MembroConversa[];
  modo?: "app" | "estab";
  aoMudar?: () => void;
  nomeEstab?: string;
  planos?: Plano[];
  abrirPlano?: (id: string) => void;
}) {
  const { mensagens, temMais, anteriores, recarregar } = useMensagens(dados.id);
  const { lugares } = useVitrine();
  const [texto, setTexto] = useState("");
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState<Mensagem | null>(null);
  const [mais, setMais] = useState(false);
  const [escolher, setEscolher] = useState<null | "compartilhar" | "plano">(null);
  const [denunciar, setDenunciar] = useState<Mensagem | null>(null);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const perto = useRef(true);
  const qtd = useRef(0);
  const iniciais = useRef<Set<string> | null>(null);

  const porId = useMemo(() => new Map(membros.map((m) => [m.id, m])), [membros]);
  const lugarPorId = useMemo(() => new Map(lugares.map((l) => [l.id, l])), [lugares]);
  const planoPorId = useMemo(() => new Map(planos.map((p) => [p.id, p])), [planos]);
  const minha = (m: Mensagem) => (modo === "estab" ? m.como_estab : m.autor_id === eu && !m.como_estab);
  const podePlanejar = modo === "app" && dados.tipo !== "estabelecimento" && dados.situacao === "ativo" && !dados.bloqueado;

  if (mensagens && !iniciais.current) iniciais.current = new Set(mensagens.map((m) => m.id));

  // Marca como lida ao abrir e a cada mensagem nova.
  useEffect(() => {
    if (!mensagens) return;
    void supabase.rpc("marcar_conversa_lida", { p_conversa: dados.id }).then(() => aoMudar?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensagens?.length, dados.id]);

  // Preserva a posição de leitura: só desce sozinho se a pessoa já estava no fim.
  useEffect(() => {
    if (!mensagens) return;
    const total = mensagens.length + pendentes.length;
    const novas = total > qtd.current;
    const primeira = qtd.current === 0;
    qtd.current = total;
    if (primeira || (novas && perto.current)) fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens, pendentes.length]);

  useEffect(() => {
    const caminhos = (mensagens ?? []).filter((m) => m.foto && !fotos[m.foto]).map((m) => m.foto!);
    if (caminhos.length) linksDasFotos(caminhos).then((l) => setFotos((f) => ({ ...f, ...l })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensagens]);

  // Envio otimista: a mensagem aparece na hora como "enviando" e vira "falhou" se der erro.
  const mandar = async (p: Pendente) => {
    setPendentes((l) => [...l.filter((x) => x.id !== p.id), { ...p, estado: "enviando", erro: undefined }]);
    perto.current = true;
    try {
      await enviarMensagem(dados.id, p.texto, p.arquivo, p.lugar);
      await recarregar();
      setPendentes((l) => l.filter((x) => x.id !== p.id));
      if (p.previa) URL.revokeObjectURL(p.previa);
      aoMudar?.();
    } catch (e) {
      setPendentes((l) => l.map((x) => (x.id === p.id ? { ...x, estado: "falhou", erro: mensagemDeErro(e) } : x)));
    }
  };

  const novo = (parcial: Partial<Pendente>): Pendente => ({ id: crypto.randomUUID(), texto: "", arquivo: null, previa: null, lugar: null, estado: "enviando", ...parcial });

  const enviarTexto = () => {
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    void mandar(novo({ texto: t }));
    campo.current?.focus();
  };

  const escolherFoto = (l: FileList | null) => {
    const f = l?.[0];
    if (seletor.current) seletor.current.value = "";
    if (!f) return;
    void mandar(novo({ arquivo: f, previa: URL.createObjectURL(f), texto: texto.trim() }));
    setTexto("");
  };

  const aoEscolherLugar = async (l: Lugar) => {
    const acao = escolher;
    setEscolher(null);
    if (acao === "compartilhar") {
      void mandar(novo({ lugar: l.id, texto: texto.trim() }));
      setTexto("");
    } else {
      try {
        const id = (await rpcPlano("criar_plano", { p_conversa: dados.id, p_local: l.id })) as string;
        await recarregar();
        aoMudar?.();
        abrirPlano?.(id);
      } catch (e) {
        setErro(mensagemDeErro(e));
      }
    }
  };

  const virarPlano = async (m: Mensagem) => {
    try {
      const id = (await rpcPlano("criar_plano", { p_conversa: dados.id, p_local: m.estabelecimento_id, p_mensagem: m.id })) as string;
      await recarregar();
      aoMudar?.();
      abrirPlano?.(id);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
      e.preventDefault();
      enviarTexto();
    }
  };

  // "Visto" (conversa direta): a outra pessoa leu depois da sua última mensagem.
  const outro = dados.tipo === "direta" ? membros.find((m) => m.id !== eu) : null;
  const ultimaMinha = [...(mensagens ?? [])].reverse().find((m) => minha(m) && m.tipo !== "sistema");
  const visto = !!(outro && ultimaMinha && outro.lida_em >= ultimaMinha.criado_em);
  const podeEscrever = !dados.bloqueado && dados.situacao !== "recusado" && dados.situacao !== "saiu";

  const nomeAutor = (m: Mensagem) => {
    if (m.como_estab) return `${nomeEstab ?? "Equipe"}${modo === "estab" && m.autor_id && porId.get(m.autor_id) ? ` · ${porId.get(m.autor_id)!.nome.split(" ")[0]}` : ""}`;
    return (m.autor_id ? porId.get(m.autor_id)?.nome.split(" ")[0] : null) ?? "Alguém";
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        onScroll={(e) => {
          const el = e.currentTarget;
          perto.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
      >
        {mensagens === null ? (
          <Carregando />
        ) : (
          <>
            {temMais && (
              <div className="mb-3 text-center">
                <button className="rounded-full bg-elevado px-3 py-1.5 text-[13px] text-suave hover:text-texto" onClick={() => void anteriores()}>
                  Ver mensagens anteriores
                </button>
              </div>
            )}
            {mensagens.length === 0 && pendentes.length === 0 && (
              <p className="px-6 py-10 text-center text-sm text-suave">
                {dados.tipo === "estabelecimento" && modo === "app" ? "Mande sua pergunta. A equipe do lugar responde por aqui." : "Nenhuma mensagem ainda. Diga oi!"}
              </p>
            )}
            <ul>
              {mensagens.map((m, i) => {
                const ant = mensagens[i - 1];
                const prox = mensagens[i + 1];
                const novoDia = !ant || new Date(ant.criado_em).toDateString() !== new Date(m.criado_em).toDateString();
                const eMinha = minha(m);
                const autor = m.autor_id ? porId.get(m.autor_id) : undefined;
                const mesmoAutor = !!ant && ant.tipo !== "sistema" && ant.autor_id === m.autor_id && ant.como_estab === m.como_estab && !novoDia;
                const ultimoDoBloco = !prox || prox.tipo === "sistema" || prox.autor_id !== m.autor_id || prox.como_estab !== m.como_estab;
                const emGrupo = dados.tipo === "role" || dados.tipo === "estabelecimento";
                const mostrarAutor = !eMinha && !mesmoAutor && (dados.tipo === "role" || (modo === "estab" && m.como_estab));
                const nova = iniciais.current && !iniciais.current.has(m.id);
                return (
                  <li key={m.id} className={clsx(nova && "surgir")}>
                    {novoDia && <p className="my-4 text-center text-[12px] font-medium capitalize text-suave">{diaMensagem(m.criado_em)}</p>}
                    {m.tipo === "sistema" ? (
                      <p className="mx-auto my-2 max-w-[85%] text-center text-[12px] text-suave">{m.texto}</p>
                    ) : m.tipo === "plano" ? (
                      <div className="my-3">
                        <CartaoPlano plano={m.plano_id ? planoPorId.get(m.plano_id) : undefined} autor={eMinha ? "Você" : nomeAutor(m)} abrir={() => m.plano_id && abrirPlano?.(m.plano_id)} />
                      </div>
                    ) : (
                      <div className={clsx("flex items-end gap-2", eMinha ? "justify-end" : "justify-start", mesmoAutor ? "mt-0.5" : "mt-3")}>
                        {!eMinha && emGrupo && dados.tipo === "role" && (
                          <span className="w-7 shrink-0">{ultimoDoBloco && <Avatar nome={autor?.nome ?? "?"} foto={autor?.foto_url} tamanho="sm" />}</span>
                        )}
                        <div className={clsx("flex max-w-[78%] flex-col", eMinha ? "items-end" : "items-start")}>
                          {mostrarAutor && <span className="mb-0.5 px-3 text-[12px] font-semibold text-suave">{nomeAutor(m)}</span>}
                          <button
                            onClick={() => !m.apagada && setMenu(m)}
                            className={clsx(
                              "overflow-hidden text-left text-[15px] leading-snug",
                              eMinha ? "bg-marca text-marca-texto" : "bg-elevado",
                              "rounded-[20px]",
                              eMinha ? !ultimoDoBloco && "rounded-br-md" : !ultimoDoBloco && "rounded-bl-md",
                              m.apagada && "italic opacity-70",
                            )}
                          >
                            {m.apagada ? (
                              <span className="block px-3.5 py-2">Mensagem apagada</span>
                            ) : (
                              <>
                                {m.foto &&
                                  (fotos[m.foto] ? (
                                    <img
                                      src={fotos[m.foto]}
                                      alt="Foto enviada"
                                      className="max-h-80 w-full cursor-zoom-in object-cover"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAmpliada(fotos[m.foto!]);
                                      }}
                                    />
                                  ) : (
                                    <span className="block h-48 w-56 animate-pulse bg-borda" />
                                  ))}
                                {m.tipo === "lugar" && <PreviaLugar lugar={m.estabelecimento_id ? lugarPorId.get(m.estabelecimento_id) : undefined} minha={eMinha} />}
                                {(m.tipo === "evento" || m.tipo === "lista") && m.dados?.id && (
                                  <span className="block p-1.5" onClick={(e) => e.stopPropagation()}>
                                    <CartaoDivulgacao tipo={m.tipo} id={m.dados.id} codigo={m.dados.ref ?? null} minha={eMinha} />
                                  </span>
                                )}
                                {m.tipo === "story" && m.dados && (
                                  <span className="flex items-center gap-2.5 px-2.5 pt-2.5">
                                    {m.dados.foto_url ? (
                                      <img src={m.dados.foto_url} alt="" className="h-16 w-10 shrink-0 rounded-md object-cover" loading="lazy" />
                                    ) : null}
                                    <span className={clsx("text-[12px]", eMinha ? "opacity-80" : "text-suave")}>
                                      {eMinha
                                        ? m.dados.resposta
                                          ? "Você respondeu ao story"
                                          : "Você reagiu ao story"
                                        : m.dados.resposta
                                          ? "Respondeu ao seu story"
                                          : "Reagiu ao seu story"}
                                    </span>
                                    {m.dados.emoji && !m.dados.resposta && <span className="text-[32px] leading-none">{m.dados.emoji}</span>}
                                  </span>
                                )}
                                {m.texto && !(m.tipo === "story" && !m.dados?.resposta) && !((m.tipo === "evento" || m.tipo === "lista") && m.dados?.id && /^(Evento|Lista): /.test(m.texto)) && (
                                  <span className="block whitespace-pre-wrap break-words px-3.5 py-2">{m.texto}</span>
                                )}
                              </>
                            )}
                          </button>
                          {m.tipo === "lugar" && podePlanejar && m.estabelecimento_id && !m.apagada && (
                            <button onClick={() => void virarPlano(m)} className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 text-[13px] font-semibold text-destaque">
                              <PartyPopper className="h-3.5 w-3.5" />
                              {planos.some((p) => p.mensagem_id === m.id && p.situacao !== "cancelado") ? "Ver plano" : "Vamos nesse lugar?"}
                            </button>
                          )}
                          {ultimoDoBloco && (
                            <span className="mt-0.5 flex items-center gap-1 px-2 text-[11px] text-suave">
                              {hora(m.criado_em)}
                              {ultimaMinha?.id === m.id && dados.tipo === "direta" && (
                                <>
                                  {" · "}
                                  {visto ? <CheckCheck className="h-3.5 w-3.5 text-destaque" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                                  {visto ? "Vista" : "Enviada"}
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
              {pendentes.map((p) => (
                <li key={p.id} className="surgir mt-3 flex justify-end">
                  <div className="flex max-w-[78%] flex-col items-end">
                    <button
                      onClick={() => p.estado === "falhou" && void mandar(p)}
                      disabled={p.estado === "enviando"}
                      className={clsx("overflow-hidden rounded-[20px] bg-marca text-left text-[15px] leading-snug text-marca-texto", p.estado === "enviando" && "opacity-70")}
                    >
                      {p.previa && <img src={p.previa} alt="Foto sendo enviada" className="max-h-80 w-full object-cover" />}
                      {p.lugar && <PreviaLugar lugar={lugarPorId.get(p.lugar)} minha />}
                      {p.texto && <span className="block whitespace-pre-wrap break-words px-3.5 py-2">{p.texto}</span>}
                    </button>
                    {p.estado === "enviando" ? (
                      <span className="mt-0.5 flex items-center gap-1 px-2 text-[11px] text-suave">
                        <Clock3 className="h-3 w-3" aria-hidden />
                        Enviando
                      </span>
                    ) : (
                      <span className="mt-0.5 flex items-center gap-2 px-2 text-[12px] text-perigo">
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                        Não enviada
                        <button onClick={() => void mandar(p)} className="inline-flex items-center gap-1 font-semibold">
                          <RotateCw className="h-3 w-3" />
                          Tentar de novo
                        </button>
                        <button onClick={() => setPendentes((l) => l.filter((x) => x.id !== p.id))} className="font-semibold text-suave">
                          Descartar
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <div ref={fim} />
      </div>

      {podeEscrever ? (
        <div className="pb-seguro bg-fundo px-2 pt-1.5">
          {erro && (
            <p className="mb-1 flex items-center gap-2 px-2 text-[13px] text-perigo">
              {erro}
              <button onClick={() => setErro("")} aria-label="Fechar aviso">
                <X className="h-3.5 w-3.5" />
              </button>
            </p>
          )}
          <div className="flex items-end gap-1.5 pb-2">
            <input ref={seletor} type="file" accept="image/*" className="hidden" onChange={(e) => escolherFoto(e.target.files)} />
            <button
              onClick={() => setMais(true)}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-suave transition-colors hover:bg-elevado hover:text-texto"
              aria-label="Compartilhar lugar, foto ou ideia de rolê"
            >
              <Plus className="h-6 w-6" />
            </button>
            <textarea
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, 2000))}
              onKeyDown={tecla}
              rows={1}
              aria-label="Mensagem"
              placeholder={modo === "estab" ? `Responder como ${nomeEstab ?? "o estabelecimento"}` : "Mensagem..."}
              className="max-h-32 min-h-[40px] flex-1 resize-none rounded-[20px] bg-elevado px-4 py-2 text-[15px] placeholder:text-suave focus:outline-none focus:ring-2 focus:ring-marca/60"
              style={{ height: `${Math.min(128, 40 + (texto.split("\n").length - 1) * 20)}px` }}
            />
            <button
              onClick={enviarTexto}
              disabled={!texto.trim()}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca text-marca-texto transition-opacity disabled:opacity-30"
              aria-label="Enviar"
            >
              <Send className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      ) : (
        <p className="pb-seguro bg-fundo px-4 py-4 text-center text-sm text-suave">
          {dados.bloqueado ? "Não é possível responder esta conversa." : dados.situacao === "saiu" ? "Você saiu desta conversa." : "Você recusou esta conversa."}
        </p>
      )}

      {mais && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Compartilhar" onClick={() => setMais(false)}>
          <div className="folha w-full max-w-sm overflow-hidden rounded-t-2xl bg-superficie pb-[env(safe-area-inset-bottom)] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <ItemMais
              icone={MapPin}
              titulo="Compartilhar lugar"
              texto="Mande a prévia de um lugar do RoVibes"
              onClick={() => {
                setMais(false);
                setEscolher("compartilhar");
              }}
            />
            <ItemMais
              icone={ImagemIcone}
              titulo="Foto"
              texto="Da galeria ou da câmera"
              onClick={() => {
                setMais(false);
                seletor.current?.click();
              }}
            />
            {podePlanejar && (
              <ItemMais
                icone={PartyPopper}
                titulo="Ideia de rolê"
                texto="Proponha um lugar e vejam quem topa"
                onClick={() => {
                  setMais(false);
                  setEscolher("plano");
                }}
              />
            )}
            <button className="w-full px-5 py-3.5 text-center text-suave hover:bg-elevado" onClick={() => setMais(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {escolher && (
        <EscolherLugar
          titulo={escolher === "compartilhar" ? "Compartilhar lugar" : "Ideia de rolê: qual lugar?"}
          lugares={lugares}
          escolher={(l) => void aoEscolherLugar(l)}
          fechar={() => setEscolher(null)}
        />
      )}

      {menu && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Opções da mensagem" onClick={() => setMenu(null)}>
          <div className="folha w-full max-w-sm overflow-hidden rounded-t-2xl bg-superficie pb-[env(safe-area-inset-bottom)] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            {menu.texto && (
              <button
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-elevado"
                onClick={() => {
                  void navigator.clipboard?.writeText(menu.texto ?? "");
                  setMenu(null);
                }}
              >
                <Copy className="h-4 w-4" />
                Copiar texto
              </button>
            )}
            {minha(menu) && menu.autor_id === eu ? (
              <button
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-perigo hover:bg-elevado"
                onClick={() => {
                  const m = menu;
                  setMenu(null);
                  if (window.confirm("Apagar esta mensagem para todos?")) apagarMensagem(m.id).catch((e) => setErro(mensagemDeErro(e)));
                }}
              >
                <Trash2 className="h-4 w-4" />
                Apagar para todos
              </button>
            ) : (
              !minha(menu) && (
                <button
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-perigo hover:bg-elevado"
                  onClick={() => {
                    setDenunciar(menu);
                    setMenu(null);
                  }}
                >
                  <Flag className="h-4 w-4" />
                  Denunciar mensagem
                </button>
              )
            )}
            <button className="w-full px-5 py-3.5 text-center text-suave hover:bg-elevado" onClick={() => setMenu(null)} aria-label="Fechar">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {denunciar && <JanelaDenuncia tipo="mensagem" alvo={denunciar.id} titulo="Denunciar mensagem" fechar={() => setDenunciar(null)} />}
      {ampliada && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label="Foto" onClick={() => setAmpliada(null)}>
          <img src={ampliada} alt="Foto ampliada" className="max-h-full max-w-full object-contain" />
          <button className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] rounded-full p-2 text-white hover:bg-white/10" aria-label="Fechar">
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
}

function ItemMais({ icone: Icone, titulo, texto, onClick }: { icone: typeof MapPin; titulo: string; texto: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3.5 px-5 py-3 text-left hover:bg-elevado">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-elevado text-destaque">
        <Icone className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-[15px] font-medium">{titulo}</span>
        <span className="block text-[13px] text-suave">{texto}</span>
      </span>
    </button>
  );
}

/** Prévia de um lugar dentro do balão (foto real, nome e bairro). */
function PreviaLugar({ lugar, minha }: { lugar?: Lugar; minha: boolean }) {
  if (!lugar) return <span className="block px-3.5 py-2 text-[13px] opacity-80">Lugar compartilhado</span>;
  const img = lugar.capa_url ?? lugar.logo_url;
  return (
    <Link to={`/lugar/${lugar.id}`} onClick={(e) => e.stopPropagation()} className="block w-64 max-w-full">
      {img ? (
        <img src={img} alt="" className="aspect-[16/10] w-full object-cover" loading="lazy" />
      ) : (
        <span className={clsx("flex aspect-[16/10] w-full items-center justify-center", minha ? "bg-black/15" : "bg-borda")}>
          <Store className="h-7 w-7 opacity-60" />
        </span>
      )}
      <span className="block px-3.5 pt-2">
        <span className="block truncate font-semibold">{lugar.nome}</span>
        <span className={clsx("block truncate pb-2 text-[13px]", minha ? "text-marca-texto/75" : "text-suave")}>
          {[lugar.categoria?.nome, lugar.bairro].filter(Boolean).join(" · ") || "Ver lugar"}
        </span>
      </span>
    </Link>
  );
}

/** Prévia compacta do plano no histórico da conversa (abre o plano completo ao tocar). */
export function CartaoPlano({ plano, autor, abrir }: { plano?: Plano; autor: string; abrir: () => void }) {
  if (!plano) return <p className="text-center text-[12px] text-suave">{autor} propôs um rolê</p>;
  const confirmado = plano.situacao === "confirmado";
  const cancelado = plano.situacao === "cancelado";
  return (
    <button onClick={abrir} className={clsx("mx-auto flex w-full max-w-[320px] overflow-hidden rounded-2xl bg-superficie text-left shadow-sm ring-1 ring-borda/60", cancelado && "opacity-60")}>
      {plano.local_foto ? (
        <img src={plano.local_foto} alt="" className="w-24 shrink-0 object-cover" />
      ) : (
        <span className="flex w-24 shrink-0 items-center justify-center bg-elevado text-suave">
          <MapPin className="h-6 w-6" />
        </span>
      )}
      <span className="min-w-0 flex-1 px-3 py-2.5">
        <span className={clsx("block text-[11px] font-bold uppercase tracking-wide", confirmado ? "text-ok" : cancelado ? "text-suave" : "text-destaque")}>
          {confirmado ? "Plano confirmado" : cancelado ? "Plano cancelado" : "Ideia de rolê"}
        </span>
        <span className="block truncate font-semibold">{plano.local_nome ?? "Lugar a definir"}</span>
        <span className="block truncate text-[13px] text-suave">{quandoPlano(plano.quando)}</span>
        <span className="mt-1 flex items-center gap-1 text-[12px] text-suave">
          <Users className="h-3.5 w-3.5" aria-hidden />
          {plano.vao} {plano.vao === 1 ? "vai" : "vão"} · {plano.interessados} com interesse
        </span>
      </span>
    </button>
  );
}

/** Faixa de pedido de mensagem / convite para grupo. */
export function FaixaPedido({ dados, aoResponder, bloquear }: { dados: DadosConversa; aoResponder: () => void; bloquear?: () => void }) {
  const [erro, setErro] = useState("");
  const responder = async (aceitar: boolean) => {
    const { error } = await supabase.rpc("responder_conversa", { p_conversa: dados.id, p_aceitar: aceitar });
    if (error) setErro(mensagemDeErro(error));
    else aoResponder();
  };
  return (
    <div className="bg-elevado px-4 py-3">
      <p className="text-sm">
        {dados.tipo === "role" ? (
          <>
            Você foi convidado para o grupo <strong>{dados.titulo}</strong>.
          </>
        ) : (
          <>
            <strong>{dados.titulo}</strong> quer conversar com você. Essa pessoa só sabe que você leu depois que você aceitar.
          </>
        )}
      </p>
      <div className="mt-2 flex gap-2">
        <button className="botao-principal h-9 flex-1 text-sm" onClick={() => void responder(true)}>
          {dados.tipo === "role" ? "Entrar no grupo" : "Aceitar"}
        </button>
        <button className="botao h-9 flex-1 text-sm" onClick={() => void responder(false)}>
          Recusar
        </button>
        {bloquear && (
          <button className="botao h-9 px-3 text-sm text-perigo" onClick={bloquear} aria-label="Bloquear">
            <Ban className="h-4 w-4" />
          </button>
        )}
      </div>
      {erro && <p className="mt-1 text-[13px] text-perigo">{erro}</p>}
    </div>
  );
}

/** Ícone redondo da conversa (pessoa, lugar ou grupo). */
export function IconeConversa({ tipo, titulo, foto }: { tipo: string; titulo: string | null; foto: string | null }) {
  if (foto) return <img src={foto} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />;
  if (tipo === "estabelecimento")
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-elevado text-suave">
        <Store className="h-5 w-5" />
      </span>
    );
  if (tipo === "role")
    return <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-magenta/15 text-lg font-bold text-magenta">{(titulo ?? "R")[0]?.toUpperCase()}</span>;
  return <Avatar nome={titulo ?? "?"} />;
}

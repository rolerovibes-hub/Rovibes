import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Ban, Check, CheckCheck, Copy, Flag, ImagePlus, Send, Store, Trash2, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { Carregando } from "./Carregando";
import { JanelaDenuncia } from "./Denunciar";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { apagarMensagem, DadosConversa, diaMensagem, enviarMensagem, linksDasFotos, MembroConversa, Mensagem, useMensagens } from "@/lib/chat";

/**
 * Corpo de uma conversa (lista de mensagens + caixa de escrever).
 * modo "app": quem escreve é a pessoa; modo "estab": quem escreve é a equipe, em nome do lugar.
 */
export function CorpoConversa({
  dados,
  eu,
  membros,
  modo = "app",
  aoMudar,
  nomeEstab,
}: {
  dados: DadosConversa;
  eu: string;
  membros: MembroConversa[];
  modo?: "app" | "estab";
  aoMudar?: () => void;
  nomeEstab?: string;
}) {
  const { mensagens, temMais, anteriores } = useMensagens(dados.id);
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState<Mensagem | null>(null);
  const [denunciar, setDenunciar] = useState<Mensagem | null>(null);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const perto = useRef(true);
  const qtd = useRef(0);

  const porId = useMemo(() => new Map(membros.map((m) => [m.id, m])), [membros]);
  const minha = (m: Mensagem) => (modo === "estab" ? m.como_estab : m.autor_id === eu && !m.como_estab);

  // Marca como lida ao abrir e a cada mensagem nova.
  useEffect(() => {
    if (!mensagens) return;
    void supabase.rpc("marcar_conversa_lida", { p_conversa: dados.id }).then(() => aoMudar?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensagens?.length, dados.id]);

  // Rola para o fim quando chega mensagem (se a pessoa já estava perto do fim).
  useEffect(() => {
    if (!mensagens) return;
    const novas = mensagens.length > qtd.current;
    const primeira = qtd.current === 0;
    qtd.current = mensagens.length;
    if (primeira || (novas && perto.current)) fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens]);

  useEffect(() => {
    const caminhos = (mensagens ?? []).filter((m) => m.foto && !fotos[m.foto]).map((m) => m.foto!);
    if (caminhos.length) linksDasFotos(caminhos).then((l) => setFotos((f) => ({ ...f, ...l })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensagens]);

  const escolherFoto = (l: FileList | null) => {
    const f = l?.[0];
    if (seletor.current) seletor.current.value = "";
    if (!f) return;
    if (previa) URL.revokeObjectURL(previa);
    setArquivo(f);
    setPrevia(URL.createObjectURL(f));
  };
  const tirarFoto = () => {
    if (previa) URL.revokeObjectURL(previa);
    setArquivo(null);
    setPrevia(null);
  };

  const enviar = async () => {
    if ((!texto.trim() && !arquivo) || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await enviarMensagem(dados.id, texto, arquivo);
      setTexto("");
      tirarFoto();
      perto.current = true;
      aoMudar?.();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setEnviando(false);
  };

  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
      e.preventDefault();
      void enviar();
    }
  };

  // "Visto": na conversa direta, quando a outra pessoa leu depois da sua última mensagem.
  const outro = dados.tipo === "direta" ? membros.find((m) => m.id !== eu) : null;
  const ultimaMinha = [...(mensagens ?? [])].reverse().find((m) => minha(m) && m.tipo !== "sistema");
  const visto = !!(outro && ultimaMinha && outro.lida_em >= ultimaMinha.criado_em);

  const podeEscrever = !dados.bloqueado && dados.situacao !== "recusado" && dados.situacao !== "saiu";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={lista}
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
                <button className="botao h-8 px-3 text-[13px]" onClick={() => void anteriores()}>
                  Ver mensagens anteriores
                </button>
              </div>
            )}
            {mensagens.length === 0 && (
              <p className="px-6 py-10 text-center text-sm text-suave">
                {dados.tipo === "estabelecimento" && modo === "app" ? "Mande sua pergunta. A equipe do lugar responde por aqui." : "Nenhuma mensagem ainda. Diga oi!"}
              </p>
            )}
            <ul className="space-y-1">
              {mensagens.map((m, i) => {
                const ant = mensagens[i - 1];
                const novoDia = !ant || new Date(ant.criado_em).toDateString() !== new Date(m.criado_em).toDateString();
                const eMinha = minha(m);
                const autor = m.autor_id ? porId.get(m.autor_id) : undefined;
                const mesmoAutor = ant && ant.tipo !== "sistema" && ant.autor_id === m.autor_id && ant.como_estab === m.como_estab && !novoDia;
                const mostrarAutor = !eMinha && !mesmoAutor && (dados.tipo === "role" || (modo === "estab" && m.como_estab));
                return (
                  <li key={m.id}>
                    {novoDia && <p className="my-3 text-center text-[12px] font-medium capitalize text-suave">{diaMensagem(m.criado_em)}</p>}
                    {m.tipo === "sistema" ? (
                      <p className="my-2 text-center text-[12px] text-suave">{m.texto}</p>
                    ) : (
                      <div className={clsx("flex items-end gap-2", eMinha ? "justify-end" : "justify-start", !mesmoAutor && "mt-2")}>
                        {!eMinha && dados.tipo === "role" && (
                          <span className="w-7 shrink-0">{!mensagens[i + 1] || mensagens[i + 1].autor_id !== m.autor_id ? <Avatar nome={autor?.nome ?? "?"} foto={autor?.foto_url} tamanho="sm" /> : null}</span>
                        )}
                        <button
                          onClick={() => !m.apagada && setMenu(m)}
                          className={clsx(
                            "max-w-[78%] overflow-hidden rounded-2xl text-left text-[15px]",
                            eMinha ? "rounded-br-md bg-marca text-marca-texto" : "rounded-bl-md bg-elevado",
                            m.apagada && "italic opacity-70",
                          )}
                        >
                          {mostrarAutor && (
                            <span className="block px-3 pt-2 text-[12px] font-semibold text-destaque">
                              {m.como_estab ? `${nomeEstab ?? "Equipe"}${modo === "estab" && autor ? ` · ${autor.nome.split(" ")[0]}` : ""}` : autor?.nome.split(" ")[0] ?? "Alguém"}
                            </span>
                          )}
                          {m.apagada ? (
                            <span className="block px-3 py-2">Mensagem apagada</span>
                          ) : (
                            <>
                              {m.foto &&
                                (fotos[m.foto] ? (
                                  <img
                                    src={fotos[m.foto]}
                                    alt="Foto"
                                    className="max-h-80 w-full cursor-zoom-in object-cover"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAmpliada(fotos[m.foto!]);
                                    }}
                                  />
                                ) : (
                                  <span className="block h-48 w-56 animate-pulse bg-borda" />
                                ))}
                              {m.texto && <span className="block whitespace-pre-wrap break-words px-3 py-2">{m.texto}</span>}
                            </>
                          )}
                          <span className={clsx("block px-3 pb-1.5 text-right text-[11px]", eMinha ? "text-marca-texto/70" : "text-suave", m.texto || m.apagada ? "-mt-1.5" : "pt-1")}>
                            {new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </button>
                      </div>
                    )}
                    {ultimaMinha?.id === m.id && dados.tipo === "direta" && (
                      <p className="mt-0.5 flex items-center justify-end gap-1 pr-1 text-[11px] text-suave">
                        {visto ? <CheckCheck className="h-3.5 w-3.5 text-destaque" /> : <Check className="h-3.5 w-3.5" />}
                        {visto ? "Visto" : "Enviado"}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div ref={fim} />
      </div>

      {podeEscrever ? (
        <div className="pb-seguro border-t border-borda bg-superficie px-3 pt-2">
          {previa && (
            <div className="relative mb-2 inline-block">
              <img src={previa} alt="Foto para enviar" className="h-24 rounded-lg object-cover" />
              <button onClick={tirarFoto} className="absolute -right-2 -top-2 rounded-full bg-texto p-1 text-fundo" aria-label="Tirar a foto">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {erro && <p className="mb-1 text-[13px] text-perigo">{erro}</p>}
          <div className="flex items-end gap-2 pb-2">
            <input ref={seletor} type="file" accept="image/*" className="hidden" onChange={(e) => escolherFoto(e.target.files)} />
            <button onClick={() => seletor.current?.click()} className="mb-0.5 rounded-full p-2 text-suave hover:bg-elevado" aria-label="Enviar foto">
              <ImagePlus className="h-5 w-5" />
            </button>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, 2000))}
              onKeyDown={tecla}
              rows={1}
              placeholder={modo === "estab" ? `Responder como ${nomeEstab ?? "o estabelecimento"}` : "Mensagem"}
              className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-borda bg-fundo px-3.5 py-2 text-[15px] focus:border-marca focus:outline-none"
              style={{ height: `${Math.min(128, 40 + (texto.split("\n").length - 1) * 20)}px` }}
            />
            <button
              onClick={() => void enviar()}
              disabled={enviando || (!texto.trim() && !arquivo)}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca text-marca-texto disabled:opacity-40"
              aria-label="Enviar"
            >
              <Send className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      ) : (
        <p className="pb-seguro border-t border-borda bg-superficie px-4 py-4 text-center text-sm text-suave">
          {dados.bloqueado ? "Não é possível responder esta conversa." : dados.situacao === "saiu" ? "Você saiu desta conversa." : "Você recusou esta conversa."}
        </p>
      )}

      {menu && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setMenu(null)}>
          <div className="w-full max-w-sm overflow-hidden rounded-t-2xl bg-superficie pb-[env(safe-area-inset-bottom)] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
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
            <button className="w-full border-t border-borda px-5 py-3.5 text-center text-suave hover:bg-elevado" onClick={() => setMenu(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {denunciar && <JanelaDenuncia tipo="mensagem" alvo={denunciar.id} titulo="Denunciar mensagem" fechar={() => setDenunciar(null)} />}
      {ampliada && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black" onClick={() => setAmpliada(null)}>
          <img src={ampliada} alt="Foto" className="max-h-full max-w-full object-contain" />
          <button className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] rounded-full p-2 text-white hover:bg-white/10" aria-label="Fechar">
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Faixa de pedido de mensagem / convite para rolê. */
export function FaixaPedido({ dados, aoResponder, bloquear }: { dados: DadosConversa; aoResponder: () => void; bloquear?: () => void }) {
  const [erro, setErro] = useState("");
  const responder = async (aceitar: boolean) => {
    const { error } = await supabase.rpc("responder_conversa", { p_conversa: dados.id, p_aceitar: aceitar });
    if (error) setErro(mensagemDeErro(error));
    else aoResponder();
  };
  return (
    <div className="border-b border-borda bg-destaque-suave px-4 py-3">
      <p className="text-sm">
        {dados.tipo === "role" ? (
          <>
            Você foi convidado para o rolê <strong>{dados.titulo}</strong>.
          </>
        ) : (
          <>
            <strong>{dados.titulo}</strong> quer conversar com você. Essa pessoa não sabe se você já leu até você responder.
          </>
        )}
      </p>
      <div className="mt-2 flex gap-2">
        <button className="botao-principal h-9 flex-1 text-sm" onClick={() => void responder(true)}>
          {dados.tipo === "role" ? "Entrar no rolê" : "Aceitar"}
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

/** Ícone redondo da conversa (pessoa, lugar ou rolê). */
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

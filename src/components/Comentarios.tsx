import { FormEvent, Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Flag, MessageCircle, MoreHorizontal, Send, Store, Trash2, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { BotaoBrindar } from "./Brindar";
import { JanelaDenuncia } from "./Denunciar";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";

export type TipoPublicacao = "lugar" | "pessoa";

interface Comentario {
  id: string;
  resposta_a: string | null;
  criado_em: string;
  apagado: boolean;
  texto: string | null;
  como_estab: boolean;
  autor: { id: string; nome: string; foto_url: string | null; usuario: string | null; lugar: boolean };
  meu: boolean;
  curtidas: number;
  curti: boolean;
}

interface Dados {
  comentarios: Comentario[];
  pode_moderar: boolean;
  sou_equipe: boolean;
  estab: { id: string; nome: string; logo_url: string | null } | null;
}

const tempo = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d} d` : new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

/** Total de comentários de várias publicações (para mostrar no feed). Vazio se o banco ainda não tiver a 034. */
export async function contarComentarios(tipo: TipoPublicacao, ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase.rpc("contar_comentarios", { p_tipo: tipo, p_ids: ids });
  if (error) return new Map();
  return new Map(((data ?? []) as { publicacao_id: string; total: number }[]).map((x) => [x.publicacao_id, x.total]));
}

/**
 * Comentários de uma publicação (de lugar ou de pessoa), em folha que sobe da parte de baixo:
 * responder (um nível), curtir, apagar (autor ou dono da publicação/equipe do lugar) e denunciar.
 * A equipe do lugar pode comentar "como o lugar".
 */
export function FolhaComentarios({
  tipo,
  id,
  titulo = "Comentários",
  fechar,
  aoMudarTotal,
  destaque,
}: {
  tipo: TipoPublicacao;
  id: string;
  titulo?: string;
  fechar: () => void;
  aoMudarTotal?: (n: number) => void;
  /** Comentário para ir direto e destacar (vindo de uma notificação). */
  destaque?: string | null;
}) {
  const { perfil } = useSessao();
  const [dados, setDados] = useState<Dados | null | undefined>(undefined);
  const [texto, setTexto] = useState("");
  const [respondendo, setRespondendo] = useState<Comentario | null>(null);
  const [comoEstab, setComoEstab] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [denunciando, setDenunciando] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  const primeira = useRef(true);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("comentarios_da", { p_tipo: tipo, p_id: id });
    if (error) {
      setDados(null);
      setErro(/function|schema cache/i.test(error.message) ? "Os comentários aparecem depois que a atualização 034 do banco for aplicada." : mensagemDeErro(error));
      return;
    }
    const d = data as Dados;
    setDados(d);
    // A equipe do lugar começa comentando como o lugar (dá para desmarcar).
    if (primeira.current && d.sou_equipe && tipo === "lugar") setComoEstab(true);
    primeira.current = false;
    aoMudarTotal?.(d.comentarios.filter((c) => !c.apagado).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Veio de uma notificação: rola até o comentário e destaca.
  const jaRolou = useRef(false);
  useEffect(() => {
    if (!destaque || !dados || jaRolou.current) return;
    jaRolou.current = true;
    window.setTimeout(() => document.getElementById(`comentario-${destaque}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  }, [destaque, dados]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && !denunciando && fechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [fechar, denunciando]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    setErro("");
    const { error } = await supabase.rpc("comentar", {
      p_tipo: tipo,
      p_id: id,
      p_texto: t,
      p_resposta: respondendo?.id ?? null,
      p_como_estab: comoEstab && !!dados?.sou_equipe,
    });
    setEnviando(false);
    if (error) return setErro(mensagemDeErro(error));
    setTexto("");
    setRespondendo(null);
    await carregar();
    window.setTimeout(() => fim.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
  };

  const curtir = async (c: Comentario) => {
    setDados((d) => d && { ...d, comentarios: d.comentarios.map((x) => (x.id === c.id ? { ...x, curti: !c.curti, curtidas: x.curtidas + (c.curti ? -1 : 1) } : x)) });
    const { error } = await supabase.rpc("curtir_comentario", { p_comentario: c.id });
    if (error) void carregar();
  };

  const apagar = async (c: Comentario) => {
    setMenu(null);
    if (!window.confirm("Apagar este comentário?")) return;
    const { error } = await supabase.rpc("apagar_comentario", { p_comentario: c.id });
    if (error) return setErro(mensagemDeErro(error));
    await carregar();
  };

  const responder = (c: Comentario) => {
    setRespondendo(c);
    if (!texto && c.autor.usuario && !c.autor.lugar) setTexto(`@${c.autor.usuario} `);
    window.setTimeout(() => campo.current?.focus(), 30);
  };

  const principais = (dados?.comentarios ?? []).filter((c) => !c.resposta_a);
  const respostasDe = (pai: string) => (dados?.comentarios ?? []).filter((c) => c.resposta_a === pai);

  const Linha = ({ c, resposta }: { c: Comentario; resposta?: boolean }) => (
    <li id={`comentario-${c.id}`} className={clsx("flex gap-2.5 py-2", resposta && "pl-11", c.id === destaque && "comentario-destaque")}>
      {c.apagado ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elevado text-suave">
          <X className="h-3.5 w-3.5" />
        </span>
      ) : c.autor.lugar ? (
        <Link to={`/lugar/${c.autor.id}`} onClick={fechar} className="shrink-0">
          {c.autor.foto_url ? (
            <img src={c.autor.foto_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-elevado text-suave">
              <Store className="h-4 w-4" />
            </span>
          )}
        </Link>
      ) : (
        <Link to={c.meu ? "/perfil" : `/p/${c.autor.usuario}`} onClick={fechar} className="shrink-0">
          <Avatar nome={c.autor.nome} foto={c.autor.foto_url} tamanho="sm" ampliar />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        {c.apagado ? (
          <p className="text-[13px] italic text-suave">Comentário apagado</p>
        ) : (
          <>
            <p className="text-[14px] leading-snug">
              <span className="mr-1.5 font-semibold">
                {c.autor.lugar ? c.autor.nome : c.autor.usuario ?? c.autor.nome}
                {c.autor.lugar && <span className="ml-1 rounded bg-destaque-suave px-1 py-px text-[10px] font-semibold text-destaque">LUGAR</span>}
              </span>
              <span className="whitespace-pre-line break-words">{c.texto}</span>
            </p>
            <div className="mt-0.5 flex items-center gap-3 text-[12px] text-suave">
              <span>{tempo(c.criado_em)}</span>
              {c.curtidas > 0 && <span>{c.curtidas === 1 ? "1 brinde" : `${c.curtidas} brindes`}</span>}
              <button onClick={() => responder(c)} className="font-semibold hover:text-texto">
                Responder
              </button>
              <span className="relative">
                <button onClick={() => setMenu(menu === c.id ? null : c.id)} className="rounded p-0.5 hover:text-texto" aria-label="Mais opções do comentário">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menu === c.id && (
                  <span className="absolute left-0 top-6 z-10 block w-40 overflow-hidden rounded-lg border border-borda bg-superficie py-1 text-[13px] text-texto shadow-lg">
                    {(c.meu || dados?.pode_moderar) && (
                      <button onClick={() => void apagar(c)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-perigo hover:bg-elevado">
                        <Trash2 className="h-3.5 w-3.5" />
                        Apagar
                      </button>
                    )}
                    {!c.meu && (
                      <button
                        onClick={() => {
                          setMenu(null);
                          setDenunciando(c.id);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-elevado"
                      >
                        <Flag className="h-3.5 w-3.5" />
                        Denunciar
                      </button>
                    )}
                  </span>
                )}
              </span>
            </div>
          </>
        )}
      </div>
      {!c.apagado && (
        <BotaoBrindar ativo={c.curti} aoBrindar={() => void curtir(c)} tamanho="sm" rotulo="comentário" className="shrink-0 self-start" />
      )}
    </li>
  );

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={titulo} onClick={fechar}>
      <div className="folha flex h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-superficie sm:h-[70vh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-5 py-3">
          <h2 className="font-semibold">{titulo}</h2>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4" onClick={() => setMenu(null)}>
          {dados === undefined ? (
            <p className="py-6 text-center text-sm text-suave">Carregando...</p>
          ) : dados === null ? (
            <p className="py-6 text-center text-sm text-suave">{erro}</p>
          ) : principais.length === 0 ? (
            <div className="py-12 text-center">
              <MessageCircle className="mx-auto h-8 w-8 text-suave" />
              <p className="mt-2 font-medium">Nenhum comentário ainda</p>
              <p className="text-sm text-suave">Comece a conversa.</p>
            </div>
          ) : (
            <ul className="py-2">
              {principais.map((c) => (
                <Fragment key={c.id}>
                  <Linha c={c} />
                  {respostasDe(c.id).map((r) => (
                    <Linha key={r.id} c={r} resposta />
                  ))}
                </Fragment>
              ))}
            </ul>
          )}
          <div ref={fim} />
        </div>

        {dados !== null && (
          <form onSubmit={enviar} className="border-t border-borda px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
            {respondendo && (
              <p className="mb-1.5 flex items-center gap-2 px-1 text-[12px] text-suave">
                <span className="min-w-0 flex-1 truncate">
                  Respondendo a <strong>{respondendo.autor.lugar ? respondendo.autor.nome : respondendo.autor.usuario ?? respondendo.autor.nome}</strong>
                </span>
                <button type="button" onClick={() => setRespondendo(null)} aria-label="Cancelar resposta">
                  <X className="h-3.5 w-3.5" />
                </button>
              </p>
            )}
            {dados?.sou_equipe && dados.estab && (
              <label className="mb-1.5 flex items-center gap-2 px-1 text-[12px]">
                <input type="checkbox" className="h-3.5 w-3.5 accent-[rgb(var(--marca))]" checked={comoEstab} onChange={(e) => setComoEstab(e.target.checked)} />
                Comentar como <strong>{dados.estab.nome}</strong>
              </label>
            )}
            {erro && dados && <p className="mb-1.5 px-1 text-[13px] text-perigo">{erro}</p>}
            <div className="flex items-center gap-2">
              {comoEstab && dados?.estab ? (
                dados.estab.logo_url ? (
                  <img src={dados.estab.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elevado text-suave">
                    <Store className="h-4 w-4" />
                  </span>
                )
              ) : (
                <Avatar nome={perfil?.nome ?? "?"} foto={perfil?.foto_url} tamanho="sm" />
              )}
              <input
                ref={campo}
                value={texto}
                onChange={(e) => setTexto(e.target.value.slice(0, 500))}
                placeholder={respondendo ? "Escreva sua resposta..." : "Adicione um comentário..."}
                className="h-10 min-w-0 flex-1 rounded-full border border-borda bg-fundo px-4 text-sm focus:border-marca focus:outline-none"
                enterKeyHint="send"
              />
              <button type="submit" disabled={!texto.trim() || enviando} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca text-marca-texto disabled:opacity-40" aria-label="Enviar comentário">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}
      </div>
      {denunciando && <JanelaDenuncia tipo="comentario" alvo={denunciando} titulo="Denunciar comentário" fechar={() => setDenunciando(null)} />}
    </div>
  );
}

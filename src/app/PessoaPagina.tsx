import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, Ban, Flag, Lock, Megaphone, MessageCircle, MoreHorizontal, UserMinus, UserRound } from "lucide-react";
import { abrirConversa } from "@/lib/chat";
import { Avatar } from "@/components/Avatar";
import { Carregando } from "@/components/Carregando";
import { JanelaDenuncia } from "@/components/Denunciar";
import { GradePublicacoes } from "@/components/GradePublicacoes";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import {
  bloquearPessoa,
  buscarPerfilPessoa,
  deixarDeSeguir,
  desbloquearPessoa,
  listaConexoes,
  PerfilPessoa,
  PessoaResumo,
  seguirPessoa,
  textoSeguir,
} from "@/lib/pessoas";
import { buscarStoriesPessoas, GrupoStories } from "./conteudo";
import { AnelStory, VisorStories } from "./VisorStories";

function Topo({ titulo }: { titulo: string }) {
  const navegar = useNavigate();
  return (
    <div className="flex items-center gap-2 px-2 pt-3">
      <button onClick={() => navegar(-1)} className="rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="truncate text-lg font-semibold">{titulo}</h1>
    </div>
  );
}

/** Perfil de outra pessoa: /p/:usuario */
export function PessoaPagina() {
  const { usuario = "" } = useParams();
  const navegar = useNavigate();
  const { sessao, perfil: eu } = useSessao();
  const [p, setP] = useState<PerfilPessoa | null | undefined>(undefined);
  const [stories, setStories] = useState<GrupoStories[]>([]);
  const [visor, setVisor] = useState(false);
  const [menu, setMenu] = useState(false);
  const [denunciando, setDenunciando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const dados = await buscarPerfilPessoa(usuario);
      setP(dados);
      if (dados?.pode_ver && sessao) setStories(await buscarStoriesPessoas(sessao.user.id, dados.id));
      else setStories([]);
    } catch (e) {
      setErro(mensagemDeErro(e));
      setP(null);
    }
  }, [usuario, sessao]);

  useEffect(() => {
    setP(undefined);
    void carregar();
  }, [carregar]);
  useEffect(() => {
    if (p) document.title = `${p.nome} (@${p.usuario}) · RoVibes`;
  }, [p]);

  if (eu?.usuario && usuario.toLowerCase() === eu.usuario) return <Navigate to="/perfil" replace />;
  if (p === undefined) return <Carregando />;
  if (!p)
    return (
      <div>
        <Topo titulo="Perfil" />
        <div className="px-6 py-16 text-center">
          <UserRound className="mx-auto h-8 w-8 text-suave" />
          <p className="mt-3 font-medium">Perfil não encontrado</p>
          <p className="mt-1 text-sm text-suave">{erro || "Esta conta não existe ou não está disponível."}</p>
        </div>
      </div>
    );

  const acao = async (f: () => Promise<unknown>) => {
    setOcupado(true);
    setErro("");
    try {
      await f();
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setOcupado(false);
  };

  const alternarSeguir = () =>
    acao(async () => {
      if (p.eu_sigo) {
        if (p.eu_sigo === "ativo" && p.privado && !window.confirm(`Deixar de seguir @${p.usuario}? O perfil é privado: para voltar, você precisará pedir de novo.`)) return;
        await deixarDeSeguir(p.id);
      } else await seguirPessoa(p.id);
    });

  const bloquear = () => {
    setMenu(false);
    if (p.eu_bloqueei) return void acao(() => desbloquearPessoa(p.id));
    if (!window.confirm(`Bloquear @${p.usuario}? Vocês deixam de se seguir, e essa pessoa não vê mais seu perfil nem seus stories. Ela não é avisada.`)) return;
    void acao(() => bloquearPessoa(p.id));
  };

  const removerSeguidor = () => {
    setMenu(false);
    if (!window.confirm(`Remover @${p.usuario} dos seus seguidores? A pessoa não é avisada.`)) return;
    void acao(async () => {
      const { error } = await supabase.rpc("remover_seguidor", { p_seguidor: p.id });
      if (error) throw error;
    });
  };

  const temStory = stories.length > 0;

  return (
    <div className="pb-8">
      <div className="flex items-center gap-2 px-2 pt-3">
        <BotaoVoltar />
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{p.usuario}</h1>
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} className="rounded-full p-2 hover:bg-elevado" aria-label="Mais opções" aria-expanded={menu}>
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menu && (
            <div className="absolute right-0 top-10 z-20 w-52 overflow-hidden rounded-xl border border-borda bg-superficie text-sm shadow-lg">
              {p.me_segue && (
                <button onClick={removerSeguidor} className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-elevado">
                  <UserMinus className="h-4 w-4" />
                  Remover seguidor
                </button>
              )}
              <button onClick={bloquear} className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-elevado">
                <Ban className="h-4 w-4" />
                {p.eu_bloqueei ? "Desbloquear" : "Bloquear"}
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  setDenunciando(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-perigo hover:bg-elevado"
              >
                <Flag className="h-4 w-4" />
                Denunciar perfil
              </button>
            </div>
          )}
        </div>
      </div>

      <section className="px-4 pt-3">
        <div className="flex items-center gap-5">
          {temStory ? (
            <button onClick={() => setVisor(true)} aria-label="Ver story">
              <AnelStory visto={stories[0].vistos}>
                <Avatar nome={p.nome} foto={p.foto_url} tamanho="xl" />
              </AnelStory>
            </button>
          ) : (
            <Avatar nome={p.nome} foto={p.foto_url} tamanho="xl" ampliar />
          )}
          <Contadores pessoa={p} />
        </div>
        <h2 className="mt-3 flex items-center gap-1.5 font-semibold">
          {p.nome}
          {p.privado && <Lock className="h-3.5 w-3.5 text-suave" aria-label="Perfil privado" />}
        </h2>
        <SelosPromoter pessoa={p.id} />
        {p.bio && <p className="mt-0.5 whitespace-pre-line text-[15px]">{p.bio}</p>}
        {p.me_segue && !p.eu_bloqueei && <p className="mt-1 text-[13px] text-suave">Segue você</p>}

        {p.eu_bloqueei ? (
          <button className="botao mt-4 w-full" disabled={ocupado} onClick={bloquear}>
            Desbloquear
          </button>
        ) : (
          <div className="mt-4 flex gap-2">
            <button
              className={clsx("h-10 flex-1 rounded-lg text-sm font-semibold", p.eu_sigo ? "botao" : "botao-principal")}
              disabled={ocupado || !sessao}
              onClick={() => void alternarSeguir()}
            >
              {textoSeguir(p.eu_sigo, p.me_segue)}
            </button>
            <button
              className="botao h-10 flex-1 text-sm font-semibold"
              disabled={ocupado}
              onClick={() =>
                void acao(async () => {
                  const c = await abrirConversa(p.id);
                  navegar(`/chat/${c}`);
                })
              }
            >
              <MessageCircle className="h-4 w-4" />
              Mensagem
            </button>
          </div>
        )}
        {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}
      </section>

      {p.pode_ver && !p.eu_bloqueei && (
        <div className="mt-6 border-t border-borda">
          <GradePublicacoes pessoa={p.id} autor={{ nome: p.nome, usuario: p.usuario, foto_url: p.foto_url }} />
        </div>
      )}
      <section className={clsx("mt-6 border-t border-borda px-6 py-12 text-center", p.pode_ver && !p.eu_bloqueei && "hidden")}>
        {p.eu_bloqueei ? (
          <p className="text-sm text-suave">Você bloqueou esta pessoa.</p>
        ) : !p.pode_ver ? (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-borda">
              <Lock className="h-5 w-5" />
            </span>
            <p className="mt-3 font-semibold">Este perfil é privado</p>
            <p className="mt-1 text-sm text-suave">Siga para ver as publicações, os stories e as conexões de {p.nome.split(" ")[0]}.</p>
          </>
        ) : null}
      </section>

      {visor && sessao && (
        <VisorStories
          grupos={stories}
          inicio={0}
          usuario={sessao.user.id}
          fechar={() => {
            setVisor(false);
            void carregar();
          }}
        />
      )}
      {denunciando && <JanelaDenuncia tipo="perfil" alvo={p.id} titulo={`Denunciar @${p.usuario}`} fechar={() => setDenunciando(false)} />}
    </div>
  );
}

function BotaoVoltar() {
  const navegar = useNavigate();
  return (
    <button onClick={() => navegar(-1)} className="rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}

/** Seguidores e seguindo (com link quando é possível ver). */
export function Contadores({ pessoa }: { pessoa: Pick<PerfilPessoa, "usuario" | "seguidores" | "seguindo" | "pode_ver"> }) {
  const item = (n: number, rotulo: string, tipo: string) => {
    const conteudo = (
      <>
        <span className="block text-lg font-semibold">{n}</span>
        <span className="block text-[13px] text-suave">{rotulo}</span>
      </>
    );
    return pessoa.pode_ver ? (
      <Link to={`/p/${pessoa.usuario}/${tipo}`} className="flex-1 rounded-lg py-1 text-center hover:bg-elevado">
        {conteudo}
      </Link>
    ) : (
      <span className="flex-1 py-1 text-center">{conteudo}</span>
    );
  };
  return (
    <div className="flex flex-1 gap-1">
      {item(pessoa.seguidores, pessoa.seguidores === 1 ? "seguidor" : "seguidores", "seguidores")}
      {item(pessoa.seguindo, "seguindo", "seguindo")}
    </div>
  );
}

/** Lista de seguidores ou de quem a pessoa segue: /p/:usuario/seguidores | /p/:usuario/seguindo */
export function ListaConexoes() {
  const { usuario = "", tipo = "seguidores" } = useParams();
  const { sessao, perfil: eu } = useSessao();
  const [lista, setLista] = useState<PessoaResumo[] | null>(null);
  const [dono, setDono] = useState<PerfilPessoa | null>(null);
  const [erro, setErro] = useState("");
  const meu = eu?.usuario === usuario;
  const modo = tipo === "seguindo" ? "seguindo" : "seguidores";

  const carregar = useCallback(async () => {
    try {
      const p = await buscarPerfilPessoa(usuario);
      setDono(p);
      if (!p) return setLista([]);
      setLista(await listaConexoes(p.id, modo));
    } catch (e) {
      setErro(mensagemDeErro(e));
      setLista([]);
    }
  }, [usuario, modo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const responder = async (id: string, aceitar: boolean) => {
    const { error } = await supabase.rpc("responder_seguidor", { p_seguidor: id, p_aceitar: aceitar });
    if (error) setErro(mensagemDeErro(error));
    await carregar();
  };
  const remover = async (id: string) => {
    if (modo === "seguidores") await supabase.rpc("remover_seguidor", { p_seguidor: id });
    else await deixarDeSeguir(id);
    await carregar();
  };

  return (
    <div className="pb-6">
      <Topo titulo={`${modo === "seguidores" ? "Seguidores" : "Seguindo"}${dono ? ` · ${dono.usuario}` : ""}`} />
      {erro && <p className="px-4 pt-2 text-sm text-perigo">{erro}</p>}
      {lista === null ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <p className="px-6 py-14 text-center text-sm text-suave">{modo === "seguidores" ? "Nenhum seguidor ainda." : "Ainda não segue ninguém."}</p>
      ) : (
        <ul className="mt-2 divide-y divide-borda">
          {lista.map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-4 py-2.5">
              <Link to={x.id === sessao?.user.id ? "/perfil" : `/p/${x.usuario}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar nome={x.nome} foto={x.foto_url} ampliar />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{x.usuario}</span>
                  <span className="block truncate text-[13px] text-suave">{x.nome}</span>
                </span>
              </Link>
              {meu && x.situacao === "pendente" ? (
                <span className="flex gap-1.5">
                  <button className="botao-principal h-8 px-3 text-[13px]" onClick={() => void responder(x.id, true)}>
                    Aceitar
                  </button>
                  <button className="botao h-8 px-3 text-[13px]" onClick={() => void responder(x.id, false)}>
                    Recusar
                  </button>
                </span>
              ) : (
                meu && (
                  <button className="botao h-8 px-3 text-[13px]" onClick={() => void remover(x.id)}>
                    {modo === "seguidores" ? "Remover" : "Deixar de seguir"}
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Selo "Promoter · Lugar" no perfil da pessoa. */
function SelosPromoter({ pessoa }: { pessoa: string }) {
  const [selos, setSelos] = useState<{ estabelecimento_id: string; nome: string }[]>([]);
  useEffect(() => {
    supabase.rpc("selos_promoter", { p_usuario: pessoa }).then(({ data }) => setSelos((data ?? []) as { estabelecimento_id: string; nome: string }[]));
  }, [pessoa]);
  if (!selos.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {selos.map((s) => (
        <Link key={s.estabelecimento_id} to={`/lugar/${s.estabelecimento_id}`} className="inline-flex items-center gap-1 rounded-full bg-destaque-suave px-2.5 py-0.5 text-[12px] font-semibold text-destaque">
          <Megaphone className="h-3 w-3" />
          Promoter · {s.nome}
        </Link>
      ))}
    </div>
  );
}

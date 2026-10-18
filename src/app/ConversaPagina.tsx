import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, LogOut, MoreHorizontal, Settings2, Trash2, UserPlus, UserRound } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Carregando } from "@/components/Carregando";
import { CorpoConversa, FaixaPedido, IconeConversa } from "@/components/Conversa";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { bloquearPessoa } from "@/lib/pessoas";
import { DadosConversa, faltaBanco, MembroConversa, useAoVivoChat, usePlanos } from "@/lib/chat";
import { FolhaPlano, PlanoFixado, useLocalizacao } from "./PlanoRole";
import { EscolherPessoas } from "./NovoRole";

/** Uma conversa do App: /chat/:id (direta, com lugar ou grupo do rolê). */
export function ConversaPagina() {
  const { id = "" } = useParams();
  const { sessao } = useSessao();
  const eu = sessao!.user.id;
  const navegar = useNavigate();
  const [dados, setDados] = useState<DadosConversa | null | undefined>(undefined);
  const [membros, setMembros] = useState<MembroConversa[]>([]);
  const [menu, setMenu] = useState(false);
  const [detalhes, setDetalhes] = useState(false);
  const [erro, setErro] = useState("");
  const [planoAberto, setPlanoAberto] = useState<string | null>(null);
  const { planos, fixado, recarregar: recarregarPlanos } = usePlanos(id);
  const temPlano = planos.some((p) => p.situacao !== "cancelado");
  const localizacao = useLocalizacao(id, eu, temPlano);

  const carregar = useCallback(async () => {
    const [d, m] = await Promise.all([supabase.rpc("dados_conversa", { p_conversa: id }), supabase.rpc("membros_conversa", { p_conversa: id })]);
    if (d.error && faltaBanco(d.error.message)) setErro("Falta aplicar a atualização 014 do banco.");
    setDados(((d.data ?? []) as DadosConversa[])[0] ?? null);
    setMembros((m.data ?? []) as MembroConversa[]);
  }, [id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  useAoVivoChat(`membros-${id}`, `conversa_id=eq.${id}`, () => {
    supabase.rpc("membros_conversa", { p_conversa: id }).then(({ data }) => setMembros((data ?? []) as MembroConversa[]));
  });
  useEffect(() => {
    if (dados?.titulo) document.title = `${dados.titulo} · RoVibes`;
  }, [dados?.titulo]);

  if (dados === undefined) return <Carregando />;
  if (!dados)
    return (
      <div className="px-6 py-16 text-center">
        <p className="font-medium">Conversa não encontrada</p>
        <p className="mt-1 text-sm text-suave">{erro || "Ela pode ter sido apagada ou você não participa mais."}</p>
        <Link to="/chats" className="botao mt-5">
          Voltar ao Chat
        </Link>
      </div>
    );

  const outro = dados.tipo === "direta" ? membros.find((m) => m.id !== eu) : undefined;
  const linkTitulo = dados.tipo === "direta" && dados.link ? `/p/${dados.link}` : dados.tipo === "estabelecimento" && dados.link ? `/lugar/${dados.link}` : null;

  const sair = async () => {
    setMenu(false);
    const pergunta = dados.tipo === "role" ? "Sair deste grupo?" : "Apagar esta conversa da sua lista? Se a outra parte escrever de novo, ela volta.";
    if (!window.confirm(pergunta)) return;
    const { error } = await supabase.rpc("sair_da_conversa", { p_conversa: dados.id });
    if (error) return setErro(mensagemDeErro(error));
    navegar("/chats", { replace: true });
  };

  const bloquear = async () => {
    setMenu(false);
    if (!outro || !window.confirm(`Bloquear ${outro.nome}? Vocês deixam de se seguir e não poderão trocar mensagens. A pessoa não é avisada.`)) return;
    try {
      await bloquearPessoa(outro.id);
      navegar("/chats", { replace: true });
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  const cabecalho = (
    <>
      <IconeConversa tipo={dados.tipo} titulo={dados.titulo} foto={dados.foto} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{dados.titulo}</span>
        <span className="block truncate text-[12px] text-suave">
          {dados.tipo === "role"
            ? `${membros.filter((m) => m.situacao === "ativo").length} pessoas`
            : dados.tipo === "estabelecimento"
              ? "Fale com o estabelecimento"
              : outro
                ? `@${outro.usuario}`
                : ""}
        </span>
      </span>
    </>
  );

  return (
    <div className="fixed inset-x-0 top-0 z-40 mx-auto flex h-[100dvh] max-w-xl flex-col bg-fundo sm:border-x sm:border-borda">
      <header className="flex h-14 shrink-0 items-center gap-2 bg-fundo px-2 pt-[env(safe-area-inset-top)]">
        <button onClick={() => (window.history.length > 1 ? navegar(-1) : navegar("/chats"))} className="rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        {linkTitulo ? (
          <Link to={linkTitulo} className="flex min-w-0 flex-1 items-center gap-2.5">
            {cabecalho}
          </Link>
        ) : (
          <button onClick={() => dados.tipo === "role" && setDetalhes(true)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            {cabecalho}
          </button>
        )}
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} className="rounded-full p-2 hover:bg-elevado" aria-label="Mais opções" aria-expanded={menu}>
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menu && (
            <div className="absolute right-0 top-10 z-20 w-52 overflow-hidden rounded-xl border border-borda bg-superficie text-sm shadow-lg">
              {dados.tipo === "role" && (
                <button
                  onClick={() => {
                    setMenu(false);
                    setDetalhes(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-elevado"
                >
                  <Settings2 className="h-4 w-4" />
                  Informações do grupo
                </button>
              )}
              {outro && (
                <Link to={`/p/${outro.usuario}`} className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-elevado">
                  <UserRound className="h-4 w-4" />
                  Ver perfil
                </Link>
              )}
              {outro && (
                <button onClick={() => void bloquear()} className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-elevado">
                  <Ban className="h-4 w-4" />
                  Bloquear
                </button>
              )}
              <button onClick={() => void sair()} className="flex w-full items-center gap-2 px-3 py-2.5 text-perigo hover:bg-elevado">
                {dados.tipo === "role" ? <LogOut className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                {dados.tipo === "role" ? "Sair do grupo" : "Apagar conversa"}
              </button>
            </div>
          )}
        </div>
      </header>

      {dados.situacao === "pedido" && <FaixaPedido dados={dados} aoResponder={() => void carregar()} bloquear={outro ? () => void bloquear() : undefined} />}
      {fixado && dados.situacao === "ativo" && <PlanoFixado plano={fixado} compartilhando={!!localizacao.meu} abrir={() => setPlanoAberto(fixado.id)} />}
      {erro && <p className="px-4 py-2 text-sm text-perigo">{erro}</p>}

      <CorpoConversa
        dados={dados}
        eu={eu}
        membros={membros}
        nomeEstab={dados.tipo === "estabelecimento" ? dados.titulo ?? undefined : undefined}
        planos={planos}
        abrirPlano={(pid) => {
          void recarregarPlanos();
          setPlanoAberto(pid);
        }}
      />
      {planoAberto && planos.find((p) => p.id === planoAberto) && (
        <FolhaPlano
          plano={planos.find((p) => p.id === planoAberto)!}
          eu={eu}
          localizacao={localizacao}
          fechar={() => setPlanoAberto(null)}
          aoMudar={() => void recarregarPlanos()}
        />
      )}

      {detalhes && <DetalhesRole dados={dados} membros={membros} eu={eu} fechar={() => setDetalhes(false)} aoMudar={() => void carregar()} />}
    </div>
  );
}

function DetalhesRole({
  dados,
  membros,
  eu,
  fechar,
  aoMudar,
}: {
  dados: DadosConversa;
  membros: MembroConversa[];
  eu: string;
  fechar: () => void;
  aoMudar: () => void;
}) {
  const [modo, setModo] = useState<"ver" | "editar" | "convidar">("ver");
  const [erro, setErro] = useState("");

  const remover = async (m: MembroConversa) => {
    if (!window.confirm(`Remover ${m.nome} do grupo?`)) return;
    const { error } = await supabase.rpc("remover_do_role", { p_conversa: dados.id, p_pessoa: m.id });
    if (error) setErro(mensagemDeErro(error));
    aoMudar();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Informações do grupo" onClick={fechar}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {modo === "editar" ? (
          <EditarNome
            inicial={dados.titulo ?? ""}
            salvar={async (titulo) => {
              const { error } = await supabase.rpc("editar_role", { p_conversa: dados.id, p_titulo: titulo, p_local: dados.local_id, p_quando: dados.quando });
              if (error) throw error;
              aoMudar();
              setModo("ver");
            }}
            cancelar={() => setModo("ver")}
          />
        ) : modo === "convidar" ? (
          <EscolherPessoas
            jaNoRole={membros.map((m) => m.id)}
            confirmar={async (ids) => {
              const { error } = await supabase.rpc("adicionar_ao_role", { p_conversa: dados.id, p_pessoas: ids });
              if (error) throw error;
              aoMudar();
              setModo("ver");
            }}
            cancelar={() => setModo("ver")}
            textoBotao="Convidar"
          />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{dados.titulo}</h2>
              <button className="botao h-8 px-3 text-[13px]" onClick={() => setModo("editar")}>
                Mudar nome
              </button>
            </div>
            <button className="botao mt-4 w-full" onClick={() => setModo("convidar")}>
              <UserPlus className="h-4 w-4" />
              Convidar pessoas
            </button>
            <h3 className="rotulo mb-1 mt-5">Participantes</h3>
            <ul className="divide-y divide-borda">
              {membros.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <Link to={m.id === eu ? "/perfil" : `/p/${m.usuario}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar nome={m.nome} foto={m.foto_url} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {m.id === eu ? "Você" : m.nome}
                        {m.papel === "admin" && <span className="ml-1.5 text-[11px] font-medium text-destaque">organiza</span>}
                      </span>
                      <span className="block text-[12px] text-suave">{m.situacao === "pedido" ? "Convidado" : `@${m.usuario}`}</span>
                    </span>
                  </Link>
                  {dados.eu_admin && m.id !== eu && (
                    <button className="botao h-8 px-3 text-[13px] text-perigo" onClick={() => void remover(m)}>
                      Remover
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}
            <button className="botao mt-4 w-full" onClick={fechar}>
              Fechar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function EditarNome({ inicial, salvar, cancelar }: { inicial: string; salvar: (t: string) => Promise<void>; cancelar: () => void }) {
  const [titulo, setTitulo] = useState(inicial);
  const [erro, setErro] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        salvar(titulo.trim()).catch((er) => setErro(mensagemDeErro(er)));
      }}
      className="space-y-3"
    >
      <label className="block">
        <span className="rotulo mb-1 block">Nome do grupo</span>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value.slice(0, 60))} className="h-11 w-full rounded-lg bg-elevado px-3 text-sm focus:outline-none focus:ring-2 focus:ring-marca" />
      </label>
      {erro && <p className="text-sm text-perigo">{erro}</p>}
      <div className="flex gap-2">
        <button type="submit" className="botao-principal h-11 flex-1" disabled={!titulo.trim()}>
          Salvar
        </button>
        <button type="button" className="botao h-11" onClick={cancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

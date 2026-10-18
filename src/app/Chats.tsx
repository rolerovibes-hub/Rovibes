import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, ChevronRight, MessageCircle, PartyPopper, PenSquare, Search, UserPlus, X } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { IconeConversa } from "@/components/Conversa";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { abrirConversa, ConversaResumo, faltaBanco, horaMensagem, quandoPlano, useAoVivoChat } from "@/lib/chat";
import { DadosRole, EscolherPessoas, FormularioRole } from "./NovoRole";

export function Chats() {
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const [lista, setLista] = useState<ConversaResumo[] | null>(null);
  const [verPedidos, setVerPedidos] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "pessoas" | "grupos" | "planos">("todas");
  const [busca, setBusca] = useState("");
  const [nova, setNova] = useState<null | "mensagem" | "role">(params.get("novoRole") !== null ? "role" : null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    supabase.rpc("minhas_conversas").then(({ data, error }) => {
      if (error) setErro(faltaBanco(error.message) ? "Falta aplicar a atualização 014 do banco." : mensagemDeErro(error));
      setLista((data ?? []) as ConversaResumo[]);
    });
  }, []);
  useEffect(() => {
    document.title = "Chat · RoVibes";
    carregar();
  }, [carregar]);
  useAoVivoChat("lista-chat", null, carregar);

  const pedidos = (lista ?? []).filter((c) => c.situacao === "pedido");
  const conversas = (lista ?? []).filter((c) => c.situacao === "ativo");
  const termo = busca
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const visiveis = (verPedidos ? pedidos : conversas)
    .filter((c) => filtro === "todas" || (filtro === "pessoas" ? c.tipo === "direta" : filtro === "grupos" ? c.tipo === "role" : c.tem_plano))
    .filter(
      (c) =>
        !termo ||
        `${c.titulo ?? ""} ${c.link ?? ""} ${c.local_nome ?? ""}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(termo),
    );

  const fecharNova = () => {
    setNova(null);
    if (params.has("novoRole")) setParams({}, { replace: true });
  };

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 px-4 pt-3">
        {verPedidos && (
          <button onClick={() => setVerPedidos(false)} className="-ml-2 rounded-full p-2 hover:bg-elevado" aria-label="Voltar para as conversas">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h1 className="flex-1 text-[22px] font-semibold">{verPedidos ? "Pedidos de mensagem" : "Mensagens"}</h1>
        {!verPedidos && (
          <>
            <button onClick={() => setNova("role")} className="rounded-full p-2 text-magenta hover:bg-elevado" aria-label="Novo rolê em grupo">
              <PartyPopper className="h-5 w-5" />
            </button>
            <button onClick={() => setNova("mensagem")} className="rounded-full p-2 hover:bg-elevado" aria-label="Nova mensagem">
              <PenSquare className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {!verPedidos && (
        <>
          <label className="relative mx-4 mt-2 block">
            <span className="sr-only">Buscar conversas</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar conversas..."
              className="h-10 w-full rounded-full bg-elevado pl-10 pr-3 text-[15px] placeholder:text-suave focus:outline-none focus:ring-2 focus:ring-marca/60"
            />
          </label>
          <div className="mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" role="tablist" aria-label="Filtrar conversas">
            {(
              [
                ["todas", "Todas"],
                ["pessoas", "Pessoas"],
                ["grupos", "Grupos"],
                ["planos", "Planos"],
              ] as const
            ).map(([v, n]) => (
              <button
                key={v}
                role="tab"
                aria-selected={filtro === v}
                onClick={() => setFiltro(v)}
                className={clsx(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors",
                  filtro === v ? "bg-texto font-medium text-fundo" : "bg-elevado text-suave hover:text-texto",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          {pedidos.length > 0 && (
            <button onClick={() => setVerPedidos(true)} className="mt-2 flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevado">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-elevado text-destaque">
                <UserPlus className="h-5 w-5" />
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-semibold">
                  {pedidos.length} {pedidos.length === 1 ? "pedido de mensagem" : "pedidos de mensagem"}
                </span>
                <span className="block text-[13px] text-suave">De quem você não segue e convites para grupos</span>
              </span>
              <ChevronRight className="h-4 w-4 text-suave" />
            </button>
          )}
        </>
      )}

      {erro && <p className="px-4 pt-3 text-sm text-perigo">{erro}</p>}
      {lista === null ? (
        <Carregando />
      ) : visiveis.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-suave" />
          {busca || filtro !== "todas" ? (
            <p className="mt-3 text-sm text-suave">Nenhuma conversa encontrada.</p>
          ) : verPedidos ? (
            <p className="mt-3 text-sm text-suave">Nenhum pedido agora.</p>
          ) : (
            <>
              <p className="mt-3 font-semibold">Nenhuma conversa ainda</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-suave">Chame alguém pelo perfil, compartilhe um lugar e combinem o rolê por aqui.</p>
              <button className="botao-principal mt-5" onClick={() => setNova("mensagem")}>
                <PenSquare className="h-4 w-4" />
                Nova mensagem
              </button>
            </>
          )}
        </div>
      ) : (
        <ul className="mt-1">
          {visiveis.map((c) => {
            const naoLida = c.nao_lidas > 0;
            return (
              <li key={c.id}>
                <Link to={`/chat/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevado">
                  <IconeConversa tipo={c.tipo} titulo={c.titulo} foto={c.foto} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={clsx("min-w-0 flex-1 truncate text-[15px]", naoLida ? "font-bold" : "font-medium")}>{c.titulo}</span>
                      <span className={clsx("shrink-0 text-[12px]", naoLida ? "font-semibold text-texto" : "text-suave")}>{horaMensagem(c.ultima_em)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={clsx("min-w-0 flex-1 truncate text-[14px]", naoLida ? "font-medium text-texto" : "text-suave")}>
                        {c.ultima_minha ? "Você: " : ""}
                        {c.ultima_texto ?? ""}
                      </span>
                      {naoLida && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-magenta" aria-label={`${c.nao_lidas} não lidas`} />}
                    </span>
                    {c.tem_plano && (
                      <span className={clsx("mt-0.5 block truncate text-[12px] font-medium", c.plano_situacao === "confirmado" ? "text-ok" : "text-destaque")}>
                        {c.plano_situacao === "confirmado" ? "Plano confirmado" : "Ideia de rolê"} · {c.local_nome ?? "lugar a definir"} · {quandoPlano(c.quando)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {nova && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" onClick={fecharNova}>
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{nova === "role" ? "Novo rolê em grupo" : "Nova mensagem"}</h2>
              <button onClick={fecharNova} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nova === "mensagem" ? (
              <EscolherPessoas
                unica
                textoBotao="Conversar"
                confirmar={async ([id]) => {
                  const c = await abrirConversa(id);
                  navegar(`/chat/${c}`);
                }}
              />
            ) : (
              <NovoRole localInicial={params.get("novoRole") || null} criado={(id) => navegar(`/chat/${id}`)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NovoRole({ localInicial, criado }: { localInicial: string | null; criado: (id: string) => void }) {
  const [dados, setDados] = useState<DadosRole | null>(null);
  if (!dados)
    return (
      <>
        <p className="mb-3 text-sm text-suave">Um grupo com um plano já dentro: o lugar, quando, quem tem interesse e quem vai.</p>
        <FormularioRole inicial={{ titulo: "", local: localInicial, quando: null }} textoBotao="Próximo: chamar a galera" salvar={async (d) => setDados(d)} />
      </>
    );
  return (
    <>
      <p className="mb-3 text-sm text-suave">
        Quem vai no <strong>{dados.titulo}</strong>?
      </p>
      <EscolherPessoas
        textoBotao="Criar rolê"
        cancelar={() => setDados(null)}
        confirmar={async (ids) => {
          const { data, error } = await supabase.rpc("criar_role", { p_titulo: dados.titulo, p_local: dados.local, p_quando: dados.quando, p_pessoas: ids });
          if (error) throw error;
          criado(data as string);
        }}
      />
    </>
  );
}

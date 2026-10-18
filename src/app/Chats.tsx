import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { MessageCircle, PartyPopper, PenSquare, X } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { IconeConversa } from "@/components/Conversa";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { abrirConversa, ConversaResumo, faltaBanco, horaMensagem, quandoRole, useAoVivoChat } from "@/lib/chat";
import { DadosRole, EscolherPessoas, FormularioRole } from "./NovoRole";

export function Chats() {
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const [lista, setLista] = useState<ConversaResumo[] | null>(null);
  const [aba, setAba] = useState<"conversas" | "pedidos">("conversas");
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
  const visiveis = aba === "pedidos" ? pedidos : conversas;

  const fecharNova = () => {
    setNova(null);
    if (params.has("novoRole")) setParams({}, { replace: true });
  };

  return (
    <div className="pb-6">
      <div className="flex items-center justify-between px-4 pt-3">
        <h1 className="text-[22px] font-semibold">Chat</h1>
        <div className="flex gap-1">
          <button onClick={() => setNova("role")} className="botao h-9 px-3 text-[13px]">
            <PartyPopper className="h-4 w-4 text-magenta" />
            Novo rolê
          </button>
          <button onClick={() => setNova("mensagem")} className="rounded-full p-2 hover:bg-elevado" aria-label="Nova mensagem">
            <PenSquare className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-5 border-b border-borda px-4" role="tablist">
        {(["conversas", "pedidos"] as const).map((a) => (
          <button
            key={a}
            role="tab"
            aria-selected={aba === a}
            onClick={() => setAba(a)}
            className={clsx("-mb-px border-b-2 pb-2 text-sm", aba === a ? "border-marca font-semibold" : "border-transparent text-suave")}
          >
            {a === "conversas" ? "Conversas" : `Pedidos${pedidos.length ? ` (${pedidos.length})` : ""}`}
          </button>
        ))}
      </div>

      {erro && <p className="px-4 pt-3 text-sm text-perigo">{erro}</p>}
      {lista === null ? (
        <Carregando />
      ) : visiveis.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destaque-suave text-destaque">
            <MessageCircle className="h-6 w-6" />
          </span>
          {aba === "pedidos" ? (
            <p className="mt-4 text-sm text-suave">Mensagens de quem você não segue e convites para rolês aparecem aqui.</p>
          ) : (
            <>
              <p className="mt-4 font-semibold">Nenhuma conversa ainda</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-suave">Chame alguém, monte um rolê com a galera ou fale com um lugar pela página dele.</p>
              <button className="botao-principal mt-5" onClick={() => setNova("role")}>
                <PartyPopper className="h-4 w-4" />
                Montar um rolê
              </button>
            </>
          )}
        </div>
      ) : (
        <ul>
          {visiveis.map((c) => (
            <li key={c.id}>
              <Link to={`/chat/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-elevado">
                <IconeConversa tipo={c.tipo} titulo={c.titulo} foto={c.foto} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={clsx("min-w-0 flex-1 truncate text-[15px]", c.nao_lidas ? "font-bold" : "font-semibold")}>{c.titulo}</span>
                    <span className={clsx("shrink-0 text-[12px]", c.nao_lidas ? "font-semibold text-destaque" : "text-suave")}>{horaMensagem(c.ultima_em)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={clsx("min-w-0 flex-1 truncate text-[13px]", c.nao_lidas ? "font-medium text-texto" : "text-suave")}>
                      {c.tipo === "role" && !c.ultima_texto
                        ? [c.local_nome, quandoRole(c.quando)].filter(Boolean).join(" · ")
                        : `${c.ultima_minha ? "Você: " : ""}${c.ultima_texto ?? ""}`}
                    </span>
                    {c.nao_lidas > 0 && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-magenta px-1.5 text-[11px] font-bold text-white">{c.nao_lidas > 99 ? "99+" : c.nao_lidas}</span>
                    )}
                  </span>
                  {c.tipo === "role" && <span className="text-[11px] font-medium text-magenta">Rolê · {c.membros} {c.membros === 1 ? "pessoa" : "pessoas"}</span>}
                  {c.tipo === "estabelecimento" && <span className="text-[11px] font-medium text-destaque">Estabelecimento</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nova && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" onClick={fecharNova}>
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{nova === "role" ? "Novo rolê" : "Nova mensagem"}</h2>
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
        <p className="mb-3 text-sm text-suave">Um grupo para combinar o rolê: lugar fixado, quem topa e, se quiserem, a localização de cada um até chegar.</p>
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

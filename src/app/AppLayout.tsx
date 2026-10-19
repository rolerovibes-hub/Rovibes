import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Armchair, Bell, ChevronRight, Home, Map, MessageCircle, MoreHorizontal, Search, UserRound, X } from "lucide-react";
import { LeitorQr } from "@/components/Qr";
import { codigoDaMesa } from "@/lib/salao";
import { Marca } from "@/components/Marca";
import { Carregando } from "@/components/Carregando";
import { useSessao } from "@/lib/sessao";
import { AcessoRapidoProvider, useAcessoRapido } from "./estadoAcesso";
import { MenuFlutuante, MenuMais } from "./AcessoRapido";
import { useChatNaoLidas } from "@/lib/chat";

const ABAS = [
  { para: "/mapa", nome: "Mapa", icone: Map },
  { para: "/pesquisar", nome: "Pesquisar", icone: Search },
  { para: "/", nome: "Feed", icone: Home, fim: true, central: true },
  { para: "/chats", nome: "Chat", icone: MessageCircle },
  { para: "/perfil", nome: "Perfil", icone: UserRound },
];

// Telas em que o menu flutuante atrapalharia (têm botões próprios no canto de baixo).
const SEM_MENU = ["/mapa", "/comanda", "/mesa", "/retirada", "/chat/", "/ao-vivo/"];

export function AppLayout() {
  const { carregando, sessao } = useSessao();
  const local = useLocation();
  useEffect(() => {
    document.title = "RoVibes";
  }, []);

  // O App é só para quem tem conta: sem login, vai para a tela de entrar e volta depois.
  if (carregando) return <Carregando />;
  if (!sessao) return <Navigate to={`/entrar?voltar=${encodeURIComponent(local.pathname + local.search)}`} replace />;

  return (
    <AcessoRapidoProvider>
      <Estrutura />
    </AcessoRapidoProvider>
  );
}

function Estrutura() {
  const local = useLocation();
  const navegar = useNavigate();
  const { mesa, lendo, setLendo } = useAcessoRapido();
  const [mais, setMais] = useState(false);
  const chat = useChatNaoLidas(true);
  const seloChat = chat.conversas + chat.pedidos;
  const comMenu = !SEM_MENU.some((r) => local.pathname.startsWith(r));

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col border-borda sm:border-x">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-fundo/95 px-4 backdrop-blur">
        <Link to="/" aria-label="RoVibes, início">
          <Marca />
        </Link>
        <button onClick={() => setMais(true)} className="rounded-full p-2 text-texto hover:bg-elevado" aria-label="Mais opções">
          <MoreHorizontal className="h-6 w-6" />
        </button>
      </header>

      {mesa && !local.pathname.startsWith("/comanda") && (
        <Link
          to={mesa.aviso ? "/retirada" : `/comanda/${mesa.id}`}
          className={clsx("flex items-center gap-3 border-y px-4 py-2.5 text-sm", mesa.aviso ? "border-magenta/40 bg-magenta/10" : "border-borda bg-destaque-suave")}
        >
          <Armchair className="h-4 w-4 text-destaque" />
          <span className="min-w-0 flex-1 truncate">
            {mesa.aviso ? (
              <strong>{mesa.aviso}</strong>
            ) : (
              <>
                Você está na <strong>{mesa.rotulo}</strong> · {mesa.lugar}
              </>
            )}
          </span>
          <span className="font-semibold text-destaque">{mesa.aviso ? "QR Code" : "Comanda"}</span>
          <ChevronRight className="h-4 w-4 text-destaque" />
        </Link>
      )}

      {lendo && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Ler QR code da mesa" onClick={() => setLendo(false)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-superficie p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Ler QR code da mesa</h2>
              <button onClick={() => setLendo(false)} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <LeitorQr
              aoLer={(t) => {
                setLendo(false);
                navegar(`/mesa/${codigoDaMesa(t)}`);
              }}
            />
            <p className="mt-3 text-center text-[13px] text-suave">Aponte para o QR code que está na mesa para pedir pelo cardápio.</p>
          </div>
        </div>
      )}

      <main className="flex-1 pb-24">
        <Outlet />
      </main>

      {comMenu && <MenuFlutuante />}
      {mais && <MenuMais fechar={() => setMais(false)} />}

      <nav aria-label="Navegação principal" className="pb-seguro fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl border-t border-borda bg-superficie sm:border-x">
        <ul className="grid grid-cols-5">
          {ABAS.map(({ para, nome, icone: Icone, fim, central }) => (
            <li key={para}>
              <NavLink
                to={para}
                end={fim}
                className={({ isActive }) =>
                  clsx(
                    "flex flex-col items-center gap-1 py-2.5 text-[12px] transition-colors",
                    isActive ? "font-semibold text-destaque" : "text-suave hover:text-texto",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <Icone className={clsx("h-[22px] w-[22px]", central && isActive && "fill-current")} />
                      {para === "/chats" && seloChat > 0 && (
                        <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-magenta px-1 text-[10px] font-bold text-white">
                          {seloChat > 9 ? "9+" : seloChat}
                        </span>
                      )}
                    </span>
                    {nome}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Estado vazio padrão das abas que entram em fases seguintes. */
export function EmBreve({ icone: Icone, titulo, texto }: { icone: typeof Bell; titulo: string; texto: string }) {
  return (
    <div className="px-6 py-20 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destaque-suave text-destaque">
        <Icone className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-lg font-semibold">{titulo}</h1>
      <p className="mx-auto mt-1 max-w-xs text-sm text-suave">{texto}</p>
    </div>
  );
}

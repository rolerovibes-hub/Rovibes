import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Armchair, Bell, ChevronRight, Clapperboard, Home, Map, PlusSquare, Search, UserRound, X } from "lucide-react";
import { LeitorQr } from "@/components/Qr";
import { codigoDaMesa } from "@/lib/salao";
import { Marca } from "@/components/Marca";
import { Carregando } from "@/components/Carregando";
import { useSessao } from "@/lib/sessao";
import { ler } from "@/lib/armazenamento";
import { AcessoRapidoProvider, useAcessoRapido } from "./estadoAcesso";
import { MenuFlutuante } from "./AcessoRapido";
import { NovoStory } from "./NovoStory";
import { EnviosProvider } from "@/lib/envios";
import { BarraEnvios } from "@/components/BarraEnvios";
import { iniciarPush } from "@/lib/push";

const ABAS = [
  { para: "/mapa", nome: "Mapa", icone: Map },
  { para: "/pesquisar", nome: "Pesquisar", icone: Search },
  { para: "/", nome: "Feed", icone: Home, fim: true, central: true },
  // O chat foi para o botão RoV (acesso rápido); no lugar dele, o VibeCut.
  { para: "/vibecut", nome: "VibeCut", icone: Clapperboard },
  { para: "/perfil", nome: "Perfil", icone: UserRound },
];

// Telas em que o menu flutuante atrapalharia (têm botões próprios no canto de baixo).
const SEM_MENU = ["/mapa", "/comanda", "/mesa", "/retirada", "/chat/", "/ao-vivo/", "/primeira-vibe"];

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
      <EnviosProvider>
        <Estrutura />
        <BarraEnvios />
      </EnviosProvider>
    </AcessoRapidoProvider>
  );
}

function Estrutura() {
  const local = useLocation();
  const navegar = useNavigate();
  const { mesa, lendo, setLendo } = useAcessoRapido();
  const [publicar, setPublicar] = useState(false);
  const { perfil } = useSessao();
  // Notificações: renova o registro do aparelho e abre a tela certa ao tocar na notificação.
  // Com o App aberto não aparece notificação: o celular só vibra rapidinho.
  useEffect(() => {
    void iniciarPush(
      (link) => navegar(link),
      () => {
        try {
          navigator.vibrate?.(60);
        } catch {
          /* sem vibração */
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Telas de fluxo (criar evento, marcar rolê, primeira vibe) têm o próprio botão no rodapé: sem abas embaixo.
  const telaDeFluxo = /^\/(lugar\/[^/]+\/role|eventos\/(novo|[^/]+\/editar)|primeira-vibe)/.test(local.pathname);
  const comMenu = !SEM_MENU.some((r) => local.pathname.startsWith(r)) && !telaDeFluxo;
  // VibeCut: vídeo em tela cheia, sem o topo do app e com a barra de baixo escura.
  const vibecut = local.pathname.startsWith("/vibecut");

  // Primeira vez no App: mostra a "Primeira vibe" (uma vez; dá para pular).
  if (local.pathname === "/" && perfil && perfil.vibe_inicial_em === null && !ler<boolean>("vibe_inicial_feita", false)) {
    return <Navigate to="/primeira-vibe" replace />;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col border-borda sm:border-x">
      {!vibecut && (
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-fundo/95 px-4 backdrop-blur">
        <Link to="/" aria-label="RoVibes, início">
          <Marca />
        </Link>
        <button onClick={() => setPublicar(true)} className="rounded-full p-2 text-texto hover:bg-elevado" aria-label="Nova publicação ou story">
          <PlusSquare className="h-6 w-6" />
        </button>
      </header>
      )}

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
      {publicar && (
        <NovoStory
          destinoInicial="feed"
          fechar={() => setPublicar(false)}
          // O envio segue em segundo plano (barra no topo); a pessoa continua onde estava.
          publicado={() => setPublicar(false)}
        />
      )}

      <nav
        aria-label="Navegação principal"
        hidden={telaDeFluxo}
        className={clsx("pb-seguro fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl border-t sm:border-x", vibecut ? "dark border-white/10 bg-black" : "border-borda bg-superficie")}
      >
        <ul className="grid grid-cols-5">
          {ABAS.map(({ para, nome, icone: Icone, fim, central }) => (
            <li key={para}>
              <NavLink
                to={para}
                end={fim}
                className={({ isActive }) =>
                  clsx(
                    "flex flex-col items-center gap-1 py-2.5 text-[12px] transition-colors",
                    isActive ? (vibecut ? "font-semibold text-white" : "font-semibold text-destaque") : vibecut ? "text-white/60 hover:text-white" : "text-suave hover:text-texto",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <Icone className={clsx("h-[22px] w-[22px]", central && isActive && "fill-current")} />
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

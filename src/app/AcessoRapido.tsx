import { CSSProperties, PointerEvent as EventoPonteiro, useCallback, useEffect, useRef, useState } from "react";
import { IconePapo } from "@/components/IconesRoVibes";
import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Bell, Briefcase, ChevronRight, CreditCard, Megaphone, PartyPopper, QrCode, ScanLine, Store, Ticket, UtensilsCrossed, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAcessoRapido } from "./estadoAcesso";
import { useChatNaoLidas } from "@/lib/chat";

/** Logo "RoV" do menu flutuante. */
export function LogoRov({ className }: { className?: string }) {
  return (
    <span className={clsx("bg-gradient-to-br from-[#8B5CF6] to-[#EC4899] bg-clip-text font-semibold italic tracking-tight text-transparent", className)}>RoV</span>
  );
}

function Selo({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-magenta px-1 text-[11px] font-semibold text-white">{n > 9 ? "9+" : n}</span>
  );
}

const TAMANHO = 52;
const MARGEM = 12;
const BARRA = 76; // altura da navegação de baixo
const CHAVE = "rovibes:hub";
const TEMPO_ABERTO = 10000; // aberto sem interação: recolhe
const TEMPO_NITIDO = 3000; // recolhido sem interação: vira marca d'água

type Posicao = { x: number; y: number };

const limites = () => ({
  maxX: window.innerWidth - TAMANHO - MARGEM,
  maxY: window.innerHeight - TAMANHO - BARRA - MARGEM,
  // Abaixo do topo do app e da linha de ações das telas (três pontinhos do perfil, do lugar...), para não cobrir esses botões.
  minY: 116,
});
const prender = (p: Posicao): Posicao => {
  const l = limites();
  return { x: Math.min(Math.max(MARGEM, p.x), l.maxX), y: Math.min(Math.max(l.minY, p.y), l.maxY) };
};
const lerPosicao = (): Posicao => {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as Posicao | null;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return prender(p);
  } catch {
    /* sem armazenamento */
  }
  const l = limites();
  return { x: l.maxX, y: l.maxY };
};

/**
 * Hub flutuante (pode ser arrastado para qualquer lugar da tela):
 * toque abre os atalhos; 10 s sem mexer recolhe (nítido); 3 s recolhido vira marca d'água.
 */
export function MenuFlutuante() {
  const { mesa, naoLidas, setLendo, equipe, promoter, convitesPromoter, ondeEstou } = useAcessoRapido();
  const navegar = useNavigate();
  const local = useLocation();
  const [pos, setPos] = useState<Posicao>(lerPosicao);
  const chat = useChatNaoLidas(true);
  const seloChat = chat.conversas + chat.pedidos;
  const [aberto, setAberto] = useState(false);
  const [nitido, setNitido] = useState(true);
  const [arrastando, setArrastando] = useState(false);
  const toque = useRef<{ id: number; x: number; y: number; px: number; py: number; moveu: boolean } | null>(null);
  const relogio = useRef<number>();
  const [interacao, setInteracao] = useState(0);

  // Contexto do hub: o lugar aberto na tela tem prioridade; senão, onde a pessoa está (check-in ou comanda aberta).
  const idRota = local.pathname.match(/^\/lugar\/([^/]+)/)?.[1] ?? null;
  const [lugarRota, setLugarRota] = useState<{ id: string; nome: string; logo_url: string | null } | null>(null);
  useEffect(() => {
    if (!idRota) return setLugarRota(null);
    if (ondeEstou?.id === idRota) return setLugarRota(ondeEstou);
    let vivo = true;
    supabase
      .from("estabelecimentos")
      .select("id, nome, logo_url")
      .eq("id", idRota)
      .maybeSingle()
      .then(({ data }) => vivo && setLugarRota((data as { id: string; nome: string; logo_url: string | null } | null) ?? null));
    return () => {
      vivo = false;
    };
  }, [idRota, ondeEstou]);
  const foco = lugarRota ?? ondeEstou ?? (mesa?.estabelecimento_id ? { id: mesa.estabelecimento_id, nome: mesa.lugar, logo_url: null } : null);
  const estouNele = !!foco && (foco.id === ondeEstou?.id || foco.id === mesa?.estabelecimento_id);
  const comandaAqui = !!mesa && !!foco && mesa.estabelecimento_id === foco.id;

  // Temporizadores de recolher e de esmaecer: qualquer interação reinicia.
  const mexeu = useCallback(() => {
    setNitido(true);
    setInteracao((n) => n + 1);
  }, []);
  useEffect(() => {
    window.clearTimeout(relogio.current);
    if (arrastando) return;
    if (aberto) relogio.current = window.setTimeout(() => setAberto(false), TEMPO_ABERTO);
    else if (nitido) relogio.current = window.setTimeout(() => setNitido(false), TEMPO_NITIDO);
    return () => window.clearTimeout(relogio.current);
  }, [aberto, nitido, arrastando, interacao]);

  useEffect(() => setAberto(false), [local.pathname]);
  useEffect(() => {
    const aoGirar = () => setPos((p) => prender(p));
    window.addEventListener("resize", aoGirar);
    return () => window.removeEventListener("resize", aoGirar);
  }, []);

  const aoApertar = (e: EventoPonteiro<HTMLButtonElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    toque.current = { id: e.pointerId, x: e.clientX, y: e.clientY, px: pos.x, py: pos.y, moveu: false };
    mexeu();
  };
  const aoMover = (e: EventoPonteiro<HTMLButtonElement>) => {
    const t = toque.current;
    if (!t || t.id !== e.pointerId) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (!t.moveu && Math.hypot(dx, dy) < 6) return;
    if (!t.moveu) {
      t.moveu = true;
      setArrastando(true);
      setAberto(false);
    }
    setPos(prender({ x: t.px + dx, y: t.py + dy }));
  };
  const aoSoltar = (e: EventoPonteiro<HTMLButtonElement>) => {
    const t = toque.current;
    toque.current = null;
    if (!t || t.id !== e.pointerId) return;
    if (t.moveu) {
      setArrastando(false);
      // Encosta na lateral mais próxima, na altura escolhida.
      setPos((p) => {
        const l = limites();
        const final = prender({ x: p.x + TAMANHO / 2 < window.innerWidth / 2 ? MARGEM : l.maxX, y: p.y });
        try {
          localStorage.setItem(CHAVE, JSON.stringify(final));
        } catch {
          /* sem armazenamento */
        }
        return final;
      });
    } else setAberto((a) => !a);
  };

  const ir = (para: string) => {
    setAberto(false);
    navegar(para);
  };

  const lerQr = () => {
    setAberto(false);
    setLendo(true);
  };
  const acoesLugar = foco
    ? [
        { nome: "Cardápio", icone: UtensilsCrossed, acao: () => ir(`/lugar/${foco.id}/cardapio`) },
        // Sem comanda aberta, o cardápio mostra o jeito de pedir que o lugar escolheu (QR, mesa da lista ou balcão).
        { nome: "Pedir", icone: ScanLine, acao: () => ir(comandaAqui && mesa ? `/comanda/${mesa.id}?pedir=1` : `/lugar/${foco.id}/cardapio`) },
        { nome: "Pagar", icone: CreditCard, acao: () => ir(comandaAqui && mesa ? `/comanda/${mesa.id}` : `/lugar/${foco.id}/cardapio`) },
        { nome: "Ingressos", icone: Ticket, acao: () => ir(`/lugar/${foco.id}?aba=programacao`) },
      ]
    : [];

  const atalhos = [
    ...(foco ? [] : [{ nome: "Ler QR da mesa", sub: "Pedir pelo cardápio", icone: ScanLine, selo: 0, acao: lerQr }]),
    { nome: "Chat", sub: "Conversas e rolês", icone: IconePapo, selo: seloChat, acao: () => ir("/chats") },
    { nome: "Notificações", sub: "Novidades", icone: Bell, selo: naoLidas, acao: () => ir("/notificacoes") },
    { nome: "Retiradas", sub: "QR dos pedidos", icone: QrCode, selo: mesa?.prontos ?? 0, acao: () => ir("/retirada") },
    { nome: "Carteira", sub: "Cupons e ingressos", icone: Wallet, selo: 0, acao: () => ir("/carteira") },
    ...(promoter > 0 ? [{ nome: "Promoter", sub: "Links, listas e benefícios", icone: Megaphone, selo: convitesPromoter, acao: () => ir("/promoter") }] : []),
    ...(equipe ? [{ nome: "Modo trabalho", sub: "RoVibes Job", icone: Briefcase, selo: 0, acao: () => ir("/job") }] : []),
    { nome: "Business", sub: "Meu estabelecimento", icone: Store, selo: 0, acao: () => ir("/business") },
  ];
  const total = (mesa?.prontos ?? 0) + naoLidas + convitesPromoter + seloChat;

  // O painel abre para o lado e a altura onde há espaço.
  const largura = Math.min(320, window.innerWidth - 2 * MARGEM);
  const naDireita = pos.x + TAMANHO / 2 > window.innerWidth / 2;
  const emCima = pos.y > window.innerHeight / 2;
  const painel: CSSProperties = {
    width: largura,
    left: naDireita ? Math.max(MARGEM, pos.x + TAMANHO - largura) : pos.x,
    ...(emCima ? { bottom: window.innerHeight - pos.y + 10 } : { top: pos.y + TAMANHO + 10 }),
  };

  return (
    <>
      {aberto && <div className="fixed inset-0 z-[45] bg-black/40" onClick={() => setAberto(false)} onPointerDown={mexeu} />}
      {aberto && (
        <div
          style={painel}
          className="surgir fixed z-[47] max-h-[70vh] overflow-y-auto rounded-[22px] border border-borda bg-superficie/95 p-3 shadow-2xl backdrop-blur"
          role="dialog"
          aria-label="Acesso rápido"
          onPointerDown={mexeu}
          onScroll={mexeu}
        >
          {foco && (
            <div className="mb-3 rounded-2xl border border-borda bg-fundo/70 p-3">
              <button onClick={() => ir(`/lugar/${foco.id}`)} className="flex w-full items-center gap-2.5 text-left">
                {foco.logo_url ? (
                  <img src={foco.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-elevado text-suave">
                    <Store className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold leading-tight">{foco.nome}</span>
                  <span className={clsx("block text-[11px]", estouNele ? "font-medium text-ok" : "text-suave")}>
                    {estouNele ? (comandaAqui ? `Você está aqui · ${mesa?.rotulo}` : "Você está aqui") : "Ações deste lugar"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-suave" />
              </button>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {acoesLugar.map((a) => (
                  <button key={a.nome} onClick={a.acao} className="flex flex-col items-center gap-1 rounded-xl py-2 text-[12px] font-medium hover:bg-elevado">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-elevado text-destaque">
                      <a.icone className="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    {a.nome}
                  </button>
                ))}
              </div>
              <button onClick={() => ir(`/lugar/${foco.id}/role`)} className="mt-2 flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm hover:bg-elevado">
                <PartyPopper className="h-4 w-4 text-magenta" />
                <span className="flex-1">Marcar rolê aqui</span>
                <ChevronRight className="h-4 w-4 text-suave" />
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {atalhos.map((a) => (
              <button key={a.nome} onClick={a.acao} className="relative flex flex-col items-start gap-1.5 rounded-2xl border border-borda bg-fundo/70 p-3 text-left hover:bg-elevado">
                <a.icone className="h-6 w-6 text-destaque" strokeWidth={1.7} />
                <span>
                  <span className="block text-[14px] font-medium leading-tight">{a.nome}</span>
                  <span className="block text-[11px] text-suave">{a.sub}</span>
                </span>
                <Selo n={a.selo} />
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-suave">Arraste o botão RoV para mudar de lugar</p>
        </div>
      )}
      <button
        style={{ left: pos.x, top: pos.y, width: TAMANHO, height: TAMANHO, touchAction: "none" }}
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        className={clsx(
          "fixed z-[48] flex select-none items-center justify-center rounded-full border shadow-lg backdrop-blur transition-[opacity,transform,background-color] duration-500",
          aberto ? "border-[#8B5CF6]/70 bg-superficie" : estouNele ? "border-ok/70 bg-superficie/80" : "border-borda bg-superficie/80",
          arrastando ? "scale-110 opacity-100 duration-0" : nitido || aberto ? "opacity-100" : "opacity-30",
        )}
        aria-label={aberto ? "Fechar acesso rápido" : "Abrir acesso rápido (arraste para mudar de lugar)"}
        aria-expanded={aberto}
      >
        <LogoRov className="text-[17px]" />
        {total > 0 && !aberto && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-fundo bg-magenta" />}
      </button>
    </>
  );
}

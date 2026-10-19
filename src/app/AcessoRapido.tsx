import { CSSProperties, PointerEvent as EventoPonteiro, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Bell, Briefcase, Megaphone, QrCode, ScanLine, Store, Wallet } from "lucide-react";
import { useAcessoRapido } from "./estadoAcesso";

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
  minY: 64,
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
  const { mesa, naoLidas, setLendo, equipe, promoter, convitesPromoter } = useAcessoRapido();
  const navegar = useNavigate();
  const local = useLocation();
  const [pos, setPos] = useState<Posicao>(lerPosicao);
  const [aberto, setAberto] = useState(false);
  const [nitido, setNitido] = useState(true);
  const [arrastando, setArrastando] = useState(false);
  const toque = useRef<{ id: number; x: number; y: number; px: number; py: number; moveu: boolean } | null>(null);
  const relogio = useRef<number>();
  const [interacao, setInteracao] = useState(0);

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

  const atalhos = [
    { nome: "Ler QR da mesa", sub: "Pedir pelo cardápio", icone: ScanLine, selo: 0, acao: () => (setAberto(false), setLendo(true)) },
    { nome: "Notificações", sub: "Novidades", icone: Bell, selo: naoLidas, acao: () => ir("/notificacoes") },
    { nome: "Retiradas", sub: "QR dos pedidos", icone: QrCode, selo: mesa?.prontos ?? 0, acao: () => ir("/retirada") },
    { nome: "Carteira", sub: "Cupons e ingressos", icone: Wallet, selo: 0, acao: () => ir("/carteira") },
    ...(promoter > 0 ? [{ nome: "Promoter", sub: "Links, listas e benefícios", icone: Megaphone, selo: convitesPromoter, acao: () => ir("/promoter") }] : []),
    ...(equipe ? [{ nome: "Modo trabalho", sub: "RoVibes Job", icone: Briefcase, selo: 0, acao: () => ir("/job") }] : []),
    { nome: "Business", sub: "Meu estabelecimento", icone: Store, selo: 0, acao: () => ir("/business") },
  ];
  const total = (mesa?.prontos ?? 0) + naoLidas + convitesPromoter;

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
          aberto ? "border-[#8B5CF6]/70 bg-superficie" : "border-borda bg-superficie/80",
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

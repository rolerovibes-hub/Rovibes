import { PointerEvent as EventoPonteiro, ReactNode, useEffect, useRef, useState } from "react";
import { IconePapo } from "@/components/IconesRoVibes";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { MapPin, Volume2, VolumeX, X } from "lucide-react";
import { Avatar } from "./Avatar";
import { BotaoBrindar } from "./Brindar";
import { QuemBrindou } from "./QuemBrindou";

export interface DadosVisor {
  autor: { nome: string; foto: string | null; link?: string };
  local?: { id: string; nome: string } | null;
  foto: string | null;
  video?: string | null;
  texto?: string | null;
  criado_em: string;
  curtidas: number;
  curti: boolean;
  comentarios: number;
}

/**
 * Publicação em tela cheia. Um toque na tela esconde tudo e deixa só o nome e o local marcado;
 * outro toque traz as informações de volta. Arrastar para baixo fecha e volta para onde estava.
 */
export function VisorPublicacao({
  dados,
  fechar,
  aoCurtir,
  aoComentar,
  acoes,
  referencia,
  extra,
  children,
}: {
  dados: DadosVisor;
  fechar: () => void;
  aoCurtir: () => void;
  aoComentar: () => void;
  /** Botões extras no topo (apagar, denunciar...). */
  acoes?: ReactNode;
  /** Conteúdo extra no rodapé (Marcar rolê, evento...). */
  extra?: ReactNode;
  /** Publicação (para listar quem brindou). */
  referencia?: { tipo: "pessoa" | "lugar"; id: string };
  /** Folhas abertas por cima (comentários, denúncia). */
  children?: ReactNode;
}) {
  const [limpo, setLimpo] = useState(false);
  const [mudo, setMudo] = useState(true);
  const [verBrindes, setVerBrindes] = useState(false);

  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener("keydown", tecla);
    };
  }, [fechar]);

  // Arrastar para baixo: a foto acompanha o dedo; passou do ponto, fecha.
  const [puxado, setPuxado] = useState(0);
  const puxadoRef = useRef(0);
  const arrasto = useRef<{ x: number; y: number; id: number; ativo: boolean } | null>(null);
  const arrastou = useRef(false);
  const mudarPuxado = (v: number) => {
    puxadoRef.current = v;
    setPuxado(v);
  };
  const descer = (e: EventoPonteiro<HTMLDivElement>) => {
    if ((e.pointerType === "mouse" && e.button !== 0) || (e.target as Element).closest("[data-visor-folhas],[data-rolagem]")) return;
    arrasto.current = { x: e.clientX, y: e.clientY, id: e.pointerId, ativo: false };
    arrastou.current = false;
  };
  const mover = (e: EventoPonteiro<HTMLDivElement>) => {
    const s = arrasto.current;
    if (!s || s.id !== e.pointerId) return;
    const dy = e.clientY - s.y;
    const dx = e.clientX - s.x;
    if (!s.ativo) {
      if (dy > 12 && dy > Math.abs(dx) * 1.3) {
        s.ativo = true;
        arrastou.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* sem captura */
        }
      } else if (Math.abs(dx) > 12 || dy < -12) arrasto.current = null;
      return;
    }
    mudarPuxado(Math.max(0, dy - 12));
  };
  const soltar = () => {
    const s = arrasto.current;
    arrasto.current = null;
    if (!s?.ativo) return;
    if (puxadoRef.current > 110) fechar();
    else mudarPuxado(0);
  };
  const p = Math.min(1, puxado / 300);

  const alternar = () => setLimpo((l) => !l);
  const parar = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const some = clsx("transition-opacity duration-200", limpo && "pointer-events-none opacity-0");
  const data = new Date(dados.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  const nome = dados.autor.link ? (
    <Link to={dados.autor.link} onClick={parar} className="block truncate text-[15px] font-semibold drop-shadow">
      {dados.autor.nome}
    </Link>
  ) : (
    <span className="block truncate text-[15px] font-semibold drop-shadow">{dados.autor.nome}</span>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[70] select-none text-white"
      style={{ backgroundColor: `rgba(0,0,0,${1 - p * 0.75})` }}
      role="dialog"
      aria-modal="true"
      aria-label="Publicação"
      onClick={alternar}
      onPointerDown={descer}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onClickCapture={(e) => {
        if (arrastou.current) {
          e.preventDefault();
          e.stopPropagation();
          arrastou.current = false;
        }
      }}
    >
      {/* Mídia ocupando a tela toda */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          touchAction: "none",
          transform: puxado ? `translateY(${puxado}px) scale(${1 - p * 0.25})` : undefined,
          transition: puxado ? "none" : "transform 220ms cubic-bezier(.2,.8,.2,1)",
          borderRadius: puxado ? 18 : 0,
          overflow: "hidden",
        }}
      >
        {dados.video ? (
          <video src={dados.video} poster={dados.foto ?? undefined} autoPlay loop playsInline muted={mudo} className="h-full w-full object-contain" />
        ) : (
          dados.foto && <img src={dados.foto} alt={dados.texto ?? ""} className="h-full w-full object-contain" draggable={false} />
        )}
      </div>

      {/* Topo: nome e local ficam sempre; o resto some no toque */}
      <div
        className={clsx("absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-3 pb-10 pt-[max(12px,env(safe-area-inset-top))] transition-opacity", puxado > 0 && "opacity-0")}
        style={{ touchAction: "none" }}
      >
        <div className="flex items-center gap-2.5">
          <span className={some} onClick={parar}>
            <Avatar nome={dados.autor.nome} foto={dados.autor.foto} tamanho="sm" ampliar />
          </span>
          <span className="min-w-0 flex-1">
            {nome}
            {dados.local && (
              <Link to={`/lugar/${dados.local.id}`} onClick={parar} className="flex items-center gap-1 truncate text-[12px] text-white/85 drop-shadow">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{dados.local.nome}</span>
              </Link>
            )}
          </span>
          <span className={clsx("flex items-center", some)} onClick={parar}>
            {acoes}
            <button onClick={fechar} className="rounded-full p-2 hover:bg-white/10" aria-label="Fechar">
              <X className="h-6 w-6" />
            </button>
          </span>
        </div>
      </div>

      {/* Rodapé: texto, brindes, comentários */}
      <div
        className={clsx("absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-12", some, puxado > 0 && "opacity-0")}
        style={{ touchAction: "none" }}
        onClick={parar}
      >
        {dados.texto && <p data-rolagem className="mb-2 max-h-[28vh] overflow-y-auto whitespace-pre-line text-[15px] leading-relaxed">{dados.texto}</p>}
        <div className="flex items-center gap-3">
          <BotaoBrindar
            ativo={dados.curti}
            total={dados.curtidas}
            aoBrindar={aoCurtir}
            tamanho="lg"
            sobreFoto
            className="-ml-1"
            aoVerQuem={referencia ? () => setVerBrindes(true) : undefined}
          />
          <button onClick={aoComentar} className="inline-flex items-center gap-1.5 py-1 text-sm" aria-label="Comentários">
            <IconePapo className="h-6 w-6" />
            <span className="font-medium">{dados.comentarios}</span>
          </button>
          {dados.video && (
            <button onClick={() => setMudo((m) => !m)} className="ml-auto rounded-full bg-white/15 p-2" aria-label={mudo ? "Ligar o som" : "Tirar o som"}>
              {mudo ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}
        </div>
        <p className="mt-1 text-[12px] text-white/70">{data}</p>
        {extra && <div className="mt-2.5">{extra}</div>}
      </div>

      <div data-visor-folhas onClick={parar}>
        {children}
        {verBrindes && referencia && <QuemBrindou tipo={referencia.tipo} id={referencia.id} fechar={() => setVerBrindes(false)} />}
      </div>
    </div>,
    document.body,
  );
}

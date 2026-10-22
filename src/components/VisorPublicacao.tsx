import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { MapPin, MessageCircle, Volume2, VolumeX, X } from "lucide-react";
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
 * outro toque traz as informações de volta.
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
    <div className="fixed inset-0 z-[70] select-none bg-black text-white" role="dialog" aria-modal="true" aria-label="Publicação" onClick={alternar}>
      {/* Mídia ocupando a tela toda */}
      <div className="absolute inset-0 flex items-center justify-center">
        {dados.video ? (
          <video src={dados.video} poster={dados.foto ?? undefined} autoPlay loop playsInline muted={mudo} className="h-full w-full object-contain" />
        ) : (
          dados.foto && <img src={dados.foto} alt={dados.texto ?? ""} className="h-full w-full object-contain" draggable={false} />
        )}
      </div>

      {/* Topo: nome e local ficam sempre; o resto some no toque */}
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-3 pb-10 pt-[max(12px,env(safe-area-inset-top))]">
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
        className={clsx("absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-12", some)}
        onClick={parar}
      >
        {dados.texto && <p className="mb-2 max-h-[28vh] overflow-y-auto whitespace-pre-line text-[15px] leading-relaxed">{dados.texto}</p>}
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
            <MessageCircle className="h-6 w-6" />
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

      <div onClick={parar}>
        {children}
        {verBrindes && referencia && <QuemBrindou tipo={referencia.tipo} id={referencia.id} fechar={() => setVerBrindes(false)} />}
      </div>
    </div>,
    document.body,
  );
}

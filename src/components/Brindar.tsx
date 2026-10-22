import { useEffect, useId, useState } from "react";
import { gravar, ler } from "@/lib/armazenamento";
import clsx from "clsx";

// Som do brinde: o "tim" do arquivo cai em ~0,4 s, junto com as taças batendo na animação.
let somBrinde: HTMLAudioElement | null = null;
const prepararSom = () => {
  if (somBrinde || typeof Audio === "undefined") return;
  somBrinde = new Audio("/sons/brinde.mp3");
  somBrinde.preload = "auto";
  somBrinde.volume = 0.7;
};
export const somBrindeLigado = () => ler<boolean>("som_brinde", true);
export const ligarSomBrinde = (v: boolean) => gravar("som_brinde", v);
function tocarBrinde() {
  if (!somBrindeLigado()) return;
  prepararSom();
  if (!somBrinde) return;
  try {
    somBrinde.currentTime = 0;
    void somBrinde.play().catch(() => undefined);
  } catch {
    /* sem som */
  }
}

const TACA = "M4.5 6.2h8.2M19 6.2l-7 7.6-7.5-7.6M12 13.8v6.4M8.6 20.6c2.2-.5 4.6-.5 6.8 0";
const LIQUIDO = "M7.6 8.6h8.8L12 13.4z";
const ESTRELA = "M18.5 1.6l.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.5 2.1-.3z";

function Degrade({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#9333EA" />
        <stop offset=".55" stopColor="#EC4899" />
        <stop offset="1" stopColor="#F97316" />
      </linearGradient>
    </defs>
  );
}

/** Taça do "Brindar" (no lugar do coração de curtir): vazia = ainda não brindou; cheia com estrela = brindou. */
export function IconeTaca({ cheia = false, className, sobreFoto = false }: { cheia?: boolean; className?: string; sobreFoto?: boolean }) {
  const id = useId().replace(/:/g, "");
  const cor = cheia ? `url(#${id})` : "currentColor";
  return (
    <svg viewBox="0 0 24 24" className={clsx("taca-icone overflow-visible", !cheia && (sobreFoto ? "text-white" : "text-suave"), className)} aria-hidden="true">
      <Degrade id={id} />
      {cheia && <path className="taca-liquido" d={LIQUIDO} fill={cor} />}
      <path d={TACA} fill="none" stroke={cor} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      {cheia && <path className="taca-estrela" d={ESTRELA} fill={cor} />}
    </svg>
  );
}

/** Duas taças batendo ("tim-tim") — aparece por 1 segundo ao brindar. */
function DuasTacas() {
  const id = useId().replace(/:/g, "");
  const taca = (
    <>
      <path d={LIQUIDO} fill={`url(#${id})`} />
      <path d={TACA} fill="none" stroke={`url(#${id})`} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
  return (
    <svg viewBox="0 0 44 26" className="brinde-duas" aria-hidden="true">
      <Degrade id={id} />
      <g className="brinde-esq">
        <g transform="translate(2 2)">{taca}</g>
      </g>
      <g className="brinde-dir">
        <g transform="translate(42 2) scale(-1 1)">{taca}</g>
      </g>
      <path className="brinde-tim" d="M22 1v3M17.5 2.5l1.6 2.4M26.5 2.5l-1.6 2.4" fill="none" stroke="#F59E0B" strokeWidth={1.6} strokeLinecap="round" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} className={`brinde-faisca brinde-faisca-${i}`} cx="22" cy="9" r="1.3" />
      ))}
    </svg>
  );
}

/**
 * Botão de brindar (curtir). Ao brindar, duas taças fazem "tim-tim" e volta uma taça cheia.
 * `tamanho`: md no feed, lg na tela cheia, sm nos comentários.
 */
export function BotaoBrindar({
  ativo,
  total,
  aoBrindar,
  tamanho = "md",
  sobreFoto = false,
  rotulo = "publicação",
  className,
  aoVerQuem,
}: {
  ativo: boolean;
  total?: number;
  aoBrindar: () => void;
  tamanho?: "sm" | "md" | "lg";
  sobreFoto?: boolean;
  rotulo?: string;
  className?: string;
  /** Toque no número abre a lista de quem brindou. */
  aoVerQuem?: () => void;
}) {
  const [animacao, setAnimacao] = useState(0);
  useEffect(prepararSom, []);
  const medida = tamanho === "sm" ? "h-4 w-4" : tamanho === "lg" ? "h-6 w-6" : "h-[22px] w-[22px]";

  const botao = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!ativo) {
          setAnimacao((n) => n + 1);
          tocarBrinde();
          try {
            navigator.vibrate?.(12);
          } catch {
            /* sem vibração */
          }
        }
        aoBrindar();
      }}
      aria-pressed={ativo}
      aria-label={ativo ? `Tirar brinde da ${rotulo}` : `Brindar ${rotulo}`}
      className={clsx("inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm", className)}
    >
      <span key={animacao} className={clsx("relative inline-flex", animacao > 0 && ativo && "brindando")}>
        <IconeTaca cheia={ativo} sobreFoto={sobreFoto} className={medida} />
        {animacao > 0 && ativo && <DuasTacas />}
      </span>
      {total !== undefined && !(aoVerQuem && total > 0) && (
        <span className={clsx(ativo ? "font-medium" : sobreFoto ? "" : "text-suave", sobreFoto && "font-medium")}>{total}</span>
      )}
    </button>
  );
  if (!aoVerQuem || !total) return botao;
  return (
    <span className="inline-flex items-center">
      {botao}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          aoVerQuem();
        }}
        className={clsx("-ml-1 rounded-lg px-1 py-1 text-sm underline-offset-2 hover:underline", ativo || sobreFoto ? "font-medium" : "text-suave")}
        aria-label={`Ver quem brindou (${total})`}
      >
        {total}
      </button>
    </span>
  );
}

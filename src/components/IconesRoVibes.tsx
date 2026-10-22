import { useId } from "react";
import clsx from "clsx";

/**
 * Ícones próprios do RoVibes, na família da taça do Brindar:
 * traço fino, cor do texto quando parados e degradê roxo → rosa → laranja quando ativos.
 */
type Props = { className?: string; ativo?: boolean; strokeWidth?: number };

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

/** Papo com faísca: balão de conversa cuja pontinha é a estrela do RoVibes (comentários e chat). */
export function IconePapo({ className, ativo = false, strokeWidth = 1.9 }: Props) {
  const id = useId().replace(/:/g, "");
  const cor = ativo ? `url(#${id})` : "currentColor";
  return (
    <svg viewBox="0 0 24 24" className={clsx("icone-papo overflow-visible", className)} aria-hidden="true">
      {ativo && <Degrade id={id} />}
      <path
        d="M8.6 16.4h7.9a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.5 4h-9A3.6 3.6 0 0 0 3.9 7.6v4.6M8.3 8.9h7.4M8.3 12h4.6"
        fill="none"
        stroke={cor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path className="icone-papo-faisca" d="M5.2 14.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill={cor} />
    </svg>
  );
}

/** Convite: um ingresso com uma seta saindo — mandar no RoVibes é chamar alguém para o rolê (compartilhar). */
export function IconeConvite({ className, ativo = false, strokeWidth = 1.9 }: Props) {
  const id = useId().replace(/:/g, "");
  const cor = ativo ? `url(#${id})` : "currentColor";
  const traco = { fill: "none", stroke: cor, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className={clsx("icone-convite overflow-visible", className)} aria-hidden="true">
      {ativo && <Degrade id={id} />}
      <path d="M3.4 9.2V7.4c0-.6.5-1.1 1.1-1.1h8.3M17.4 13.6v4.9c0 .6-.5 1.1-1.1 1.1H4.5c-.6 0-1.1-.5-1.1-1.1v-1.8a2.3 2.3 0 0 0 0-4.6v-1M9.2 9.5v1.2M9.2 13.2v1.2M9.2 16.9v.9" {...traco} />
      <path className="icone-convite-seta" d="M14.6 9.4l6-6M15.6 3.4h5v5" {...traco} />
    </svg>
  );
}

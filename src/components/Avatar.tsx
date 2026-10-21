import clsx from "clsx";
import { Ampliavel } from "./FotoAmpliada";

/** Foto de perfil. Com `ampliar`, o toque mostra a foto grande (para reconhecer a pessoa). */
export function Avatar({
  nome,
  tamanho = "md",
  foto,
  ampliar = false,
}: {
  nome: string;
  tamanho?: "sm" | "md" | "lg" | "xl" | "story";
  foto?: string | null;
  ampliar?: boolean;
}) {
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const medida = clsx(
    tamanho === "sm" && "h-8 w-8 text-xs",
    tamanho === "md" && "h-10 w-10 text-sm",
    tamanho === "lg" && "h-16 w-16 text-lg",
    tamanho === "xl" && "h-24 w-24 text-2xl",
    tamanho === "story" && "h-[58px] w-[58px] text-lg",
  );
  if (foto) {
    const img = <img src={foto} alt="" className={clsx("shrink-0 rounded-full object-cover", medida)} />;
    return ampliar ? (
      <Ampliavel src={foto} nome={nome}>
        {img}
      </Ampliavel>
    ) : (
      img
    );
  }
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-destaque-suave font-semibold text-destaque",
        medida,
      )}
    >
      {iniciais}
    </span>
  );
}

import clsx from "clsx";

export function Avatar({ nome, tamanho = "md" }: { nome: string; tamanho?: "sm" | "md" | "lg" }) {
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-destaque-suave font-semibold text-destaque",
        tamanho === "sm" && "h-8 w-8 text-xs",
        tamanho === "md" && "h-10 w-10 text-sm",
        tamanho === "lg" && "h-16 w-16 text-lg",
      )}
    >
      {iniciais}
    </span>
  );
}

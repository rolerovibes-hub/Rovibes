import { Simbolo } from "./Marca";

export function Carregando() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Carregando">
      <Simbolo className="h-10 animate-pulse" />
    </div>
  );
}

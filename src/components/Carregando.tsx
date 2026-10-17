import { Simbolo } from "./Marca";

export function Carregando() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Carregando">
      <Simbolo className="h-9 w-9 animate-pulse" />
    </div>
  );
}

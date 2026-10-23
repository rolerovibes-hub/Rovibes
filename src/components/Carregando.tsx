import clsx from "clsx";

const CAMADAS = 16;

/** Pin 3D da marca com o degradê correndo (estilos em /public/carregando.css). */
function Pin3D({ camadas = CAMADAS }: { camadas?: number }) {
  return (
    <div className="rv-palco" aria-hidden="true">
      <div className="rv-halo">
        <div className="rv-aura" />
      </div>
      <div className="rv-objeto">
        {Array.from({ length: camadas }, (_, i) => {
          const n = ((i + 1) * CAMADAS) / camadas;
          return (
            <div
              key={i}
              className="rv-camada"
              style={{ transform: `translateZ(calc(var(--w) * ${(-0.0052 * n).toFixed(4)}))`, filter: `brightness(${(1 - n * 0.035).toFixed(2)})` }}
            />
          );
        })}
        <div className="rv-pin">
          <div className="rv-fluxo" />
          <div className="rv-giro" />
          <div className="rv-luz" />
          <div className="rv-brilho" />
        </div>
      </div>
    </div>
  );
}

/**
 * Carregando.
 * - Padrão: tela temporária translúcida (vidro fosco) por cima do app, com o pin 3D grande.
 * - `compacto`: só o pin pequeno, para carregar uma parte da tela (lista, comentários...).
 */
export function Carregando({ compacto = false, texto = "Carregando a vibe" }: { compacto?: boolean; texto?: string }) {
  if (compacto) {
    return (
      <div className="rv-carregando-compacto" role="status" aria-label="Carregando">
        <Pin3D camadas={8} />
        <div className="rv-sombra" />
      </div>
    );
  }
  return (
    <>
      {/* Mantém a altura da página enquanto carrega (a tela de vidro fica por cima). */}
      <div className="min-h-[60vh]" />
      <div className={clsx("rv-carregando")} role="status" aria-label="Carregando">
        <Pin3D />
        <div className="rv-sombra" />
        <p className="rv-texto">
          {texto}
          <i />
          <i />
          <i />
        </p>
      </div>
    </>
  );
}

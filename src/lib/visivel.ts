/** Atualização automática só com a tela à vista (economiza internet e banco). Não usar em telas de operação (caixa, cozinha). */
export const seVisivel =
  (f: () => unknown) =>
  () => {
    if (typeof document === "undefined" || document.visibilityState !== "hidden") void f();
  };

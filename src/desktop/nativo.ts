/**
 * Ponte com o app de computador (Tauri). Fora dele (navegador), cada função tem um comportamento simples
 * ou avisa que só funciona no app instalado.
 */
type Invocar = (comando: string, args?: Record<string, unknown>) => Promise<unknown>;

const invocar = (): Invocar | undefined => (window as unknown as { __TAURI__?: { core?: { invoke?: Invocar } } }).__TAURI__?.core?.invoke;

/** Está rodando dentro do app instalado no computador. */
export const noApp = () => !!invocar();

async function chamar<T>(comando: string, args?: Record<string, unknown>): Promise<T> {
  const i = invocar();
  if (!i) throw new Error("Disponível só no app instalado no computador.");
  try {
    return (await i(comando, args)) as T;
  } catch (e) {
    throw new Error(typeof e === "string" ? e : e instanceof Error ? e.message : "Não foi possível concluir.");
  }
}

/** Aviso do Windows (aparece mesmo com o app minimizado). */
export async function avisar(titulo: string, texto: string) {
  if (noApp()) return void chamar("avisar", { titulo, texto }).catch(() => undefined);
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification(titulo, { body: texto });
  } catch {
    /* sem aviso */
  }
}

export const listarImpressoras = () => (noApp() ? chamar<string[]>("listar_impressoras") : Promise.resolve<string[]>([]));

/** Envia os bytes direto para a impressora (ESC/POS), sem a janela de imprimir. */
export const imprimirBruto = (impressora: string, dados: Uint8Array) => chamar<void>("imprimir", { impressora, dados: Array.from(dados) });

/** Texto que aparece ao passar o mouse no ícone ao lado do relógio. */
export const dicaBandeja = (texto: string) => (noApp() ? chamar<void>("dica_bandeja", { texto }).catch(() => undefined) : Promise.resolve());

export const tituloJanela = (texto: string) => {
  document.title = texto;
  if (noApp()) void chamar("titulo_janela", { texto }).catch(() => undefined);
};

export async function telaCheia(ligar: boolean) {
  if (noApp()) return chamar<void>("tela_cheia", { ligar });
  if (ligar) await document.documentElement.requestFullscreen?.().catch(() => undefined);
  else if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
}

export const iniciarComWindows = (ligar: boolean) => chamar<boolean>("iniciar_com_windows", { ligar });
export const iniciaComWindows = () => (noApp() ? chamar<boolean>("inicia_com_windows") : Promise.resolve(false));

/** Abre um endereço no navegador padrão. */
export function abrirNoNavegador(url: string) {
  if (noApp()) return void chamar("abrir_link", { url }).catch(() => undefined);
  window.open(url, "_blank", "noopener");
}

/** Abre uma parte do app numa janela separada (ex.: segundo monitor). */
export function novaJanela(rotulo: string, titulo: string, caminho: string) {
  if (noApp()) return chamar<void>("nova_janela", { rotulo, titulo, url: `desktop-business.html#${caminho}` });
  window.open(`#${caminho}`, "_blank");
  return Promise.resolve();
}

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

interface PluginApp {
  addListener: (evento: "backButton", cb: () => void) => Promise<{ remove: () => void }> | { remove: () => void };
  exitApp: () => Promise<void>;
}

/** Plugin "App" do Capacitor (só existe dentro do APK). */
function pluginApp(): PluginApp | null {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown>; registerPlugin?: (n: string) => unknown } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return ((cap.Plugins?.App as PluginApp | undefined) ?? (cap.registerPlugin?.("App") as PluginApp | undefined)) || null;
}

// Telas iniciais de cada área: dali o voltar pergunta se quer sair.
const INICIOS = ["/", "/business", "/job", "/entrar"];

/**
 * Botão voltar do aparelho (Android):
 * 1. fecha a janela/folha aberta; 2. volta uma tela dentro do RoVibes;
 * 3. na tela inicial, pergunta se quer sair do app.
 */
export function BotaoVoltarAparelho() {
  const navegar = useNavigate();
  const local = useLocation();
  const [perguntar, setPerguntar] = useState(false);
  const estado = useRef({ perguntar, caminho: local.pathname });
  estado.current = { perguntar, caminho: local.pathname };

  useEffect(() => {
    const app = pluginApp();
    if (!app) return;
    let remover: (() => void) | null = null;

    const aoVoltar = () => {
      if (estado.current.perguntar) return setPerguntar(false);

      // 1. Janela aberta (folhas, menus, visualizador de stories...): fecha a de cima.
      const janelas = document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]');
      const topo = janelas[janelas.length - 1];
      if (topo) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        const fechar = topo.querySelector<HTMLElement>('[aria-label="Fechar"], [aria-label="Voltar"]');
        if (document.body.contains(topo)) (fechar ?? topo).click();
        return;
      }

      // 2. Volta uma tela, se houver para onde voltar dentro do app.
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx > 0) return navegar(-1);

      // Abriu direto numa tela interna (link, notificação): vai para o início da área.
      const caminho = estado.current.caminho;
      if (!INICIOS.includes(caminho)) {
        const inicio = caminho.startsWith("/business") ? "/business" : caminho.startsWith("/job") ? "/job" : "/";
        return navegar(inicio, { replace: true });
      }

      // 3. Está no início: pergunta se quer sair.
      setPerguntar(true);
    };

    const r = app.addListener("backButton", aoVoltar);
    Promise.resolve(r).then((h) => (remover = () => h.remove()));
    return () => remover?.();
  }, [navegar]);

  if (!perguntar) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setPerguntar(false)}>
      <div className="w-full max-w-sm rounded-t-2xl bg-superficie p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-center sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destaque-suave text-destaque">
          <LogOut className="h-5 w-5" />
        </span>
        <p className="mt-3 text-lg font-semibold">Sair do RoVibes?</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="botao h-11" onClick={() => setPerguntar(false)}>
            Ficar
          </button>
          <button className="botao-principal h-11" onClick={() => void pluginApp()?.exitApp()}>
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}

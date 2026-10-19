import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Smartphone, X } from "lucide-react";

interface PluginApp {
  addListener: (evento: "appUrlOpen", cb: (d: { url: string }) => void) => Promise<{ remove: () => void }> | { remove: () => void };
  getLaunchUrl?: () => Promise<{ url?: string } | undefined>;
}

const capacitor = () =>
  (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown>; registerPlugin?: (n: string) => unknown } }).Capacitor;
const noApp = () => !!capacitor()?.isNativePlatform?.();

/** Converte o link recebido (https://rovibes.vercel.app/... ou rovibes://...) no caminho interno. */
function caminhoDoLink(url: string): string | null {
  try {
    if (url.startsWith("rovibes://")) {
      const resto = url.slice("rovibes://".length);
      return "/" + resto.replace(/^\/+/, "");
    }
    const u = new URL(url);
    if (!/rovibes/.test(u.hostname) && u.hostname !== "localhost") return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

const PAGINAS_COMPARTILHAVEIS = /^\/(evento|lista|lugar|p)\//;

/**
 * Links de fora (WhatsApp, Instagram...):
 * - no app (Android), abre direto a tela do link, inclusive com o app fechado;
 * - no navegador do celular, oferece "Abrir no app".
 * Sem login, o app pede para entrar e depois volta para a mesma tela.
 */
export function LinksDoApp() {
  const navegar = useNavigate();
  const local = useLocation();
  const [banner, setBanner] = useState(false);

  // Dentro do app: link que abriu o app (frio) e links recebidos com ele aberto.
  useEffect(() => {
    if (!noApp()) return;
    const cap = capacitor();
    const app = ((cap?.Plugins?.App as PluginApp | undefined) ?? (cap?.registerPlugin?.("App") as PluginApp | undefined)) || null;
    if (!app) return;
    const ir = (url?: string) => {
      const c = url ? caminhoDoLink(url) : null;
      if (c && c !== "/") navegar(c);
    };
    void app.getLaunchUrl?.().then((r) => ir(r?.url)).catch(() => undefined);
    let remover: (() => void) | null = null;
    const r = app.addListener("appUrlOpen", (d) => ir(d.url));
    if (r && "then" in r) void r.then((x) => (remover = x.remove));
    else remover = r.remove;
    return () => remover?.();
  }, [navegar]);

  // No navegador do celular Android: oferecer abrir no app.
  useEffect(() => {
    if (noApp() || !/Android/i.test(navigator.userAgent)) return;
    const params = new URLSearchParams(local.search);
    if (params.get("web") === "1") return;
    let dispensado = false;
    try {
      dispensado = sessionStorage.getItem("rovibes:banner-app") === "nao";
    } catch {
      /* sem armazenamento */
    }
    setBanner(!dispensado && PAGINAS_COMPARTILHAVEIS.test(local.pathname));
  }, [local.pathname, local.search]);

  if (!banner) return null;

  const abrir = () => {
    const caminho = local.pathname + local.search;
    const volta = `${window.location.origin}${caminho}${local.search ? "&" : "?"}web=1`;
    window.location.href = `intent://${caminho.replace(/^\//, "")}#Intent;scheme=rovibes;package=br.com.rovibes.app;S.browser_fallback_url=${encodeURIComponent(volta)};end`;
  };
  const fechar = () => {
    setBanner(false);
    try {
      sessionStorage.setItem("rovibes:banner-app", "nao");
    } catch {
      /* sem armazenamento */
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[75] mx-auto max-w-xl p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="folha flex items-center gap-3 rounded-2xl border border-borda bg-superficie p-3 shadow-xl">
        <img src="/favicon.png" alt="" className="h-10 w-10 rounded-xl" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Abrir no app RoVibes</span>
          <span className="block text-[12px] text-suave">Vai direto para esta tela.</span>
        </span>
        <button onClick={abrir} className="botao-principal h-9 shrink-0 px-3 text-[13px]">
          <Smartphone className="h-4 w-4" />
          Abrir
        </button>
        <button onClick={fechar} className="shrink-0 rounded-full p-1.5 text-suave hover:bg-elevado" aria-label="Continuar no navegador">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

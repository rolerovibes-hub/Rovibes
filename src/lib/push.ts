import { supabase } from "./supabase";
import { gravar, ler } from "./armazenamento";

/** Notificações no celular: Android (app RoVibes, Firebase) ou Web Push (navegador e iPhone na Tela de Início). */

interface PluginPush {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  createChannel?: (c: { id: string; name: string; importance: number; description?: string }) => Promise<void>;
  addListener: (evento: string, cb: (dados: never) => void) => Promise<{ remove: () => void }> | { remove: () => void };
}

type Cap = { isNativePlatform?: () => boolean; isPluginAvailable?: (n: string) => boolean; Plugins?: Record<string, unknown>; registerPlugin?: (n: string) => unknown };
const cap = () => (window as unknown as { Capacitor?: Cap }).Capacitor;

/** Plugin de push do app Android (só existe se o APK foi gerado com o Firebase configurado). */
function pluginAndroid(): PluginPush | null {
  const c = cap();
  if (!c?.isNativePlatform?.()) return null;
  if (c.isPluginAvailable && !c.isPluginAvailable("PushNotifications")) return null;
  return ((c.Plugins?.PushNotifications as PluginPush | undefined) ?? (c.registerPlugin?.("PushNotifications") as PluginPush | undefined)) || null;
}

const ehApp = () => !!cap()?.isNativePlatform?.();
const ehIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const naTelaDeInicio = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export type EstadoPush = "ativo" | "pendente" | "negado" | "instalar" | "app_antigo" | "indisponivel";

/** Como estão as notificações neste aparelho. */
export async function estadoPush(): Promise<EstadoPush> {
  if (ehApp()) {
    const p = pluginAndroid();
    if (!p) return "app_antigo";
    const { receive } = await p.checkPermissions();
    if (receive === "granted") return ler<boolean>("push_registrado", false) ? "ativo" : "pendente";
    return receive === "denied" ? "negado" : "pendente";
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return ehIphone() && !naTelaDeInicio() ? "instalar" : "indisponivel";
  }
  if (Notification.permission === "denied") return "negado";
  if (Notification.permission === "granted") {
    const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "ativo" : "pendente";
  }
  return "pendente";
}

const paraBytes = (base64: string) => {
  const b = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
};

async function registrarWeb(): Promise<void> {
  const reg = await navigator.serviceWorker.register("/sw-push.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { data, error } = await supabase.functions.invoke("enviar-push", { method: "GET" });
    const chave = (data as { chave_publica?: string } | null)?.chave_publica;
    if (error || !chave) throw new Error("As notificações ainda estão sendo ligadas no servidor. Tente de novo em alguns minutos.");
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: paraBytes(chave) });
  }
  const j = sub.toJSON() as { endpoint: string; keys?: { p256dh: string; auth: string } };
  const { error } = await supabase.rpc("registrar_dispositivo", { p_tipo: "web", p_endereco: j.endpoint, p_chaves: j.keys ?? null, p_aparelho: navigator.userAgent.slice(0, 120) });
  if (error) throw error;
}

let ouvindoAndroid = false;

async function registrarAndroid(p: PluginPush): Promise<void> {
  await p.createChannel?.({ id: "rovibes", name: "RoVibes", importance: 4, description: "Brindes, convites, mensagens e pedidos" }).catch(() => undefined);
  await new Promise<void>((ok, falhou) => {
    const tempo = window.setTimeout(() => falhou(new Error("O aparelho não respondeu. Tente de novo.")), 15000);
    void p.addListener("registration", async (t: { value: string }) => {
      window.clearTimeout(tempo);
      const { error } = await supabase.rpc("registrar_dispositivo", { p_tipo: "android", p_endereco: t.value, p_chaves: null, p_aparelho: "Android" });
      if (error) return falhou(error);
      gravar("push_registrado", true);
      ok();
    });
    void p.addListener("registrationError", () => {
      window.clearTimeout(tempo);
      falhou(new Error("Não foi possível ligar as notificações neste aparelho."));
    });
    void p.register();
  });
}

/** Pede permissão (se ainda não deu) e liga as notificações neste aparelho. */
export async function ativarPush(): Promise<EstadoPush> {
  if (ehApp()) {
    const p = pluginAndroid();
    if (!p) return "app_antigo";
    let { receive } = await p.checkPermissions();
    if (receive !== "granted") receive = (await p.requestPermissions()).receive;
    if (receive !== "granted") return "negado";
    await registrarAndroid(p);
    return "ativo";
  }
  const e = await estadoPush();
  if (e === "instalar" || e === "indisponivel" || e === "negado") return e;
  const permissao = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permissao !== "granted") return permissao === "denied" ? "negado" : "pendente";
  await registrarWeb();
  return "ativo";
}

/** Desliga as notificações neste aparelho. */
export async function desativarPush(): Promise<void> {
  if (ehApp()) {
    gravar("push_registrado", false);
    return;
  }
  const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.rpc("remover_dispositivo", { p_endereco: sub.endpoint });
    await sub.unsubscribe();
  }
}

/**
 * Ao abrir o App: se as notificações já estão permitidas, renova o registro do aparelho
 * e prepara o toque na notificação (abre a tela certa) e o aviso com o App aberto.
 */
export async function iniciarPush(abrir: (link: string) => void, avisar: (n: { titulo: string; texto: string; link: string }) => void) {
  // Mantém o banco sabendo o endereço da função de envio (barato: uma chamada por abertura do App).
  void supabase.functions.invoke("enviar-push", { method: "GET" }).catch(() => undefined);
  if ("serviceWorker" in navigator && !ehApp()) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      const d = e.data as { tipo?: string; link?: string; titulo?: string; texto?: string };
      if (d?.tipo === "rovibes:abrir" && d.link) abrir(d.link);
      if (d?.tipo === "rovibes:notificacao") avisar({ titulo: d.titulo ?? "RoVibes", texto: d.texto ?? "", link: d.link ?? "/" });
    });
  }
  const p = pluginAndroid();
  if (p && !ouvindoAndroid) {
    ouvindoAndroid = true;
    void p.addListener("pushNotificationActionPerformed", (a: { notification?: { data?: { link?: string } } }) => {
      const link = a.notification?.data?.link;
      if (link) abrir(link);
    });
    void p.addListener("pushNotificationReceived", (n: { title?: string; body?: string; data?: { link?: string } }) =>
      avisar({ titulo: n.title ?? "RoVibes", texto: n.body ?? "", link: n.data?.link ?? "/" }),
    );
  }
  try {
    if ((await estadoPush()) === "ativo" || (ehApp() && p && (await p.checkPermissions()).receive === "granted")) {
      if (p) await registrarAndroid(p);
      else await registrarWeb();
    }
  } catch {
    /* tenta de novo na próxima abertura */
  }
}

/** O cartão "Ative as notificações" não volta antes de 7 dias depois de "Agora não". */
export const podePerguntar = () => Date.now() - ler<number>("push_adiado", 0) > 7 * 86400000;
export const adiarPergunta = () => gravar("push_adiado", Date.now());

export const CATEGORIAS_PUSH: { id: string; nome: string; explica: string }[] = [
  { id: "brindes", nome: "Brindes", explica: "Quando brindarem suas publicações e comentários" },
  { id: "comentarios", nome: "Comentários", explica: "Comentários e respostas" },
  { id: "seguidores", nome: "Seguidores", explica: "Novos seguidores e pedidos para seguir" },
  { id: "convites", nome: "Convites", explica: "Eventos de amigos, rolês e convites de promoter" },
  { id: "eventos", nome: "Eventos", explica: "Novos eventos dos lugares que você segue e mudanças nos que você tem interesse" },
  { id: "chat", nome: "Mensagens", explica: "Mensagens no chat" },
  { id: "pedidos", nome: "Pedidos", explica: "Quando seu pedido fica pronto" },
];

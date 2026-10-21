// Envia as notificações do RoVibes para os celulares.
// • GET  → devolve a chave pública do Web Push (o App usa para se inscrever) e se o Android está ligado.
// • POST → manda as notificações pendentes (o banco chama sempre que cria uma).
// Web Push (navegador e iPhone com o RoVibes na Tela de Início): chaves VAPID_PUBLICA / VAPID_PRIVADA.
// Android (app RoVibes): Firebase Cloud Messaging, com a conta de serviço em FCM_CONTA_SERVICO.
import webpush from "npm:web-push@3.6.7";
import { admin, cors, resposta, SITE, URL_SUPABASE } from "../_compartilhado/mp.ts";

const VAPID_PUBLICA = Deno.env.get("VAPID_PUBLICA") ?? "";
const VAPID_PRIVADA = Deno.env.get("VAPID_PRIVADA") ?? "";
const FCM = Deno.env.get("FCM_CONTA_SERVICO") ?? "";

if (VAPID_PUBLICA && VAPID_PRIVADA) webpush.setVapidDetails(SITE, VAPID_PUBLICA, VAPID_PRIVADA);

interface Envio {
  id: string;
  usuario_id: string;
  tipo: string;
  titulo: string;
  texto: string | null;
  link: string;
  grupo: string | null;
  quer: boolean;
}

interface Dispositivo {
  id: string;
  usuario_id: string;
  tipo: "web" | "android";
  endereco: string;
  chaves: { p256dh: string; auth: string } | null;
}

// ---------- Firebase (Android) ----------
let tokenFcm: { valor: string; ate: number } | null = null;

const b64url = (dados: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof dados === "string" ? new TextEncoder().encode(dados) : new Uint8Array(dados);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function acessoFcm(conta: { client_email: string; private_key: string; token_uri?: string }) {
  if (tokenFcm && tokenFcm.ate > Date.now() + 60000) return tokenFcm.valor;
  const agora = Math.floor(Date.now() / 1000);
  const aud = conta.token_uri ?? "https://oauth2.googleapis.com/token";
  const cabecalho = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64url(JSON.stringify({ iss: conta.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud, iat: agora, exp: agora + 3600 }));
  const pem = conta.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", chave, new TextEncoder().encode(`${cabecalho}.${corpo}`));
  const r = await fetch(aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${cabecalho}.${corpo}.${b64url(assinatura)}` }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Firebase: ${JSON.stringify(j)}`);
  tokenFcm = { valor: j.access_token, ate: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return tokenFcm.valor;
}

async function enviarAndroid(d: Dispositivo, n: Envio): Promise<"ok" | "invalido" | "erro"> {
  if (!FCM) return "erro";
  const conta = JSON.parse(FCM);
  const token = await acessoFcm(conta);
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${conta.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: d.endereco,
        notification: { title: n.titulo, body: n.texto ?? "" },
        data: { link: n.link, tipo: n.tipo },
        android: { priority: "high", notification: { tag: n.grupo ?? n.id, color: "#7C3AED", default_sound: true } },
      },
    }),
  });
  if (r.ok) return "ok";
  const t = await r.text();
  if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(t)) return "invalido";
  console.error("FCM", r.status, t);
  return "erro";
}

async function enviarWeb(d: Dispositivo, n: Envio): Promise<"ok" | "invalido" | "erro"> {
  if (!VAPID_PRIVADA || !d.chaves) return "erro";
  try {
    await webpush.sendNotification(
      { endpoint: d.endereco, keys: d.chaves },
      JSON.stringify({ titulo: n.titulo, texto: n.texto ?? "", link: n.link, tag: n.grupo ?? n.id }),
      { TTL: 86400, urgency: "high" },
    );
    return "ok";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "invalido";
    console.error("Web Push", status, (e as Error).message);
    return "erro";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  // O banco descobre aqui o endereço desta função (para avisar quando criar notificação).
  await db.from("config_push").upsert({ id: true, url_envio: `${URL_SUPABASE}/functions/v1/enviar-push`, atualizado_em: new Date().toISOString() });

  if (req.method === "GET") return resposta({ chave_publica: VAPID_PUBLICA || null, android: !!FCM });

  let total = 0;
  for (let rodada = 0; rodada < 5; rodada++) {
    const { data: lote, error } = await db.rpc("reservar_envios", { p_limite: 100 });
    if (error) return resposta({ erro: error.message }, 500);
    const envios = ((lote ?? []) as Envio[]).filter((n) => n.quer);
    if (!lote?.length) break;
    if (!envios.length) continue;
    const pessoas = [...new Set(envios.map((n) => n.usuario_id))];
    const { data: aparelhos } = await db.from("dispositivos_push").select("id, usuario_id, tipo, endereco, chaves").in("usuario_id", pessoas);
    const porPessoa = new Map<string, Dispositivo[]>();
    for (const d of (aparelhos ?? []) as Dispositivo[]) porPessoa.set(d.usuario_id, [...(porPessoa.get(d.usuario_id) ?? []), d]);
    const invalidos: string[] = [];
    await Promise.all(
      envios.flatMap((n) =>
        (porPessoa.get(n.usuario_id) ?? []).map(async (d) => {
          const r = d.tipo === "android" ? await enviarAndroid(d, n).catch(() => "erro" as const) : await enviarWeb(d, n);
          if (r === "invalido") invalidos.push(d.id);
          if (r === "ok") total++;
        }),
      ),
    );
    if (invalidos.length) await db.from("dispositivos_push").delete().in("id", invalidos);
  }
  return resposta({ enviados: total });
});

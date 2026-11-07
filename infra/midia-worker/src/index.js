/**
 * RoVibes · serviço de mídia (Cloudflare Worker + R2)
 *
 *   PUT    /m/<chave>   envia um arquivo (precisa do login do RoVibes; só na própria pasta u/<id-da-pessoa>/)
 *   GET    /m/<chave>   entrega o arquivo (cache de 1 ano; suporta partes para áudio e vídeo)
 *   DELETE /m/<chave>   apaga um arquivo da própria pasta
 *   GET    /saude       verificação simples
 *
 * Chave: u/<usuario>/<finalidade>/<id>/<arquivo>   ex.: u/9f.../publicacao/1b2c.../640.webp
 * O banco (catálogo "midias") é registrado pelo app depois do envio; este serviço não guarda chaves do banco.
 */

const FINALIDADES = new Set(["publicacao", "story", "avatar", "estabelecimento", "produto", "chat", "evento", "musica", "gosto", "biblioteca", "ao-vivo", "documento", "teste"]);
const TIPOS = {
  webp: ["image/webp", 8], jpg: ["image/jpeg", 8], jpeg: ["image/jpeg", 8], png: ["image/png", 8], avif: ["image/avif", 8],
  mp3: ["audio/mpeg", 15], m4a: ["audio/mp4", 15], ogg: ["audio/ogg", 15],
  mp4: ["video/mp4", 60], webm: ["video/webm", 60],
  pdf: ["application/pdf", 10],
};
const CHAVE = /^u\/([0-9a-f-]{36})\/([a-z-]{2,20})\/([0-9a-zA-Z-]{8,60})\/([a-z0-9_-]{1,40})\.([a-z0-9]{2,5})$/;
const CACHE = "public, max-age=31536000, immutable";

// Logins já conferidos (evita perguntar ao Supabase a cada arquivo de um mesmo envio).
const conferidos = new Map();

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = cabecalhosCors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === "/saude") return json({ ok: true, servico: "rovibes-midia" }, 200, cors);
      if (!url.pathname.startsWith("/m/")) return json({ erro: "Endereço desconhecido." }, 404, cors);

      const chave = decodeURIComponent(url.pathname.slice(3));
      const partes = chave.match(CHAVE);
      if (!partes) return json({ erro: "Chave inválida." }, 400, cors);
      const [, dono, finalidade, , , ext] = partes;
      if (!FINALIDADES.has(finalidade) || !TIPOS[ext]) return json({ erro: "Tipo de arquivo não permitido." }, 400, cors);

      if (req.method === "GET" || req.method === "HEAD") return entregar(req, env, ctx, chave, cors);

      // Envio e exclusão: só a própria pessoa, na própria pasta.
      const usuario = await quemEnvia(req, env);
      if (!usuario) return json({ erro: "Entre no RoVibes para enviar arquivos." }, 401, cors);
      if (usuario !== dono) return json({ erro: "Sem permissão para esta pasta." }, 403, cors);

      if (req.method === "PUT") {
        const [tipo, limiteMb] = TIPOS[ext];
        const tamanho = Number(req.headers.get("content-length") || 0);
        if (!tamanho) return json({ erro: "Arquivo vazio." }, 411, cors);
        if (tamanho > limiteMb * 1024 * 1024) return json({ erro: `Arquivo maior que ${limiteMb} MB.` }, 413, cors);
        const recebido = (req.headers.get("content-type") || "").split(";")[0].trim();
        if (recebido && recebido !== tipo && !(ext === "webm" && recebido.startsWith("video/webm"))) return json({ erro: "Formato não confere com o arquivo." }, 415, cors);
        if (await env.MIDIA.head(chave)) return json({ erro: "Arquivo já existe." }, 409, cors);
        const obj = await env.MIDIA.put(chave, req.body, {
          httpMetadata: { contentType: tipo, cacheControl: CACHE },
          customMetadata: { dono, finalidade },
        });
        return json({ ok: true, chave, bytes: obj.size, etag: obj.httpEtag }, 201, cors);
      }

      if (req.method === "DELETE") {
        await env.MIDIA.delete(chave);
        return json({ ok: true }, 200, cors);
      }

      return json({ erro: "Método não permitido." }, 405, cors);
    } catch (e) {
      return json({ erro: "Falha no serviço de mídia.", detalhe: String(e?.message || e).slice(0, 200) }, 500, cors);
    }
  },
};

async function entregar(req, env, ctx, chave, cors) {
  const temParte = req.headers.has("range");
  const cache = caches.default;
  const chaveCache = new Request(new URL(req.url).origin + "/m/" + chave, { method: "GET" });

  // Arquivo inteiro: tenta o cache da borda primeiro (funciona com domínio próprio).
  if (!temParte && req.method === "GET") {
    const guardado = await cache.match(chaveCache);
    if (guardado) return comCors(guardado, cors);

  }

  const obj = await env.MIDIA.get(chave, { range: req.headers, onlyIf: req.headers });
  if (!obj) return new Response("Não encontrado", { status: 404, headers: cors });


  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("etag", obj.httpEtag);
  h.set("cache-control", CACHE);
  h.set("accept-ranges", "bytes");

  // Não mudou desde a última vez (If-None-Match): o aparelho usa o que já tem.
  if (!("body" in obj) || !obj.body) return comCors(new Response(null, { status: 304, headers: h }), cors);

  if (temParte && obj.range) {
    const inicio = obj.range.offset ?? 0;
    const fim = inicio + (obj.range.length ?? obj.size - inicio) - 1;
    h.set("content-range", `bytes ${inicio}-${fim}/${obj.size}`);
    h.set("content-length", String(fim - inicio + 1));
    return comCors(new Response(req.method === "HEAD" ? null : obj.body, { status: 206, headers: h }), cors);
  }

  h.set("content-length", String(obj.size));
  const resp = new Response(req.method === "HEAD" ? null : obj.body, { status: 200, headers: h });
  // Guarda na borda sem os cabeçalhos de origem (servem para qualquer site do RoVibes).
  if (req.method === "GET") ctx.waitUntil(cache.put(chaveCache, resp.clone()).catch(() => undefined));
  return comCors(resp, cors);
}

/** Confere o login do RoVibes perguntando ao Supabase (funciona com qualquer tipo de chave de assinatura). */
async function quemEnvia(req, env) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token.split(".").length !== 3) return null;
  const agora = Date.now();
  const antes = conferidos.get(token);
  if (antes && antes.ate > agora) return antes.id;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  if (!u?.id) return null;
  if (conferidos.size > 500) conferidos.clear();
  conferidos.set(token, { id: u.id, ate: agora + 5 * 60 * 1000 });
  return u.id;
}

function cabecalhosCors(req, env) {
  const origem = req.headers.get("origin") || "";
  const permitidas = (env.ORIGENS || "").split(",").map((s) => s.trim());
  const ok = permitidas.includes(origem) || /^https:\/\/rovibes[a-z0-9-]*\.vercel\.app$/.test(origem);
  return {
    "access-control-allow-origin": ok ? origem : permitidas[0] || "*",
    "access-control-allow-methods": "GET, HEAD, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, range, if-none-match",
    "access-control-expose-headers": "content-length, content-range, etag",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function comCors(resp, cors) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
  return r;
}

function json(dados, status, cors) {
  return new Response(JSON.stringify(dados), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });
}

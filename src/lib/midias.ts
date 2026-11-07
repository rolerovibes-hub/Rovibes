import { supabase } from "./supabase";

/**
 * Camada de mídia do RoVibes (catálogo central + armazenamento independente).
 * O resto do app não precisa saber onde o arquivo está: envia por aqui e recebe um endereço.
 * Com VITE_MIDIA_URL definido, fotos, áudios e vídeos vão para o R2 (Cloudflare), sem custo de entrega;
 * sem ele, tudo continua no Supabase Storage como antes.
 */
export const MIDIA_URL = ((import.meta.env.VITE_MIDIA_URL as string | undefined) ?? "").replace(/\/$/, "");
export const usaR2 = () => !!MIDIA_URL;

/** Larguras das versões de cada foto (a de 1280 é a principal). */
export const TAMANHOS = [160, 320, 640, 960, 1280] as const;
const VERSAO = /\/(160|320|640|960|1280)\.(webp|jpg)$/;

/** Endereço da versão mais adequada para a largura exibida (considera a densidade da tela). */
export function urlNoTamanho(url: string | null | undefined, larguraNaTela: number): string {
  if (!url) return "";
  const m = url.match(VERSAO);
  if (!m || !MIDIA_URL || !url.startsWith(MIDIA_URL)) return url;
  const alvo = larguraNaTela * Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  const maxima = Number(m[1]);
  const escolhida = TAMANHOS.find((t) => t >= alvo && t <= maxima) ?? maxima;
  return url.replace(VERSAO, `/${escolhida}.${m[2]}`);
}

/** srcSet para <img> (o navegador escolhe a versão). */
export function srcSetDe(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const m = url.match(VERSAO);
  if (!m || !MIDIA_URL || !url.startsWith(MIDIA_URL)) return undefined;
  return TAMANHOS.filter((t) => t <= Number(m[1]))
    .map((t) => `${url.replace(VERSAO, `/${t}.${m[2]}`)} ${t}w`)
    .join(", ");
}

/** De onde vem o arquivo (pelo caminho antigo do Supabase), para organizar as pastas no R2. */
function finalidadeDe(balde: string, caminho: string) {
  if (balde === "estabelecimentos") return "estabelecimento";
  if (balde === "chat") return "chat";
  if (balde === "musicas") return "musica";
  if (balde === "gostos") return "gosto";
  if (balde === "biblioteca") return "biblioteca";
  if (balde === "ao-vivo") return "ao-vivo";
  if (/\/story-/.test(caminho)) return "story";
  if (/\/post-/.test(caminho)) return "publicacao";
  if (/\/evento-/.test(caminho)) return "evento";
  return "avatar";
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png", "video/mp4": "mp4", "video/webm": "webm", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg" };

async function sessao() {
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  if (!s) throw new Error("Entre no RoVibes para enviar arquivos.");
  return { token: s.access_token, eu: s.user.id };
}

/** Envia um arquivo para o R2 (com progresso). Já existir conta como sucesso (envio retomado). */
function enviar(chave: string, arquivo: Blob, tipo: string, token: string, aoProgresso?: (p: number) => void) {
  return new Promise<void>((ok, falha) => {
    const x = new XMLHttpRequest();
    let vigia = 0;
    const vigiar = () => {
      window.clearTimeout(vigia);
      vigia = window.setTimeout(() => x.abort(), 45000);
    };
    x.open("PUT", `${MIDIA_URL}/m/${chave}`);
    x.setRequestHeader("authorization", `Bearer ${token}`);
    x.setRequestHeader("content-type", tipo.split(";")[0]);
    x.upload.onprogress = (e) => {
      vigiar();
      if (e.lengthComputable) aoProgresso?.(e.loaded / e.total);
    };
    x.onload = () => {
      window.clearTimeout(vigia);
      if ((x.status >= 200 && x.status < 300) || x.status === 409) ok();
      else {
        let msg = "Não foi possível enviar o arquivo.";
        try {
          msg = JSON.parse(x.responseText).erro || msg;
        } catch {
          /* resposta sem texto */
        }
        falha(new Error(msg));
      }
    };
    x.onerror = () => {
      window.clearTimeout(vigia);
      falha(new Error("Sem conexão. Verifique a internet e tente de novo."));
    };
    x.onabort = () => falha(new Error("A internet travou no envio. Toque em ↻ para continuar."));
    vigiar();
    x.send(arquivo);
  });
}

/** Gera as versões de uma foto (WebP; JPEG onde o aparelho não gera WebP). */
async function versoesDaFoto(foto: Blob) {
  const img = await createImageBitmap(foto);
  const lado = Math.max(img.width, img.height);
  const lista: { nome: string; blob: Blob; tipo: string }[] = [];
  for (const t of TAMANHOS) {
    const escala = Math.min(1, t / lado);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * escala));
    c.height = Math.max(1, Math.round(img.height * escala));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    let blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/webp", 0.8));
    if (!blob || blob.type !== "image/webp") blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.82));
    if (!blob) throw new Error("Não foi possível preparar a foto.");
    lista.push({ nome: `${t}.${blob.type === "image/webp" ? "webp" : "jpg"}`, blob, tipo: blob.type });
  }
  const dims = { largura: img.width, altura: img.height };
  img.close();
  return { lista, ...dims };
}

/**
 * Envio pelo catálogo de mídias: fotos viram 5 versões + original; vídeo e áudio vão como estão.
 * Devolve o endereço principal (foto: versão 1280; outros: o próprio arquivo).
 */
export async function enviarParaR2(balde: string, caminho: string, arquivo: Blob, tipo: string, aoProgresso?: (p: number) => void, estab?: string | null): Promise<string> {
  const { token, eu } = await sessao();
  const finalidade = finalidadeDe(balde, caminho);
  const id = (caminho.split("/").pop() ?? crypto.randomUUID()).replace(/\.[a-z0-9]+$/i, "").replace(/[^0-9a-zA-Z-]/g, "-").slice(0, 60).padEnd(8, "0");
  const base = `u/${eu}/${finalidade}/${id}`;
  const ehFoto = tipo.startsWith("image/");
  let principal: string;
  let variantes: Record<string, string> = {};
  let dims: { largura?: number; altura?: number } = {};

  if (ehFoto) {
    const v = await versoesDaFoto(arquivo);
    dims = { largura: v.largura, altura: v.altura };
    const ext = EXT[tipo] ?? "jpg";
    const todos = [...v.lista, { nome: `original.${ext}`, blob: arquivo, tipo }];
    const total = todos.reduce((s, x) => s + x.blob.size, 0);
    let feito = 0;
    for (const x of todos) {
      await enviar(`${base}/${x.nome}`, x.blob, x.tipo, token, (p) => aoProgresso?.((feito + p * x.blob.size) / total));
      feito += x.blob.size;
      variantes[x.nome.split(".")[0]] = x.nome;
    }
    principal = `${base}/${v.lista[v.lista.length - 1].nome}`;
  } else {
    const nome = `${tipo.startsWith("video/") ? "video" : tipo.startsWith("audio/") ? "audio" : "arquivo"}.${EXT[tipo.split(";")[0]] ?? "bin"}`;
    await enviar(`${base}/${nome}`, arquivo, tipo, token, aoProgresso);
    variantes = { original: nome };
    principal = `${base}/${nome}`;
  }
  aoProgresso?.(1);

  // Catálogo central (não impede o envio se o banco estiver fora do ar).
  void supabase
    .rpc("registrar_midia", {
      p_provedor: "r2",
      p_chave: base,
      p_tipo: ehFoto ? "imagem" : tipo.startsWith("video/") ? "video" : tipo.startsWith("audio/") ? "audio" : "documento",
      p_finalidade: finalidade,
      p_variantes: variantes,
      p_formato: tipo,
      p_bytes: arquivo.size,
      p_largura: dims.largura ?? null,
      p_altura: dims.altura ?? null,
      p_estab: estab ?? null,
    })
    .then(() => undefined);

  return `${MIDIA_URL}/m/${principal}`;
}

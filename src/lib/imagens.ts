import { supabase } from "./supabase";

const BALDE = "estabelecimentos";

/** Reduz a foto no próprio aparelho antes de enviar (lado maior até 1600 px, JPEG). */
type Fonte = { desenho: CanvasImageSource; largura: number; altura: number; liberar: () => void };

const ehHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

/** Abre a imagem por vários caminhos: alguns celulares (WebView do Android) falham num e funcionam no outro. */
async function abrirImagem(arquivo: Blob, ladoMaximo: number): Promise<Fonte> {
  // 1) createImageBitmap: decodifica já reduzida (usa pouca memória com fotos grandes da câmera).
  if (typeof createImageBitmap === "function") {
    try {
      const inteira = await createImageBitmap(arquivo);
      const escala = Math.min(1, ladoMaximo / Math.max(inteira.width, inteira.height));
      if (escala >= 1) return { desenho: inteira, largura: inteira.width, altura: inteira.height, liberar: () => inteira.close() };
      const w = Math.round(inteira.width * escala);
      const h = Math.round(inteira.height * escala);
      inteira.close();
      const menor = await createImageBitmap(arquivo, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" }).catch(() => null);
      if (menor) return { desenho: menor, largura: w, altura: h, liberar: () => menor.close() };
    } catch {
      /* tenta o próximo */
    }
  }
  // 2) <img> com endereço temporário; 3) <img> com o arquivo lido como texto (data URL).
  const carregar = (src: string) =>
    new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error("img"));
      i.src = src;
    });
  const url = URL.createObjectURL(arquivo);
  try {
    const i = await carregar(url);
    return { desenho: i, largura: i.naturalWidth, altura: i.naturalHeight, liberar: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
  }
  const dados = await new Promise<string>((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falha(new Error("leitura"));
    r.readAsDataURL(arquivo);
  });
  const i = await carregar(dados);
  return { desenho: i, largura: i.naturalWidth, altura: i.naturalHeight, liberar: () => undefined };
}

/** Reduz a foto (lado maior até ladoMaximo) e converte para JPEG. */
export async function reduzirImagem(arquivo: File, ladoMaximo = 1600): Promise<Blob> {
  if (!arquivo.size) throw new Error("A foto não chegou inteira. Se ela está na nuvem (Google Fotos), baixe para o celular e tente de novo.");
  let fonte: Fonte;
  try {
    fonte = await abrirImagem(arquivo, ladoMaximo);
  } catch {
    // Sem conseguir abrir aqui: JPEG/PNG/WEBP até 8 MB vão como estão.
    if (/^image\/(jpeg|png|webp)$/i.test(arquivo.type) && arquivo.size <= 8 * 1024 * 1024) return arquivo;
    throw new Error(
      ehHeic(arquivo)
        ? "Esta foto está no formato HEIC, que o aparelho não conseguiu abrir aqui. Nas configurações da câmera, escolha “Mais compatível” (JPG), ou envie um print da foto."
        : "Não foi possível ler esta imagem. Tente outra foto (JPG ou PNG).",
    );
  }
  try {
    const escala = Math.min(1, ladoMaximo / Math.max(fonte.largura, fonte.altura));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(fonte.largura * escala));
    canvas.height = Math.max(1, Math.round(fonte.altura * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a imagem.");
    ctx.fillStyle = "#fff"; // PNG com fundo transparente não fica preto no JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(fonte.desenho, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, falha) =>
      canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível preparar a imagem."))), "image/jpeg", 0.85),
    );
  } finally {
    fonte.liberar();
  }
}

/** Envia a foto para a pasta do estabelecimento e devolve o endereço público. */
export async function enviarFoto(estabelecimentoId: string, arquivo: File, prefixo: string) {
  const blob = await reduzirImagem(arquivo);
  const caminho = `${estabelecimentoId}/${prefixo}-${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BALDE).upload(caminho, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from(BALDE).getPublicUrl(caminho);
  return { url: data.publicUrl, caminho };
}

export async function apagarFoto(caminho: string) {
  await supabase.storage.from(BALDE).remove([caminho]);
}

/** Caminho no armazenamento a partir do endereço público. */
export function caminhoDaUrl(url: string | null | undefined) {
  if (!url) return null;
  const marca = `/${BALDE}/`;
  const i = url.indexOf(marca);
  return i >= 0 ? url.slice(i + marca.length) : null;
}

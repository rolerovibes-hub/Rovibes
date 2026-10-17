import { supabase } from "./supabase";

const BALDE = "estabelecimentos";

/** Reduz a foto no próprio aparelho antes de enviar (lado maior até 1600 px, JPEG). */
export async function reduzirImagem(arquivo: File, ladoMaximo = 1600): Promise<Blob> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error("Não foi possível ler esta imagem."));
      i.src = url;
    });
    const escala = Math.min(1, ladoMaximo / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, falha) =>
      canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível preparar a imagem."))), "image/jpeg", 0.85),
    );
  } finally {
    URL.revokeObjectURL(url);
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

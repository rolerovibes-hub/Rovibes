import { supabase } from "./supabase";
import { reduzirImagem } from "./imagens";

export interface ItemBiblioteca {
  id: string;
  ean: string | null;
  nome: string;
  descricao: string | null;
  foto_url: string | null;
  marca: string | null;
  categoria: string | null;
  unidade: string;
  embalagem_nome: string | null;
  embalagem_fator: number | null;
  situacao: "aprovado" | "pendente" | "recusado" | "inativo";
  produto_id: string | null;
}

export interface DadosBiblioteca {
  ean: string;
  nome: string;
  descricao: string;
  foto_url: string | null;
  marca: string;
  grupo: string;
  categoria: string;
  unidade: string;
  embalagem_nome: string;
  embalagem_fator: string;
  industrializado: boolean;
}

export const SITUACAO_BIBLIOTECA: Record<string, { nome: string; cor: string }> = {
  aprovado: { nome: "Aprovado", cor: "text-ok" },
  pendente: { nome: "Em análise", cor: "text-alerta" },
  recusado: { nome: "Recusado", cor: "text-perigo" },
  inativo: { nome: "Desativado", cor: "text-suave" },
};

export async function buscarBiblioteca(estab: string, termo: string): Promise<ItemBiblioteca[]> {
  const { data, error } = await supabase.rpc("buscar_biblioteca", { p_estab: estab, p_termo: termo });
  if (error) throw error;
  return ((data ?? []) as ItemBiblioteca[]).map((x) => ({ ...x, embalagem_fator: x.embalagem_fator == null ? null : Number(x.embalagem_fator) }));
}

export async function incluirNoEstoque(estab: string, biblioteca: string): Promise<string> {
  const { data, error } = await supabase.rpc("incluir_no_estoque", { p_estab: estab, p_biblioteca: biblioteca });
  if (error) throw error;
  return data as string;
}

/** Foto do produto: reduzida no aparelho e guardada na pasta de quem enviou. */
export async function enviarFotoBiblioteca(usuario: string, arquivo: File | Blob, jaTratada = false): Promise<string> {
  const blob = jaTratada ? arquivo : await reduzirImagem(arquivo as File, 1000);
  const caminho = `${usuario}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("biblioteca").upload(caminho, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return supabase.storage.from("biblioteca").getPublicUrl(caminho).data.publicUrl;
}

export async function enviarParaBiblioteca(estab: string, dados: DadosBiblioteca) {
  const { data, error } = await supabase.rpc("enviar_para_biblioteca", { p_estab: estab, p_dados: dados });
  if (error) throw error;
  return ((data ?? []) as { biblioteca_id: string; produto_id: string; ja_existia: boolean }[])[0];
}

export const dadosVazios = (inicial?: Partial<DadosBiblioteca>): DadosBiblioteca => ({
  ean: "",
  nome: "",
  descricao: "",
  foto_url: null,
  marca: "",
  grupo: "",
  categoria: "",
  unidade: "un",
  embalagem_nome: "",
  embalagem_fator: "",
  industrializado: true,
  ...inicial,
});

/** Caminho da foto dentro do armazenamento da biblioteca (para apagar). */
export function caminhoFotoBiblioteca(url: string | null | undefined) {
  if (!url) return null;
  const i = url.indexOf("/biblioteca/");
  return i >= 0 ? url.slice(i + "/biblioteca/".length).split("?")[0] : null;
}

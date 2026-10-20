import { supabase } from "./supabase";

export interface PessoaResumo {
  id: string;
  nome: string;
  usuario: string;
  foto_url: string | null;
  privado?: boolean;
  eu_sigo?: "ativo" | "pendente" | null;
  em_comum?: number;
  situacao?: "ativo" | "pendente";
}

export interface PerfilPessoa {
  id: string;
  nome: string;
  usuario: string;
  foto_url: string | null;
  bio: string | null;
  privado: boolean;
  seguidores: number;
  seguindo: number;
  eu_sigo: "ativo" | "pendente" | null;
  me_segue: boolean;
  eu_bloqueei: boolean;
  pode_ver: boolean;
}

export const MOTIVOS_DENUNCIA: { valor: string; nome: string }[] = [
  { valor: "assedio", nome: "Assédio ou ofensa" },
  { valor: "improprio", nome: "Conteúdo impróprio" },
  { valor: "spam", nome: "Spam ou golpe" },
  { valor: "perfil_falso", nome: "Perfil falso" },
  { valor: "menor", nome: "Parece ser menor de 18 anos" },
  { valor: "violencia", nome: "Violência ou ameaça" },
  { valor: "outro", nome: "Outro motivo" },
];

export const nomeMotivo = (v: string) => MOTIVOS_DENUNCIA.find((m) => m.valor === v)?.nome ?? v;

export async function buscarPerfilPessoa(usuario: string): Promise<PerfilPessoa | null> {
  const { data, error } = await supabase.rpc("perfil_pessoa", { p_usuario: usuario });
  if (error) throw error;
  return ((data ?? []) as PerfilPessoa[])[0] ?? null;
}

export async function seguirPessoa(id: string): Promise<"ativo" | "pendente"> {
  const { data, error } = await supabase.rpc("seguir_pessoa", { p_pessoa: id });
  if (error) throw error;
  return data as "ativo" | "pendente";
}

export async function deixarDeSeguir(id: string) {
  const { error } = await supabase.rpc("deixar_de_seguir", { p_pessoa: id });
  if (error) throw error;
}

export async function bloquearPessoa(id: string) {
  const { error } = await supabase.rpc("bloquear", { p_pessoa: id });
  if (error) throw error;
}

export async function desbloquearPessoa(id: string) {
  const { error } = await supabase.rpc("desbloquear", { p_pessoa: id });
  if (error) throw error;
}

export async function denunciar(tipo: "perfil" | "story" | "publicacao" | "mensagem" | "post" | "comentario", alvo: string, motivo: string, detalhe: string) {
  const { error } = await supabase.rpc("denunciar", { p_tipo: tipo, p_alvo: alvo, p_motivo: motivo, p_detalhe: detalhe });
  if (error) throw error;
}

export async function listaConexoes(pessoa: string, tipo: "seguidores" | "seguindo"): Promise<PessoaResumo[]> {
  const { data, error } = await supabase.rpc("lista_conexoes", { p_pessoa: pessoa, p_tipo: tipo });
  if (error) throw error;
  return (data ?? []) as PessoaResumo[];
}

/** Texto do botão de seguir conforme a relação atual. */
export function textoSeguir(eu_sigo: PessoaResumo["eu_sigo"], meSegue = false) {
  if (eu_sigo === "ativo") return "Seguindo";
  if (eu_sigo === "pendente") return "Solicitado";
  return meSegue ? "Seguir de volta" : "Seguir";
}

/** Formato aceito para @usuário: 3 a 24 letras minúsculas, números, ponto ou sublinhado. */
export function limparUsuario(v: string) {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 24);
}

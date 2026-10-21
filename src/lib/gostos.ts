import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type TipoGosto = "musica" | "ambiente" | "bebida" | "comida" | "experiencia";

export interface Gosto {
  id: number;
  tipo: TipoGosto;
  nome: string;
  emoji: string | null;
}

export const NOME_TIPO_GOSTO: Record<TipoGosto, string> = {
  musica: "Estilos musicais",
  ambiente: "Ambientes",
  bebida: "Bebidas",
  comida: "Comidas",
  experiencia: "Experiências",
};

export const ORDEM_TIPOS: TipoGosto[] = ["musica", "ambiente", "bebida", "comida", "experiencia"];

let cache: Gosto[] | null = null;

/** Catálogo de gostos. null = banco sem a atualização 031. */
export function useGostos() {
  const [gostos, setGostos] = useState<Gosto[] | null | undefined>(cache ?? undefined);
  useEffect(() => {
    if (cache) return;
    supabase
      .from("gostos")
      .select("id, tipo, nome, emoji")
      .eq("ativo", true)
      .order("tipo")
      .order("ordem")
      .then(({ data, error }) => {
        if (error) return setGostos(null);
        cache = (data ?? []) as Gosto[];
        setGostos(cache);
      });
  }, []);
  return gostos;
}

export interface CapaGosto {
  url: string;
  /** Nome do lugar ou evento da foto (vazio quando a foto é da equipe RoVibes). */
  lugar: string | null;
}

interface LinhaCapa {
  gosto_id: number;
  imagem_url: string | null;
  candidatos: { url: string; lugar: string }[] | null;
}

/**
 * Fotos dos cards da Primeira vibe. A foto da equipe vem primeiro; sem ela, usa a capa de um lugar ou evento
 * com aquele gosto — sem repetir a mesma foto em dois cards. Sem foto nenhuma, o card fica no degradê da marca.
 */
export function useCapasGostos(ordem: number[] | undefined) {
  const [capas, setCapas] = useState<Map<number, CapaGosto>>(new Map());
  const chave = ordem?.join(",") ?? "";
  useEffect(() => {
    if (!ordem?.length) return;
    let vivo = true;
    supabase.rpc("capas_gostos").then(({ data, error }) => {
      if (!vivo || error || !data) return;
      const porGosto = new Map((data as LinhaCapa[]).map((l) => [l.gosto_id, l]));
      const usadas = new Set<string>();
      const final = new Map<number, CapaGosto>();
      for (const id of ordem) {
        const l = porGosto.get(id);
        if (l?.imagem_url) {
          final.set(id, { url: l.imagem_url, lugar: null });
          usadas.add(l.imagem_url);
        }
      }
      for (const id of ordem) {
        if (final.has(id)) continue;
        const livre = porGosto.get(id)?.candidatos?.find((c) => c.url && !usadas.has(c.url));
        if (livre) {
          final.set(id, { url: livre.url, lugar: livre.lugar });
          usadas.add(livre.url);
        }
      }
      setCapas(final);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return capas;
}

/** Toque leve no celular (onde houver vibração). */
export function vibrarLeve() {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* sem vibração */
  }
}

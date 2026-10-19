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

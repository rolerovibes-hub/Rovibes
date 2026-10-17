import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";
import type { Movimento } from "@/components/Marca";

export interface Resumo {
  estabelecimento_id: string;
  nota: number | null;
  avaliacoes: number;
  movimento: Movimento | null;
  pessoas_2h: number;
  seguidores: number;
}

/** Nota, movimento agora e seguidores de vários lugares de uma vez. */
export function useResumos(ids: string[] | null) {
  const [resumos, setResumos] = useState<Map<string, Resumo>>(new Map());
  const chave = ids ? ids.join(",") : "todos";
  const recarregar = useCallback(async () => {
    const { data } = await supabase.rpc("resumo_lugares", { p_ids: ids && ids.length ? ids : null });
    const lista = ((data ?? []) as Resumo[]).map((r) => ({ ...r, nota: r.nota == null ? null : Number(r.nota) }));
    setResumos(new Map(lista.map((r) => [r.estabelecimento_id, r])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  useEffect(() => {
    void recarregar();
  }, [recarregar]);
  return { resumos, recarregar };
}

/** Exige login: leva para a tela de entrar e volta para a página atual. */
export function useExigirLogin() {
  const { sessao } = useSessao();
  const navegar = useNavigate();
  const local = useLocation();
  return () => {
    if (sessao) return true;
    navegar(`/entrar?voltar=${encodeURIComponent(local.pathname)}`);
    return false;
  };
}

/** Salvo e seguindo para um lugar. */
export function useRelacao(estabelecimentoId: string) {
  const { sessao } = useSessao();
  const usuario = sessao?.user.id;
  const [salvo, setSalvo] = useState(false);
  const [seguindo, setSeguindo] = useState(false);

  useEffect(() => {
    if (!usuario) {
      setSalvo(false);
      setSeguindo(false);
      return;
    }
    Promise.all([
      supabase.from("salvos").select("estabelecimento_id").eq("usuario_id", usuario).eq("estabelecimento_id", estabelecimentoId).maybeSingle(),
      supabase.from("seguidores").select("estabelecimento_id").eq("usuario_id", usuario).eq("estabelecimento_id", estabelecimentoId).maybeSingle(),
    ]).then(([a, b]) => {
      setSalvo(!!a.data);
      setSeguindo(!!b.data);
    });
  }, [usuario, estabelecimentoId]);

  const alternar = async (tabela: "salvos" | "seguidores", atual: boolean, definir: (v: boolean) => void) => {
    if (!usuario) return;
    definir(!atual);
    const { error } = atual
      ? await supabase.from(tabela).delete().eq("usuario_id", usuario).eq("estabelecimento_id", estabelecimentoId)
      : await supabase.from(tabela).insert({ estabelecimento_id: estabelecimentoId });
    if (error) definir(atual);
  };

  return {
    salvo,
    seguindo,
    alternarSalvo: () => alternar("salvos", salvo, setSalvo),
    alternarSeguir: () => alternar("seguidores", seguindo, setSeguindo),
  };
}

export const NOME_MOVIMENTO: Record<Movimento, string> = { tranquilo: "Tranquilo", moderado: "Moderado", cheio: "Cheio" };

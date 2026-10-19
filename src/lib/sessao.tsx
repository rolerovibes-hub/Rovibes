import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { bancoConfigurado, supabase } from "./supabase";

export interface Perfil {
  id: string;
  nome: string;
  data_nascimento: string;
  foto_url: string | null;
  telefone?: string | null;
  usuario?: string;
  bio?: string | null;
  privado?: boolean;
  suspenso?: boolean;
  /** null = ainda não passou pela Primeira vibe (undefined = banco sem a atualização 031). */
  vibe_inicial_em?: string | null;
}

interface SessaoContexto {
  carregando: boolean;
  sessao: Session | null;
  perfil: Perfil | null;
  email: string | null;
  ehAdmin: boolean;
  recarregar: () => Promise<void>;
  sair: () => Promise<void>;
}

const Contexto = createContext<SessaoContexto>({
  carregando: true,
  sessao: null,
  perfil: null,
  email: null,
  ehAdmin: false,
  recarregar: async () => {},
  sair: async () => {},
});

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(bancoConfigurado);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [ehAdmin, setEhAdmin] = useState(false);

  const carregarDados = useCallback(async (s: Session | null) => {
    if (!s) {
      setPerfil(null);
      setEhAdmin(false);
      return;
    }
    const [p, a] = await Promise.all([
      supabase.from("perfis").select("*").eq("id", s.user.id).maybeSingle(),
      supabase.from("administradores").select("usuario_id").eq("usuario_id", s.user.id).maybeSingle(),
    ]);
    setPerfil((p.data as Perfil | null) ?? null);
    setEhAdmin(!!a.data);
  }, []);

  useEffect(() => {
    if (!bancoConfigurado) return;
    let ativo = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return;
      setSessao(data.session);
      await carregarDados(data.session);
      if (ativo) setCarregando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s);
      // fora do callback, como o Supabase recomenda
      setTimeout(() => void carregarDados(s), 0);
    });
    return () => {
      ativo = false;
      data.subscription.unsubscribe();
    };
  }, [carregarDados]);

  const valor: SessaoContexto = {
    carregando,
    sessao,
    perfil,
    email: sessao?.user.email ?? null,
    ehAdmin,
    recarregar: () => carregarDados(sessao),
    sair: async () => {
      await supabase.auth.signOut();
    },
  };

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useSessao = () => useContext(Contexto);

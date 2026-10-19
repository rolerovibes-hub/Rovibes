import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Aplicativo, porCodigo } from "./catalogo";
import { supabase } from "./supabase";
import { useSessao } from "./sessao";
import { ler, gravar } from "./armazenamento";

export type Papel = "proprietario" | "gestor" | "equipe";
export type Situacao = "pendente" | "aprovado" | "recusado" | "suspenso";

export interface Vinculo {
  estabelecimento_id: string;
  papel: Papel;
  cargo: string | null;
  estabelecimento: { id: string; nome: string; situacao: Situacao; motivo_situacao: string | null };
}

interface Uso {
  codigo: string;
  vezes: number;
  ultimo_em: string;
}

/** Cor e ícone que a pessoa escolheu para um app da tela inicial (null = padrão). */
export interface EstiloApp {
  cor: string | null;
  icone: string | null;
}

interface BusinessContexto {
  carregando: boolean;
  vinculos: Vinculo[];
  atual: Vinculo | null;
  escolherEstabelecimento: (id: string) => void;
  temAcesso: (a: Aplicativo) => boolean;
  favoritos: Aplicativo[];
  maisUsados: Aplicativo[];
  usoPercentual: { app: Aplicativo; pct: number }[];
  ultimos: { app: Aplicativo; quando: number }[];
  ehFavorito: (codigo: string) => boolean;
  foiSolicitado: (codigo: string) => boolean;
  alternarFavorito: (codigo: string) => Promise<void>;
  moverFavorito: (codigo: string, direcao: -1 | 1) => Promise<void>;
  ordenarFavoritos: (visiveis: string[]) => Promise<void>;
  estiloDe: (codigo: string) => EstiloApp;
  definirEstilo: (codigo: string, estilo: Partial<EstiloApp> | null) => Promise<void>;
  registrarUso: (codigo: string) => void;
  solicitarAcesso: (codigo: string) => Promise<void>;
  recarregar: () => Promise<void>;
}

const Contexto = createContext<BusinessContexto | null>(null);

const apps = (codigos: string[]) => codigos.map(porCodigo).filter((a): a is Aplicativo => !!a);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { sessao, ehAdmin } = useSessao();
  const usuario = sessao?.user.id;
  const [carregando, setCarregando] = useState(true);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [atualId, setAtualId] = useState<string | null>(() => ler<string | null>("estabelecimento_id", null));
  const [liberados, setLiberados] = useState<Set<string>>(new Set());
  const [favoritos, setFavoritos] = useState<string[]>([]);
  const [usos, setUsos] = useState<Uso[]>([]);
  const [estilos, setEstilos] = useState<Record<string, EstiloApp>>(() => ler<Record<string, EstiloApp>>("estilos_apps", {}));
  // false enquanto a atualização 030 não foi aplicada: aí o estilo fica só neste aparelho.
  const [estiloNoBanco, setEstiloNoBanco] = useState(true);
  const [solicitados, setSolicitados] = useState<string[]>([]);

  const atual = vinculos.find((v) => v.estabelecimento_id === atualId) ?? vinculos[0] ?? null;

  const recarregar = useCallback(async () => {
    if (!usuario) return;
    const [v, f, u, s] = await Promise.all([
      supabase
        .from("membros")
        .select("estabelecimento_id, papel, cargo, estabelecimento:estabelecimentos(id, nome, situacao, motivo_situacao)")
        .eq("usuario_id", usuario)
        .eq("ativo", true),
      supabase
        .from("favoritos")
        .select("codigo, ordem, cor, icone")
        .eq("usuario_id", usuario)
        .order("ordem")
        .then(async (r) => {
          if (!r.error) return { ...r, novo: true };
          const velho = await supabase.from("favoritos").select("codigo, ordem").eq("usuario_id", usuario).order("ordem");
          return { ...velho, novo: false };
        }),
      supabase.from("usos_aplicativo").select("codigo, vezes, ultimo_em").eq("usuario_id", usuario),
      supabase.from("solicitacoes_acesso").select("codigo").eq("usuario_id", usuario).eq("situacao", "pendente"),
    ]);
    setVinculos(((v.data ?? []) as unknown as Vinculo[]).filter((x) => x.estabelecimento));
    const linhas = (f.data ?? []) as { codigo: string; cor?: string | null; icone?: string | null }[];
    setFavoritos(linhas.map((x) => x.codigo));
    setEstiloNoBanco(f.novo);
    if (f.novo) setEstilos(Object.fromEntries(linhas.filter((x) => x.cor || x.icone).map((x) => [x.codigo, { cor: x.cor ?? null, icone: x.icone ?? null }])));
    setUsos((u.data ?? []) as Uso[]);
    setSolicitados((s.data ?? []).map((x) => x.codigo as string));
    setCarregando(false);
  }, [usuario]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  // Aplicativos liberados individualmente no estabelecimento atual.
  useEffect(() => {
    if (!usuario || !atual || atual.papel === "proprietario") {
      setLiberados(new Set());
      return;
    }
    supabase
      .from("acessos")
      .select("codigo")
      .eq("usuario_id", usuario)
      .eq("estabelecimento_id", atual.estabelecimento_id)
      .then(({ data }) => setLiberados(new Set((data ?? []).map((x) => x.codigo as string))));
  }, [usuario, atual]);

  const temAcesso = useCallback(
    (a: Aplicativo) => {
      if (a.padrao) return true;
      if (a.area === "Administração") return ehAdmin;
      if (!atual) return false;
      return atual.papel === "proprietario" || liberados.has(a.codigo);
    },
    [ehAdmin, atual, liberados],
  );

  const alternarFavorito = useCallback(
    async (codigo: string) => {
      if (!usuario) return;
      if (favoritos.includes(codigo)) {
        setFavoritos((f) => f.filter((c) => c !== codigo));
        setEstilos((e) => {
          const n = { ...e };
          delete n[codigo];
          return n;
        });
        await supabase.from("favoritos").delete().eq("usuario_id", usuario).eq("codigo", codigo);
      } else {
        setFavoritos((f) => [...f, codigo]);
        await supabase.from("favoritos").insert({ codigo, ordem: favoritos.length });
      }
    },
    [usuario, favoritos],
  );

  const moverFavorito = useCallback(
    async (codigo: string, direcao: -1 | 1) => {
      if (!usuario) return;
      const i = favoritos.indexOf(codigo);
      const j = i + direcao;
      if (i < 0 || j < 0 || j >= favoritos.length) return;
      const novo = [...favoritos];
      [novo[i], novo[j]] = [novo[j], novo[i]];
      setFavoritos(novo);
      await supabase.from("favoritos").upsert(novo.map((c, ordem) => ({ usuario_id: usuario, codigo: c, ordem })));
    },
    [usuario, favoritos],
  );

  const ordenarFavoritos = useCallback(
    async (visiveis: string[]) => {
      if (!usuario) return;
      // Só os apps visíveis mudam de lugar; os demais ficam onde estavam.
      let k = 0;
      const novo = favoritos.map((c) => (visiveis.includes(c) ? visiveis[k++] : c));
      setFavoritos(novo);
      const { error } = await supabase.rpc("ordenar_favoritos", { p_codigos: novo });
      if (error) await supabase.from("favoritos").upsert(novo.map((c, ordem) => ({ usuario_id: usuario, codigo: c, ordem })));
    },
    [usuario, favoritos],
  );

  const definirEstilo = useCallback(
    async (codigo: string, estilo: Partial<EstiloApp> | null) => {
      if (!usuario) return;
      const atualEstilo = estilos[codigo] ?? { cor: null, icone: null };
      const novo: EstiloApp = estilo === null ? { cor: null, icone: null } : { ...atualEstilo, ...estilo };
      const proximos = { ...estilos };
      if (!novo.cor && !novo.icone) delete proximos[codigo];
      else proximos[codigo] = novo;
      setEstilos(proximos);
      if (estiloNoBanco) {
        const { error } = await supabase.from("favoritos").update({ cor: novo.cor, icone: novo.icone }).eq("usuario_id", usuario).eq("codigo", codigo);
        if (!error) return;
        setEstiloNoBanco(false);
      }
      gravar("estilos_apps", proximos);
    },
    [usuario, estilos, estiloNoBanco],
  );

  const registrarUso = useCallback(
    (codigo: string) => {
      if (!usuario) return;
      setUsos((atuais) => {
        const agora = new Date().toISOString();
        const existe = atuais.find((u) => u.codigo === codigo);
        return existe
          ? atuais.map((u) => (u.codigo === codigo ? { ...u, vezes: u.vezes + 1, ultimo_em: agora } : u))
          : [...atuais, { codigo, vezes: 1, ultimo_em: agora }];
      });
      void supabase.rpc("registrar_uso", { p_codigo: codigo });
    },
    [usuario],
  );

  const solicitarAcesso = useCallback(
    async (codigo: string) => {
      if (!usuario) return;
      setSolicitados((s) => [...s, codigo]);
      await supabase.from("solicitacoes_acesso").insert({
        codigo,
        estabelecimento_id: porCodigo(codigo)?.area === "Administração" ? null : atual?.estabelecimento_id ?? null,
      });
    },
    [usuario, atual],
  );

  const escolherEstabelecimento = (id: string) => {
    setAtualId(id);
    gravar("estabelecimento_id", id);
  };

  const valor = useMemo<BusinessContexto>(
    () => ({
      carregando,
      vinculos,
      atual,
      escolherEstabelecimento,
      temAcesso,
      favoritos: apps(favoritos).filter(temAcesso),
      maisUsados: apps([...usos].sort((a, b) => b.vezes - a.vezes).slice(0, 5).map((u) => u.codigo)).filter(temAcesso),
      usoPercentual: (() => {
        const limite = Date.now() - 30 * 86400000;
        const validos = usos.filter((u) => Date.parse(u.ultimo_em) >= limite && porCodigo(u.codigo) && temAcesso(porCodigo(u.codigo)!));
        const total = validos.reduce((s, u) => s + u.vezes, 0) || 1;
        return [...validos]
          .sort((a, b) => b.vezes - a.vezes)
          .slice(0, 5)
          .map((u) => ({ app: porCodigo(u.codigo)!, pct: Math.round((u.vezes / total) * 100) }));
      })(),
      ultimos: [...usos]
        .sort((a, b) => b.ultimo_em.localeCompare(a.ultimo_em))
        .slice(0, 5)
        .map((u) => ({ app: porCodigo(u.codigo), quando: Date.parse(u.ultimo_em) }))
        .filter((x): x is { app: Aplicativo; quando: number } => !!x.app),
      ehFavorito: (c) => favoritos.includes(c),
      foiSolicitado: (c) => solicitados.includes(c),
      alternarFavorito,
      moverFavorito,
      ordenarFavoritos,
      estiloDe: (c) => estilos[c] ?? { cor: null, icone: null },
      definirEstilo,
      registrarUso,
      solicitarAcesso,
      recarregar,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [carregando, vinculos, atual, temAcesso, favoritos, usos, solicitados, alternarFavorito, moverFavorito, ordenarFavoritos, estilos, definirEstilo, registrarUso, solicitarAcesso, recarregar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useBusiness() {
  const c = useContext(Contexto);
  if (!c) throw new Error("useBusiness fora do BusinessProvider");
  return c;
}

export const NOME_PAPEL: Record<Papel, string> = { proprietario: "Proprietário", gestor: "Gestor", equipe: "Equipe" };

export const NOME_SITUACAO: Record<Situacao, string> = {
  pendente: "Aguardando aprovação",
  aprovado: "Aprovado",
  recusado: "Recusado",
  suspenso: "Suspenso",
};

export function tempoRelativo(ms: number) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

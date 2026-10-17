import { useCallback, useState } from "react";
import { CATALOGO, porCodigo, Aplicativo } from "./catalogo";
import { ler, gravar } from "./armazenamento";

// Usuário de demonstração enquanto o login com Supabase não entra.
export const USUARIO_DEMO = {
  nome: "Ana Ribeiro",
  cargo: "Proprietária",
  email: "ana@exemplo.com",
  estabelecimento: "Casa Aurora",
  estabelecimentos: ["Casa Aurora", "Varanda 38"],
};

// Na demonstração, a proprietária acessa tudo do Business, mas não a Administração.
export const CODIGOS_COM_ACESSO = new Set(CATALOGO.filter((a) => a.area !== "Administração").map((a) => a.codigo));

export const temAcesso = (a: Aplicativo) => !!a.padrao || CODIGOS_COM_ACESSO.has(a.codigo);

const FAVORITOS_INICIAIS = ["G1001", "G4001", "G5001", "G5003", "T7001", "C8001"];

interface Uso {
  codigo: string;
  vezes: number;
  ultimo: number;
}

export function useAcessos() {
  const [favoritos, setFavoritos] = useState<string[]>(() => ler("favoritos", FAVORITOS_INICIAIS));
  const [usos, setUsos] = useState<Uso[]>(() => ler<Uso[]>("usos", []));
  const [solicitados, setSolicitados] = useState<string[]>(() => ler<string[]>("solicitados", []));

  const alternarFavorito = useCallback((codigo: string) => {
    setFavoritos((atual) => {
      const novo = atual.includes(codigo) ? atual.filter((c) => c !== codigo) : [...atual, codigo];
      gravar("favoritos", novo);
      return novo;
    });
  }, []);

  const moverFavorito = useCallback((codigo: string, direcao: -1 | 1) => {
    setFavoritos((atual) => {
      const i = atual.indexOf(codigo);
      const j = i + direcao;
      if (i < 0 || j < 0 || j >= atual.length) return atual;
      const novo = [...atual];
      [novo[i], novo[j]] = [novo[j], novo[i]];
      gravar("favoritos", novo);
      return novo;
    });
  }, []);

  const registrarUso = useCallback((codigo: string) => {
    setUsos((atual) => {
      const existente = atual.find((u) => u.codigo === codigo);
      const novo = existente
        ? atual.map((u) => (u.codigo === codigo ? { ...u, vezes: u.vezes + 1, ultimo: Date.now() } : u))
        : [...atual, { codigo, vezes: 1, ultimo: Date.now() }];
      gravar("usos", novo);
      return novo;
    });
  }, []);

  const solicitarAcesso = useCallback((codigo: string) => {
    setSolicitados((atual) => {
      const novo = atual.includes(codigo) ? atual : [...atual, codigo];
      gravar("solicitados", novo);
      return novo;
    });
  }, []);

  const apps = (codigos: string[]) => codigos.map(porCodigo).filter((a): a is Aplicativo => !!a);

  return {
    favoritos: apps(favoritos),
    maisUsados: apps([...usos].sort((a, b) => b.vezes - a.vezes).slice(0, 5).map((u) => u.codigo)),
    ultimos: [...usos]
      .sort((a, b) => b.ultimo - a.ultimo)
      .slice(0, 5)
      .map((u) => ({ app: porCodigo(u.codigo), quando: u.ultimo }))
      .filter((x): x is { app: Aplicativo; quando: number } => !!x.app),
    ehFavorito: (codigo: string) => favoritos.includes(codigo),
    foiSolicitado: (codigo: string) => solicitados.includes(codigo),
    alternarFavorito,
    moverFavorito,
    registrarUso,
    solicitarAcesso,
  };
}

export function tempoRelativo(ms: number) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

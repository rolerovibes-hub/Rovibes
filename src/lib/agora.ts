import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Movimento } from "@/components/Marca";

export type Confianca = "alta" | "media" | "baixa";
export type Visibilidade = "publico" | "amigos" | "privado";

export interface PessoaPresente {
  id: string;
  nome: string;
  usuario: string | null;
  foto_url: string | null;
}

export interface Amigos {
  pessoas: PessoaPresente[];
  identificados: number;
  anonimos: number;
  presentes: number;
}

export interface EventoHoje {
  id: string;
  nome: string;
  inicio: string;
  fim: string | null;
  entrada: string | null;
  capa_url: string | null;
  estilos: string[];
}

export interface Agora {
  movimento: { nivel: Movimento | null; fonte?: "equipe" | "comunidade"; em?: string; confianca?: Confianca; respostas?: number; ultimo_em?: string | null };
  musica_agora: { texto: string; em: string; fonte: "equipe" } | null;
  musica_prevista: string[];
  prevista_de: "programacao" | "estilos_da_casa" | null;
  estilos_da_casa: string[];
  hoje: EventoHoje[];
  amigos: Amigos;
  agora: string;
}

/** "há 8 min", "há 2 h", "ontem". */
export function haQuanto(iso: string | null | undefined) {
  if (!iso) return "";
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export const NOME_FONTE = { equipe: "pela equipe", comunidade: "por quem está lá" } as const;

/** Tudo o que se sabe sobre o lugar agora, com origem e horário. null = banco ainda sem a atualização 031. */
export function useAgora(estab: string | null | undefined) {
  const [agora, setAgora] = useState<Agora | null | undefined>(undefined);
  const carregar = useCallback(async () => {
    if (!estab) return;
    const { data, error } = await supabase.rpc("agora_no_lugar", { p_estab: estab });
    setAgora(error || !data ? null : (data as Agora));
  }, [estab]);
  useEffect(() => {
    void carregar();
    const t = window.setInterval(() => void carregar(), 120000);
    return () => window.clearInterval(t);
  }, [carregar]);
  return { agora, recarregar: carregar };
}

/** Minha presença (check-in ativo) no lugar. */
export function useMinhaPresenca(estab: string, usuario: string) {
  const [presenca, setPresenca] = useState<{ visibilidade: Visibilidade; desde: string; ate: string } | null>(null);
  const carregar = useCallback(async () => {
    if (!usuario) return setPresenca(null);
    const { data } = await supabase.rpc("minha_presenca", { p_estab: estab });
    const r = ((data ?? []) as { visibilidade: Visibilidade; desde: string; ate: string }[])[0];
    setPresenca(r ?? null);
  }, [estab, usuario]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  return { presenca, recarregar: carregar };
}

export const VISIBILIDADES: { valor: Visibilidade; nome: string; texto: string }[] = [
  { valor: "publico", nome: "Público", texto: "Quem segue você vê que você está aqui." },
  { valor: "amigos", nome: "Amigos", texto: "Só quem você segue e segue você de volta." },
  { valor: "privado", nome: "Privado", texto: "Ninguém vê seu nome. Você conta só para o movimento do lugar." },
];

export async function mudarPresenca(estab: string, v: Visibilidade) {
  const { error } = await supabase.rpc("mudar_presenca", { p_estab: estab, p_visibilidade: v });
  if (error) throw error;
}

export async function sairDoLugar(estab: string) {
  const { error } = await supabase.rpc("sair_do_lugar", { p_estab: estab });
  if (error) throw error;
}

export async function confirmarMovimento(estab: string, nivel: Movimento) {
  const { error } = await supabase.rpc("confirmar_movimento", { p_estab: estab, p_nivel: nivel });
  if (error) throw error;
}

/** Pessoas que eu sigo presentes em vários lugares (para cartões do feed e do mapa). */
export function usePresencaAmigos(ids: string[], usuario: string) {
  const [mapa, setMapa] = useState<Map<string, Amigos>>(new Map());
  const chave = ids.join(",");
  useEffect(() => {
    if (!usuario || !ids.length) return setMapa(new Map());
    supabase.rpc("presenca_amigos", { p_ids: ids }).then(({ data, error }) => {
      if (error) return;
      setMapa(new Map(((data ?? []) as (Amigos & { estabelecimento_id: string })[]).map((a) => [a.estabelecimento_id, a])));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, usuario]);
  return mapa;
}

// ------------------------------------------------------------
// Clima (Open-Meteo: serviço público e gratuito, sem chave)
// ------------------------------------------------------------
export interface Clima {
  temperatura: number;
  texto: string;
}

const cacheClima = new Map<string, { em: number; clima: Clima }>();

function descreverClima(codigo: number, t: number, dia: boolean): string {
  const periodo = dia ? "Dia" : "Noite";
  if ([95, 96, 99].includes(codigo)) return "Tempestade";
  if (codigo >= 61 && codigo <= 82) return codigo >= 80 ? "Pancadas de chuva" : "Chuva";
  if (codigo >= 51 && codigo <= 57) return "Garoa";
  if (codigo === 45 || codigo === 48) return "Neblina";
  if (t >= 30) return `${periodo} quente`;
  if (t <= 15) return `${periodo} fria`;
  if (codigo <= 1) return `${periodo} agradável`;
  if (codigo <= 3) return dia ? "Dia nublado" : "Noite nublada";
  return `${periodo} agradável`;
}

export async function buscarClima(lat: number, lng: number): Promise<Clima | null> {
  const chave = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const c = cacheClima.get(chave);
  if (c && Date.now() - c.em < 30 * 60000) return c.clima;
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&current=temperature_2m,weather_code,is_day&timezone=America%2FSao_Paulo`,
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { current?: { temperature_2m: number; weather_code: number; is_day: number } };
    if (!j.current) return null;
    const clima = { temperatura: Math.round(j.current.temperature_2m), texto: descreverClima(j.current.weather_code, j.current.temperature_2m, j.current.is_day === 1) };
    cacheClima.set(chave, { em: Date.now(), clima });
    return clima;
  } catch {
    return null;
  }
}

/** Localização só se a pessoa já liberou (não pede de novo). */
export async function posicaoSeLiberada(): Promise<[number, number] | null> {
  try {
    const s = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (s?.state !== "granted") return null;
    return await new Promise((ok) =>
      navigator.geolocation.getCurrentPosition(
        (p) => ok([p.coords.latitude, p.coords.longitude]),
        () => ok(null),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      ),
    );
  } catch {
    return null;
  }
}

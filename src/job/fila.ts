import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CAMPOS_ITEM_FILA, ItemFila, normalizarItensFila, SituacaoItem, useAoVivo } from "@/lib/salao";

/** Itens do estabelecimento nas situações pedidas, sempre atualizados (tempo real). */
export function useItensFila(estab: string | undefined, situacoes: SituacaoItem[], aoChegarNovo?: () => void) {
  const [itens, setItens] = useState<ItemFila[] | null>(null);
  const [conectado, setConectado] = useState(true);
  const conhecidos = useRef<Set<string> | null>(null);
  const aviso = useRef(aoChegarNovo);
  aviso.current = aoChegarNovo;
  const chave = situacoes.join(",");

  const carregar = useCallback(async () => {
    if (!estab) return;
    const { data, error } = await supabase
      .from("pedido_itens")
      .select(CAMPOS_ITEM_FILA)
      .eq("estabelecimento_id", estab)
      .in("situacao", chave.split(","))
      .limit(500);
    if (error) {
      setConectado(false);
      return;
    }
    setConectado(true);
    const lista = normalizarItensFila(data).sort((a, b) => (a.pedido!.criado_em < b.pedido!.criado_em ? -1 : 1));
    const ids = new Set(lista.map((i) => i.id));
    if (conhecidos.current && [...ids].some((i) => !conhecidos.current!.has(i))) aviso.current?.();
    conhecidos.current = ids;
    setItens(lista);
  }, [estab, chave]);

  useEffect(() => {
    conhecidos.current = null;
    setItens(null);
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const offline = () => setConectado(false);
    const online = () => void carregar();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [carregar]);

  useAoVivo(`fila-${chave}`, { itens: `estabelecimento_id=eq.${estab}` }, () => void carregar(), !!estab);
  return { itens, carregar, conectado };
}

/** Agrupa itens por pedido, mantendo a ordem de chegada. */
export function porPedido(itens: ItemFila[]) {
  const mapa = new Map<string, ItemFila[]>();
  for (const i of itens) mapa.set(i.pedido!.id, [...(mapa.get(i.pedido!.id) ?? []), i]);
  return [...mapa.values()];
}

/** Bip curto quando chega item novo (sem arquivo de som). */
export function bip() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
    o.onended = () => void ctx.close();
  } catch {
    /* sem áudio */
  }
  navigator.vibrate?.(80);
}

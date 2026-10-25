import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { reduzirImagem } from "./imagens";
import { capaDoVideo, comPrazo, extensao, liberarMidia, MAX_VIDEO_BYTES, OpcoesVideo, regravarVideo, subirComProgresso } from "./midia";
import { apagarEnvio, EnvioGuardado, guardarEnvio, listarEnvios } from "./rascunhosEnvio";

export type Destino = "feed" | "story";

export type MidiaEnvio =
  | { tipo: "foto"; arquivo: File | Blob }
  /** Uma ou mais fotos (carrossel no feed), com música opcional. */
  | { tipo: "fotos"; arquivos: (File | Blob)[]; musicaId: string | null }
  | { tipo: "video"; arquivo: File | Blob; regravar: boolean; opcoes: OpcoesVideo; musicaId: string | null };

/** Arquivo principal (capa) de um envio. */
export const arquivoDaMidia = (m: MidiaEnvio) => (m.tipo === "fotos" ? m.arquivos[0] : m.arquivo);

export interface PedidoPublicacao {
  destino: Destino;
  midia: MidiaEnvio;
  legenda: string | null;
  localId: string | null;
  /** Hashtags escolhidas (sem #). */
  tags?: string[];
}

export interface Envio {
  id: string;
  pedido: PedidoPublicacao;
  previa: string | null;
  /** rascunho = ficou guardado no aparelho (interrompido ou falhou) esperando continuar. */
  estado: "preparando" | "enviando" | "publicado" | "erro" | "rascunho";
  /** 0 a 1, somando as etapas (regravar o vídeo, enviar). */
  progresso: number;
  erro?: string;
  /** Caminho no armazenamento e id da publicação: fixos, para reenviar sem duplicar. */
  base?: string;
  postId?: string;
  usuario?: string;
  criado_em?: number;
}

interface Contexto {
  envios: Envio[];
  publicar: (p: PedidoPublicacao, previa: string | null) => void;
  tentarDeNovo: (id: string) => void;
  descartar: (id: string) => void;
}

const Ctx = createContext<Contexto | null>(null);

/**
 * Publicações em segundo plano: a pessoa toca em "Publicar" e continua usando o app.
 * Uma por vez, com progresso; ao terminar, avisa as telas (evento "rovibes:publicou").
 */
export function EnviosProvider({ children }: { children: ReactNode }) {
  const [envios, setEnvios] = useState<Envio[]>([]);
  const fila = useRef<string[]>([]);
  const rodando = useRef(false);
  const lista = useRef<Envio[]>([]);
  lista.current = envios;

  const mudar = useCallback((id: string, m: Partial<Envio>) => setEnvios((l) => l.map((e) => (e.id === id ? { ...e, ...m } : e))), []);

  const executar = useCallback(
    async (e: Envio) => {
      const { data: s } = await supabase.auth.getSession();
      const eu = s.session?.user.id;
      if (!eu) throw new Error("Entre na sua conta para publicar.");
      const { destino, midia, legenda, localId, tags } = e.pedido;
      const base = e.base ?? `${eu}/${destino === "feed" ? "post" : "story"}-${crypto.randomUUID()}`;
      const postId = e.postId ?? crypto.randomUUID();
      const caminhos: string[] = [];
      let foto_url: string;
      let video_url: string | null = null;
      let duracao: number | null = null;
      let fotos: string[] | null = null;
      try {
        if (midia.tipo === "fotos") {
          mudar(e.id, { estado: "preparando", progresso: 0.03 });
          const n = midia.arquivos.length;
          fotos = [];
          for (let i = 0; i < n; i++) {
            const blob = await reduzirImagem(midia.arquivos[i] as File, 1440);
            mudar(e.id, { estado: "enviando" });
            const caminho = n === 1 ? `${base}.jpg` : `${base}-${i + 1}.jpg`;
            caminhos.push(caminho);
            fotos.push(await subirComProgresso("avatares", caminho, blob, "image/jpeg", (p) => mudar(e.id, { progresso: 0.05 + ((i + p) / n) * 0.9 })));
          }
          foto_url = fotos[0];
        } else if (midia.tipo === "foto") {
          mudar(e.id, { estado: "preparando", progresso: 0.05 });
          const blob = await reduzirImagem(midia.arquivo as File, 1440);
          mudar(e.id, { estado: "enviando" });
          caminhos.push(`${base}.jpg`);
          foto_url = await subirComProgresso("avatares", `${base}.jpg`, blob, "image/jpeg", (p) => mudar(e.id, { progresso: 0.1 + p * 0.85 }));
        } else {
          mudar(e.id, { estado: "preparando", progresso: 0.02 });
          let video: Blob = midia.arquivo;
          let tipo = midia.arquivo.type || "video/mp4";
          duracao = midia.opcoes.duracao;
          // Etapa 1: regravar (trecho de até 3 min e o som escolhido), só quando precisa.
          if (midia.regravar) {
            const r = await regravarVideo(midia.arquivo, midia.opcoes, (p) => mudar(e.id, { progresso: 0.02 + p * 0.5 }));
            video = r.blob;
            tipo = r.tipo;
            duracao = r.duracao;
            // Guarda o vídeo já pronto: se fechar o app agora, continua daqui sem refazer.
            const pronto: PedidoPublicacao = { ...e.pedido, midia: { ...midia, arquivo: video, regravar: false, opcoes: { ...midia.opcoes, duracao: r.duracao } } };
            e.pedido = pronto;
            mudar(e.id, { pedido: pronto });
            void guardarEnvio(paraGuardar({ ...e, pedido: pronto, base, postId, usuario: eu }, "pendente"));
          }
          const capa = await comPrazo(capaDoVideo(video, 0.2), 15000, "sem capa").catch(() => null);
          mudar(e.id, { estado: "enviando", progresso: midia.regravar ? 0.55 : 0.1 });
          const ini = midia.regravar ? 0.55 : 0.1;
          if (capa) {
            caminhos.push(`${base}.jpg`);
            foto_url = await subirComProgresso("avatares", `${base}.jpg`, capa, "image/jpeg");
          } else foto_url = "";
          if (video.size > MAX_VIDEO_BYTES) throw new Error("Vídeo pesado demais. Escolha um trecho menor.");
          caminhos.push(`${base}.${extensao(tipo)}`);
          video_url = await subirComProgresso("avatares", `${base}.${extensao(tipo)}`, video, tipo, (p) => mudar(e.id, { progresso: ini + p * (0.97 - ini) }));
          if (!foto_url) foto_url = video_url;
        }
        const extras: Record<string, unknown> =
          midia.tipo === "video"
            ? { video_url, duracao: duracao ? Math.round(duracao * 100) / 100 : null, musica_id: midia.musicaId }
            : midia.tipo === "fotos" && midia.musicaId
              ? { musica_id: midia.musicaId }
              : {};
        // Carrossel só no feed; hashtags quando houver (atualização 054).
        if (destino === "feed" && fotos && fotos.length > 1) extras.fotos = fotos;
        if (tags?.length) extras.tags = tags;
        const linha: Record<string, unknown> =
          destino === "feed" ? { id: postId, foto_url, texto: legenda, estabelecimento_id: localId, ...extras } : { id: postId, foto_url, legenda, estabelecimento_id: localId, ...extras };
        const { error } = await comPrazo(
          Promise.resolve(supabase.from(destino === "feed" ? "publicacoes_pessoas" : "stories_pessoas").insert(linha)),
          30000,
          "Sem resposta do servidor. Toque em ↻ para tentar de novo.",
        );
        // Já tinha publicado antes de o app fechar: não duplica.
        if (error && (error.code === "23505" || /duplicate key/i.test(error.message))) return;
        if (error) {
          throw /column|schema cache/i.test(error.message)
            ? new Error(extras.fotos || extras.tags ? "Para carrossel e hashtags, falta aplicar a atualização 054 do banco." : "Para publicar vídeos, falta aplicar a atualização 036 do banco.")
            : /relation|does not exist/i.test(error.message)
              ? new Error(`Falta aplicar a atualização ${destino === "feed" ? "027" : "013"} do banco.`)
              : error;
        }
      } catch (err) {
        if (caminhos.length) await supabase.storage.from("avatares").remove(caminhos).catch(() => undefined);
        throw err;
      }
    },
    [mudar],
  );

  const proximo = useCallback(async (): Promise<void> => {
    if (rodando.current) return;
    const id = fila.current.shift();
    if (!id) return;
    const e = lista.current.find((x) => x.id === id);
    if (!e) return void proximo();
    rodando.current = true;
    try {
      // Guarda no aparelho antes de começar (com caminho e id fixos).
      const { data: s } = await supabase.auth.getSession();
      const eu = s.session?.user.id;
      if (eu) {
        e.base ??= `${eu}/${e.pedido.destino === "feed" ? "post" : "story"}-${crypto.randomUUID()}`;
        e.postId ??= crypto.randomUUID();
        e.usuario = eu;
        e.criado_em ??= Date.now();
        mudar(id, { base: e.base, postId: e.postId, usuario: eu, criado_em: e.criado_em });
        await guardarEnvio(paraGuardar(e, "pendente"));
      }
      await executar(e);
      await apagarEnvio(id);
      mudar(id, { estado: "publicado", progresso: 1 });
      window.dispatchEvent(new CustomEvent("rovibes:publicou", { detail: e.pedido.destino }));
      window.setTimeout(() => setEnvios((l) => l.filter((x) => x.id !== id || x.estado !== "publicado")), 4000);
    } catch (err) {
      const erro = err instanceof Error ? err.message : "Não foi possível publicar.";
      mudar(id, { estado: "erro", erro });
      // Continua guardado como rascunho para tentar de novo depois.
      if (e.usuario && e.base && e.postId) void guardarEnvio({ ...paraGuardar(e, "rascunho"), erro });
    }
    rodando.current = false;
    void proximo();
  }, [executar, mudar]);

  const publicar = useCallback(
    (pedido: PedidoPublicacao, previa: string | null) => {
      const id = crypto.randomUUID();
      const novo: Envio = { id, pedido, previa, estado: "preparando", progresso: 0 };
      lista.current = [...lista.current, novo];
      setEnvios(lista.current);
      fila.current.push(id);
      void proximo();
    },
    [proximo],
  );

  const tentarDeNovo = useCallback(
    (id: string) => {
      // O toque libera som e vídeo para refazer o trecho com música, se precisar.
      if (lista.current.find((x) => x.id === id)?.pedido.midia.tipo === "video") liberarMidia();
      mudar(id, { estado: "preparando", progresso: 0, erro: undefined });
      fila.current.push(id);
      void proximo();
    },
    [mudar, proximo],
  );

  const descartar = useCallback((id: string) => {
    setEnvios((l) => {
      const e = l.find((x) => x.id === id);
      if (e?.previa) URL.revokeObjectURL(e.previa);
      return l.filter((x) => x.id !== id);
    });
    void apagarEnvio(id);
  }, []);

  // Ao abrir o app: o que ficou no meio do envio continua sozinho; o que falhou aparece como rascunho.
  const restaurou = useRef<string | null>(null);
  useEffect(() => {
    const restaurar = async (eu: string | undefined) => {
      if (!eu || restaurou.current === eu) return;
      restaurou.current = eu;
      const guardados = await listarEnvios(eu);
      const novos: Envio[] = guardados
        .filter((g) => !lista.current.some((x) => x.id === g.id))
        .map((g) => ({
          id: g.id,
          pedido: g.pedido,
          previa: URL.createObjectURL(arquivoDaMidia(g.pedido.midia)),
          base: g.base,
          postId: g.postId,
          usuario: g.usuario,
          criado_em: g.criado_em,
          progresso: 0,
          // Vídeo que ainda precisa ser refeito (trecho/música) espera um toque: o navegador só libera o som assim.
          estado: g.estado === "pendente" && !(g.pedido.midia.tipo === "video" && g.pedido.midia.regravar) ? "preparando" : "rascunho",
          erro: g.estado === "rascunho" ? g.erro : undefined,
        }));
      if (!novos.length) return;
      lista.current = [...lista.current, ...novos];
      setEnvios(lista.current);
      for (const n of novos) if (n.estado === "preparando") fila.current.push(n.id);
      void proximo();
    };
    void supabase.auth.getSession().then(({ data }) => restaurar(data.session?.user.id));
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, sessao) => void restaurar(sessao?.user.id));
    return () => sub.subscription.unsubscribe();
  }, [proximo]);

  // Fechar o app no meio do envio: a publicação fica guardada e continua depois, mas avisa mesmo assim.
  const ativos = envios.some((e) => e.estado === "preparando" || e.estado === "enviando");
  useEffect(() => {
    if (!ativos) return;
    const aviso = (ev: BeforeUnloadEvent) => {
      ev.preventDefault();
      ev.returnValue = "";
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [ativos]);

  return <Ctx.Provider value={{ envios, publicar, tentarDeNovo, descartar }}>{children}</Ctx.Provider>;
}

function paraGuardar(e: Envio, estado: EnvioGuardado["estado"]): EnvioGuardado {
  return { id: e.id, usuario: e.usuario!, pedido: e.pedido, base: e.base!, postId: e.postId!, estado, erro: e.erro, criado_em: e.criado_em ?? Date.now() };
}

export function useEnvios() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useEnvios fora do EnviosProvider");
  return c;
}

import { supabase } from "./supabase";

/** Vídeos do RoVibes: até 3 minutos. */
export const MAX_VIDEO = 180;
/** Tamanho máximo do arquivo de vídeo enviado (limite do armazenamento). */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** 75 → "1:15"; 12 → "12 s". */
export const tempoVideo = (s: number) => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

export type AudioVideo = "original" | "mudo" | "musica" | "mistura";

export interface OpcoesVideo {
  /** Segundo do vídeo original onde começa o trecho. */
  inicio: number;
  /** Duração do trecho (até 3 min). */
  duracao: number;
  audio: AudioVideo;
  musicaUrl?: string | null;
  /** Segundo da música onde começa. */
  musicaInicio?: number;
}

export interface Musica {
  id: string;
  titulo: string;
  artista: string | null;
  estilo: string | null;
  arquivo_url: string;
  duracao: number | null;
  licenca: string;
}

export async function listarMusicas(): Promise<Musica[] | null> {
  const { data, error } = await supabase.from("musicas").select("id, titulo, artista, estilo, arquivo_url, duracao, licenca").eq("ativa", true).order("ordem").order("titulo");
  if (error) return null;
  return (data ?? []) as Musica[];
}

export const ehVideo = (f: Blob) => f.type.startsWith("video/");

/** Duração e tamanho de um vídeo. */
export function lerVideo(arquivo: Blob): Promise<{ duracao: number; largura: number; altura: number }> {
  return new Promise((ok, falha) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(arquivo);
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    const fim = (r?: { duracao: number; largura: number; altura: number }, e?: Error) => {
      URL.revokeObjectURL(url);
      if (r) ok(r);
      else falha(e ?? new Error("Não foi possível abrir este vídeo."));
    };
    v.onloadedmetadata = () => {
      // Alguns celulares informam duração "Infinity" até ler o arquivo todo.
      if (!Number.isFinite(v.duration)) {
        v.currentTime = 1e7;
        v.ontimeupdate = () => {
          v.ontimeupdate = null;
          fim({ duracao: v.duration, largura: v.videoWidth, altura: v.videoHeight });
        };
        return;
      }
      fim({ duracao: v.duration, largura: v.videoWidth, altura: v.videoHeight });
    };
    v.onerror = () => fim(undefined, new Error("Este formato de vídeo não abre neste aparelho. Tente gravar pela câmera do RoVibes."));
    v.src = url;
  });
}

/** Espera um evento do vídeo; sem resposta no prazo, desiste (alguns celulares nunca avisam). */
const esperar = (el: HTMLMediaElement, evento: string, ms = 15000) =>
  new Promise<void>((ok, falha) => {
    const t = window.setTimeout(() => falha(new Error("O vídeo demorou demais para abrir neste aparelho.")), ms);
    el.addEventListener(
      evento,
      () => {
        window.clearTimeout(t);
        ok();
      },
      { once: true },
    );
  });

/** Promessa com prazo: não deixa o envio preso para sempre. */
export function comPrazo<T>(p: Promise<T>, ms: number, mensagem: string): Promise<T> {
  return new Promise<T>((ok, falha) => {
    const t = window.setTimeout(() => falha(new Error(mensagem)), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        ok(v);
      },
      (e) => {
        window.clearTimeout(t);
        falha(e);
      },
    );
  });
}

/** Capa (JPEG) de um vídeo no segundo indicado. */
export async function capaDoVideo(arquivo: Blob, segundo = 0.1): Promise<Blob> {
  const v = document.createElement("video");
  const url = URL.createObjectURL(arquivo);
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    v.load();
    await esperar(v, "loadeddata", 8000);
    const d = Number.isFinite(v.duration) ? v.duration : 1;
    v.currentTime = Math.min(segundo, Math.max(0, d - 0.1));
    await esperar(v, "seeked", 5000).catch(() => undefined); // sem "seeked": usa o primeiro quadro
    const escala = Math.min(1, 1080 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(v.videoWidth * escala));
    c.height = Math.max(1, Math.round(v.videoHeight * escala));
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error("Sem capa"))), "image/jpeg", 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Formato de gravação aceito por este aparelho (MP4 quando dá; senão WebM). */
export function formatoGravacao(): string {
  const opcoes = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return opcoes.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "video/webm";
}
export const extensao = (tipo: string) => (tipo.includes("mp4") ? "mp4" : "webm");

/** O vídeo pode ir como está (sem regravar)? Mais rápido e sem perder qualidade. */
export function podeIrDireto(arquivo: Blob, duracaoTotal: number, op: OpcoesVideo) {
  return (
    op.audio === "original" &&
    op.inicio < 0.05 &&
    duracaoTotal <= MAX_VIDEO + 0.5 &&
    arquivo.size <= 20 * 1024 * 1024 &&
    /video\/(mp4|webm)/.test(arquivo.type)
  );
}

// Elemento e áudio "liberados" pelo toque da pessoa (o navegador só deixa tocar som depois de um toque).
let videoLiberado: HTMLVideoElement | null = null;
let audioCtx: AudioContext | null = null;

/** Chamar dentro do toque em "Publicar": libera som e vídeo para a regravação em segundo plano. */
export function liberarMidia() {
  try {
    audioCtx ??= new AudioContext();
    void audioCtx.resume();
  } catch {
    /* sem Web Audio */
  }
  if (!videoLiberado) {
    videoLiberado = document.createElement("video");
    videoLiberado.playsInline = true;
  }
  videoLiberado.muted = true;
  void videoLiberado.play().catch(() => undefined);
}

/**
 * Regrava o trecho escolhido (até 3 min) com o som escolhido: original, sem som, música, ou música + original.
 * Acontece em tempo real (1 min de vídeo leva ~1 min), sem sair da tela atual.
 */
export async function regravarVideo(arquivo: Blob, op: OpcoesVideo, aoProgresso?: (p: number) => void): Promise<{ blob: Blob; tipo: string; duracao: number }> {
  const duracao = Math.min(MAX_VIDEO, Math.max(0.5, op.duracao));
  const v = videoLiberado ?? document.createElement("video");
  videoLiberado = null; // cada regravação usa o seu elemento
  const url = URL.createObjectURL(arquivo);
  v.playsInline = true;
  v.preload = "auto";
  v.muted = false;
  v.src = url;
  const ctx = audioCtx ?? new AudioContext();
  audioCtx = null;
  await ctx.resume().catch(() => undefined);
  let fonteMusica: AudioBufferSourceNode | null = null;
  let parar: (() => void) | null = null;
  try {
    await esperar(v, "loadeddata");
    const escala = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((v.videoWidth * escala) / 2) * 2;
    canvas.height = Math.round((v.videoHeight * escala) / 2) * 2;
    const g = canvas.getContext("2d")!;

    // Som: o vídeo passa pelo Web Audio (não sai no alto-falante) junto com a música, se houver.
    const destino = ctx.createMediaStreamDestination();
    const original = ctx.createMediaElementSource(v);
    const ganhoOriginal = ctx.createGain();
    ganhoOriginal.gain.value = op.audio === "original" ? 1 : op.audio === "mistura" ? 0.45 : 0;
    original.connect(ganhoOriginal).connect(destino);
    if ((op.audio === "musica" || op.audio === "mistura") && op.musicaUrl) {
      const bruto = await fetch(op.musicaUrl).then((r) => {
        if (!r.ok) throw new Error("Não foi possível carregar a música.");
        return r.arrayBuffer();
      });
      const buffer = await ctx.decodeAudioData(bruto);
      fonteMusica = ctx.createBufferSource();
      fonteMusica.buffer = buffer;
      fonteMusica.loop = true;
      const ganhoMusica = ctx.createGain();
      ganhoMusica.gain.value = op.audio === "mistura" ? 0.8 : 1;
      // Fade-out da música no último segundo.
      ganhoMusica.gain.setValueAtTime(ganhoMusica.gain.value, ctx.currentTime + Math.max(0, duracao - 1));
      ganhoMusica.gain.linearRampToValueAtTime(0, ctx.currentTime + duracao);
      fonteMusica.connect(ganhoMusica).connect(destino);
    }

    v.currentTime = Math.max(0, op.inicio);
    await esperar(v, "seeked");
    g.drawImage(v, 0, 0, canvas.width, canvas.height);

    const imagem = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(30);
    const faixas = [...imagem.getVideoTracks(), ...(op.audio === "mudo" ? [] : destino.stream.getAudioTracks())];
    const tipo = formatoGravacao();
    const gravador = new MediaRecorder(new MediaStream(faixas), { mimeType: tipo, videoBitsPerSecond: 1_600_000, audioBitsPerSecond: 128_000 });
    const partes: Blob[] = [];
    gravador.ondataavailable = (e) => e.data.size && partes.push(e.data);
    const terminou = new Promise<void>((ok) => (gravador.onstop = () => ok()));

    // Desenha cada quadro do vídeo no canvas.
    let ativo = true;
    const desenhar = () => {
      if (!ativo) return;
      g.drawImage(v, 0, 0, canvas.width, canvas.height);
      aoProgresso?.(Math.min(1, (v.currentTime - op.inicio) / duracao));
      if (v.currentTime - op.inicio >= duracao || v.ended) return parar?.();
      const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
      if (rvfc) rvfc.call(v, desenhar);
      else requestAnimationFrame(desenhar);
    };
    parar = () => {
      if (!ativo) return;
      ativo = false;
      v.pause();
      try {
        fonteMusica?.stop();
      } catch {
        /* já parou */
      }
      if (gravador.state !== "inactive") gravador.stop();
    };
    gravador.start(250);
    fonteMusica?.start(0, Math.max(0, op.musicaInicio ?? 0));
    await comPrazo(v.play(), 10000, "O aparelho não deixou preparar o vídeo. Toque em ↻ para tentar de novo.");
    desenhar();
    const limite = window.setTimeout(() => parar?.(), (duracao + 1.5) * 1000);
    await terminou;
    window.clearTimeout(limite);
    return { blob: new Blob(partes, { type: tipo.split(";")[0] }), tipo: tipo.split(";")[0], duracao };
  } finally {
    parar?.();
    URL.revokeObjectURL(url);
    v.removeAttribute("src");
    void ctx.close().catch(() => undefined);
  }
}

/** Envia para o armazenamento com progresso (0 a 1). Sem link assinado, envia do jeito comum. */
export async function subirComProgresso(balde: string, caminho: string, arquivo: Blob, tipo: string, aoProgresso?: (p: number) => void): Promise<string> {
  const assinado = await supabase.storage.from(balde).createSignedUploadUrl(caminho);
  let foi = false;
  if (!assinado.error && assinado.data?.signedUrl) {
    let parado = false;
    foi = await new Promise<boolean>((ok) => {
      const x = new XMLHttpRequest();
      // Sem nenhum avanço por 45 s: a conexão travou.
      let vigia = 0;
      const vigiar = () => {
        window.clearTimeout(vigia);
        vigia = window.setTimeout(() => {
          parado = true;
          x.abort();
        }, 45000);
      };
      x.open("PUT", assinado.data!.signedUrl);
      x.setRequestHeader("content-type", tipo);
      x.setRequestHeader("x-upsert", "false");
      x.upload.onprogress = (e) => {
        vigiar();
        if (e.lengthComputable) aoProgresso?.(e.loaded / e.total);
      };
      x.onload = () => {
        window.clearTimeout(vigia);
        ok(x.status >= 200 && x.status < 300);
      };
      x.onerror = x.onabort = () => {
        window.clearTimeout(vigia);
        ok(false);
      };
      vigiar();
      x.send(arquivo);
    });
    if (parado) throw new Error("A internet travou no envio. Toque em ↻ para continuar.");
  }
  // Sem link assinado (ou se ele falhar): envio comum, sem barra de progresso detalhada.
  if (!foi) {
    const { error } = await comPrazo(
      supabase.storage.from(balde).upload(caminho, arquivo, { contentType: tipo, upsert: true }),
      Math.max(90000, (arquivo.size / (100 * 1024)) * 1000),
      "A internet travou no envio. Toque em ↻ para continuar.",
    );
    if (error) throw /network|fetch/i.test(error.message) ? new Error("Sem conexão. Verifique a internet e tente de novo.") : error;
    aoProgresso?.(1);
  }
  return supabase.storage.from(balde).getPublicUrl(caminho).data.publicUrl;
}

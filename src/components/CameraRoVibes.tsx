import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { RefreshCw, X } from "lucide-react";
import { formatoGravacao, MAX_VIDEO } from "@/lib/midia";

type Modo = "foto" | "video";

/**
 * Câmera do RoVibes: foto ou vídeo de até 15 s com o som do ambiente.
 * Se o aparelho não deixar abrir a câmera aqui, usa a câmera do próprio celular.
 */
export function CameraRoVibes({ capturado, fechar, modoInicial = "foto" }: { capturado: (arquivo: File) => void; fechar: () => void; modoInicial?: Modo }) {
  const tela = useRef<HTMLVideoElement>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const reserva = useRef<HTMLInputElement>(null);
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [frente, setFrente] = useState(false);
  const [pronta, setPronta] = useState(false);
  const [falhou, setFalhou] = useState("");
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const desligar = () => {
    fluxo.current?.getTracks().forEach((t) => t.stop());
    fluxo.current = null;
  };

  const ligar = useCallback(async () => {
    desligar();
    setPronta(false);
    setFalhou("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("sem câmera");
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: frente ? "user" : "environment", width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: modo === "video",
      });
      fluxo.current = s;
      if (tela.current) {
        tela.current.srcObject = s;
        await tela.current.play().catch(() => undefined);
      }
      setPronta(true);
    } catch (e) {
      const negado = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setFalhou(
        negado
          ? "O RoVibes não tem permissão para usar a câmera" + (modo === "video" ? " e o microfone" : "") + ". Libere nas configurações do celular, ou use a câmera do aparelho."
          : "Não foi possível abrir a câmera aqui. Use a câmera do aparelho.",
      );
    }
  }, [frente, modo]);

  useEffect(() => {
    void ligar();
    return desligar;
  }, [ligar]);

  // Contador e parada automática nos 15 s.
  useEffect(() => {
    if (!gravando) return;
    const inicio = Date.now();
    const t = window.setInterval(() => {
      const s = (Date.now() - inicio) / 1000;
      setSegundos(s);
      if (s >= MAX_VIDEO) parar();
    }, 100);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gravando]);

  const tirarFoto = () => {
    const v = tela.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const g = c.getContext("2d")!;
    if (frente) {
      g.translate(c.width, 0);
      g.scale(-1, 1);
    }
    g.drawImage(v, 0, 0);
    c.toBlob(
      (b) => {
        if (!b) return;
        desligar();
        capturado(new File([b], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  };

  const gravar = () => {
    if (!fluxo.current) return;
    const tipo = formatoGravacao();
    const partes: Blob[] = [];
    const g = new MediaRecorder(fluxo.current, { mimeType: tipo, videoBitsPerSecond: 3_000_000 });
    g.ondataavailable = (e) => e.data.size && partes.push(e.data);
    g.onstop = () => {
      const base = tipo.split(";")[0];
      desligar();
      capturado(new File([new Blob(partes, { type: base })], `video-${Date.now()}.${base.includes("mp4") ? "mp4" : "webm"}`, { type: base }));
    };
    gravador.current = g;
    g.start(250);
    setSegundos(0);
    setGravando(true);
  };

  const parar = () => {
    setGravando(false);
    if (gravador.current && gravador.current.state !== "inactive") gravador.current.stop();
  };

  const disparar = () => {
    if (modo === "foto") tirarFoto();
    else if (gravando) parar();
    else gravar();
  };

  const progresso = Math.min(1, segundos / MAX_VIDEO);
  const R = 36;
  const C = 2 * Math.PI * R;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Câmera">
      <video ref={tela} muted playsInline className={clsx("absolute inset-0 h-full w-full object-cover", frente && "-scale-x-100")} />

      <div className="relative z-10 flex items-center justify-between p-3 pt-[max(12px,env(safe-area-inset-top))]">
        <button onClick={fechar} className="rounded-full bg-black/40 p-2.5" aria-label="Fechar câmera">
          <X className="h-6 w-6" />
        </button>
        {gravando && (
          <span className="rounded-full bg-perigo px-3 py-1 text-sm font-semibold">
            {Math.floor(segundos)}s / {MAX_VIDEO}s
          </span>
        )}
        <button onClick={() => !gravando && setFrente((f) => !f)} className="rounded-full bg-black/40 p-2.5" aria-label="Virar a câmera" disabled={gravando}>
          <RefreshCw className="h-6 w-6" />
        </button>
      </div>

      {falhou && (
        <div className="relative z-10 mx-6 mt-16 rounded-2xl bg-black/70 p-5 text-center">
          <p className="text-sm">{falhou}</p>
          <button onClick={() => reserva.current?.click()} className="mt-4 h-11 w-full rounded-full bg-white font-semibold text-black">
            Abrir a câmera do aparelho
          </button>
        </div>
      )}
      <input
        ref={reserva}
        type="file"
        accept={modo === "foto" ? "image/*" : "video/*"}
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) capturado(f);
        }}
      />

      <div className="relative z-10 mt-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className="mb-5 flex justify-center gap-6 text-sm font-semibold">
          {(["foto", "video"] as Modo[]).map((m) => (
            <button key={m} disabled={gravando} onClick={() => setModo(m)} className={clsx("px-2 py-1 uppercase tracking-wide", modo === m ? "text-white" : "text-white/55")}>
              {m === "foto" ? "Foto" : "Vídeo"}
            </button>
          ))}
        </div>
        <div className="flex justify-center">
          <button onClick={disparar} disabled={!pronta} className="relative h-20 w-20 disabled:opacity-40" aria-label={modo === "foto" ? "Tirar foto" : gravando ? "Parar gravação" : "Gravar vídeo"}>
            <svg viewBox="0 0 80 80" className="absolute inset-0 h-full w-full -rotate-90">
              <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="5" />
              {gravando && <circle cx="40" cy="40" r={R} fill="none" stroke="rgb(var(--perigo))" strokeWidth="5" strokeDasharray={C} strokeDashoffset={C * (1 - progresso)} strokeLinecap="round" />}
            </svg>
            <span
              className={clsx(
                "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all",
                modo === "foto" ? "h-[60px] w-[60px] rounded-full bg-white" : gravando ? "h-7 w-7 rounded-md bg-perigo" : "h-[60px] w-[60px] rounded-full bg-perigo",
              )}
            />
          </button>
        </div>
        <p className="mt-3 text-center text-[12px] text-white/70">{modo === "foto" ? "Toque para tirar a foto" : gravando ? "Toque para parar" : `Toque para gravar (até ${MAX_VIDEO} s, com som)`}</p>
      </div>
    </div>
  );
}

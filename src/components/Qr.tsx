import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { CameraOff } from "lucide-react";

/** QR code em preto sobre branco (lido melhor pelas câmeras, mesmo no modo escuro). */
export function QrCode({ texto, tamanho = 220 }: { texto: string; tamanho?: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    QRCode.toDataURL(texto, { margin: 1, width: tamanho * 2, errorCorrectionLevel: "M", color: { dark: "#111318", light: "#FFFFFF" } })
      .then(setUrl)
      .catch(() => setUrl(""));
  }, [texto, tamanho]);
  return (
    <span className="inline-block rounded-xl bg-white p-3">
      {url ? (
        <img src={url} alt={`QR code ${texto}`} width={tamanho} height={tamanho} />
      ) : (
        <span className="block" style={{ width: tamanho, height: tamanho }} />
      )}
    </span>
  );
}

/** Leitor de QR pela câmera. Chama aoLer uma vez por código lido. */
export function LeitorQr({ aoLer }: { aoLer: (texto: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState("");
  const ultimo = useRef<{ t: string; em: number } | null>(null);
  const callback = useRef(aoLer);
  callback.current = aoLer;

  useEffect(() => {
    let fluxo: MediaStream | null = null;
    let quadro = 0;
    let parado = false;
    const tela = document.createElement("canvas");
    const ctx = tela.getContext("2d", { willReadFrequently: true });

    const ler = () => {
      if (parado) return;
      const v = video.current;
      if (v && ctx && v.readyState >= 2 && v.videoWidth) {
        const escala = Math.min(1, 640 / v.videoWidth);
        tela.width = Math.round(v.videoWidth * escala);
        tela.height = Math.round(v.videoHeight * escala);
        ctx.drawImage(v, 0, 0, tela.width, tela.height);
        const img = ctx.getImageData(0, 0, tela.width, tela.height);
        const achado = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (achado?.data) {
          const agora = Date.now();
          if (!ultimo.current || ultimo.current.t !== achado.data || agora - ultimo.current.em > 4000) {
            ultimo.current = { t: achado.data, em: agora };
            callback.current(achado.data);
          }
        }
      }
      quadro = requestAnimationFrame(ler);
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      setErro("Este aparelho não permite usar a câmera aqui. Digite o código.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        if (parado) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        fluxo = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        quadro = requestAnimationFrame(ler);
      })
      .catch(() => setErro("Não foi possível abrir a câmera. Permita o acesso à câmera ou digite o código."));

    return () => {
      parado = true;
      cancelAnimationFrame(quadro);
      fluxo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (erro) {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-borda bg-fundo p-6 text-center text-sm text-suave">
        <CameraOff className="h-6 w-6" />
        {erro}
      </div>
    );
  }
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
      <video ref={video} muted playsInline className="h-full w-full object-cover" />
      <span className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-white/80" />
    </div>
  );
}

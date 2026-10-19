import { useEffect, useRef, useState } from "react";

interface Detector {
  detect: (fonte: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}

/** Leitor de código de barras (EAN/UPC/Code 128) pela câmera. Usa o leitor nativo do navegador quando existe. */
export function LeitorBarras({ aoLer }: { aoLer: (codigo: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState("");
  const callback = useRef(aoLer);
  callback.current = aoLer;

  useEffect(() => {
    const Classe = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    if (!Classe) {
      setErro("Este aparelho não lê código de barras pela câmera. Use um leitor USB/Bluetooth ou digite o código.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErro("Este aparelho não permite usar a câmera aqui. Digite o código.");
      return;
    }
    const detector = new Classe({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"] });
    let fluxo: MediaStream | null = null;
    let parado = false;
    let espera: number | undefined;

    const ler = async () => {
      if (parado) return;
      const v = video.current;
      if (v && v.readyState >= 2) {
        try {
          const achados = await detector.detect(v);
          const codigo = achados[0]?.rawValue;
          if (codigo) {
            parado = true;
            navigator.vibrate?.(80);
            callback.current(codigo);
            return;
          }
        } catch {
          /* tenta de novo no próximo quadro */
        }
      }
      espera = window.setTimeout(() => void ler(), 200);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        if (parado) return s.getTracks().forEach((t) => t.stop());
        fluxo = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        void ler();
      })
      .catch(() => setErro("Não foi possível abrir a câmera. Permita o acesso à câmera ou digite o código."));

    return () => {
      parado = true;
      window.clearTimeout(espera);
      fluxo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (erro) return <p className="rounded-lg bg-elevado px-3 py-3 text-sm text-suave">{erro}</p>;
  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
      <span className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-perigo/80" />
      <p className="absolute inset-x-0 bottom-2 text-center text-[12px] text-white/80">Aponte para o código de barras</p>
    </div>
  );
}

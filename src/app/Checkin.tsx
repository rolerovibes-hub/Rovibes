import { useEffect, useState } from "react";
import clsx from "clsx";
import { Check, LocateFixed, MapPinned, X } from "lucide-react";
import { MedidorMovimento, Movimento } from "@/components/Marca";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { pedirLocalizacao } from "./dados";
import { NOME_MOVIMENTO } from "./presenca";

const NIVEIS: Movimento[] = ["tranquilo", "moderado", "cheio"];

/** Folha de check-in: confirma a localização e faz duas perguntas rápidas. */
export function FolhaCheckin({
  estabelecimentoId,
  nome,
  vibes,
  fechar,
  concluido,
}: {
  estabelecimentoId: string;
  nome: string;
  vibes: string[];
  fechar: () => void;
  concluido: () => void;
}) {
  const [movimento, setMovimento] = useState<Movimento | null>(null);
  const [vibeConfere, setVibeConfere] = useState<boolean | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState(false);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [fechar]);

  const confirmar = async () => {
    setErro("");
    setEnviando(true);
    try {
      const [lat, lng] = await pedirLocalizacao(true);
      const { error } = await supabase.rpc("fazer_checkin", {
        p_estab: estabelecimentoId,
        p_lat: lat,
        p_lng: lng,
        p_movimento: movimento ?? "",
        p_vibe_confere: vibes.length ? vibeConfere : null,
      });
      if (error) throw error;
      setFeito(true);
      concluido();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Check-in em ${nome}`}>
      <div className="absolute inset-0 bg-black/50" onClick={fechar} />
      <div className="relative w-full max-w-xl rounded-t-[20px] border border-borda bg-superficie p-5 pb-8 sm:rounded-[20px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{feito ? "Check-in feito" : "Check-in"}</h2>
            <p className="text-sm text-suave">{nome}</p>
          </div>
          <button onClick={fechar} className="botao h-8 w-8 px-0" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {feito ? (
          <div className="space-y-4 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ok/15 text-ok">
              <Check className="h-7 w-7" />
            </span>
            <p className="text-sm text-suave">Obrigado! Sua resposta ajuda quem está decidindo para onde ir. Agora você também pode avaliar este lugar.</p>
            <button onClick={fechar} className="botao-principal h-11 w-full">
              Fechar
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-sm font-medium">Como está o movimento agora?</h3>
              <div className="grid grid-cols-3 gap-2">
                {NIVEIS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setMovimento(movimento === n ? null : n)}
                    aria-pressed={movimento === n}
                    className={clsx(
                      "flex flex-col items-center gap-2 rounded-lg border px-2 py-3 text-sm",
                      movimento === n ? "border-marca bg-destaque-suave font-semibold" : "border-borda hover:bg-elevado",
                    )}
                  >
                    <MedidorMovimento nivel={n} rotulo={false} />
                    {NOME_MOVIMENTO[n]}
                  </button>
                ))}
              </div>
            </section>

            {vibes.length > 0 && (
              <section>
                <h3 className="mb-1 text-sm font-medium">A vibe confere?</h3>
                <p className="mb-2 text-[13px] text-suave">{vibes.join(" · ")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: true, t: "Sim, confere" },
                    { v: false, t: "Não muito" },
                  ].map(({ v, t }) => (
                    <button
                      key={t}
                      onClick={() => setVibeConfere(vibeConfere === v ? null : v)}
                      aria-pressed={vibeConfere === v}
                      className={clsx(
                        "rounded-lg border px-3 py-2.5 text-sm",
                        vibeConfere === v ? "border-marca bg-destaque-suave font-semibold" : "border-borda hover:bg-elevado",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <p className="flex items-center gap-2 text-[13px] text-suave">
              <LocateFixed className="h-4 w-4 shrink-0" />
              Vamos confirmar pela sua localização que você está no local.
            </p>

            {erro && (
              <p role="alert" className="text-sm text-perigo">
                {erro}
              </p>
            )}

            <button onClick={() => void confirmar()} disabled={enviando} className="botao-principal h-11 w-full">
              <MapPinned className="h-4 w-4" />
              {enviando ? "Confirmando…" : "Confirmar check-in"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

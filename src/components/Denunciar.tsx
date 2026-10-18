import { useState } from "react";
import clsx from "clsx";
import { Flag, X } from "lucide-react";
import { denunciar, MOTIVOS_DENUNCIA } from "@/lib/pessoas";
import { mensagemDeErro } from "@/lib/supabase";

/** Janela de denúncia: motivo + detalhe opcional. Vai para a administração RoVibes (A1003). */
export function JanelaDenuncia({
  tipo,
  alvo,
  titulo,
  fechar,
}: {
  tipo: "perfil" | "story" | "publicacao" | "mensagem";
  alvo: string;
  titulo: string;
  fechar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState(false);

  const enviar = async () => {
    setEnviando(true);
    setErro("");
    try {
      await denunciar(tipo, alvo, motivo, detalhe);
      setFeito(true);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setEnviando(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label={titulo} onClick={fechar}>
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-superficie p-5 text-texto sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <Flag className="h-4 w-4 text-perigo" />
            {titulo}
          </h2>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {feito ? (
          <div className="py-6 text-center">
            <p className="font-medium">Obrigado por avisar</p>
            <p className="mt-1 text-sm text-suave">A equipe RoVibes vai analisar. Quem foi denunciado não sabe quem denunciou.</p>
            <button className="botao mt-5 w-full" onClick={fechar}>
              Fechar
            </button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-suave">Qual é o problema?</p>
            <ul className="mt-3 space-y-1.5">
              {MOTIVOS_DENUNCIA.map((m) => (
                <li key={m.valor}>
                  <button
                    onClick={() => setMotivo(m.valor)}
                    aria-pressed={motivo === m.valor}
                    className={clsx(
                      "w-full rounded-lg border px-3 py-2.5 text-left text-sm",
                      motivo === m.valor ? "border-marca bg-destaque-suave font-medium" : "border-borda hover:bg-elevado",
                    )}
                  >
                    {m.nome}
                  </button>
                </li>
              ))}
            </ul>
            <label className="mt-3 block">
              <span className="rotulo mb-1 block">Detalhes (opcional)</span>
              <textarea
                value={detalhe}
                onChange={(e) => setDetalhe(e.target.value.slice(0, 500))}
                rows={3}
                className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm focus:border-marca focus:outline-none"
              />
            </label>
            {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}
            <button className="botao-principal mt-4 h-11 w-full" disabled={!motivo || enviando} onClick={() => void enviar()}>
              {enviando ? "Enviando..." : "Enviar denúncia"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

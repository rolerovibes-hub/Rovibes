import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Check, ExternalLink, Search, Send, UserPlus, X } from "lucide-react";
import { IconeConversa } from "./Conversa";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { abrirConversa, ConversaResumo } from "@/lib/chat";
import { compartilhar, enviarCartao, linkDivulgacao } from "@/lib/promoters";
import { EscolherPessoas } from "@/app/NovoRole";

/**
 * Compartilhar evento ou lista: dentro do RoVibes (chat direto ou grupo, como cartão)
 * ou em outros apps (link que abre o RoVibes direto no evento/lista).
 */
export function CompartilharNoChat({
  tipo,
  id,
  titulo,
  codigo,
  fechar,
  enviado,
}: {
  tipo: "evento" | "lista";
  id: string;
  titulo: string;
  codigo?: string | null;
  fechar: () => void;
  enviado?: (texto: string) => void;
}) {
  const [conversas, setConversas] = useState<ConversaResumo[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [texto, setTexto] = useState("");
  const [pessoas, setPessoas] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    supabase.rpc("minhas_conversas").then(({ data }) => setConversas(((data ?? []) as ConversaResumo[]).filter((c) => c.situacao === "ativo")));
  }, []);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (conversas ?? []).filter((c) => !t || (c.titulo ?? "").toLowerCase().includes(t));
  }, [conversas, busca]);

  const alternar = (c: string) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  const enviar = async (ids: string[]) => {
    setEnviando(true);
    setErro("");
    try {
      for (const c of ids) await enviarCartao(c, tipo, id, texto.trim() || null);
      enviado?.(`Enviado para ${ids.length} conversa${ids.length === 1 ? "" : "s"}.`);
      fechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setEnviando(false);
  };

  const externo = async () => {
    const r = await compartilhar(titulo, linkDivulgacao(tipo, id, codigo));
    enviado?.(r === "copiado" ? "Link copiado. Quem abrir vai direto para o RoVibes." : "Link compartilhado.");
    fechar();
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Compartilhar" onClick={fechar}>
      <div className="folha flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-superficie pb-[max(12px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 pb-2 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Compartilhar</h2>
            <p className="truncate text-[13px] text-suave">
              {tipo === "evento" ? "Evento" : "Lista"}: {titulo}
            </p>
          </div>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {pessoas ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-1">
            <EscolherPessoas
              textoBotao="Enviar"
              cancelar={() => setPessoas(false)}
              confirmar={async (ids) => {
                const conv: string[] = [];
                for (const p of ids) conv.push(await abrirConversa(p));
                await enviar(conv);
              }}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 px-5 pb-3">
              <button className="botao h-11" onClick={() => void externo()}>
                <ExternalLink className="h-4 w-4" />
                Outros apps
              </button>
              <button className="botao h-11" onClick={() => setPessoas(true)}>
                <UserPlus className="h-4 w-4" />
                Nova conversa
              </button>
            </div>
            <label className="relative mx-5 block">
              <span className="sr-only">Buscar conversas</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Conversas e grupos" className="entrada pl-9" />
            </label>
            <ul className="mt-2 min-h-0 flex-1 overflow-y-auto">
              {conversas === null && <li className="px-5 py-4 text-sm text-suave">Carregando...</li>}
              {conversas && lista.length === 0 && <li className="px-5 py-4 text-sm text-suave">Nenhuma conversa. Use “Nova conversa”.</li>}
              {lista.map((c) => (
                <li key={c.id}>
                  <button onClick={() => alternar(c.id)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-elevado">
                    <IconeConversa tipo={c.tipo} titulo={c.titulo} foto={c.foto} />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.titulo}</span>
                    <span className={clsx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2", marcadas.has(c.id) ? "border-marca bg-marca text-marca-texto" : "border-borda")}>
                      {marcadas.has(c.id) && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {erro && <p className="px-5 pt-2 text-sm text-perigo">{erro}</p>}
            <div className="flex items-end gap-2 border-t border-borda px-4 pt-3">
              <input value={texto} onChange={(e) => setTexto(e.target.value.slice(0, 300))} placeholder="Escreva algo (opcional)" className="entrada min-w-0 flex-1" />
              <button className="botao-principal h-10 shrink-0" disabled={!marcadas.size || enviando} onClick={() => void enviar([...marcadas])}>
                <Send className="h-4 w-4" />
                {marcadas.size ? `Enviar (${marcadas.size})` : "Enviar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, Send } from "lucide-react";
import { Aviso } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useBusiness } from "@/lib/acessos";

interface Pedido {
  numero: number;
  titulo: string;
  estado: string;
  criado_em: string;
  resultado: string | null;
  novas?: number;
}
interface Conversa {
  numero: number;
  titulo: string;
  descricao: string | null;
  estado: string;
  criado_em: string;
  resultado: string | null;
  mensagens: { id: number; texto: string; criado_em: string; lado: "equipe" | "estabelecimento"; autor: string }[];
}
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ESTADO: Record<string, { nome: string; cor: string }> = {
  nova: { nome: "Recebido", cor: "bg-elevado text-suave" },
  em_analise: { nome: "Em análise", cor: "bg-azul/15 text-azul" },
  aguardando: { nome: "Aguardando", cor: "bg-alerta/15 text-alerta" },
  resolvida: { nome: "Resolvido", cor: "bg-ok/15 text-ok" },
  encerrada: { nome: "Encerrado", cor: "bg-elevado text-suave" },
};

/** G1004 · Ajuda RoVibes: o estabelecimento pede ajuda e acompanha (vira situação no Atendimento da Gestão). */
export function AjudaRoVibes() {
  const { atual } = useBusiness();
  const estab = atual?.estabelecimento_id;
  const [lista, setLista] = useState<Pedido[] | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aberto, setAberto] = useState<number | null>(null);
  const carregar = useCallback(async () => {
    if (!estab) return;
    const { data, error } = await supabase.rpc("minhas_solicitacoes_rovibes", { p_estab: estab });
    if (error && /function|schema cache/i.test(error.message)) setAviso({ tipo: "erro", texto: "Disponível depois da atualização 049 do banco." });
    setLista((data ?? []) as Pedido[]);
  }, [estab]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!estab) return <p className="cartao p-6 text-sm text-suave">Escolha um estabelecimento.</p>;
  if (aberto != null)
    return (
      <ConversaPedido
        estab={estab}
        numero={aberto}
        voltar={() => {
          setAberto(null);
          void carregar();
        }}
      />
    );

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setAviso(null);
    const { error } = await supabase.rpc("pedir_ajuda_rovibes", { p_estab: estab, p_titulo: titulo, p_descricao: descricao });
    setOcupado(false);
    if (error) return setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    setTitulo("");
    setDescricao("");
    setAviso({ tipo: "ok", texto: "Pedido enviado." });
    await carregar();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <form onSubmit={(e) => void enviar(e)} className="cartao space-y-3 p-5">
        <input required minLength={3} maxLength={160} className="entrada" placeholder="Assunto" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <textarea rows={4} className="entrada" placeholder="O que está acontecendo?" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        <button type="submit" className="botao-principal h-10 px-6" disabled={ocupado}>
          Enviar
        </button>
      </form>
      <section className="cartao overflow-hidden">
        {lista === null ? (
          <p className="p-6 text-center text-sm text-suave">Carregando...</p>
        ) : lista.length === 0 ? (
          <p className="p-8 text-center text-sm text-suave">Nenhum pedido.</p>
        ) : (
          <ul className="divide-y divide-borda">
            {lista.map((p) => (
              <li key={p.numero}>
                <button className="block w-full px-4 py-3 text-left hover:bg-elevado" onClick={() => setAberto(p.numero)}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{p.titulo}</span>
                  {!!p.novas && <span className="rounded-full bg-marca px-2 py-0.5 text-[11px] font-bold text-marca-texto">{p.novas} nova{p.novas > 1 ? "s" : ""}</span>}
                  <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", ESTADO[p.estado]?.cor)}>{ESTADO[p.estado]?.nome ?? p.estado}</span>
                </div>
                <p className="text-[12px] text-suave">{quando(p.criado_em)}</p>
                {p.resultado && <p className="mt-1 text-sm">{p.resultado}</p>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Conversa de um pedido com a equipe RoVibes. */
function ConversaPedido({ estab, numero, voltar }: { estab: string; numero: number; voltar: () => void }) {
  const [c, setC] = useState<Conversa | null>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("conversa_ajuda_rovibes", { p_estab: estab, p_numero: numero });
    if (error) return setErro(mensagemDeErro(error));
    setC(data as Conversa);
  }, [estab, numero]);
  useEffect(() => {
    void carregar();
    const t = window.setInterval(() => void carregar(), 20000);
    return () => window.clearInterval(t);
  }, [carregar]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setOcupado(true);
    setErro("");
    const { error } = await supabase.rpc("responder_ajuda_rovibes", { p_estab: estab, p_numero: numero, p_texto: texto });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    setTexto("");
    await carregar();
  };

  const fechado = c && (c.estado === "resolvida" || c.estado === "encerrada");
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <button onClick={voltar} className="inline-flex items-center gap-1.5 text-sm text-suave hover:text-texto">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!c ? (
        <p className="cartao p-6 text-center text-sm text-suave">Carregando...</p>
      ) : (
        <section className="cartao overflow-hidden">
          <div className="border-b border-borda px-5 py-4">
            <div className="flex items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{c.titulo}</h2>
              <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", ESTADO[c.estado]?.cor)}>{ESTADO[c.estado]?.nome ?? c.estado}</span>
            </div>
            <p className="text-[12px] text-suave">{quando(c.criado_em)}</p>
            {c.descricao && <p className="mt-2 whitespace-pre-line text-sm">{c.descricao}</p>}
          </div>
          <ol className="space-y-2 px-5 py-4">
            {c.mensagens.map((m) => (
              <li key={m.id} className={clsx("flex", m.lado === "estabelecimento" ? "justify-end" : "justify-start")}>
                <span className={clsx("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm", m.lado === "estabelecimento" ? "rounded-br-md bg-marca/20" : "rounded-bl-md bg-elevado")}>
                  <span className="block text-[11.5px] text-suave">
                    {m.lado === "estabelecimento" ? m.autor : "Equipe RoVibes"} · {quando(m.criado_em)}
                  </span>
                  <span className="block whitespace-pre-line">{m.texto}</span>
                </span>
              </li>
            ))}
            {c.resultado && (
              <li className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">
                <strong>Resolvido:</strong> {c.resultado}
              </li>
            )}
          </ol>
          <form onSubmit={(e) => void enviar(e)} className="flex gap-2 border-t border-borda px-5 py-3">
            <input className="entrada flex-1" placeholder={fechado ? "Escrever reabre o pedido..." : "Mensagem"} value={texto} onChange={(e) => setTexto(e.target.value)} />
            <button type="submit" className="botao-principal h-10 w-10 shrink-0 px-0" disabled={ocupado || !texto.trim()} aria-label="Enviar">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

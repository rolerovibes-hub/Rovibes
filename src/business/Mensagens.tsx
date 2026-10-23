import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Carregando } from "@/components/Carregando";
import { CorpoConversa } from "@/components/Conversa";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { DadosConversa, faltaBanco, horaMensagem, MembroConversa, useAoVivoChat } from "@/lib/chat";

interface ConversaEstab {
  id: string;
  cliente: string;
  foto: string | null;
  ultima_texto: string | null;
  ultima_estab: boolean;
  ultima_em: string;
  nao_lidas: number;
}

/** T2001 — Mensagens: a equipe responde os clientes em nome do estabelecimento (Business e Job). */
export function MensagensEstab({ estab, nomeEstab, altura = "h-[calc(100vh-170px)]" }: { estab: string; nomeEstab: string; altura?: string }) {
  const { sessao } = useSessao();
  const [lista, setLista] = useState<ConversaEstab[] | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    supabase.rpc("conversas_do_estab", { p_estab: estab }).then(({ data, error }) => {
      if (error) setErro(faltaBanco(error.message) ? "Falta aplicar a atualização 014 do banco." : mensagemDeErro(error));
      else setErro("");
      setLista((data ?? []) as ConversaEstab[]);
    });
  }, [estab]);
  useEffect(() => {
    setLista(null);
    setAberta(null);
    carregar();
  }, [carregar]);
  useAoVivoChat(`estab-${estab}`, null, carregar);

  return (
    <div className={clsx("cartao grid overflow-hidden md:grid-cols-[320px_minmax(0,1fr)]", altura)}>
      <section className={clsx("min-h-0 flex-col border-borda md:flex md:border-r", aberta ? "hidden" : "flex")}>
        <h2 className="border-b border-borda px-4 py-3 font-semibold">Conversas com clientes</h2>
        {erro && <p className="px-4 py-3 text-sm text-perigo">{erro}</p>}
        {lista === null ? (
          <Carregando compacto />
        ) : lista.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <MessagesSquare className="mx-auto h-8 w-8 text-suave" />
            <p className="mt-3 text-sm text-suave">Quando um cliente tocar em "Mensagem" na página do seu lugar no App, a conversa aparece aqui.</p>
          </div>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {lista.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setAberta(c.id)}
                  className={clsx("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevado", aberta === c.id && "bg-destaque-suave")}
                >
                  <Avatar nome={c.cliente} foto={c.foto} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={clsx("min-w-0 flex-1 truncate text-sm", c.nao_lidas ? "font-bold" : "font-semibold")}>{c.cliente}</span>
                      <span className="shrink-0 text-[12px] text-suave">{horaMensagem(c.ultima_em)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={clsx("min-w-0 flex-1 truncate text-[13px]", c.nao_lidas ? "font-medium" : "text-suave")}>
                        {c.ultima_estab ? "Equipe: " : ""}
                        {c.ultima_texto}
                      </span>
                      {c.nao_lidas > 0 && <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-magenta px-1.5 text-[11px] font-bold text-white">{c.nao_lidas}</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={clsx("min-h-0 flex-col", aberta ? "flex" : "hidden md:flex")}>
        {aberta && sessao ? (
          <Fio key={aberta} id={aberta} eu={sessao.user.id} nomeEstab={nomeEstab} voltar={() => setAberta(null)} aoMudar={carregar} />
        ) : (
          <p className="m-auto px-6 text-center text-sm text-suave">Escolha uma conversa para responder.</p>
        )}
      </section>
    </div>
  );
}

function Fio({ id, eu, nomeEstab, voltar, aoMudar }: { id: string; eu: string; nomeEstab: string; voltar: () => void; aoMudar: () => void }) {
  const [dados, setDados] = useState<DadosConversa | null>(null);
  const [membros, setMembros] = useState<MembroConversa[]>([]);
  useEffect(() => {
    Promise.all([supabase.rpc("dados_conversa", { p_conversa: id }), supabase.rpc("membros_conversa", { p_conversa: id })]).then(([d, m]) => {
      setDados(((d.data ?? []) as DadosConversa[])[0] ?? null);
      setMembros((m.data ?? []) as MembroConversa[]);
    });
  }, [id]);
  if (!dados) return <Carregando />;
  return (
    <>
      <div className="flex items-center gap-2 border-b border-borda px-3 py-2.5">
        <button onClick={voltar} className="rounded-full p-1.5 hover:bg-elevado md:hidden" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar nome={dados.titulo ?? "?"} foto={dados.foto} tamanho="sm" />
        <span className="min-w-0 flex-1 truncate font-semibold">{dados.titulo}</span>
        <span className="text-[12px] text-suave">Respondendo como {nomeEstab}</span>
      </div>
      <CorpoConversa dados={dados} eu={eu} membros={membros} modo="estab" nomeEstab={nomeEstab} aoMudar={aoMudar} />
    </>
  );
}

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { useSessao } from "@/lib/sessao";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Plus, X } from "lucide-react";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { AREAS_OPERACAO, codCon, nomeArea, prazoDa, PRIORIDADES, SituacaoLinha, tempoCurto, TIPOS, useGestao } from "@/lib/gestao";

/** Uma linha de situação (Central, áreas e ficha do estabelecimento). */
export function LinhaSituacao({ s, mostrarArea = true }: { s: SituacaoLinha; mostrarArea?: boolean }) {
  const { sessao } = useSessao();
  const fechada = s.estado === "resolvida" || s.estado === "encerrada";
  const prazo = prazoDa(s);
  return (
    <Link to={`/gestao/situacao/${s.numero}`} className={clsx("grid grid-cols-[4px_1fr_auto] items-center gap-3 px-4 py-2.5 hover:bg-elevado", fechada && "opacity-60")}>
      <span className={clsx("h-9 w-1 rounded-full", PRIORIDADES[s.prioridade]?.cor)} aria-label={PRIORIDADES[s.prioridade]?.nome} />
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold">{s.titulo}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-suave">
          {s.origem === "automatica" && <Selo cor="bg-elevado text-suave">Automática</Selo>}
          {s.origem === "estabelecimento" && <Selo cor="bg-azul/15 text-azul">Pedido</Selo>}
          {s.conhecimento_numero ? <Selo cor="bg-ok/15 text-ok">{codCon(s.conhecimento_numero)}</Selo> : !fechada && <Selo cor="bg-marca/20 text-destaque">Nova</Selo>}
          {fechada && <Selo cor="bg-elevado text-suave">{s.estado === "resolvida" ? "Resolvida" : "Encerrada"}</Selo>}
          {s.estado === "aguardando" && <Selo cor="bg-elevado text-suave">Aguardando</Selo>}
          {prazo?.atrasada && <Selo cor="bg-perigo/15 text-perigo">{prazo.texto}</Selo>}
          {prazo?.perto && <Selo cor="bg-alerta/15 text-alerta">{prazo.texto}</Selo>}
          {prazo?.parada && !prazo.atrasada && <Selo cor="bg-elevado text-alerta">{prazo.parada}</Selo>}
          <span>{[mostrarArea ? nomeArea(s.area) : null, s.estabelecimento, tempoCurto(s.criado_em)].filter(Boolean).join(" · ")}</span>
        </span>
      </span>
      <span className="text-right text-[12px]">
        {s.responsavel_id ? (
          <span className="text-suave">{s.responsavel_id === sessao?.user.id ? "Você" : s.responsavel}</span>
        ) : fechada ? null : (
          <span className="font-semibold text-alerta">Sem responsável</span>
        )}
      </span>
    </Link>
  );
}

export function Selo({ cor, children }: { cor: string; children: ReactNode }) {
  return <span className={clsx("rounded-full px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide", cor)}>{children}</span>;
}

const FILTROS: { id: string; nome: string }[] = [
  { id: "atencao", nome: "Abertas" },
  { id: "comigo", nome: "Comigo" },
  { id: "novas", nome: "Novas" },
  { id: "resolvidas", nome: "Resolvidas" },
];

/** Situações de uma área (ou de um estabelecimento). */
export function ListaSituacoes({ area, estab, titulo }: { area?: string; estab?: string; titulo?: string }) {
  const { nivel } = useGestao();
  const [filtro, setFiltro] = useState("atencao");
  const [lista, setLista] = useState<SituacaoLinha[] | null>(null);
  const [nova, setNova] = useState(false);
  const carregar = useCallback(async () => {
    const { data } = await supabase.rpc("situacoes_lista", { p_filtro: estab ? (filtro === "atencao" ? "todas" : filtro) : filtro, p_area: area ?? null, p_estab: estab ?? null });
    setLista((data ?? []) as SituacaoLinha[]);
  }, [area, estab, filtro]);
  useEffect(() => {
    setLista(null);
    void carregar();
  }, [carregar]);
  const podeAbrir = area ? nivel(area) >= 2 : AREAS_OPERACAO.some((a) => nivel(a.id) >= 2);

  return (
    <section className="cartao overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-borda px-4 py-2.5">
        {titulo && <h2 className="mr-2 font-semibold">{titulo}</h2>}
        {!estab &&
          FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={clsx("rounded-full border px-2.5 py-0.5 text-[12px]", filtro === f.id ? "border-marca bg-marca text-marca-texto" : "border-borda text-suave")}
            >
              {f.nome}
            </button>
          ))}
        {podeAbrir && (
          <button className="botao ml-auto h-8 px-3 text-[13px]" onClick={() => setNova(true)}>
            <Plus className="h-4 w-4" />
            Situação
          </button>
        )}
      </div>
      {lista === null ? (
        <p className="px-4 py-8 text-center text-sm text-suave">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-suave">Nada por aqui.</p>
      ) : (
        <div className="divide-y divide-borda">
          {lista.map((s) => (
            <LinhaSituacao key={s.id} s={s} mostrarArea={!area} />
          ))}
        </div>
      )}
      {nova && <NovaSituacao area={area} estab={estab} fechar={() => setNova(false)} criada={() => void carregar()} />}
    </section>
  );
}

/** Abrir situação (equipe). */
export function NovaSituacao({ area, estab, fechar, criada }: { area?: string; estab?: string; fechar: () => void; criada?: (numero: number) => void }) {
  const { nivel } = useGestao();
  const areas = AREAS_OPERACAO.filter((a) => !["conhecimento", "configuracoes", "inteligencia"].includes(a.id) && nivel(a.id) >= 2);
  const [d, setD] = useState({ titulo: "", descricao: "", area: area ?? areas[0]?.id ?? "atendimento", tipo: "tecnica", prioridade: "media" });
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setErro("");
    const { data, error } = await supabase.rpc("abrir_situacao", {
      p_titulo: d.titulo,
      p_descricao: d.descricao,
      p_area: d.area,
      p_tipo: d.tipo,
      p_prioridade: d.prioridade,
      p_estab: estab ?? null,
      p_conhecimento: null,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    criada?.(data as number);
    fechar();
  };
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Nova situação" onClick={fechar}>
      <form onSubmit={enviar} className="folha w-full max-w-lg space-y-3 rounded-t-2xl bg-superficie p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nova situação</h2>
          <button type="button" className="rounded-full p-1.5 hover:bg-elevado" onClick={fechar} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <input required minLength={3} maxLength={160} autoFocus className="entrada" placeholder="O que está acontecendo?" value={d.titulo} onChange={(e) => setD({ ...d, titulo: e.target.value })} />
        <textarea rows={3} className="entrada" placeholder="Detalhes" value={d.descricao} onChange={(e) => setD({ ...d, descricao: e.target.value })} />
        <div className="grid grid-cols-3 gap-2">
          <select className="entrada" value={d.area} onChange={(e) => setD({ ...d, area: e.target.value })} aria-label="Área" disabled={!!area}>
            {(area ? AREAS_OPERACAO.filter((a) => a.id === area) : areas).map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
          <select className="entrada" value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value })} aria-label="Tipo">
            {Object.entries(TIPOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select className="entrada" value={d.prioridade} onChange={(e) => setD({ ...d, prioridade: e.target.value })} aria-label="Prioridade">
            {Object.entries(PRIORIDADES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.nome}
              </option>
            ))}
          </select>
        </div>
        {erro && <p className="text-sm text-perigo">{erro}</p>}
        <button type="submit" className="botao-principal h-11 w-full" disabled={ocupado}>
          Abrir situação
        </button>
      </form>
    </div>,
    document.body,
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AREAS_OPERACAO, codSit, SituacaoLinha, useGestao } from "@/lib/gestao";
import { LinhaSituacao, NovaSituacao } from "./Situacoes";
import { useNavigate } from "react-router-dom";

interface Resumo {
  criticas?: number;
  sem_responsavel?: number;
  novas?: number;
  atrasadas?: number;
  resolvidas_semana?: number;
  saude?: { pedidos_hora: number; pedidos_hora_normal?: number | null; pagamentos_aprovados: number | null; notificacoes_atrasadas: number; cadastros_em_analise?: number } | null;
}
interface Mudanca {
  situacao_id: string;
  numero: number;
  titulo: string;
  tipo: string;
  texto: string | null;
  autor: string;
  criado_em: string;
}

/** Central: o que eu preciso saber, decidir ou resolver agora. */
export function Central() {
  const { nivel } = useGestao();
  const navegar = useNavigate();
  const [filtro, setFiltro] = useState("atencao");
  const [resumo, setResumo] = useState<Resumo>({});
  const [lista, setLista] = useState<SituacaoLinha[] | null>(null);
  const [mudancas, setMudancas] = useState<Mudanca[]>([]);
  const [nova, setNova] = useState(false);
  const [semBanco, setSemBanco] = useState(false);

  const carregar = useCallback(async () => {
    const [r, l, m] = await Promise.all([
      supabase.rpc("resumo_central"),
      supabase.rpc("situacoes_lista", { p_filtro: filtro, p_area: null, p_estab: null }),
      supabase.rpc("mudancas_central", { p_limite: 12 }),
    ]);
    if (l.error && /function|schema cache/i.test(l.error.message)) setSemBanco(true);
    setResumo((r.data ?? {}) as Resumo);
    setLista((l.data ?? []) as SituacaoLinha[]);
    setMudancas((m.data ?? []) as Mudanca[]);
  }, [filtro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Detecção automática (no servidor, no máximo a cada 2 minutos) e atualização periódica.
  useEffect(() => {
    void supabase.rpc("detectar_situacoes", { p_forcar: false }).then(({ data }) => (data ? void carregar() : undefined));
    const t = window.setInterval(() => {
      void supabase.rpc("detectar_situacoes", { p_forcar: false }).then(() => void carregar());
    }, 120000);
    return () => window.clearInterval(t);
  }, [carregar]);

  if (semBanco) return <p className="cartao p-6 text-sm text-perigo">Aplique a atualização 049 do banco.</p>;

  const kpis: { valor?: number; nome: string; cor?: string; f: string }[] = [
    { valor: resumo.criticas, nome: "críticas abertas", cor: "text-perigo", f: "atencao" },
    { valor: resumo.atrasadas, nome: "atrasadas", cor: "text-perigo", f: "atrasadas" },
    { valor: resumo.sem_responsavel, nome: "sem responsável", cor: "text-alerta", f: "atencao" },
    { valor: resumo.novas, nome: "situações novas", cor: "text-destaque", f: "novas" },
    { valor: resumo.resolvidas_semana, nome: "resolvidas na semana", f: "resolvidas" },
  ];
  const podeAbrir = AREAS_OPERACAO.some((a) => nivel(a.id) >= 2);
  const s = resumo.saude;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <button key={k.nome} onClick={() => setFiltro(k.f)} className="cartao px-3.5 py-3 text-left hover:bg-elevado">
            <span className={clsx("block text-2xl font-semibold leading-tight", k.cor)}>{k.valor ?? "—"}</span>
            <span className="text-[12px] text-suave">{k.nome}</span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="cartao overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-borda px-4 py-2.5">
            <h2 className="mr-2 font-semibold">Precisa de atenção</h2>
            {[
              ["atencao", "Minhas e da minha área"],
              ["abertas", "Todas"],
              ["comigo", "Comigo"],
              ["atrasadas", "Atrasadas"],
              ["novas", "Novas"],
            ].map(([f, nome]) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={clsx("rounded-full border px-2.5 py-0.5 text-[12px]", filtro === f ? "border-marca bg-marca text-marca-texto" : "border-borda text-suave")}
              >
                {nome}
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
            <p className="px-4 py-10 text-center text-sm text-suave">Carregando...</p>
          ) : lista.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-suave">Nada precisando de atenção.</p>
          ) : (
            <div className="divide-y divide-borda">
              {lista.map((x) => (
                <LinhaSituacao key={x.id} s={x} />
              ))}
            </div>
          )}
        </section>

        <div className="space-y-4">
          {s && (
            <section className="cartao">
              <h2 className="border-b border-borda px-4 py-2.5 font-semibold">Saúde da plataforma</h2>
              <IndicadoresSaude s={s} />
            </section>
          )}
          <section className="cartao overflow-hidden">
            <h2 className="border-b border-borda px-4 py-2.5 font-semibold">O que mudou</h2>
            {mudancas.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-suave">—</p>
            ) : (
              <ul className="divide-y divide-borda">
                {mudancas.map((m, i) => (
                  <li key={i}>
                    <Link to={`/gestao/situacao/${m.numero}`} className="grid grid-cols-[48px_1fr] gap-2 px-4 py-2 text-[13px] hover:bg-elevado">
                      <span className="text-suave">{new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="min-w-0">
                        <span className="block truncate">
                          <strong>{m.autor}</strong> · {m.texto || (m.tipo === "criada" ? "abriu" : m.tipo)}
                        </span>
                        <span className="block truncate text-[12px] text-suave">
                          {codSit(m.numero)} · {m.titulo}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      {nova && <NovaSituacao fechar={() => setNova(false)} criada={(n) => navegar(`/gestao/situacao/${n}`)} />}
    </div>
  );
}

function IndicadoresSaude({ s, largo }: { s: NonNullable<Resumo["saude"]>; largo?: boolean }) {
  const normal = s.pedidos_hora_normal ?? null;
  // Abaixo da metade do normal do horário (com movimento esperado) = atenção.
  const baixo = normal != null && normal >= 4 && s.pedidos_hora < normal / 2;
  return (
    <div className={clsx("grid grid-cols-2 gap-2 p-3", largo && "lg:grid-cols-4")}>
      <Saude nome="Pedidos na última hora" valor={s.pedidos_hora} detalhe={normal != null ? `normal ${normal}` : undefined} alerta={baixo} />
      <Saude nome="Pagamentos aprovados (24 h)" valor={s.pagamentos_aprovados == null ? "—" : `${s.pagamentos_aprovados}%`} alerta={s.pagamentos_aprovados != null && s.pagamentos_aprovados < 90} />
      <Saude nome="Notificações atrasadas" valor={s.notificacoes_atrasadas} alerta={s.notificacoes_atrasadas > 0} />
      <Saude nome="Cadastros em análise" valor={s.cadastros_em_analise ?? "—"} alerta={(s.cadastros_em_analise ?? 0) > 0} />
    </div>
  );
}

function Saude({ nome, valor, alerta, detalhe }: { nome: string; valor: string | number; alerta?: boolean; detalhe?: string }) {
  return (
    <span className="rounded-lg bg-elevado/70 px-3 py-2">
      <span className="block text-[11.5px] text-suave">{nome}</span>
      <span className={clsx("block text-lg font-semibold", alerta ? "text-alerta" : "text-ok")}>
        {valor}
        {detalhe && <span className="ml-1.5 text-[11px] font-normal text-suave">{detalhe}</span>}
      </span>
    </span>
  );
}

/** Saúde da plataforma (Operação). */
export function SaudePlataforma() {
  const [s, setS] = useState<Resumo["saude"]>(null);
  useEffect(() => {
    supabase.rpc("resumo_central").then(({ data }) => setS(((data ?? {}) as Resumo).saude ?? null));
  }, []);
  if (!s) return <p className="cartao p-6 text-sm text-suave">Carregando...</p>;
  return (
    <section className="cartao">
      <IndicadoresSaude s={s} largo />
    </section>
  );
}

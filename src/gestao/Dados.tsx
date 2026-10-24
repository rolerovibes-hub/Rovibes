import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, Search, UserRound } from "lucide-react";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { reais } from "@/components/Formulario";
import { codSit, ESTADOS, tempoCurto, useGestao } from "@/lib/gestao";

const data = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Chips({ opcoes, valor, mudar }: { opcoes: [string, string][]; valor: string; mudar: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map(([v, nome]) => (
        <button
          key={v}
          onClick={() => mudar(v)}
          className={clsx("rounded-full border px-2.5 py-0.5 text-[12px]", valor === v ? "border-marca bg-marca text-marca-texto" : "border-borda text-suave")}
        >
          {nome}
        </button>
      ))}
    </div>
  );
}

function Busca({ valor, mudar, rotulo }: { valor: string; mudar: (v: string) => void; rotulo: string }) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
      <input className="entrada pl-9" placeholder="Buscar..." value={valor} onChange={(e) => mudar(e.target.value)} aria-label={rotulo} />
    </label>
  );
}

function Kpi({ valor, nome, cor }: { valor: string | number; nome: string; cor?: string }) {
  return (
    <span className="cartao px-3.5 py-2.5">
      <span className={clsx("block text-lg font-semibold leading-tight", cor)}>{valor}</span>
      <span className="text-[12px] text-suave">{nome}</span>
    </span>
  );
}

function useAtraso<T>(valor: T, ms = 250) {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = window.setTimeout(() => setV(valor), ms);
    return () => window.clearTimeout(t);
  }, [valor, ms]);
  return v;
}

// ============================================================
// Usuários · pessoas do app
// ============================================================
interface PessoaLinha {
  id: string;
  nome: string;
  usuario: string | null;
  foto_url: string | null;
  criado_em: string;
  suspenso: boolean;
  advertencias: number;
  denuncias_abertas: number;
}

export function PessoasApp() {
  const [termo, setTermo] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [lista, setLista] = useState<PessoaLinha[] | null>(null);
  const t = useAtraso(termo);
  useEffect(() => {
    supabase.rpc("buscar_pessoas_gestao", { p_termo: t, p_filtro: filtro }).then(({ data: d }) => setLista((d ?? []) as PessoaLinha[]));
  }, [t, filtro]);
  return (
    <section className="cartao overflow-hidden">
      <div className="space-y-2.5 border-b border-borda p-3">
        <Busca valor={termo} mudar={setTermo} rotulo="Buscar pessoa" />
        <Chips
          valor={filtro}
          mudar={setFiltro}
          opcoes={[
            ["todas", "Todas"],
            ["denunciadas", "Com denúncia"],
            ["advertidas", "Advertidas"],
            ["suspensas", "Suspensas"],
            ["novas", "Novas (7 dias)"],
          ]}
        />
      </div>
      {lista === null ? (
        <p className="p-6 text-center text-sm text-suave">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="p-10 text-center text-sm text-suave">Ninguém encontrado.</p>
      ) : (
        <ul className="divide-y divide-borda">
          {lista.map((p) => (
            <li key={p.id}>
              <Link to={`/gestao/pessoa/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-elevado">
                <Foto url={p.foto_url} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.nome}</span>
                  <span className="block text-[12px] text-suave">
                    {p.usuario ? `@${p.usuario} · ` : ""}desde {data(p.criado_em)}
                  </span>
                </span>
                {p.suspenso && <span className="rounded-full bg-perigo/15 px-2 py-0.5 text-[11px] font-bold text-perigo">Suspensa</span>}
                {p.advertencias > 0 && <span className="rounded-full bg-alerta/15 px-2 py-0.5 text-[11px] font-bold text-alerta">{p.advertencias} adv.</span>}
                {p.denuncias_abertas > 0 && <span className="rounded-full bg-perigo/15 px-2 py-0.5 text-[11px] font-bold text-perigo">{p.denuncias_abertas} den.</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Foto({ url, grande }: { url: string | null; grande?: boolean }) {
  const t = grande ? "h-14 w-14" : "h-9 w-9";
  return url ? (
    <img src={url} alt="" className={clsx(t, "shrink-0 rounded-full object-cover")} />
  ) : (
    <span className={clsx(t, "flex shrink-0 items-center justify-center rounded-full bg-elevado text-suave")}>
      <UserRound className="h-4 w-4" />
    </span>
  );
}

interface FichaPessoa {
  id: string;
  nome: string;
  usuario: string | null;
  foto_url: string | null;
  bio: string | null;
  criado_em: string;
  suspenso: boolean;
  advertencias: number;
  privado: boolean;
  email: string | null;
  ultimo_acesso: string | null;
  denuncias_abertas: number;
  denuncias_total: number;
  denuncias_feitas: number;
  seguidores?: number;
  pagamentos?: number;
  gasto?: number;
  ingressos?: number;
  checkins?: number;
  situacoes: { numero: number; titulo: string; estado: string }[];
}

export function FichaPessoaGestao() {
  const { id = "" } = useParams();
  const { nivel } = useGestao();
  const [f, setF] = useState<FichaPessoa | null | undefined>(undefined);
  const [erro, setErro] = useState("");
  const [suspender, setSuspender] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const carregar = useCallback(async () => {
    const { data: d, error } = await supabase.rpc("ficha_pessoa_gestao", { p_pessoa: id });
    if (error) setErro(mensagemDeErro(error));
    setF((d as FichaPessoa | null) ?? null);
  }, [id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (f === undefined) return <p className="cartao p-6 text-sm text-suave">Carregando...</p>;
  if (!f) return <p className="cartao p-6 text-sm text-perigo">{erro || "Pessoa não encontrada."}</p>;
  const autoriza = Math.max(nivel("usuarios"), nivel("seguranca")) >= 4;

  const agir = async (e?: FormEvent) => {
    e?.preventDefault();
    setOcupado(true);
    setErro("");
    const { error } = f.suspenso ? await supabase.rpc("reativar_conta", { p_pessoa: f.id }) : await supabase.rpc("suspender_conta", { p_pessoa: f.id, p_motivo: motivo });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error));
    setSuspender(false);
    setMotivo("");
    await carregar();
  };

  return (
    <div className="space-y-4">
      <button onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 text-sm text-suave hover:text-texto">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>
      <div className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <section className="cartao space-y-3 p-4">
          <div className="flex items-center gap-3">
            <Foto url={f.foto_url} grande />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{f.nome}</h1>
              <p className="text-[12px] text-suave">
                {f.usuario ? `@${f.usuario}` : "sem @"}
                {f.suspenso && <span className="ml-1.5 font-bold text-perigo">· Suspensa</span>}
              </p>
            </div>
          </div>
          {f.bio && <p className="text-sm">{f.bio}</p>}
          <div className="space-y-1 text-sm">
            <L nome="No RoVibes desde" valor={data(f.criado_em)} />
            <L nome="Último acesso" valor={f.ultimo_acesso ? tempoCurto(f.ultimo_acesso) : "—"} />
            {f.email && <L nome="E-mail" valor={f.email} />}
            <L nome="Perfil" valor={f.privado ? "Privado" : "Público"} />
            <L nome="Advertências" valor={String(f.advertencias)} />
          </div>
          {autoriza &&
            (suspender ? (
              <form onSubmit={(e) => void agir(e)} className="space-y-2">
                <input required autoFocus className="entrada" placeholder="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                <div className="flex gap-2">
                  <button type="submit" className="botao flex-1 text-perigo" disabled={ocupado || !motivo.trim()}>
                    Suspender
                  </button>
                  <button type="button" className="botao" onClick={() => setSuspender(false)}>
                    Cancelar
                  </button>
                </div>
              </form>
            ) : f.suspenso ? (
              <button className="botao-principal w-full" disabled={ocupado} onClick={() => void agir()}>
                Reativar conta
              </button>
            ) : (
              <button className="botao w-full text-perigo" onClick={() => setSuspender(true)}>
                Suspender conta
              </button>
            ))}
          {erro && <p className="text-sm text-perigo">{erro}</p>}
        </section>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Kpi valor={f.seguidores ?? "—"} nome="seguidores" />
            <Kpi valor={f.checkins ?? "—"} nome="check-ins" />
            <Kpi valor={f.gasto != null ? reais(Number(f.gasto)) || "R$ 0,00" : "—"} nome={`gasto em ${f.pagamentos ?? 0} pagamentos`} />
            <Kpi valor={f.ingressos ?? "—"} nome="ingressos comprados" />
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <Kpi valor={f.denuncias_abertas} nome="denúncias abertas" cor={f.denuncias_abertas ? "text-perigo" : undefined} />
            <Kpi valor={f.denuncias_total} nome="denúncias recebidas" />
            <Kpi valor={f.denuncias_feitas} nome="denúncias feitas" />
          </div>
          <section className="cartao overflow-hidden">
            <h2 className="border-b border-borda px-4 py-2.5 font-semibold">Situações</h2>
            {f.situacoes.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-suave">—</p>
            ) : (
              <ul className="divide-y divide-borda">
                {f.situacoes.map((s) => (
                  <li key={s.numero}>
                    <Link to={`/gestao/situacao/${s.numero}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-elevado">
                      <span className="codigo text-[12px] text-suave">{codSit(s.numero)}</span>
                      <span className="min-w-0 flex-1 truncate">{s.titulo}</span>
                      <span className="text-[12px] text-suave">{ESTADOS[s.estado] ?? s.estado}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function L({ nome, valor }: { nome: string; valor: string }) {
  return (
    <p className="flex justify-between gap-3">
      <span className="text-suave">{nome}</span>
      <span className="truncate text-right">{valor}</span>
    </p>
  );
}

// ============================================================
// Financeiro
// ============================================================
interface ResumoFin {
  aprovado?: number;
  comissao?: number;
  aprovados?: number;
  recusados?: number;
  estornado?: number;
  pelo_app?: number;
  no_caixa?: number;
  taxa_aprovacao?: number | null;
  reembolsos_pendentes?: number;
  reembolsos_falhos?: number;
  reembolsado?: number;
  sem_mercado_pago?: number;
  por_estabelecimento?: { id: string; nome: string; total: number; comissao: number; pagamentos: number }[];
}
interface Pagamento {
  id: string;
  criado_em: string;
  estabelecimento_id: string;
  estabelecimento: string;
  pessoa: string | null;
  origem: string;
  meio: string | null;
  valor: number;
  comissao: number;
  situacao: string;
  motivo: string | null;
}
interface Reembolso {
  id: string;
  criado_em: string;
  estabelecimento: string;
  pessoa: string | null;
  valor: number;
  motivo: string;
  situacao: string;
  feito_em: string | null;
}
const SIT_PAG: Record<string, { nome: string; cor: string }> = {
  aprovado: { nome: "Aprovado", cor: "text-ok" },
  pendente: { nome: "Pendente", cor: "text-suave" },
  recusado: { nome: "Recusado", cor: "text-perigo" },
  cancelado: { nome: "Cancelado", cor: "text-perigo" },
  estornado: { nome: "Estornado", cor: "text-alerta" },
  solicitado: { nome: "Solicitado", cor: "text-alerta" },
  feito: { nome: "Feito", cor: "text-ok" },
  falhou: { nome: "Falhou", cor: "text-perigo" },
};
const MEIO: Record<string, string> = { pix: "Pix", credito: "Crédito", debito: "Débito", dinheiro: "Dinheiro", outro: "Outro" };
const r$ = (v: number | null | undefined) => reais(Number(v ?? 0)) || "R$ 0,00";

export function FinanceiroGestao() {
  const [dias, setDias] = useState("30");
  const [aba, setAba] = useState<"pagamentos" | "reembolsos" | "lugares">("pagamentos");
  const [resumo, setResumo] = useState<ResumoFin>({});
  const [filtro, setFiltro] = useState("");
  const [termo, setTermo] = useState("");
  const [pagamentos, setPagamentos] = useState<Pagamento[] | null>(null);
  const [reembolsos, setReembolsos] = useState<Reembolso[] | null>(null);
  const t = useAtraso(termo);

  useEffect(() => {
    supabase.rpc("resumo_financeiro_gestao", { p_dias: Number(dias) }).then(({ data: d }) => setResumo((d ?? {}) as ResumoFin));
  }, [dias]);
  useEffect(() => {
    if (aba !== "pagamentos") return;
    setPagamentos(null);
    supabase.rpc("pagamentos_gestao", { p_situacao: filtro || null, p_termo: t || null, p_limite: 150 }).then(({ data: d }) => setPagamentos((d ?? []) as Pagamento[]));
  }, [aba, filtro, t]);
  useEffect(() => {
    if (aba !== "reembolsos") return;
    setReembolsos(null);
    supabase.rpc("reembolsos_gestao", { p_situacao: filtro || null }).then(({ data: d }) => setReembolsos((d ?? []) as Reembolso[]));
  }, [aba, filtro]);

  const mudarAba = (a: typeof aba) => {
    setAba(a);
    setFiltro("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Chips
          valor={dias}
          mudar={setDias}
          opcoes={[
            ["1", "Hoje"],
            ["7", "7 dias"],
            ["30", "30 dias"],
            ["90", "90 dias"],
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi valor={r$(resumo.aprovado)} nome={`aprovado · ${resumo.aprovados ?? 0} pag.`} />
        <Kpi valor={r$(resumo.comissao)} nome="comissão RoVibes" cor="text-destaque" />
        <Kpi valor={r$(resumo.pelo_app)} nome="pelo app" />
        <Kpi valor={resumo.taxa_aprovacao != null ? `${resumo.taxa_aprovacao}%` : "—"} nome="aprovação no app" cor={resumo.taxa_aprovacao != null && resumo.taxa_aprovacao < 90 ? "text-alerta" : "text-ok"} />
        <Kpi valor={resumo.reembolsos_pendentes ?? 0} nome="reembolsos pendentes" cor={resumo.reembolsos_pendentes ? "text-alerta" : undefined} />
        <Kpi valor={resumo.reembolsos_falhos ?? 0} nome="reembolsos com falha" cor={resumo.reembolsos_falhos ? "text-perigo" : undefined} />
      </div>
      {!!resumo.sem_mercado_pago && (
        <p className="cartao px-4 py-2.5 text-sm">
          <strong className="text-alerta">{resumo.sem_mercado_pago}</strong> estabelecimento{resumo.sem_mercado_pago > 1 ? "s" : ""} aprovado{resumo.sem_mercado_pago > 1 ? "s" : ""} sem Mercado Pago
        </p>
      )}

      <section className="cartao overflow-hidden">
        <div className="flex gap-1 border-b border-borda p-1.5" role="tablist">
          {(
            [
              ["pagamentos", "Pagamentos"],
              ["reembolsos", "Reembolsos"],
              ["lugares", "Por estabelecimento"],
            ] as [typeof aba, string][]
          ).map(([a, n]) => (
            <button key={a} role="tab" aria-selected={aba === a} onClick={() => mudarAba(a)} className={clsx("flex-1 rounded-md py-1.5 text-sm", aba === a ? "bg-destaque-suave font-semibold text-destaque" : "text-suave")}>
              {n}
            </button>
          ))}
        </div>

        {aba === "pagamentos" && (
          <>
            <div className="space-y-2.5 border-b border-borda p-3">
              <Busca valor={termo} mudar={setTermo} rotulo="Buscar pagamento" />
              <Chips
                valor={filtro}
                mudar={setFiltro}
                opcoes={[
                  ["", "Todos"],
                  ["aprovado", "Aprovados"],
                  ["falhas", "Recusados"],
                  ["pendente", "Pendentes"],
                  ["estornado", "Estornados"],
                ]}
              />
            </div>
            {pagamentos === null ? (
              <p className="p-6 text-center text-sm text-suave">Carregando...</p>
            ) : pagamentos.length === 0 ? (
              <p className="p-10 text-center text-sm text-suave">Nenhum pagamento.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-[12px] text-suave">
                    <tr className="border-b border-borda">
                      <th className="px-4 py-2 font-medium">Quando</th>
                      <th className="px-2 py-2 font-medium">Estabelecimento</th>
                      <th className="px-2 py-2 font-medium">Pessoa</th>
                      <th className="px-2 py-2 font-medium">Meio</th>
                      <th className="px-2 py-2 text-right font-medium">Valor</th>
                      <th className="px-4 py-2 text-right font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {pagamentos.map((p) => (
                      <tr key={p.id} title={p.motivo ?? undefined}>
                        <td className="whitespace-nowrap px-4 py-2 text-suave">{dataHora(p.criado_em)}</td>
                        <td className="max-w-[180px] truncate px-2 py-2">
                          <Link to={`/gestao/estabelecimento/${p.estabelecimento_id}`} className="hover:text-destaque">
                            {p.estabelecimento}
                          </Link>
                        </td>
                        <td className="max-w-[140px] truncate px-2 py-2">{p.pessoa ?? "—"}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-suave">
                          {p.origem === "app" ? "App" : "Caixa"}
                          {p.meio ? ` · ${MEIO[p.meio] ?? p.meio}` : ""}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-medium">{r$(p.valor)}</td>
                        <td className={clsx("whitespace-nowrap px-4 py-2 text-right text-[12px] font-semibold", SIT_PAG[p.situacao]?.cor)}>{SIT_PAG[p.situacao]?.nome ?? p.situacao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {aba === "reembolsos" && (
          <>
            <div className="border-b border-borda p-3">
              <Chips
                valor={filtro}
                mudar={setFiltro}
                opcoes={[
                  ["", "Todos"],
                  ["solicitado", "Pendentes"],
                  ["falhou", "Com falha"],
                  ["feito", "Feitos"],
                ]}
              />
            </div>
            {reembolsos === null ? (
              <p className="p-6 text-center text-sm text-suave">Carregando...</p>
            ) : reembolsos.length === 0 ? (
              <p className="p-10 text-center text-sm text-suave">Nenhum reembolso.</p>
            ) : (
              <ul className="divide-y divide-borda">
                {reembolsos.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {r.estabelecimento} · {r.pessoa ?? "—"}
                      </span>
                      <span className="block truncate text-[12px] text-suave">
                        {dataHora(r.criado_em)} · {r.motivo}
                      </span>
                    </span>
                    <span className="font-medium">{r$(r.valor)}</span>
                    <span className={clsx("w-20 text-right text-[12px] font-semibold", SIT_PAG[r.situacao]?.cor)}>{SIT_PAG[r.situacao]?.nome ?? r.situacao}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {aba === "lugares" &&
          (!resumo.por_estabelecimento?.length ? (
            <p className="p-10 text-center text-sm text-suave">Sem pagamentos no período.</p>
          ) : (
            <ul className="divide-y divide-borda">
              {resumo.por_estabelecimento.map((e, i) => (
                <li key={e.id}>
                  <Link to={`/gestao/estabelecimento/${e.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-elevado">
                    <span className="w-5 text-[12px] text-suave">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{e.nome}</span>
                    <span className="text-[12px] text-suave">{e.pagamentos} pag.</span>
                    <span className="w-24 text-right text-[12px] text-destaque">{r$(e.comissao)}</span>
                    <span className="w-28 text-right font-semibold">{r$(e.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
      </section>
    </div>
  );
}

// ============================================================
// Segurança · registro
// ============================================================
interface Registro {
  id: number;
  acao: string;
  alvo: string | null;
  detalhe: string | null;
  autor: string;
  criado_em: string;
}
const COR_REGISTRO = (acao: string) =>
  /suspens|recusad|desativad|apagado/i.test(acao) ? "bg-perigo" : /aprovad|reativad|criad/i.test(acao) ? "bg-ok" : /suporte|advertid|alterad/i.test(acao) ? "bg-alerta" : "bg-borda";

export function RegistroSeguranca() {
  const [termo, setTermo] = useState("");
  const [lista, setLista] = useState<Registro[] | null>(null);
  const [erro, setErro] = useState("");
  const t = useAtraso(termo);
  useEffect(() => {
    supabase.rpc("registro_seguranca", { p_termo: t || null, p_limite: 300 }).then(({ data: d, error }) => {
      if (error) setErro(/function|schema cache/i.test(error.message) ? "Aplique a atualização 052 do banco." : mensagemDeErro(error));
      setLista((d ?? []) as Registro[]);
    });
  }, [t]);
  return (
    <section className="cartao overflow-hidden">
      <div className="border-b border-borda p-3">
        <Busca valor={termo} mudar={setTermo} rotulo="Buscar no registro" />
      </div>
      {erro && <p className="px-4 py-3 text-sm text-perigo">{erro}</p>}
      {lista === null ? (
        <p className="p-6 text-center text-sm text-suave">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="p-10 text-center text-sm text-suave">Nada registrado.</p>
      ) : (
        <ul className="divide-y divide-borda">
          {lista.map((r) => (
            <li key={r.id} className="grid grid-cols-[10px_96px_1fr] items-start gap-3 px-4 py-2.5 text-[13px]">
              <span className={clsx("mt-1.5 h-2 w-2 rounded-full", COR_REGISTRO(r.acao))} />
              <span className="text-suave">{dataHora(r.criado_em)}</span>
              <span className="min-w-0">
                <span className="block">
                  <strong>{r.acao}</strong>
                  {r.alvo ? ` · ${r.alvo}` : ""}
                </span>
                <span className="block truncate text-[12px] text-suave">
                  {r.autor}
                  {r.detalhe ? ` · ${r.detalhe}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ============================================================
// Produto · buscas sem resultado
// ============================================================
export function BuscasVazias() {
  const [dias, setDias] = useState("30");
  const [lista, setLista] = useState<{ termo: string; vezes: number; pessoas: number; ultima: string }[] | null>(null);
  useEffect(() => {
    setLista(null);
    supabase.rpc("buscas_vazias_gestao", { p_dias: Number(dias) }).then(({ data: d }) => setLista((d ?? []) as typeof lista));
  }, [dias]);
  return (
    <section className="cartao overflow-hidden">
      <div className="border-b border-borda p-3">
        <Chips
          valor={dias}
          mudar={setDias}
          opcoes={[
            ["7", "7 dias"],
            ["30", "30 dias"],
            ["90", "90 dias"],
          ]}
        />
      </div>
      {lista === null ? (
        <p className="p-6 text-center text-sm text-suave">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="p-10 text-center text-sm text-suave">Nenhuma busca sem resultado.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-[12px] text-suave">
            <tr className="border-b border-borda">
              <th className="px-4 py-2 font-medium">Termo</th>
              <th className="px-2 py-2 text-right font-medium">Pessoas</th>
              <th className="px-2 py-2 text-right font-medium">Vezes</th>
              <th className="px-4 py-2 text-right font-medium">Última</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {lista.map((b) => (
              <tr key={b.termo}>
                <td className="px-4 py-2 font-medium">{b.termo}</td>
                <td className="px-2 py-2 text-right">{b.pessoas}</td>
                <td className="px-2 py-2 text-right text-suave">{b.vezes}</td>
                <td className="px-4 py-2 text-right text-[12px] text-suave">{tempoCurto(b.ultima)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

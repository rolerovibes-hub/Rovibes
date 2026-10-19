import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { CheckCircle2, ExternalLink, QrCode, ScanLine, Ticket, TicketX, Users, X, XCircle } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, Secao } from "@/components/Formulario";
import { LeitorQr } from "@/components/Qr";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useBusiness } from "@/lib/acessos";
import { codigoLegivel, ResumoIngresso, resumoIngressos } from "@/app/carteira";
import { quandoEvento } from "./Eventos";

interface Evento {
  id: string;
  nome: string;
  inicio: string;
  situacao: string;
  ingressos_vagas: number | null;
}

interface Pessoa {
  id: string;
  nome: string;
  codigo: string;
  situacao: "valido" | "usado";
  criado_em: string;
  usado_em: string | null;
}

type Resultado = { ok: true; nome: string; evento: string; pontos: number; foto_url?: string | null; usuario?: string | null; tipo?: string | null; meia?: boolean } | { ok: false; texto: string };

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function Ingressos() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [resumo, setResumo] = useState<Map<string, ResumoIngresso>>(new Map());
  const [periodo, setPeriodo] = useState<"proximos" | "passados">("proximos");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [lista, setLista] = useState<Pessoa[] | null>(null);
  const [vagas, setVagas] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [camera, setCamera] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    const corte = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    let q = supabase.from("eventos").select("id, nome, inicio, situacao, ingressos_vagas").eq("estabelecimento_id", id).neq("situacao", "rascunho").limit(200);
    q = periodo === "proximos" ? q.gte("inicio", corte).order("inicio") : q.lt("inicio", corte).order("inicio", { ascending: false });
    const { data } = await q;
    const l = (data ?? []) as Evento[];
    setEventos(l);
    setResumo(await resumoIngressos(l.map((e) => e.id)));
  }, [id, periodo]);

  const carregarLista = useCallback(async (evento: string) => {
    const { data } = await supabase.rpc("lista_ingressos", { p_evento: evento });
    setLista((data ?? []) as Pessoa[]);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    setLista(null);
    setVagas(null);
    if (selecionado) void carregarLista(selecionado);
  }, [selecionado, carregarLista]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const evento = eventos.find((e) => e.id === selecionado) ?? null;

  const validar = async (texto: string) => {
    if (!texto.trim() || ocupado) return;
    setOcupado(true);
    const { data, error } = await supabase.rpc("validar_ingresso", { p_estab: id, p_codigo: texto });
    setOcupado(false);
    if (error) {
      setResultado({ ok: false, texto: mensagemDeErro(error) });
      navigator.vibrate?.([80, 60, 80]);
      return;
    }
    const r = ((data ?? []) as { nome: string; evento: string; pontos: number; foto_url?: string | null; usuario?: string | null; tipo?: string | null; meia?: boolean }[])[0];
    setResultado({ ok: true, nome: r?.nome ?? "Cliente", evento: r?.evento ?? "", pontos: r?.pontos ?? 0, foto_url: r?.foto_url, usuario: r?.usuario, tipo: r?.tipo, meia: r?.meia });
    navigator.vibrate?.(60);
    setCodigo("");
    void carregar();
    if (selecionado) void carregarLista(selecionado);
  };

  const enviarCodigo = (e: FormEvent) => {
    e.preventDefault();
    void validar(codigo);
  };

  const salvarVagas = async (novo: number | null) => {
    if (!evento) return;
    setOcupado(true);
    setAviso(null);
    const { error } = await supabase.rpc("definir_vagas", { p_evento: evento.id, p_vagas: novo });
    setOcupado(false);
    if (error) return setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    setVagas(null);
    setAviso({ tipo: "ok", texto: novo == null ? "Ingressos pelo app desligados para este evento." : `Agora são ${novo} ingressos pelo app.` });
    await carregar();
  };

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setCamera((c) => !c)}>
            <ScanLine className="h-4 w-4" />
            {camera ? "Fechar câmera" : "Ler QR code"}
          </button>
          <button className="botao" disabled={!evento} onClick={() => evento && setVagas(evento.ingressos_vagas ? String(evento.ingressos_vagas) : "100")}>
            <Ticket className="h-4 w-4" />
            {evento?.ingressos_vagas ? "Mudar vagas" : "Abrir ingressos"}
          </button>
          <button
            className="botao"
            disabled={!evento || !evento.ingressos_vagas || ocupado || (resumo.get(evento.id)?.pegos ?? 0) > 0}
            title={evento && (resumo.get(evento.id)?.pegos ?? 0) > 0 ? "Já há ingressos pegos" : undefined}
            onClick={() => window.confirm("Desligar os ingressos pelo app neste evento?") && void salvarVagas(null)}
          >
            <TicketX className="h-4 w-4" />
            Desligar ingressos
          </button>
          <hr className="col-span-full my-1 border-borda" />
          {evento ? (
            <Link to={`/evento/${evento.id}`} className="botao">
              <ExternalLink className="h-4 w-4" />
              Ver no App
            </Link>
          ) : (
            <button className="botao" disabled>
              <ExternalLink className="h-4 w-4" />
              Ver no App
            </button>
          )}
        </>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <Secao titulo="Validar entrada">
        <div className={clsx("grid gap-5", camera && "md:grid-cols-[minmax(0,300px)_1fr]")}>
          {camera && <LeitorQr aoLer={(t) => void validar(t)} />}
          <div className="space-y-4">
            <form onSubmit={enviarCodigo} className="flex gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Código do ingresso</span>
                <input
                  className="entrada codigo h-11 text-base uppercase tracking-widest"
                  placeholder="ABCD-2345"
                  autoComplete="off"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                />
              </label>
              <button type="submit" className="botao-principal h-11" disabled={!codigo.trim() || ocupado}>
                <QrCode className="h-4 w-4" />
                Validar
              </button>
            </form>
            <p className="text-[13px] text-suave">Leia o QR code do ingresso no celular do cliente ou digite o código que aparece embaixo dele.</p>
            {resultado &&
              (resultado.ok ? (
                <div role="status" className="flex items-start gap-3 rounded-cartao border border-ok/40 bg-ok/10 px-4 py-3">
                  {resultado.foto_url ? (
                    <img src={resultado.foto_url} alt={`Foto de ${resultado.nome}`} className="h-16 w-16 shrink-0 rounded-full object-cover" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-ok" />
                  )}
                  <div>
                    <p className="font-semibold text-ok">Entrada liberada</p>
                    <p className="text-sm">
                      <strong>{resultado.nome}</strong>
                      {resultado.usuario ? ` (@${resultado.usuario})` : ""} · {resultado.evento}
                    </p>
                    {resultado.tipo && <p className="text-sm font-medium">{resultado.tipo}</p>}
                    {resultado.meia && <p className="text-sm font-semibold text-alerta">Meia-entrada: confira o documento.</p>}
                    <p className="text-[12px] text-suave">Ingresso nominal: confira se a pessoa é a da foto.</p>
                    {resultado.pontos > 0 && <p className="text-[13px] text-suave">+{resultado.pontos} pontos para o cliente</p>}
                  </div>
                </div>
              ) : (
                <div role="alert" className="flex items-start gap-3 rounded-cartao border border-perigo/40 bg-perigo/10 px-4 py-3">
                  <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-perigo" />
                  <div>
                    <p className="font-semibold text-perigo">Entrada não liberada</p>
                    <p className="text-sm">{resultado.texto}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </Secao>

      {vagas !== null && evento && (
        <Secao
          titulo={`Ingressos pelo app · ${evento.nome}`}
          acao={
            <button className="botao h-8 w-8 px-0" onClick={() => setVagas(null)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Math.round(Number(vagas));
              if (!n || n < 1) return setAviso({ tipo: "erro", texto: "Informe quantas vagas." });
              void salvarVagas(n);
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <Campo rotulo="Quantidade de ingressos gratuitos" className="w-56">
              <input type="number" min={1} autoFocus className="entrada" value={vagas} onChange={(e) => setVagas(e.target.value)} />
            </Campo>
            <button type="submit" className="botao-principal" disabled={ocupado}>
              Salvar
            </button>
            <p className="w-full text-[13px] text-suave">Cada pessoa pega um ingresso pelo App, com QR code. Ingressos pagos chegam junto com o pagamento pelo App.</p>
          </form>
        </Secao>
      )}

      <section className="cartao flex gap-2 p-3" role="tablist" aria-label="Período">
        {(["proximos", "passados"] as const).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={periodo === p}
            onClick={() => {
              setPeriodo(p);
              setSelecionado(null);
            }}
            className={clsx("rounded-lg px-3 py-1.5 text-sm", periodo === p ? "bg-destaque-suave font-semibold text-destaque" : "text-suave hover:bg-elevado hover:text-texto")}
          >
            {p === "proximos" ? "Hoje e próximos" : "Passados"}
          </button>
        ))}
      </section>

      <section className="cartao overflow-hidden">
        {eventos.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Ticket className="mx-auto h-8 w-8 text-suave" />
            <p className="mt-3 font-medium">Nenhum evento</p>
            <p className="mt-1 text-sm text-suave">Crie o evento no aplicativo Eventos e depois abra os ingressos aqui.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-borda bg-elevado/60">
                <tr>
                  {["Evento", "Quando", "Ingressos", "Pegos", "Entraram"].map((c) => (
                    <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventos.map((e) => {
                  const r = resumo.get(e.id);
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setSelecionado(e.id)}
                      aria-selected={selecionado === e.id}
                      className={clsx("cursor-pointer border-b border-borda last:border-0", selecionado === e.id ? "bg-destaque-suave" : "hover:bg-elevado")}
                    >
                      <td className="px-4 py-2.5 font-medium">
                        {e.nome}
                        {e.situacao === "cancelado" && <span className="ml-2 text-[12px] font-normal text-perigo">cancelado</span>}
                      </td>
                      <td className="codigo whitespace-nowrap px-4 py-2.5 text-sm">{quandoEvento(e.inicio)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">{e.ingressos_vagas ? <span className="codigo text-sm">{e.ingressos_vagas} vagas</span> : <span className="text-suave">Sem ingressos</span>}</td>
                      <td className="codigo px-4 py-2.5 text-sm">{r?.pegos ?? 0}</td>
                      <td className="codigo px-4 py-2.5 text-sm">{r?.entraram ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {evento && <VendasEvento evento={evento.id} />}

      {evento && lista && (
        <Secao titulo={`Lista de ${evento.nome}`}>
          {lista.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-suave">
              <Users className="h-4 w-4" />
              Ninguém pegou ingresso ainda.
            </p>
          ) : (
            <ul className="divide-y divide-borda">
              {lista.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
                  <span className="codigo text-suave">{codigoLegivel(p.codigo)}</span>
                  <span className={clsx("w-28 text-right text-[13px]", p.situacao === "usado" ? "font-medium text-ok" : "text-suave")}>
                    {p.situacao === "usado" && p.usado_em ? `Entrou ${hora(p.usado_em)}` : "Aguardando"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      )}
    </TelaUniversal>
  );
}

interface Vendas {
  lotes: { tipo: string; lote: string; preco: number; quantidade: number; vendidos: number; meias: number; entraram: number; ativo: boolean; atual: boolean }[];
  bruto: number;
  comissao: number;
  reembolsado: number;
  reembolsos: { id: string; valor: number; motivo: string; situacao: "solicitado" | "feito" | "falhou"; nome: string | null; em: string }[];
}

/** Vendas de ingressos pagos do evento (por tipo e lote) e reembolsos. */
function VendasEvento({ evento }: { evento: string }) {
  const [v, setV] = useState<Vendas | null>(null);
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const carregar = useCallback(() => {
    supabase.rpc("vendas_ingressos", { p_evento: evento }).then(({ data, error }) => setV(error ? null : (data as Vendas)));
  }, [evento]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  if (!v || (!v.lotes.length && !v.reembolsos.length)) return null;
  const r$ = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pendentes = v.reembolsos.filter((r) => r.situacao !== "feito");

  const reembolsar = async (ids: string[]) => {
    setOcupado(true);
    setAviso("");
    const { data, error } = await supabase.functions.invoke("mp-reembolso", { body: { reembolsos: ids } });
    setOcupado(false);
    const r = data as { feitos?: string[]; falhas?: string[] } | null;
    setAviso(error ? "Não foi possível falar com o Mercado Pago agora." : `${r?.feitos?.length ?? 0} reembolso(s) feito(s)${r?.falhas?.length ? `, ${r.falhas.length} com falha (faça pelo Mercado Pago e marque como feito)` : ""}.`);
    carregar();
  };
  const marcarFeito = async (id: string) => {
    const { error } = await supabase.rpc("marcar_reembolso", { p_reembolso: id, p_situacao: "feito", p_mp: null });
    if (error) setAviso(mensagemDeErro(error));
    carregar();
  };

  return (
    <Secao titulo="Vendas de ingressos">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-elevado px-3 py-2">
          <span className="codigo block font-semibold">{r$(v.bruto)}</span>
          <span className="text-[12px] text-suave">vendido</span>
        </div>
        <div className="rounded-lg bg-elevado px-3 py-2">
          <span className="codigo block font-semibold">{r$(v.comissao)}</span>
          <span className="text-[12px] text-suave">taxa RoVibes</span>
        </div>
        <div className="rounded-lg bg-elevado px-3 py-2">
          <span className="codigo block font-semibold">{r$(v.reembolsado)}</span>
          <span className="text-[12px] text-suave">reembolsado</span>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-borda text-left text-[12px] text-suave">
              <th className="py-2 pr-3 font-medium">Tipo · lote</th>
              <th className="py-2 pr-3 text-right font-medium">Preço</th>
              <th className="py-2 pr-3 text-right font-medium">Vendidos</th>
              <th className="py-2 pr-3 text-right font-medium">Meias</th>
              <th className="py-2 text-right font-medium">Entraram</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {v.lotes.map((l, i) => (
              <tr key={i} className={l.ativo ? "" : "text-suave"}>
                <td className="py-2 pr-3">
                  {l.tipo} · {l.lote} {l.atual && <span className="ml-1 rounded bg-ok/15 px-1.5 text-[11px] font-semibold text-ok">à venda</span>}
                </td>
                <td className="codigo py-2 pr-3 text-right">{r$(l.preco)}</td>
                <td className="codigo py-2 pr-3 text-right">
                  {l.vendidos}/{l.quantidade}
                </td>
                <td className="codigo py-2 pr-3 text-right">{l.meias}</td>
                <td className="codigo py-2 text-right">{l.entraram}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {v.reembolsos.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Reembolsos</h3>
            {pendentes.length > 0 && (
              <button className="botao h-8 text-[13px]" disabled={ocupado} onClick={() => void reembolsar(pendentes.map((r) => r.id))}>
                Reembolsar pendentes pelo Mercado Pago
              </button>
            )}
          </div>
          <ul className="divide-y divide-borda rounded-lg border border-borda text-sm">
            {v.reembolsos.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block">
                    {r.nome ?? "Cliente"} · <span className="codigo">{r$(r.valor)}</span>
                  </span>
                  <span className="block text-[12px] text-suave">{r.motivo}</span>
                </span>
                <span className={r.situacao === "feito" ? "text-ok" : r.situacao === "falhou" ? "text-perigo" : "text-alerta"}>
                  {r.situacao === "feito" ? "Feito" : r.situacao === "falhou" ? "Falhou" : "Pendente"}
                </span>
                {r.situacao !== "feito" && (
                  <button className="botao h-8 px-2.5 text-[12px]" onClick={() => void marcarFeito(r.id)}>
                    Marcar como feito
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {aviso && <p className="mt-2 text-sm text-suave">{aviso}</p>}
    </Secao>
  );
}

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { BadgePercent, Ban, ExternalLink, Pause, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, Secao } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useBusiness } from "@/lib/acessos";
import { dataCurta, descreverBeneficio, descreverRegras, DIAS_SEMANA, TipoBeneficio } from "@/lib/beneficio";
import { beneficioDoBanco, beneficioParaBanco, beneficioVazio, CamposBeneficio, useItensCardapio, ValoresBeneficio } from "./CamposBeneficio";

type Situacao = "ativa" | "pausada" | "encerrada";

interface Promocao {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: TipoBeneficio;
  valor: number | null;
  item_id: string | null;
  item: { nome: string } | null;
  pedido_minimo: number | null;
  inicio: string;
  fim: string | null;
  dias: number[] | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  limite_total: number | null;
  limite_por_pessoa: number;
  validade_dias: number;
  situacao: Situacao;
}

interface Rascunho {
  id?: string;
  titulo: string;
  descricao: string;
  beneficio: ValoresBeneficio;
  inicio: string;
  fim: string;
  dias: number[];
  hora_inicio: string;
  hora_fim: string;
  limite_total: string;
  limite_por_pessoa: string;
  validade_dias: string;
  situacao: Situacao;
}

const NOME_SITUACAO: Record<Situacao, string> = { ativa: "Ativa", pausada: "Pausada", encerrada: "Encerrada" };
const COR: Record<Situacao, string> = { ativa: "text-ok", pausada: "text-alerta", encerrada: "text-suave" };

const dataLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const hoje = () => dataLocal(new Date().toISOString());

const vazio = (): Rascunho => ({
  titulo: "",
  descricao: "",
  beneficio: beneficioVazio(),
  inicio: hoje(),
  fim: "",
  dias: [],
  hora_inicio: "",
  hora_fim: "",
  limite_total: "",
  limite_por_pessoa: "1",
  validade_dias: "30",
  situacao: "ativa",
});

const inteiro = (t: string) => (t.trim() ? Math.round(Number(t)) : null);

export function Promocoes() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const itens = useItensCardapio(id);
  const [lista, setLista] = useState<Promocao[]>([]);
  const [resumo, setResumo] = useState<Map<string, { resgatados: number; usados: number }>>(new Map());
  const [filtro, setFiltro] = useState<"vigentes" | "encerradas">("vigentes");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("promocoes")
      .select("id, titulo, descricao, tipo, valor, item_id, item:cardapio_itens(nome), pedido_minimo, inicio, fim, dias, hora_inicio, hora_fim, limite_total, limite_por_pessoa, validade_dias, situacao")
      .eq("estabelecimento_id", id)
      .order("criado_em", { ascending: false })
      .limit(300);
    const l = ((data ?? []) as unknown as Promocao[]).map((p) => ({
      ...p,
      valor: p.valor == null ? null : Number(p.valor),
      pedido_minimo: p.pedido_minimo == null ? null : Number(p.pedido_minimo),
    }));
    setLista(l);
    if (l.length) {
      const { data: r } = await supabase.rpc("resumo_promocoes", { p_ids: l.map((p) => p.id) });
      setResumo(new Map(((r ?? []) as { promocao_id: string; resgatados: number; usados: number }[]).map((x) => [x.promocao_id, x])));
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const terminou = (p: Promocao) => p.situacao === "encerrada" || (p.fim != null && Date.parse(p.fim) <= Date.now());
  const visiveis = lista.filter((p) => (filtro === "vigentes" ? !terminou(p) : terminou(p)));
  const promo = lista.find((p) => p.id === selecionado) ?? null;

  const executar = async (acao: () => Promise<void>, ok?: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await acao();
      if (ok) setAviso({ tipo: "ok", texto: ok });
    } catch (err) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(err) });
    } finally {
      setOcupado(false);
    }
  };

  const editar = (p: Promocao) =>
    setRascunho({
      id: p.id,
      titulo: p.titulo,
      descricao: p.descricao ?? "",
      beneficio: beneficioDoBanco(p),
      inicio: dataLocal(p.inicio),
      fim: dataLocal(p.fim),
      dias: p.dias ?? [],
      hora_inicio: p.hora_inicio?.slice(0, 5) ?? "",
      hora_fim: p.hora_fim?.slice(0, 5) ?? "",
      limite_total: p.limite_total == null ? "" : String(p.limite_total),
      limite_por_pessoa: String(p.limite_por_pessoa),
      validade_dias: String(p.validade_dias),
      situacao: p.situacao,
    });

  const salvar = (ev: FormEvent) => {
    ev.preventDefault();
    if (!rascunho) return;
    void executar(async () => {
      const r = rascunho;
      if (!!r.hora_inicio !== !!r.hora_fim) throw new Error("Informe as duas horas (das / até) ou deixe as duas em branco.");
      const original = lista.find((p) => p.id === r.id);
      const inicioDia = r.inicio ? new Date(`${r.inicio}T00:00`) : new Date();
      // Mantém o início original se a data não mudou (evita "ainda não começou" ao editar).
      const inicio = original && dataLocal(original.inicio) === r.inicio ? original.inicio : inicioDia.toISOString();
      const fim = r.fim ? new Date(`${r.fim}T23:59:59`).toISOString() : null;
      if (fim && fim <= inicio) throw new Error("O fim precisa ser depois do início.");
      const valores = {
        titulo: r.titulo.trim(),
        descricao: r.descricao.trim() || null,
        ...beneficioParaBanco(r.beneficio),
        inicio,
        fim,
        dias: r.dias.length && r.dias.length < 7 ? [...r.dias].sort() : null,
        hora_inicio: r.hora_inicio || null,
        hora_fim: r.hora_fim || null,
        limite_total: inteiro(r.limite_total),
        limite_por_pessoa: inteiro(r.limite_por_pessoa) ?? 1,
        validade_dias: inteiro(r.validade_dias) ?? 30,
        situacao: r.situacao,
      };
      const { error } = r.id
        ? await supabase.from("promocoes").update(valores).eq("id", r.id)
        : await supabase.from("promocoes").insert({ ...valores, estabelecimento_id: id });
      if (error) throw error;
      setRascunho(null);
      await carregar();
    }, "Promoção salva.");
  };

  const mudarSituacao = (s: Situacao, pergunta?: string) =>
    promo &&
    void executar(async () => {
      if (pergunta && !window.confirm(pergunta)) return;
      const { error } = await supabase.from("promocoes").update({ situacao: s }).eq("id", promo.id);
      if (error) throw error;
      await carregar();
    });

  const excluir = () =>
    promo &&
    void executar(async () => {
      if (!window.confirm(`Excluir "${promo.titulo}"? Os cupons já resgatados continuam valendo na carteira dos clientes.`)) return;
      const { error } = await supabase.from("promocoes").delete().eq("id", promo.id);
      if (error) throw error;
      setSelecionado(null);
      await carregar();
    }, "Promoção excluída.");

  const alternarDia = (d: number) =>
    rascunho && setRascunho({ ...rascunho, dias: rascunho.dias.includes(d) ? rascunho.dias.filter((x) => x !== d) : [...rascunho.dias, d] });

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setRascunho(vazio())}>
            <Plus className="h-4 w-4" />
            Nova promoção
          </button>
          <button className="botao" disabled={!promo} onClick={() => promo && editar(promo)}>
            <Pencil className="h-4 w-4" />
            Editar
          </button>
          {promo?.situacao === "pausada" ? (
            <button className="botao" disabled={ocupado} onClick={() => mudarSituacao("ativa")}>
              <Play className="h-4 w-4" />
              Reativar
            </button>
          ) : (
            <button className="botao" disabled={!promo || promo.situacao !== "ativa" || ocupado} onClick={() => mudarSituacao("pausada")}>
              <Pause className="h-4 w-4" />
              Pausar
            </button>
          )}
          <button
            className="botao"
            disabled={!promo || promo.situacao === "encerrada" || ocupado}
            onClick={() => mudarSituacao("encerrada", `Encerrar "${promo?.titulo}"? Ninguém mais consegue resgatar. Os cupons já resgatados continuam valendo.`)}
          >
            <Ban className="h-4 w-4" />
            Encerrar
          </button>
          <hr className="col-span-full my-1 border-borda" />
          <Link to={`/lugar/${id}`} className="botao">
            <ExternalLink className="h-4 w-4" />
            Ver no App
          </Link>
        </>
      }
      rodape={
        <button className="botao w-full text-perigo" disabled={!promo || ocupado} onClick={excluir}>
          <Trash2 className="h-4 w-4" />
          Excluir
        </button>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <p className="cartao px-4 py-3 text-sm text-suave">
        Os cupons são resgatados pelos clientes no App (é preciso ter conta no RoVibes) e valem só em pedidos feitos pelo RoVibes.
      </p>

      {rascunho && (
        <Secao
          titulo={rascunho.id ? "Editar promoção" : "Nova promoção"}
          acao={
            <button className="botao h-8 w-8 px-0" onClick={() => setRascunho(null)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          }
        >
          <form onSubmit={salvar} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo rotulo="Nome da promoção" className="sm:col-span-3">
                <input
                  required
                  minLength={2}
                  autoFocus
                  className="entrada"
                  placeholder="Happy hour: 20% em todo o cardápio"
                  value={rascunho.titulo}
                  onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })}
                />
              </Campo>
              <CamposBeneficio valores={rascunho.beneficio} itens={itens} mudar={(b) => setRascunho({ ...rascunho, beneficio: b })} />
              <Campo rotulo="Descrição (opcional)" className="sm:col-span-3">
                <textarea rows={2} maxLength={400} className="entrada" value={rascunho.descricao} onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })} />
              </Campo>
            </div>

            <fieldset className="space-y-3">
              <legend className="rotulo mb-1">Quando o cupom pode ser usado</legend>
              <div className="flex flex-wrap gap-1.5">
                {DIAS_SEMANA.map((d, i) => {
                  const marcado = rascunho.dias.includes(i);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={marcado}
                      onClick={() => alternarDia(i)}
                      className={clsx("h-9 w-12 rounded-lg border text-sm capitalize", marcado ? "border-marca bg-destaque-suave font-semibold text-destaque" : "border-borda hover:bg-elevado")}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <p className="text-[13px] text-suave">Sem dias marcados, vale todos os dias.</p>
              <div className="grid max-w-sm grid-cols-2 gap-4">
                <Campo rotulo="Das (opcional)">
                  <input type="time" className="entrada" value={rascunho.hora_inicio} onChange={(e) => setRascunho({ ...rascunho, hora_inicio: e.target.value })} />
                </Campo>
                <Campo rotulo="Até">
                  <input type="time" className="entrada" value={rascunho.hora_fim} onChange={(e) => setRascunho({ ...rascunho, hora_fim: e.target.value })} />
                </Campo>
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-3">
              <Campo rotulo="Campanha começa em">
                <input type="date" className="entrada" value={rascunho.inicio} onChange={(e) => setRascunho({ ...rascunho, inicio: e.target.value })} />
              </Campo>
              <Campo rotulo="Termina em (opcional)">
                <input type="date" className="entrada" value={rascunho.fim} onChange={(e) => setRascunho({ ...rascunho, fim: e.target.value })} />
              </Campo>
              <Campo rotulo="Cupom vale por (dias após resgate)">
                <input type="number" min={1} max={365} className="entrada" value={rascunho.validade_dias} onChange={(e) => setRascunho({ ...rascunho, validade_dias: e.target.value })} />
              </Campo>
              <Campo rotulo="Total de cupons (opcional)">
                <input type="number" min={1} className="entrada" placeholder="Sem limite" value={rascunho.limite_total} onChange={(e) => setRascunho({ ...rascunho, limite_total: e.target.value })} />
              </Campo>
              <Campo rotulo="Cupons por pessoa">
                <input type="number" min={1} max={20} className="entrada" value={rascunho.limite_por_pessoa} onChange={(e) => setRascunho({ ...rascunho, limite_por_pessoa: e.target.value })} />
              </Campo>
              <Campo rotulo="Situação">
                <select className="entrada" value={rascunho.situacao} onChange={(e) => setRascunho({ ...rascunho, situacao: e.target.value as Situacao })}>
                  <option value="ativa">Ativa (aparece no App)</option>
                  <option value="pausada">Pausada</option>
                  <option value="encerrada">Encerrada</option>
                </select>
              </Campo>
            </div>
            {rascunho.id && <p className="text-[13px] text-suave">Mudanças valem para os próximos resgates. Cupons já resgatados mantêm as regras de quando foram pegos.</p>}

            <div className="flex gap-2">
              <button type="submit" className="botao-principal" disabled={ocupado}>
                Salvar promoção
              </button>
              <button type="button" className="botao" onClick={() => setRascunho(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </Secao>
      )}

      <section className="cartao flex gap-2 p-3" role="tablist" aria-label="Filtro">
        {(["vigentes", "encerradas"] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filtro === f}
            onClick={() => {
              setFiltro(f);
              setSelecionado(null);
            }}
            className={clsx("rounded-lg px-3 py-1.5 text-sm", filtro === f ? "bg-destaque-suave font-semibold text-destaque" : "text-suave hover:bg-elevado hover:text-texto")}
          >
            {f === "vigentes" ? "Vigentes" : "Encerradas"}
          </button>
        ))}
      </section>

      <section className="cartao overflow-hidden">
        {visiveis.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <BadgePercent className="mx-auto h-8 w-8 text-suave" />
            <p className="mt-3 font-medium">{filtro === "vigentes" ? "Nenhuma promoção no ar" : "Nenhuma promoção encerrada"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-borda bg-elevado/60">
                <tr>
                  {["Promoção", "Benefício", "Vigência", "Resgatados", "Usados", "Situação"].map((c) => (
                    <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => {
                  const r = resumo.get(p.id);
                  const regras = descreverRegras(p);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelecionado(p.id)}
                      onDoubleClick={() => editar(p)}
                      aria-selected={selecionado === p.id}
                      className={clsx("cursor-pointer border-b border-borda last:border-0", selecionado === p.id ? "bg-destaque-suave" : "hover:bg-elevado")}
                    >
                      <td className="px-4 py-2.5">
                        <span className="block font-medium">{p.titulo}</span>
                        {regras && <span className="block text-[12px] text-suave">{regras}</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">{descreverBeneficio(p)}</td>
                      <td className="codigo whitespace-nowrap px-4 py-2.5 text-sm">
                        {dataCurta(p.inicio)} – {p.fim ? dataCurta(p.fim) : "sem fim"}
                      </td>
                      <td className="codigo whitespace-nowrap px-4 py-2.5 text-sm">
                        {r?.resgatados ?? 0}
                        {p.limite_total != null && <span className="text-suave"> / {p.limite_total}</span>}
                      </td>
                      <td className="codigo px-4 py-2.5 text-sm">{r?.usados ?? 0}</td>
                      <td className={clsx("whitespace-nowrap px-4 py-2.5 font-medium", COR[p.situacao])}>{NOME_SITUACAO[p.situacao]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </TelaUniversal>
  );
}

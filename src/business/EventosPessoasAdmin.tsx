import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Ban, CheckCircle2, Plus, RotateCcw, Save } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Secao } from "@/components/Formulario";
import { reais } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { NOME_TIPO, TipoEventoPessoa } from "@/lib/eventosPessoa";

interface Regras {
  ativo: boolean;
  taxa_pct: number;
  preco_min: number;
  preco_max: number;
  max_ingressos: number;
  max_por_compra: number;
  corte_venda_horas: number;
  antecedencia_max_dias: number;
  permitir_publico: boolean;
  termos: string;
  termos_versao: number;
  atualizado_em: string;
  pacotes: PacoteAdmin[];
}
interface PacoteAdmin {
  id?: string;
  nome: string;
  dias: number;
  preco: number;
  raio_km: number;
  descricao: string | null;
  ativo: boolean;
  ordem: number;
}
interface EventoAdmin {
  id: string;
  titulo: string;
  tipo: TipoEventoPessoa;
  inicio: string;
  situacao: string;
  suspenso: boolean;
  visibilidade: string;
  anfitriao: string;
  anfitriao_usuario: string | null;
  vendidos: number;
  arrecadado: number;
  taxas: number;
  a_reembolsar: number;
  impulsionado: boolean;
}

type Aba = "regras" | "termos" | "pacotes" | "eventos";

/** A1007 · Eventos de pessoas: a equipe RoVibes define regras, preços, taxa, termos e pacotes de impulso, e modera os eventos. */
export function EventosPessoasAdmin() {
  const [aba, setAba] = useState<Aba>("regras");
  const [regras, setRegras] = useState<Regras | null>(null);
  const [eventos, setEventos] = useState<EventoAdmin[]>([]);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [r, e] = await Promise.all([supabase.rpc("regras_eventos_admin"), supabase.rpc("eventos_pessoa_admin")]);
    if (r.error) return setAviso({ tipo: "erro", texto: /function|schema cache/i.test(r.error.message) ? "Falta aplicar a atualização 037 do banco." : mensagemDeErro(r.error) });
    const d = r.data as Regras;
    setRegras({ ...d, taxa_pct: Number(d.taxa_pct), preco_min: Number(d.preco_min), preco_max: Number(d.preco_max), pacotes: d.pacotes.map((p) => ({ ...p, preco: Number(p.preco) })) });
    setEventos(((e.data ?? []) as EventoAdmin[]).map((x) => ({ ...x, arrecadado: Number(x.arrecadado), taxas: Number(x.taxas) })));
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!regras) return aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : <p className="text-sm text-suave">Carregando...</p>;
  const ev = eventos.find((x) => x.id === selecionado) ?? null;

  const salvarRegras = async () => {
    setSalvando(true);
    setAviso(null);
    const { error } = await supabase.rpc("salvar_regras_eventos", { p: regras });
    setSalvando(false);
    if (error) return setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    setAviso({ tipo: "ok", texto: "Regras salvas." });
    void carregar();
  };

  const salvarPacote = async (p: PacoteAdmin) => {
    const { error } = await supabase.rpc("salvar_pacote_impulso", { p_id: p.id ?? null, p });
    if (error) return setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    setAviso({ tipo: "ok", texto: `Pacote "${p.nome}" salvo.` });
    void carregar();
  };

  const suspender = async (sim: boolean) => {
    if (!ev) return;
    const motivo = sim ? window.prompt("Motivo da suspensão (o anfitrião vê):") : "";
    if (sim && motivo === null) return;
    const { error } = await supabase.rpc("suspender_evento_pessoa", { p_evento: ev.id, p_suspender: sim, p_motivo: motivo });
    if (error) return setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    setAviso({ tipo: "ok", texto: sim ? "Evento suspenso. As compras pagas entraram para reembolso." : "Evento liberado." });
    void carregar();
  };

  const reembolsado = async () => {
    if (!ev || !window.confirm("Você já estornou essas compras no Mercado Pago?")) return;
    const { data, error } = await supabase.rpc("marcar_reembolso_anfitriao", { p_evento: ev.id });
    if (error) return setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    setAviso({ tipo: "ok", texto: `${data} compra(s) marcadas como reembolsadas.` });
    void carregar();
  };

  const num = (campo: keyof Regras, rotulo: string, ajuda?: string, passo = "1") => (
    <label className="block">
      <span className="rotulo mb-1 block">{rotulo}</span>
      <input
        type="number"
        step={passo}
        className="entrada"
        value={String(regras[campo] ?? "")}
        onChange={(e) => setRegras({ ...regras, [campo]: Number(e.target.value) })}
      />
      {ajuda && <span className="mt-0.5 block text-[12px] text-suave">{ajuda}</span>}
    </label>
  );

  return (
    <TelaUniversal
      acoes={
        aba === "eventos" ? (
          <>
            <button className="botao" disabled={!ev || ev.suspenso} onClick={() => void suspender(true)}>
              <Ban className="h-4 w-4" />
              Suspender
            </button>
            <button className="botao" disabled={!ev || !ev.suspenso} onClick={() => void suspender(false)}>
              <CheckCircle2 className="h-4 w-4" />
              Liberar
            </button>
            <button className="botao" disabled={!ev || ev.a_reembolsar === 0} onClick={() => void reembolsado()}>
              <RotateCcw className="h-4 w-4" />
              Marcar reembolsado
            </button>
          </>
        ) : (
          <button className="botao-principal col-span-2 sm:col-span-1" disabled={salvando || aba === "pacotes"} onClick={() => void salvarRegras()}>
            <Save className="h-4 w-4" />
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        )
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <div className="flex gap-1 rounded-lg border border-borda p-1" role="tablist">
        {(
          [
            ["regras", "Regras e preços"],
            ["termos", "Termos"],
            ["pacotes", "Impulsionar"],
            ["eventos", `Eventos (${eventos.length})`],
          ] as [Aba, string][]
        ).map(([a, n]) => (
          <button key={a} role="tab" aria-selected={aba === a} onClick={() => setAba(a)} className={clsx("flex-1 rounded-md py-1.5 text-sm", aba === a ? "bg-destaque-suave font-semibold text-destaque" : "text-suave")}>
            {n}
          </button>
        ))}
      </div>

      {aba === "regras" && (
        <Secao titulo="Regras para quem cria eventos">
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--marca))]" checked={regras.ativo} onChange={(e) => setRegras({ ...regras, ativo: e.target.checked })} />
            Criação de eventos por pessoas ligada
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {num("taxa_pct", "Taxa do RoVibes por ingresso (%)", undefined, "0.1")}
            {num("preco_min", "Preço mínimo do ingresso pago (R$)", undefined, "0.01")}
            {num("preco_max", "Preço máximo do ingresso (R$)", undefined, "0.01")}
            {num("max_ingressos", "Máximo de ingressos por evento")}
            {num("max_por_compra", "Máximo por compra")}
            {num("corte_venda_horas", "Vendas fecham quantas horas antes")}
            {num("antecedencia_max_dias", "Criar com até quantos dias de antecedência")}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--marca))]" checked={regras.permitir_publico} onChange={(e) => setRegras({ ...regras, permitir_publico: e.target.checked })} />
            Permitir eventos públicos (qualquer pessoa perto do local)
          </label>
          <p className="mt-3 text-[12px] text-suave">Última alteração: {new Date(regras.atualizado_em).toLocaleString("pt-BR")}</p>
        </Secao>
      )}

      {aba === "termos" && (
        <Secao titulo={`Termos de venda de ingressos · versão ${regras.termos_versao}`}>
          <textarea rows={22} className="entrada py-2 font-mono text-[13px]" value={regras.termos} onChange={(e) => setRegras({ ...regras, termos: e.target.value })} />
        </Secao>
      )}

      {aba === "pacotes" && (
        <Secao titulo="Pacotes de impulsionamento">
          <div className="space-y-2">
            {[...regras.pacotes, { nome: "", dias: 1, preco: 9.9, raio_km: 5, descricao: "", ativo: true, ordem: regras.pacotes.length + 1 } as PacoteAdmin].map((p, i) => (
              <EditorPacote key={p.id ?? `novo-${i}`} inicial={p} salvar={salvarPacote} />
            ))}
          </div>
        </Secao>
      )}

      {aba === "eventos" && (
        <section className="cartao overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-[12px] text-suave">
                <th className="px-4 py-2 font-medium">Evento</th>
                <th className="px-4 py-2 font-medium">Anfitrião</th>
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 text-right font-medium">Ingressos</th>
                <th className="px-4 py-2 text-right font-medium">Vendas</th>
                <th className="px-4 py-2 text-right font-medium">Taxas</th>
                <th className="px-4 py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {eventos.map((e) => (
                <tr key={e.id} onClick={() => setSelecionado(e.id)} className={clsx("cursor-pointer hover:bg-elevado", selecionado === e.id && "bg-destaque-suave")}>
                  <td className="px-4 py-2.5">
                    <a href={`/evento-pessoa/${e.id}`} target="_blank" rel="noreferrer" className="font-medium text-destaque" onClick={(x) => x.stopPropagation()}>
                      {NOME_TIPO[e.tipo]?.emoji} {e.titulo}
                    </a>
                    {e.impulsionado && <span className="ml-1.5 text-[11px] text-magenta">impulsionado</span>}
                  </td>
                  <td className="px-4 py-2.5">{e.anfitriao_usuario ? `@${e.anfitriao_usuario}` : e.anfitriao}</td>
                  <td className="px-4 py-2.5">{new Date(e.inicio).toLocaleDateString("pt-BR")}</td>
                  <td className="codigo px-4 py-2.5 text-right">{e.vendidos}</td>
                  <td className="codigo px-4 py-2.5 text-right">{reais(e.arrecadado)}</td>
                  <td className="codigo px-4 py-2.5 text-right">{reais(e.taxas)}</td>
                  <td className="px-4 py-2.5">
                    {e.suspenso ? <span className="text-perigo">Suspenso</span> : e.situacao === "cancelado" ? <span className="text-suave">Cancelado</span> : <span className="text-ok">Ativo</span>}
                    {e.a_reembolsar > 0 && <span className="block text-[11px] font-semibold text-alerta">{e.a_reembolsar} a reembolsar</span>}
                  </td>
                </tr>
              ))}
              {eventos.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-suave">
                    Nenhum evento criado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </TelaUniversal>
  );
}

function EditorPacote({ inicial, salvar }: { inicial: PacoteAdmin; salvar: (p: PacoteAdmin) => Promise<void> }) {
  const [p, setP] = useState(inicial);
  const novo = !inicial.id;
  return (
    <div className={clsx("grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-[1.2fr_70px_90px_80px_1.5fr_auto]", novo ? "border-dashed border-borda" : "border-borda", !p.ativo && "opacity-60")}>
      <input className="entrada col-span-2 sm:col-span-1" placeholder={novo ? "Novo pacote (nome)" : "Nome"} value={p.nome} onChange={(e) => setP({ ...p, nome: e.target.value })} />
      <label className="block">
        <span className="sr-only">Dias</span>
        <input type="number" min={1} className="entrada" title="Dias" value={p.dias} onChange={(e) => setP({ ...p, dias: Number(e.target.value) })} />
      </label>
      <label className="block">
        <span className="sr-only">Preço</span>
        <input type="number" step="0.01" min={1} className="entrada" title="Preço (R$)" value={p.preco} onChange={(e) => setP({ ...p, preco: Number(e.target.value) })} />
      </label>
      <label className="block">
        <span className="sr-only">Raio (km)</span>
        <input type="number" min={1} className="entrada" title="Raio (km)" value={p.raio_km} onChange={(e) => setP({ ...p, raio_km: Number(e.target.value) })} />
      </label>
      <input className="entrada col-span-2 sm:col-span-1" placeholder="Descrição" value={p.descricao ?? ""} onChange={(e) => setP({ ...p, descricao: e.target.value })} />
      <span className="col-span-2 flex items-center gap-2 sm:col-span-1">
        {!novo && (
          <label className="flex items-center gap-1 text-[12px]">
            <input type="checkbox" checked={p.ativo} onChange={(e) => setP({ ...p, ativo: e.target.checked })} />
            Ativo
          </label>
        )}
        <button className="botao h-10" disabled={p.nome.trim().length < 2} onClick={() => void salvar(p)}>
          {novo ? <Plus className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {novo ? "Criar" : "Salvar"}
        </button>
      </span>
      <span className="col-span-2 text-[11px] text-suave sm:col-span-6">
        {p.dias} {p.dias === 1 ? "dia" : "dias"} · {reais(p.preco)} · raio de {p.raio_km} km
      </span>
    </div>
  );
}

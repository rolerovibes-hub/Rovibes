import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Award, Gift, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { VerNoApp } from "./VerNoApp";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, Secao } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { tempoRelativo, useBusiness } from "@/lib/acessos";
import { descreverBeneficio, TipoBeneficio } from "@/lib/beneficio";
import { beneficioDoBanco, beneficioParaBanco, beneficioVazio, CamposBeneficio, useItensCardapio, ValoresBeneficio } from "./CamposBeneficio";

interface Programa {
  ativo: boolean;
  pontos_checkin: number;
  pontos_ingresso: number;
}

interface Recompensa {
  id: string;
  titulo: string;
  custo: number;
  tipo: TipoBeneficio;
  valor: number | null;
  item_id: string | null;
  item: { nome: string } | null;
  pedido_minimo: number | null;
  validade_dias: number;
  ativa: boolean;
}

interface Cliente {
  usuario_id: string;
  nome: string;
  saldo: number;
  ganhos: number;
  ultimo_ganho: string | null;
}

interface Rascunho {
  id?: string;
  titulo: string;
  custo: string;
  beneficio: ValoresBeneficio;
  validade_dias: string;
  ativa: boolean;
}

const PADRAO: Programa = { ativo: true, pontos_checkin: 10, pontos_ingresso: 0 };

export function ProgramaPontos() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const itens = useItensCardapio(id);
  const [programa, setPrograma] = useState<Programa | null>(null);
  const [existe, setExiste] = useState(false);
  const [config, setConfig] = useState({ checkin: "10", ingresso: "0" });
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    const [p, r, c] = await Promise.all([
      supabase.from("programa_pontos").select("ativo, pontos_checkin, pontos_ingresso").eq("estabelecimento_id", id).maybeSingle(),
      supabase
        .from("recompensas")
        .select("id, titulo, custo, tipo, valor, item_id, item:cardapio_itens(nome), pedido_minimo, validade_dias, ativa")
        .eq("estabelecimento_id", id)
        .order("custo"),
      supabase.rpc("clientes_pontos", { p_estab: id }),
    ]);
    const prog = (p.data as Programa | null) ?? null;
    setExiste(!!prog);
    const efetivo = prog ?? { ...PADRAO, ativo: false };
    setPrograma(efetivo);
    setConfig({ checkin: String(prog?.pontos_checkin ?? PADRAO.pontos_checkin), ingresso: String(prog?.pontos_ingresso ?? PADRAO.pontos_ingresso) });
    setRecompensas(
      ((r.data ?? []) as unknown as Recompensa[]).map((x) => ({ ...x, valor: x.valor == null ? null : Number(x.valor), pedido_minimo: x.pedido_minimo == null ? null : Number(x.pedido_minimo) })),
    );
    setClientes((c.data ?? []) as Cliente[]);
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const recompensa = recompensas.find((r) => r.id === selecionado) ?? null;

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

  const gravarPrograma = (ativo: boolean) =>
    executar(
      async () => {
        const valores = {
          estabelecimento_id: id,
          ativo,
          pontos_checkin: Math.max(0, Math.round(Number(config.checkin) || 0)),
          pontos_ingresso: Math.max(0, Math.round(Number(config.ingresso) || 0)),
          atualizado_em: new Date().toISOString(),
        };
        const { error } = await supabase.from("programa_pontos").upsert(valores, { onConflict: "estabelecimento_id" });
        if (error) throw error;
        await carregar();
      },
      ativo ? (existe && programa?.ativo ? "Regras salvas." : "Programa de pontos ligado.") : "Programa pausado. Os clientes mantêm os pontos.",
    );

  const salvarConfig = (e: FormEvent) => {
    e.preventDefault();
    void gravarPrograma(programa?.ativo || !existe);
  };

  const editar = (r: Recompensa) =>
    setRascunho({ id: r.id, titulo: r.titulo, custo: String(r.custo), beneficio: beneficioDoBanco(r), validade_dias: String(r.validade_dias), ativa: r.ativa });

  const salvar = (ev: FormEvent) => {
    ev.preventDefault();
    if (!rascunho) return;
    void executar(async () => {
      const custo = Math.round(Number(rascunho.custo));
      if (!custo || custo < 1) throw new Error("Informe quantos pontos a recompensa custa.");
      const valores = {
        titulo: rascunho.titulo.trim(),
        custo,
        ...beneficioParaBanco(rascunho.beneficio),
        validade_dias: Math.round(Number(rascunho.validade_dias)) || 30,
        ativa: rascunho.ativa,
      };
      const { error } = rascunho.id
        ? await supabase.from("recompensas").update(valores).eq("id", rascunho.id)
        : await supabase.from("recompensas").insert({ ...valores, estabelecimento_id: id });
      if (error) throw error;
      setRascunho(null);
      await carregar();
    }, "Recompensa salva.");
  };

  const alternarAtiva = () =>
    recompensa &&
    void executar(async () => {
      const { error } = await supabase.from("recompensas").update({ ativa: !recompensa.ativa }).eq("id", recompensa.id);
      if (error) throw error;
      await carregar();
    });

  const excluir = () =>
    recompensa &&
    void executar(async () => {
      if (!window.confirm(`Excluir "${recompensa.titulo}"? Quem já trocou continua com o cupom na carteira.`)) return;
      const { error } = await supabase.from("recompensas").delete().eq("id", recompensa.id);
      if (error) throw error;
      setSelecionado(null);
      await carregar();
    }, "Recompensa excluída.");

  const ligado = existe && programa?.ativo;

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setRascunho({ titulo: "", custo: "100", beneficio: beneficioVazio(), validade_dias: "30", ativa: true })}>
            <Plus className="h-4 w-4" />
            Nova recompensa
          </button>
          <button className="botao" disabled={!recompensa} onClick={() => recompensa && editar(recompensa)}>
            <Pencil className="h-4 w-4" />
            Editar
          </button>
          <button className="botao" disabled={!recompensa || ocupado} onClick={alternarAtiva}>
            <Gift className="h-4 w-4" />
            {recompensa && !recompensa.ativa ? "Mostrar no App" : "Ocultar do App"}
          </button>
          <hr className="col-span-full my-1 border-borda" />
          <button className="botao" disabled={ocupado} onClick={() => void gravarPrograma(!ligado)}>
            <Power className="h-4 w-4" />
            {ligado ? "Pausar programa" : "Ligar programa"}
          </button>
          <VerNoApp caminho={id ? `/lugar/${id}` : null} />
        </>
      }
      rodape={
        <button className="botao w-full text-perigo" disabled={!recompensa || ocupado} onClick={excluir}>
          <Trash2 className="h-4 w-4" />
          Excluir recompensa
        </button>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <Secao
        titulo="Como o cliente ganha pontos"
        acao={
          <span className={clsx("inline-flex items-center gap-1.5 text-sm font-medium", ligado ? "text-ok" : "text-suave")}>
            <span className={clsx("h-2 w-2 rounded-full", ligado ? "bg-ok" : "bg-suave")} />
            {ligado ? "Programa ligado" : existe ? "Programa pausado" : "Programa desligado"}
          </span>
        }
      >
        <form onSubmit={salvarConfig} className="flex flex-wrap items-end gap-4">
          <Campo rotulo="Pontos por check-in" className="w-44">
            <input type="number" min={0} max={1000} className="entrada" value={config.checkin} onChange={(e) => setConfig({ ...config, checkin: e.target.value })} />
          </Campo>
          <Campo rotulo="Pontos por entrada em evento" className="w-56">
            <input type="number" min={0} max={1000} className="entrada" value={config.ingresso} onChange={(e) => setConfig({ ...config, ingresso: e.target.value })} />
          </Campo>
          <button type="submit" className="botao-principal" disabled={ocupado}>
            {ligado || existe ? "Salvar regras" : "Salvar e ligar"}
          </button>
          <p className="w-full text-[13px] text-suave">
            Os pontos valem só aqui. O check-in exige estar no local e conta uma vez a cada 3 horas. A troca vira um cupom para usar em pedidos pelo RoVibes.
          </p>
        </form>
      </Secao>

      {rascunho && (
        <Secao
          titulo={rascunho.id ? "Editar recompensa" : "Nova recompensa"}
          acao={
            <button className="botao h-8 w-8 px-0" onClick={() => setRascunho(null)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          }
        >
          <form onSubmit={salvar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo rotulo="Nome da recompensa" className="sm:col-span-2">
                <input required minLength={2} autoFocus className="entrada" placeholder="1 chopp grátis" value={rascunho.titulo} onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })} />
              </Campo>
              <Campo rotulo="Custa (pontos)">
                <input required type="number" min={1} className="entrada" value={rascunho.custo} onChange={(e) => setRascunho({ ...rascunho, custo: e.target.value })} />
              </Campo>
              <CamposBeneficio valores={rascunho.beneficio} itens={itens} mudar={(b) => setRascunho({ ...rascunho, beneficio: b })} />
              <Campo rotulo="Cupom vale por (dias)">
                <input type="number" min={1} max={365} className="entrada" value={rascunho.validade_dias} onChange={(e) => setRascunho({ ...rascunho, validade_dias: e.target.value })} />
              </Campo>
              <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
                <input type="checkbox" checked={rascunho.ativa} onChange={(e) => setRascunho({ ...rascunho, ativa: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--marca))]" />
                Mostrar no App
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="botao-principal" disabled={ocupado}>
                Salvar recompensa
              </button>
              <button type="button" className="botao" onClick={() => setRascunho(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </Secao>
      )}

      <section className="cartao overflow-hidden">
        <h2 className="border-b border-borda px-4 py-3 font-semibold">Recompensas</h2>
        {recompensas.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Gift className="mx-auto h-8 w-8 text-suave" />
            <p className="mt-3 font-medium">Nenhuma recompensa</p>
            <p className="mt-1 text-sm text-suave">Exemplo: 100 pontos = 1 chopp grátis.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-borda bg-elevado/60">
                <tr>
                  {["Recompensa", "Benefício", "Custo", "No App"].map((c) => (
                    <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recompensas.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelecionado(r.id)}
                    onDoubleClick={() => editar(r)}
                    aria-selected={selecionado === r.id}
                    className={clsx("cursor-pointer border-b border-borda last:border-0", selecionado === r.id ? "bg-destaque-suave" : "hover:bg-elevado")}
                  >
                    <td className="px-4 py-2.5 font-medium">{r.titulo}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{descreverBeneficio(r)}</td>
                    <td className="codigo whitespace-nowrap px-4 py-2.5 text-sm">{r.custo} pts</td>
                    <td className={clsx("px-4 py-2.5 font-medium", r.ativa ? "text-ok" : "text-suave")}>{r.ativa ? "Visível" : "Oculta"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="cartao overflow-hidden">
        <h2 className="border-b border-borda px-4 py-3 font-semibold">Clientes com pontos</h2>
        {clientes.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Award className="mx-auto h-8 w-8 text-suave" />
            <p className="mt-3 text-sm text-suave">Os clientes aparecem aqui quando ganharem os primeiros pontos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-borda bg-elevado/60">
                <tr>
                  {["Cliente", "Saldo", "Ganhos no total", "Último ganho"].map((c) => (
                    <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.usuario_id} className="border-b border-borda last:border-0">
                    <td className="px-4 py-2.5 font-medium">{c.nome}</td>
                    <td className="codigo px-4 py-2.5 text-sm">{c.saldo}</td>
                    <td className="codigo px-4 py-2.5 text-sm text-suave">{c.ganhos}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-suave">{c.ultimo_ganho ? tempoRelativo(Date.parse(c.ultimo_ganho)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </TelaUniversal>
  );
}

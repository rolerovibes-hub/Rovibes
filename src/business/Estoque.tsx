import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { ArrowDownToLine, ArrowRightLeft, ClipboardCheck, MapPin, PackagePlus, PackageX, Pencil, Plus, RefreshCw } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso } from "@/components/Formulario";
import { MovimentarEstoque } from "@/components/MovimentarEstoque";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useBusiness } from "@/lib/acessos";
import { carregarEstoque, formatarQtd, LocalEstoque, NOME_MOVIMENTO, ProdutoEstoque, SETORES, TIPOS_LOCAL, TipoLocal, TipoMovimento } from "@/lib/estoque";

interface Movimento {
  id: number;
  criado_em: string;
  produto: string;
  unidade: string;
  tipo: string;
  quantidade: number;
  saldo_depois: number;
  motivo: string | null;
  pessoa: string;
  local_nome: string | null;
  destino_nome: string | null;
}

type Aba = "saldos" | "locais" | "historico";

const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function situacao(p: ProdutoEstoque, negativo: boolean) {
  if (!p.ativo) return { texto: "Desativado", cor: "text-suave" };
  if (negativo) return { texto: "Repor", cor: "text-perigo" };
  if (p.saldo <= 0) return { texto: "Zerado", cor: "text-perigo" };
  if (p.validade && p.validade < hoje()) return { texto: "Vencido", cor: "text-perigo" };
  if (p.minimo != null && p.saldo <= p.minimo) return { texto: "Baixo", cor: "text-alerta" };
  return { texto: "OK", cor: "text-ok" };
}

/** G4002 — Estoque: saldo de cada produto em cada local, locais e movimentações. */
export function Estoque() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [aba, setAba] = useState<Aba>("saldos");
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [locais, setLocais] = useState<LocalEstoque[]>([]);
  const [saldos, setSaldos] = useState<Map<string, number>>(new Map());
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroLocal, setFiltroLocal] = useState<string>("todos");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [mover, setMover] = useState<{ tipo: TipoMovimento; produto?: string } | null>(null);
  const [rascunhoLocal, setRascunhoLocal] = useState<{ id?: string; nome: string; tipo: TipoLocal; consumo_setor: string; ativo: boolean } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    const r = await carregarEstoque(id);
    if (r.erro && /relation|does not exist|column/i.test(r.erro.message)) setAviso({ tipo: "erro", texto: "Falta aplicar a atualização 019 do banco." });
    setProdutos(r.produtos);
    setLocais(r.locais);
    setSaldos(r.saldos);
  }, [id]);
  const carregarMovimentos = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.rpc("movimentos_estoque", { p_estab: id, p_produto: null });
    setMovimentos(((data ?? []) as Movimento[]).map((m) => ({ ...m, quantidade: Number(m.quantidade), saldo_depois: Number(m.saldo_depois) })));
  }, [id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  useEffect(() => {
    if (aba === "historico") void carregarMovimentos();
  }, [aba, carregarMovimentos]);

  const ativosLocais = locais.filter((l) => l.ativo);
  const saldoEm = (p: string, l: string) => saldos.get(`${p}:${l}`) ?? 0;
  const negativo = (p: string) => ativosLocais.some((l) => saldoEm(p, l.id) < 0);
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return produtos.filter(
      (p) =>
        (!t || `${p.nome} ${p.codigo ?? ""} ${p.ean ?? ""} ${p.categoria ?? ""}`.toLowerCase().includes(t)) &&
        (filtroLocal === "todos" || saldos.has(`${p.id}:${filtroLocal}`)),
    );
  }, [produtos, busca, filtroLocal, saldos]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const alertas = {
    baixos: produtos.filter((p) => p.ativo && p.saldo > 0 && p.minimo != null && p.saldo <= p.minimo).length,
    zerados: produtos.filter((p) => p.ativo && p.saldo <= 0).length,
    repor: produtos.filter((p) => p.ativo && negativo(p.id)).length,
  };
  const colunasLocais = filtroLocal === "todos" ? ativosLocais.slice(0, 6) : ativosLocais.filter((l) => l.id === filtroLocal);

  const salvarLocal = async (e: FormEvent) => {
    e.preventDefault();
    if (!rascunhoLocal) return;
    const valores = { nome: rascunhoLocal.nome.trim(), tipo: rascunhoLocal.tipo, consumo_setor: rascunhoLocal.consumo_setor || null, ativo: rascunhoLocal.ativo };
    const { error } = rascunhoLocal.id
      ? await supabase.from("estoque_locais").update(valores).eq("id", rascunhoLocal.id)
      : await supabase.from("estoque_locais").insert({ ...valores, estabelecimento_id: id, ordem: locais.length });
    if (error) {
      return setAviso({
        tipo: "erro",
        texto: /consumo_unico/.test(error.message)
          ? "Já existe outro local marcado como ponto de consumo deste setor."
          : /duplicate/.test(error.message)
            ? "Já existe um local com esse nome."
            : mensagemDeErro(error),
      });
    }
    setRascunhoLocal(null);
    setAviso({ tipo: "ok", texto: "Local salvo." });
    void carregar();
  };

  const abaBotao = (a: Aba, nome: string) => (
    <button key={a} role="tab" aria-selected={aba === a} onClick={() => setAba(a)} className={clsx("rounded-lg px-3 py-1.5 text-sm", aba === a ? "bg-destaque-suave font-semibold text-destaque" : "text-suave hover:bg-elevado hover:text-texto")}>
      {nome}
    </button>
  );

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setMover({ tipo: "entrada", produto: selecionado ?? undefined })}>
            <ArrowDownToLine className="h-4 w-4" />
            Entrada
          </button>
          <button className="botao" onClick={() => setMover({ tipo: "transferencia", produto: selecionado ?? undefined })}>
            <ArrowRightLeft className="h-4 w-4" />
            Transferir
          </button>
          <button className="botao" onClick={() => setMover({ tipo: "perda", produto: selecionado ?? undefined })}>
            <PackageX className="h-4 w-4" />
            Perda / quebra
          </button>
          <button className="botao" onClick={() => setMover({ tipo: "ajuste", produto: selecionado ?? undefined })}>
            <ClipboardCheck className="h-4 w-4" />
            Ajuste (contagem)
          </button>
          <hr className="col-span-full my-1 border-borda" />
          <Link to="/business/area/produtos-estoque/G4003" className="botao">
            <PackagePlus className="h-4 w-4" />
            Meus produtos
          </Link>
          <button className="botao" onClick={() => setRascunhoLocal({ nome: "", tipo: "refrigerador", consumo_setor: "", ativo: true })}>
            <MapPin className="h-4 w-4" />
            Novo local
          </button>
          <button className="botao" onClick={() => void (aba === "historico" ? carregarMovimentos() : carregar())}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { nome: "Repor (ponto de consumo negativo)", valor: alertas.repor, cor: "text-perigo" },
          { nome: "Abaixo do mínimo", valor: alertas.baixos, cor: "text-alerta" },
          { nome: "Zerados", valor: alertas.zerados, cor: "text-perigo" },
        ].map((a) => (
          <div key={a.nome} className="cartao p-4">
            <p className={clsx("codigo text-2xl font-semibold", a.valor ? a.cor : "text-suave")}>{a.valor}</p>
            <p className="text-[13px] text-suave">{a.nome}</p>
          </div>
        ))}
      </div>

      <section className="cartao flex flex-wrap gap-2 p-3" role="tablist" aria-label="Estoque">
        {abaBotao("saldos", "Saldos por local")}
        {abaBotao("locais", `Locais (${ativosLocais.length})`)}
        {abaBotao("historico", "Histórico")}
      </section>

      {rascunhoLocal && (
        <form onSubmit={(e) => void salvarLocal(e)} className="cartao grid gap-3 p-4 sm:grid-cols-4">
          <label className="sm:col-span-2">
            <span className="rotulo mb-1 block">Nome do local</span>
            <input autoFocus value={rascunhoLocal.nome} onChange={(e) => setRascunhoLocal({ ...rascunhoLocal, nome: e.target.value.slice(0, 40) })} placeholder="Ex.: Refrigerador 1" className="entrada" />
          </label>
          <label>
            <span className="rotulo mb-1 block">Tipo</span>
            <select className="entrada" value={rascunhoLocal.tipo} onChange={(e) => setRascunhoLocal({ ...rascunhoLocal, tipo: e.target.value as TipoLocal })}>
              {TIPOS_LOCAL.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="rotulo mb-1 block">Ponto de consumo das vendas</span>
            <select className="entrada" value={rascunhoLocal.consumo_setor} onChange={(e) => setRascunhoLocal({ ...rascunhoLocal, consumo_setor: e.target.value })}>
              <option value="">Não (só guarda)</option>
              {SETORES.map((s) => (
                <option key={s.id} value={s.id}>
                  Vendas do setor {s.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={rascunhoLocal.ativo} onChange={(e) => setRascunhoLocal({ ...rascunhoLocal, ativo: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--marca))]" />
            Local ativo
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="botao" onClick={() => setRascunhoLocal(null)}>
              Cancelar
            </button>
            <button type="submit" className="botao-principal" disabled={rascunhoLocal.nome.trim().length < 2}>
              Salvar local
            </button>
          </div>
          <p className="text-[12px] text-suave sm:col-span-4">
            O <strong>ponto de consumo</strong> é de onde saem os produtos quando um item daquele setor é entregue. Ex.: o drink (setor Bar) consome os ingredientes do local marcado como "Vendas do setor Bar".
          </p>
        </form>
      )}

      {aba === "saldos" && (
        <section className="cartao overflow-hidden">
          <div className="flex flex-wrap gap-3 border-b border-borda p-3">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto, código ou categoria" className="entrada min-w-[200px] flex-1" />
            <select className="entrada w-auto" value={filtroLocal} onChange={(e) => setFiltroLocal(e.target.value)}>
              <option value="todos">Todos os locais</option>
              {ativosLocais.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-borda bg-elevado/60">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">Produto</th>
                  {colunasLocais.map((l) => (
                    <th key={l.id} className="whitespace-nowrap px-3 py-2.5 text-right text-[13px] font-semibold text-suave">
                      {l.nome}
                      {l.consumo_setor && <span className="block text-[11px] font-normal text-destaque">consumo {SETORES.find((s) => s.id === l.consumo_setor)?.nome}</span>}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-3 py-2.5 text-right text-[13px] font-semibold text-suave">Total</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold text-suave">Situação</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => {
                  const s = situacao(p, negativo(p.id));
                  return (
                    <tr key={p.id} onClick={() => setSelecionado(p.id === selecionado ? null : p.id)} aria-selected={selecionado === p.id} className={clsx("cursor-pointer border-b border-borda last:border-0", selecionado === p.id ? "bg-destaque-suave" : "hover:bg-elevado", !p.ativo && "opacity-60")}>
                      <td className="px-4 py-2.5">
                        <span className="block font-medium">{p.nome}</span>
                        <span className="block text-[12px] text-suave">{[p.codigo, p.categoria].filter(Boolean).join(" · ") || p.unidade}</span>
                      </td>
                      {colunasLocais.map((l) => {
                        const v = saldoEm(p.id, l.id);
                        return (
                          <td key={l.id} className={clsx("codigo whitespace-nowrap px-3 py-2.5 text-right", v < 0 ? "font-semibold text-perigo" : v === 0 ? "text-suave" : "")}>
                            {saldos.has(`${p.id}:${l.id}`) ? formatarQtd(v) : "—"}
                          </td>
                        );
                      })}
                      <td className="codigo whitespace-nowrap px-3 py-2.5 text-right font-semibold">
                        {formatarQtd(p.saldo)} <span className="font-normal text-suave">{p.unidade}</span>
                      </td>
                      <td className={clsx("whitespace-nowrap px-3 py-2.5 text-[13px] font-medium", s.cor)}>{s.texto}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visiveis.length === 0 && (
            <p className="px-6 py-10 text-center text-sm text-suave">
              {produtos.length === 0 ? (
                <>
                  Nenhum produto ainda.{" "}
                  <Link to="/business/area/produtos-estoque/G4003" className="font-semibold text-destaque">
                    Adicione da biblioteca
                  </Link>
                  .
                </>
              ) : (
                "Nada encontrado."
              )}
            </p>
          )}
          {ativosLocais.length > 6 && filtroLocal === "todos" && <p className="border-t border-borda px-4 py-2 text-[12px] text-suave">Mostrando os 6 primeiros locais. Filtre por local para ver os outros.</p>}
        </section>
      )}

      {aba === "locais" && (
        <section className="cartao divide-y divide-borda">
          {locais.map((l) => (
            <div key={l.id} className={clsx("flex items-center gap-3 px-4 py-3", !l.ativo && "opacity-60")}>
              <MapPin className="h-4 w-4 text-suave" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{l.nome}</span>
                <span className="block text-[12px] text-suave">
                  {TIPOS_LOCAL.find((t) => t.id === l.tipo)?.nome}
                  {l.consumo_setor && ` · ponto de consumo das vendas do ${SETORES.find((s) => s.id === l.consumo_setor)?.nome}`}
                  {!l.ativo && " · desativado"}
                </span>
              </span>
              <span className="codigo text-[13px] text-suave">{produtos.filter((p) => (saldos.get(`${p.id}:${l.id}`) ?? 0) !== 0).length} produtos</span>
              <button className="botao h-8 px-3 text-[13px]" onClick={() => setRascunhoLocal({ id: l.id, nome: l.nome, tipo: l.tipo, consumo_setor: l.consumo_setor ?? "", ativo: l.ativo })}>
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
            </div>
          ))}
          {locais.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-suave">
              <p>Nenhum local ainda. O primeiro movimento cria o "Depósito principal".</p>
              <button className="botao mt-3" onClick={() => setRascunhoLocal({ nome: "Depósito principal", tipo: "deposito", consumo_setor: "", ativo: true })}>
                <Plus className="h-4 w-4" />
                Criar local
              </button>
            </div>
          )}
        </section>
      )}

      {aba === "historico" && (
        <section className="cartao overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-borda bg-elevado/60">
                <tr>
                  {["Quando", "Produto", "Tipo", "Quantidade", "Local", "Motivo", "Quem"].map((c) => (
                    <th key={c} className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movimentos.map((m) => (
                  <tr key={m.id} className="border-b border-borda last:border-0">
                    <td className="codigo whitespace-nowrap px-4 py-2.5 text-[13px]">{new Date(m.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="px-4 py-2.5">{m.produto}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{NOME_MOVIMENTO[m.tipo] ?? m.tipo}</td>
                    <td className={clsx("codigo whitespace-nowrap px-4 py-2.5", m.tipo === "transferencia" ? "" : m.quantidade < 0 ? "text-perigo" : "text-ok")}>
                      {m.tipo !== "transferencia" && m.quantidade > 0 ? "+" : ""}
                      {formatarQtd(m.quantidade)} {m.unidade}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[13px]">{m.tipo === "transferencia" ? `${m.local_nome ?? "?"} → ${m.destino_nome ?? "?"}` : m.local_nome ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[13px] text-suave">{m.motivo ?? ""}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[13px]">{m.pessoa || "Sistema"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {movimentos.length === 0 && <p className="px-6 py-10 text-center text-sm text-suave">Nenhuma movimentação ainda.</p>}
        </section>
      )}

      {mover && (
        <MovimentarEstoque
          estab={id}
          produtos={produtos}
          locais={locais}
          saldos={saldos}
          gestao
          inicial={{ tipo: mover.tipo, produto: mover.produto, local: filtroLocal !== "todos" ? filtroLocal : undefined }}
          fechar={() => setMover(null)}
          concluido={(t) => {
            setMover(null);
            setAviso({ tipo: "ok", texto: t });
            void carregar();
          }}
        />
      )}
    </TelaUniversal>
  );
}

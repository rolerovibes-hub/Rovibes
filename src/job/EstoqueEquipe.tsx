import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowRightLeft, PackageX, Search } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { MovimentarEstoque } from "@/components/MovimentarEstoque";
import { useBusiness } from "@/lib/acessos";
import { porCodigo } from "@/lib/catalogo";
import { carregarEstoque, formatarQtd, LocalEstoque, ProdutoEstoque, TipoMovimento } from "@/lib/estoque";

/** Estoque para a equipe (Job e T4004): ver o saldo de cada local e transferir/registrar perda. */
export function EstoqueEquipe({ estab }: { estab: string }) {
  const negocio = useBusiness();
  const gestao = negocio.temAcesso(porCodigo("G4002")!);
  const [produtos, setProdutos] = useState<ProdutoEstoque[] | null>(null);
  const [locais, setLocais] = useState<LocalEstoque[]>([]);
  const [saldos, setSaldos] = useState<Map<string, number>>(new Map());
  const [local, setLocal] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [mover, setMover] = useState<{ tipo: TipoMovimento; produto?: string } | null>(null);
  const [ok, setOk] = useState("");
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const r = await carregarEstoque(estab);
    if (r.erro) setErro(/relation|column|does not exist/i.test(r.erro.message) ? "Falta aplicar a atualização 019 do banco." : "Sem acesso ao estoque.");
    setProdutos(r.produtos.filter((p) => p.ativo));
    setLocais(r.locais.filter((l) => l.ativo));
    setSaldos(r.saldos);
  }, [estab]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  useEffect(() => {
    if (!local && locais.length) setLocal(locais[0].id);
  }, [locais, local]);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (produtos ?? [])
      .filter((p) => !t || `${p.nome} ${p.codigo ?? ""} ${p.ean ?? ""}`.toLowerCase().includes(t))
      .map((p) => ({ p, q: saldos.get(`${p.id}:${local}`) }))
      .sort((a, b) => Number(b.q !== undefined) - Number(a.q !== undefined) || a.p.nome.localeCompare(b.p.nome));
  }, [produtos, busca, saldos, local]);

  if (produtos === null) return <Carregando />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Estoque</h1>
        <button className="botao-principal h-10" onClick={() => setMover({ tipo: "transferencia" })}>
          <ArrowRightLeft className="h-4 w-4" />
          Transferir
        </button>
      </div>
      {ok && <p role="status" className="rounded-cartao border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{ok}</p>}
      {erro && <p role="alert" className="rounded-cartao border border-perigo/40 bg-perigo/10 px-4 py-3 text-sm text-perigo">{erro}</p>}

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Local">
        {locais.map((l) => (
          <button
            key={l.id}
            role="tab"
            aria-selected={local === l.id}
            onClick={() => setLocal(l.id)}
            className={clsx("shrink-0 rounded-full border px-3.5 py-1.5 text-sm", local === l.id ? "border-marca bg-marca font-medium text-marca-texto" : "border-borda bg-superficie")}
          >
            {l.nome}
          </button>
        ))}
      </div>

      <label className="relative block">
        <span className="sr-only">Buscar produto</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto" className="entrada pl-9" />
      </label>

      {locais.length === 0 ? (
        <p className="cartao px-4 py-8 text-center text-sm text-suave">Nenhum local de estoque cadastrado. Peça à gestão para criar os locais no app Estoque.</p>
      ) : (
        <ul className="cartao divide-y divide-borda">
          {lista.map(({ p, q }) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.nome}</span>
                <span className="block text-[12px] text-suave">Total: {formatarQtd(p.saldo)} {p.unidade}</span>
              </span>
              <span className={clsx("codigo text-right text-base font-semibold", q === undefined ? "text-suave" : (q ?? 0) < 0 ? "text-perigo" : "")}>
                {q === undefined ? "—" : formatarQtd(q)}
                <span className="block text-[11px] font-normal text-suave">{p.unidade}</span>
              </span>
              <button className="botao h-9 w-9 px-0" onClick={() => setMover({ tipo: "transferencia", produto: p.id })} aria-label={`Transferir ${p.nome}`}>
                <ArrowRightLeft className="h-4 w-4" />
              </button>
              <button className="botao h-9 w-9 px-0 text-perigo" onClick={() => setMover({ tipo: "perda", produto: p.id })} aria-label={`Registrar perda de ${p.nome}`}>
                <PackageX className="h-4 w-4" />
              </button>
            </li>
          ))}
          {lista.length === 0 && <li className="px-4 py-8 text-center text-sm text-suave">Nenhum produto encontrado.</li>}
        </ul>
      )}

      {mover && (
        <MovimentarEstoque
          estab={estab}
          produtos={produtos}
          locais={locais}
          saldos={saldos}
          gestao={gestao}
          inicial={{ tipo: mover.tipo, produto: mover.produto, local: local || undefined }}
          fechar={() => setMover(null)}
          concluido={(t) => {
            setMover(null);
            setOk(t);
            setErro("");
            void carregar();
          }}
        />
      )}
    </div>
  );
}

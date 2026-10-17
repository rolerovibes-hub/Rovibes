import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Secao } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useBusiness } from "@/lib/acessos";

interface Linha {
  indicador: string;
  hoje: number | null;
  sete_dias: number | null;
  trinta_dias: number | null;
}

const numero = (v: number | null, decimal: boolean) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", decimal ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : {});

export function Indicadores() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [dias, setDias] = useState<{ dia: string; total: number }[]>([]);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    if (!id) return;
    setErro("");
    const [i, d] = await Promise.all([supabase.rpc("indicadores", { p_estab: id }), supabase.rpc("checkins_por_dia", { p_estab: id })]);
    if (i.error) setErro(mensagemDeErro(i.error));
    setLinhas((i.data ?? []) as Linha[]);
    setDias((d.data ?? []) as { dia: string; total: number }[]);
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;
  const maximo = Math.max(1, ...dias.map((d) => d.total));
  const destaque = linhas.slice(0, 3);

  return (
    <TelaUniversal
      acoes={
        <button className="botao col-span-2 sm:col-span-1" onClick={() => void carregar()}>
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      }
    >
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="grid gap-4 sm:grid-cols-3">
        {destaque.map((l) => (
          <div key={l.indicador} className="cartao p-4">
            <p className="rotulo">{l.indicador} · 7 dias</p>
            <p className="codigo mt-1 text-2xl font-semibold">{numero(l.sete_dias, false)}</p>
            <p className="mt-1 text-[13px] text-suave">Hoje: {numero(l.hoje, false)}</p>
          </div>
        ))}
      </div>

      <Secao titulo="Check-ins por dia · últimos 14 dias">
        <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Check-ins por dia nos últimos 14 dias">
          {dias.map((d) => (
            <div key={d.dia} className="flex flex-1 flex-col items-center gap-1">
              <span className="codigo text-[11px] text-suave">{d.total || ""}</span>
              <div className="w-full rounded-t bg-marca" style={{ height: `${Math.max(2, (d.total / maximo) * 120)}px`, opacity: d.total ? 1 : 0.25 }} />
              <span className="codigo text-[11px] text-suave">{d.dia.slice(8, 10)}</span>
            </div>
          ))}
        </div>
      </Secao>

      <section className="cartao overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-borda bg-elevado/60">
              <tr>
                {["Indicador", "Hoje", "7 dias", "30 dias"].map((c, i) => (
                  <th key={c} scope="col" className={`whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave ${i ? "text-right" : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const decimal = l.indicador === "Nota média";
                return (
                  <tr key={l.indicador} className="border-b border-borda last:border-0">
                    <td className="px-4 py-2.5">{l.indicador}</td>
                    <td className="codigo px-4 py-2.5 text-right text-sm">{numero(l.hoje, decimal)}</td>
                    <td className="codigo px-4 py-2.5 text-right text-sm">{numero(l.sete_dias, decimal)}</td>
                    <td className="codigo px-4 py-2.5 text-right text-sm">{numero(l.trinta_dias, decimal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </TelaUniversal>
  );
}

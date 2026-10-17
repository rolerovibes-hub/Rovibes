import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Award, BadgePercent, Check, Gift, Wallet } from "lucide-react";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { dataCurta, descreverBeneficio, descreverRegras } from "@/lib/beneficio";
import { buscarProgramaDoLugar, buscarPromocoes, Programa, Promocao, Recompensa } from "./carteira";

/** Promoções e programa de pontos na página do lugar. */
export function BeneficiosLugar({ estabelecimentoId, versao }: { estabelecimentoId: string; versao: number }) {
  const [promocoes, setPromocoes] = useState<Promocao[]>([]);
  const [programa, setPrograma] = useState<Programa | null>(null);
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [saldo, setSaldo] = useState(0);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    const [p, g] = await Promise.all([buscarPromocoes(estabelecimentoId), buscarProgramaDoLugar(estabelecimentoId)]);
    setPromocoes(p);
    setPrograma(g.programa);
    setRecompensas(g.recompensas);
    setSaldo(g.saldo);
  }, [estabelecimentoId]);

  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  const executar = async (chave: string, rpc: "resgatar_cupom" | "trocar_recompensa", args: Record<string, string>, ok: string) => {
    setOcupado(chave);
    setAviso(null);
    const { error } = await supabase.rpc(rpc, args);
    setOcupado(null);
    if (error) setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    else {
      setAviso({ tipo: "ok", texto: ok });
      await carregar();
    }
  };

  const temPrograma = programa?.ativo && (recompensas.length > 0 || programa.pontos_checkin > 0);
  if (!promocoes.length && !temPrograma) return null;

  return (
    <div className="space-y-7">
      {aviso && (
        <p
          role={aviso.tipo === "erro" ? "alert" : "status"}
          className={clsx(
            "mx-4 flex items-center gap-2 rounded-cartao border px-4 py-3 text-sm",
            aviso.tipo === "erro" ? "border-perigo/40 bg-perigo/10 text-perigo" : "border-ok/40 bg-ok/10 text-ok",
          )}
        >
          <span className="flex-1">{aviso.texto}</span>
          {aviso.tipo === "ok" && (
            <Link to="/carteira" className="font-semibold underline underline-offset-2">
              Ver carteira
            </Link>
          )}
        </p>
      )}

      {promocoes.length > 0 && (
        <section>
          <h2 className="mb-1 px-4 text-[17px] font-semibold">Promoções</h2>
          <p className="mb-3 px-4 text-[13px] text-suave">Cupons para usar nos pedidos feitos pelo RoVibes.</p>
          <ul className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {promocoes.map((p) => {
              const esgotou = p.limite_total != null && p.resgatados >= p.limite_total;
              const jaTenho = p.meus >= p.limite_por_pessoa;
              const restam = p.limite_total != null ? p.limite_total - p.resgatados : null;
              const regras = descreverRegras(p);
              return (
                <li key={p.id} className="cartao flex w-64 shrink-0 flex-col p-4">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-magenta">
                    <BadgePercent className="h-4 w-4" />
                    {descreverBeneficio(p)}
                  </span>
                  <p className="mt-1.5 font-semibold leading-snug">{p.titulo}</p>
                  {p.descricao && <p className="mt-1 line-clamp-2 text-[13px] text-suave">{p.descricao}</p>}
                  <p className="mt-2 text-[12px] text-suave">
                    {[regras, p.fim ? `até ${dataCurta(p.fim)}` : "", restam != null && restam > 0 && restam <= 20 ? `restam ${restam}` : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-auto pt-3">
                    {jaTenho ? (
                      <Link to="/carteira" className="botao h-9 w-full text-ok">
                        <Check className="h-4 w-4" />
                        Na sua carteira
                      </Link>
                    ) : (
                      <button
                        className="botao-principal h-9 w-full"
                        disabled={esgotou || ocupado === p.id}
                        onClick={() => void executar(p.id, "resgatar_cupom", { p_promocao: p.id }, "Cupom guardado na sua carteira.")}
                      >
                        {esgotou ? "Esgotado" : ocupado === p.id ? "Resgatando..." : "Resgatar cupom"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {temPrograma && programa && (
        <section className="px-4">
          <h2 className="mb-3 text-[17px] font-semibold">Programa de pontos</h2>
          <div className="cartao overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destaque-suave text-destaque">
                <Award className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  <span className="codigo text-[17px] text-texto">{saldo}</span> {saldo === 1 ? "ponto" : "pontos"} aqui
                </p>
                <p className="text-[13px] text-suave">
                  {[
                    programa.pontos_checkin > 0 ? `+${programa.pontos_checkin} por check-in` : "",
                    programa.pontos_ingresso > 0 ? `+${programa.pontos_ingresso} por entrada em evento` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Link to="/carteira" className="rounded-full p-2 text-suave hover:bg-elevado" aria-label="Abrir carteira">
                <Wallet className="h-5 w-5" />
              </Link>
            </div>
            {recompensas.length > 0 && (
              <ul className="divide-y divide-borda border-t border-borda">
                {recompensas.map((r) => {
                  const falta = r.custo - saldo;
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <Gift className="h-4 w-4 shrink-0 text-suave" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.titulo}</span>
                        <span className="block text-[12px] text-suave">{descreverBeneficio(r)}</span>
                      </span>
                      {falta > 0 ? (
                        <span className="codigo shrink-0 text-right text-[12px] text-suave">
                          {r.custo} pts
                          <span className="block">faltam {falta}</span>
                        </span>
                      ) : (
                        <button
                          className="botao h-8 shrink-0 border-marca px-3 text-destaque"
                          disabled={ocupado === r.id}
                          onClick={() =>
                            window.confirm(`Trocar ${r.custo} pontos por "${r.titulo}"?`) &&
                            void executar(r.id, "trocar_recompensa", { p_recompensa: r.id }, "Recompensa guardada na sua carteira.")
                          }
                        >
                          Trocar · {r.custo}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

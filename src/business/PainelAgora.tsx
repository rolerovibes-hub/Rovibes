import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { porCodigo } from "@/lib/catalogo";
import { supabase } from "@/lib/supabase";
import { useBusiness } from "@/lib/acessos";
import { AreaNegocio, linkDoApp, partesLiberadas } from "@/lib/areasNegocio";
import { noApp, novaJanela } from "@/desktop/nativo";
import { reais } from "@/components/Formulario";
import { seVisivel } from "@/lib/visivel";

interface Atencao {
  nivel: "alto" | "medio";
  titulo: string;
  detalhe: string;
  codigo: string;
  acao: string;
}

interface Agora {
  mesas_total?: number;
  mesas_ocupadas?: number;
  comandas_abertas?: number;
  pedidos_fila?: number;
  pedidos_prontos?: number;
  pedidos_atrasados?: number;
  vendido_hoje?: number;
  comandas_fechadas_hoje?: number;
  estoque_criticos?: number;
  estoque_ultimo?: string | null;
  movimento?: "tranquilo" | "moderado" | "cheio" | null;
  atencao?: Atencao[];
}

/** Resumo do momento (atualiza a cada 30 s). */
function useAgora(estab: string | undefined) {
  const [agora, setAgora] = useState<Agora | null>(null);
  useEffect(() => {
    if (!estab) return;
    let vivo = true;
    const carregar = () =>
      supabase.rpc("painel_agora", { p_estab: estab }).then(({ data, error }) => {
        if (vivo) setAgora(error ? {} : ((data ?? {}) as Agora));
      });
    void carregar();
    const t = window.setInterval(seVisivel(carregar), 30000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [estab]);
  return agora;
}

type Tom = "ok" | "alerta" | "neutro";
const Pilula = ({ tom = "neutro", children }: { tom?: Tom; children: React.ReactNode }) => (
  <span
    className={clsx(
      "rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
      tom === "ok" && "bg-ok/15 text-ok",
      tom === "alerta" && "bg-alerta/15 text-alerta",
      tom === "neutro" && "bg-elevado text-texto",
    )}
  >
    {children}
  </span>
);

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const DESCRICAO: Record<string, string> = {
  T7005: "Vender, receber e fechar",
  T7001: "Salão e consumo",
  T7002: "Fila da cozinha e do bar",
  T7003: "Pedidos para entregar",
  T5005: "Ingressos e listas",
  T4004: "Entrada, saída, transferência",
  T7004: "Toda a operação agora",
  T5002: "Como está o lugar no App",
  T2001: "Conversas com clientes",
  T2002: "Mesas e comandas pelo App",
};

const COR: Record<string, string> = {
  T7005: "#6D28D9",
  T7001: "#0EA5E9",
  T7002: "#F59E0B",
  T7003: "#DB2777",
  T5005: "#16A34A",
  T4004: "#64748B",
  T7004: "#0F766E",
  T5002: "#DB2777",
  T2001: "#6D28D9",
  T2002: "#0EA5E9",
};

/** Janela separada no app de computador. */
const JANELA: Record<string, [string, string, string]> = {
  T7005: ["caixa", "RoVibes Business · Caixa", "/janela/caixa"],
  T7002: ["cozinha", "RoVibes Business · Cozinha", "/janela/cozinha"],
};

function pilulas(codigo: string, a: Agora): { tom?: Tom; texto: string }[] {
  const p: { tom?: Tom; texto: string }[] = [];
  if (codigo === "T7005" && a.vendido_hoje != null) {
    p.push({ texto: `${reais(a.vendido_hoje)} hoje` });
    if (a.comandas_fechadas_hoje) p.push({ texto: plural(a.comandas_fechadas_hoje, "comanda fechada", "comandas fechadas") });
  }
  if (codigo === "T7001" && a.mesas_ocupadas != null) {
    p.push({ texto: `${a.mesas_ocupadas} de ${a.mesas_total ?? 0} mesas ocupadas` });
    p.push({ texto: plural(a.comandas_abertas ?? 0, "comanda", "comandas") });
  }
  if (codigo === "T7002" && a.pedidos_fila != null) {
    if (a.pedidos_atrasados) p.push({ tom: "alerta", texto: plural(a.pedidos_atrasados, "atrasado", "atrasados") });
    p.push({ texto: `${a.pedidos_fila} na fila` });
  }
  if (codigo === "T7003" && a.pedidos_prontos != null) p.push({ tom: a.pedidos_prontos ? "alerta" : "neutro", texto: plural(a.pedidos_prontos, "pronto", "prontos") });
  if (codigo === "T4004") {
    if (a.estoque_criticos) p.push({ tom: "alerta", texto: plural(a.estoque_criticos, "abaixo do mínimo", "abaixo do mínimo") });
    if (a.estoque_ultimo) p.push({ texto: `Último: ${hora(a.estoque_ultimo)}` });
  }
  return p;
}

/** Blocos grandes das telas da área, com o estado de cada uma. */
function Blocos({ area, agora, base }: { area: AreaNegocio; agora: Agora; base: string }) {
  const { temAcesso } = useBusiness();
  const navegar = useNavigate();
  const itens = partesLiberadas(area, temAcesso).flatMap((g) => g.itens);
  const computador = noApp();
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
      {itens.map((i) => {
        const app = porCodigo(i.codigo);
        if (!app) return null;
        const Icone = app.icone;
        const janela = computador ? JANELA[i.codigo] : undefined;
        return (
          <div
            key={i.codigo}
            role="link"
            tabIndex={0}
            onClick={() => navegar(`${base}/area/${area.id}/${i.codigo}`)}
            onKeyDown={(e) => e.key === "Enter" && navegar(`${base}/area/${area.id}/${i.codigo}`)}
            className="flex min-h-[132px] cursor-pointer flex-col gap-2 rounded-2xl border border-borda bg-superficie p-4 text-left transition hover:border-marca/50 hover:shadow-sm sm:min-h-[150px] sm:p-5"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white sm:h-11 sm:w-11" style={{ backgroundColor: COR[i.codigo] ?? "#6D28D9" }}>
              <Icone className="h-5 w-5" />
            </span>
            <span className="text-[15px] font-semibold sm:text-[17px]">{i.nome ?? app.nome}</span>
            {DESCRICAO[i.codigo] && <span className="hidden text-[13px] text-suave sm:block">{DESCRICAO[i.codigo]}</span>}
            <span className="mt-auto flex flex-wrap gap-1.5">
              {pilulas(i.codigo, agora).map((p) => (
                <Pilula key={p.texto} tom={p.tom}>
                  {p.texto}
                </Pilula>
              ))}
            </span>
            {janela && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void novaJanela(...janela);
                }}
                className="flex items-center gap-1 self-start text-[12.5px] font-semibold text-destaque hover:underline"
              >
                Abrir em outra janela
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const MOVIMENTO = { tranquilo: "Tranquilo", moderado: "Moderado", cheio: "Cheio" } as const;

/** Painel da área: Operar mostra os blocos; Acompanhar mostra o momento e o que precisa de atenção. */
export function PainelArea({ area, base }: { area: AreaNegocio; base: string }) {
  const { atual } = useBusiness();
  const agora = useAgora(atual?.estabelecimento_id);
  if (!atual) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;
  const a = agora ?? {};

  if (area.id !== "acompanhar")
    return (
      <div className="space-y-4">
        <h1 className="text-[22px] font-semibold">{area.nome}</h1>
        <Blocos area={area} agora={a} base={base} />
      </div>
    );

  const numeros = [
    a.mesas_ocupadas != null && { valor: `${a.mesas_ocupadas}/${a.mesas_total ?? 0}`, rotulo: "Mesas ocupadas" },
    a.pedidos_fila != null && { valor: String(a.pedidos_fila), rotulo: "Pedidos na fila" },
    a.comandas_abertas != null && { valor: String(a.comandas_abertas), rotulo: "Comandas abertas" },
    { valor: a.movimento ? MOVIMENTO[a.movimento] : "—", rotulo: "Movimento informado" },
  ].filter(Boolean) as { valor: string; rotulo: string }[];
  const atencao = a.atencao ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-semibold">Acompanhar · agora</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {numeros.map((n) => (
          <div key={n.rotulo} className="cartao px-4 py-3.5">
            <p className="text-[24px] font-bold leading-tight">{agora ? n.valor : "…"}</p>
            <p className="text-[12.5px] text-suave">{n.rotulo}</p>
          </div>
        ))}
      </div>

      <section className="cartao overflow-hidden">
        <header className="flex items-center border-b border-borda px-5 py-3.5 font-semibold">
          Precisa de atenção
          <span className="ml-auto text-[12.5px] font-medium text-suave">{agora ? atencao.length : ""}</span>
        </header>
        {agora && atencao.length === 0 && (
          <p className="flex items-center gap-2 px-5 py-4 text-sm text-ok">
            <CheckCircle2 className="h-4 w-4" />
            Tudo em ordem
          </p>
        )}
        <ul className="divide-y divide-borda">
          {atencao.map((x, n) => (
            <li key={n} className="flex items-center gap-3 px-5 py-3">
              <span className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", x.nivel === "alto" ? "bg-perigo" : "bg-alerta")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{x.titulo}</span>
                <span className="block truncate text-[12.5px] text-suave">{x.detalhe}</span>
              </span>
              <Link to={linkDoApp(x.codigo)} className="shrink-0 text-[13px] font-semibold text-destaque hover:underline">
                {x.acao}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Blocos area={area} agora={a} base={base} />
    </div>
  );
}

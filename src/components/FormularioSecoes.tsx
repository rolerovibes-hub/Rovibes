import { ReactNode, useEffect, useState } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";

// Padrão único de cadastro do RoVibes: as informações são coletadas em seções por assunto
// (Identidade, Contato, Localização...). Cada seção mostra se está completa e o que falta,
// e a trilha no topo leva direto a cada uma. Um só "Salvar" para a tela inteira.

export interface InfoSecao {
  id: string;
  titulo: string;
  /** Nomes dos campos obrigatórios ainda vazios. */
  falta?: string[];
  /** Resumo curto mostrado quando a seção está completa ("5 dias", "3 fotos"). */
  resumo?: string;
  alterada?: boolean;
}

/** "Falta CEP e número" a partir da lista de campos vazios. */
export function textoFalta(falta: string[]) {
  if (!falta.length) return "";
  const nomes = falta.map((f, i) => (i === 0 ? f : f.charAt(0).toLowerCase() + f.slice(1)));
  return `Falta ${nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`}`;
}

/** Lista os rótulos dos campos obrigatórios vazios. */
export function camposVazios(campos: [string, unknown][]) {
  return campos.filter(([, v]) => v == null || (typeof v === "string" && !v.trim())).map(([n]) => n);
}

const ancora = (id: string) => `secao-${id}`;

function Marca({ numero, falta, grande }: { numero: number; falta: boolean; grande?: boolean }) {
  return (
    <span
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-full font-bold text-white",
        grande ? "h-7 w-7 text-[13px]" : "h-[22px] w-[22px] text-[11.5px]",
        falta ? "bg-alerta" : "bg-ok",
      )}
    >
      {falta ? numero : <Check className={grande ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={3} />}
    </span>
  );
}

/** Trilha de seções no topo da tela: mostra o andamento e leva até cada seção. */
export function TrilhaSecoes({ secoes, topo = "top-0" }: { secoes: InfoSecao[]; /** Classe "top-*" quando há cabeçalho fixo acima. */ topo?: string }) {
  const [ativa, setAtiva] = useState(secoes[0]?.id);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (vistas) => {
        const v = vistas.filter((x) => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (v) setAtiva(v.target.id.replace("secao-", ""));
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    secoes.forEach((s) => {
      const el = document.getElementById(ancora(s.id));
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secoes.map((s) => s.id).join()]);

  return (
    <nav aria-label="Seções" className={clsx("sticky z-20 -mx-1", topo, " flex gap-2 overflow-x-auto bg-fundo px-1 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden")}>
      {secoes.map((s, i) => {
        const falta = s.falta ?? [];
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => document.getElementById(ancora(s.id))?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={clsx(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border bg-superficie py-1.5 pl-1.5 pr-3.5 text-[13px] font-semibold",
              ativa === s.id ? "border-marca ring-2 ring-marca/20" : "border-borda hover:border-suave",
            )}
          >
            <Marca numero={i + 1} falta={falta.length > 0} />
            {s.titulo}
            {falta.length > 0 && <span className="font-medium text-alerta">· {textoFalta(falta).replace(/^Falta/, "falta")}</span>}
            {s.alterada && <span className="h-1.5 w-1.5 rounded-full bg-alerta" aria-label="alterada" />}
          </button>
        );
      })}
    </nav>
  );
}

/** Uma seção do formulário: cabeçalho com andamento e campos numa grade de 12 colunas. */
export function SecaoFormulario({ info, numero, acao, children }: { info: InfoSecao; numero: number; acao?: ReactNode; children: ReactNode }) {
  const falta = info.falta ?? [];
  return (
    <section id={ancora(info.id)} className="cartao scroll-mt-32">
      <header className="flex items-center gap-3 border-b border-borda px-5 py-3.5">
        <Marca numero={numero} falta={falta.length > 0} grande />
        <h2 className="text-[15px] font-semibold">{info.titulo}</h2>
        {info.alterada && <span className="rounded-full bg-alerta/15 px-2 py-0.5 text-[11.5px] font-semibold text-alerta">alterado</span>}
        <span className={clsx("ml-auto text-right text-[12.5px]", falta.length ? "font-semibold text-alerta" : "text-suave")}>
          {falta.length ? textoFalta(falta) : (info.resumo ?? "Completo")}
        </span>
        {acao}
      </header>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-12">{children}</div>
    </section>
  );
}

const LARGURA: Record<number, string> = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  4: "sm:col-span-4",
  5: "sm:col-span-5",
  6: "sm:col-span-6",
  7: "sm:col-span-7",
  8: "sm:col-span-8",
  9: "sm:col-span-9",
  12: "sm:col-span-12",
};

/** Campo dentro de uma seção. `largura` em colunas (de 12); no celular ocupa a linha toda. */
export function CampoSecao({
  rotulo,
  largura = 12,
  obrigatorio,
  children,
  className,
}: {
  rotulo?: string;
  largura?: number;
  obrigatorio?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const Tag = rotulo ? "label" : "div";
  return (
    <Tag className={clsx("block min-w-0", LARGURA[largura] ?? "sm:col-span-12", className)}>
      {rotulo && (
        <span className="rotulo mb-1 block">
          {rotulo}
          {obrigatorio && <span className="text-perigo"> *</span>}
        </span>
      )}
      {children}
    </Tag>
  );
}

/** Subtítulo dentro de uma seção (ex.: "Música", "Ambiente"). */
export function SubtituloSecao({ children }: { children: ReactNode }) {
  return <p className="rotulo border-t border-dashed border-borda pt-3 uppercase tracking-wide first:border-0 first:pt-0 sm:col-span-12">{children}</p>;
}

/** Destaque amarelo para campo obrigatório vazio. */
export const vazioObrigatorio = (v: string | null | undefined) => (!v || !v.trim() ? "border-alerta bg-alerta/5" : "");

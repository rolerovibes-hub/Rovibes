import { reais } from "@/components/Formulario";

export type TipoBeneficio = "percentual" | "valor" | "item_gratis";

export interface Beneficio {
  tipo: TipoBeneficio;
  valor: number | null;
  item?: { nome: string } | null;
  pedido_minimo?: number | null;
  dias?: number[] | null;
  hora_inicio?: string | null;
  hora_fim?: string | null;
}

export const NOME_TIPO: Record<TipoBeneficio, string> = {
  percentual: "Desconto em %",
  valor: "Desconto em R$",
  item_gratis: "Item grátis",
};

const DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "20% de desconto", "R$ 10,00 de desconto", "Grátis: Chopp 300 ml". */
export function descreverBeneficio(b: Beneficio) {
  if (b.tipo === "percentual") return `${Number(b.valor ?? 0).toLocaleString("pt-BR")}% de desconto`;
  if (b.tipo === "valor") return `${reais(Number(b.valor ?? 0))} de desconto`;
  return b.item?.nome ? `Grátis: ${b.item.nome}` : "Item grátis";
}

/** "ter a sex", "sáb, dom" ou "" quando vale todos os dias. */
export function descreverDias(dias?: number[] | null) {
  if (!dias || dias.length === 0 || dias.length === 7) return "";
  const d = [...dias].sort((a, b) => a - b);
  const seguidos = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  if (seguidos && d.length >= 3) return `${DIA_CURTO[d[0]]} a ${DIA_CURTO[d[d.length - 1]]}`;
  return d.map((x) => DIA_CURTO[x]).join(", ");
}

const hora = (t: string) => {
  const [h, m] = t.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
};

/** Regras de uso em uma linha: "ter a sex, 18h às 20h · pedidos a partir de R$ 30,00". */
export function descreverRegras(b: Beneficio) {
  const partes: string[] = [];
  const dias = descreverDias(b.dias);
  const horas = b.hora_inicio && b.hora_fim ? `${hora(b.hora_inicio)} às ${hora(b.hora_fim)}` : "";
  if (dias || horas) partes.push([dias, horas].filter(Boolean).join(", "));
  if (b.pedido_minimo) partes.push(`pedidos a partir de ${reais(Number(b.pedido_minimo))}`);
  return partes.join(" · ");
}

export const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

export const DIAS_SEMANA = DIA_CURTO;

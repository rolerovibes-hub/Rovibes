export interface Horario {
  dia_semana: number;
  abre: string;
  fecha: string;
}

export const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

export const hhmm = (t: string) => t.slice(0, 5);

/** Aberto agora? Considera horários que atravessam a madrugada (ex.: 18:00 às 02:00). */
export function abertoAgora(horarios: Horario[], agora = new Date()) {
  const dia = agora.getDay();
  const atual = agora.getHours() * 60 + agora.getMinutes();
  const hoje = horarios.find((h) => h.dia_semana === dia);
  if (hoje) {
    const a = minutos(hoje.abre);
    const f = minutos(hoje.fecha);
    if (f > a ? atual >= a && atual < f : atual >= a) return true;
  }
  const ontem = horarios.find((h) => h.dia_semana === (dia + 6) % 7);
  if (ontem) {
    const a = minutos(ontem.abre);
    const f = minutos(ontem.fecha);
    if (f <= a && atual < f) return true;
  }
  return false;
}

/** Texto curto para o cartão: "Aberto até 02:00", "Abre às 18:00", "Fechado hoje". */
export function resumoHorario(horarios: Horario[], agora = new Date()) {
  if (horarios.length === 0) return "";
  const dia = agora.getDay();
  if (abertoAgora(horarios, agora)) {
    const atual = agora.getHours() * 60 + agora.getMinutes();
    const ontem = horarios.find((h) => h.dia_semana === (dia + 6) % 7);
    if (ontem && minutos(ontem.fecha) <= minutos(ontem.abre) && atual < minutos(ontem.fecha)) {
      return `Aberto até ${hhmm(ontem.fecha)}`;
    }
    const hoje = horarios.find((h) => h.dia_semana === dia)!;
    return `Aberto até ${hhmm(hoje.fecha)}`;
  }
  const hoje = horarios.find((h) => h.dia_semana === dia);
  const atual = agora.getHours() * 60 + agora.getMinutes();
  if (hoje && atual < minutos(hoje.abre)) return `Abre às ${hhmm(hoje.abre)}`;
  return "Fechado agora";
}

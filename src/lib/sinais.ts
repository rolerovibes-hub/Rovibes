import { supabase } from "./supabase";

export type Sinal = "abriu" | "salvou" | "compartilhou" | "role" | "checkin" | "seguiu" | "ocultou";

/** Sinal de uso para o feed aprender (sem travar a tela; se o banco não tiver a 032, ignora). */
export function registrarSinal(estab: string, tipo: Sinal) {
  void supabase.rpc("registrar_sinal", { p_estab: estab, p_tipo: tipo }).then(() => undefined);
}

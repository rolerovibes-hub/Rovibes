import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ehAreaSistema, sessaoDoSistema } from "@/lib/supabase";

/**
 * App pessoal e sistema do estabelecimento (Business/Job) usam sessões diferentes.
 * Ao passar de um para o outro dentro do site, recarrega a página para abrir com a sessão certa.
 */
export function GuardaSessao() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (ehAreaSistema(pathname) !== sessaoDoSistema) window.location.reload();
  }, [pathname]);
  return null;
}

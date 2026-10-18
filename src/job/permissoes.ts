import { useBusiness } from "@/lib/acessos";
import { porCodigo } from "@/lib/catalogo";
import { useSessao } from "@/lib/sessao";

/** O que a pessoa pode fazer na operação do estabelecimento atual. */
export function usePermissoesJob() {
  const { atual, temAcesso } = useBusiness();
  const { ehAdmin, sessao } = useSessao();
  const pode = (c: string) => temAcesso(porCodigo(c)!);
  return {
    eu: sessao?.user.id ?? "",
    garcom: pode("T7001"),
    preparo: pode("T7002"),
    entregas: pode("T7003"),
    supervisor: ehAdmin || atual?.papel === "proprietario" || atual?.papel === "gestor" || pode("T7004"),
  };
}

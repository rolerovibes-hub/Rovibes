import { useBusiness } from "@/lib/acessos";
import { porCodigo } from "@/lib/catalogo";
import { useSessao } from "@/lib/sessao";
import type { ItemPedido } from "@/lib/salao";

/** O que a pessoa pode fazer na operação do estabelecimento atual (funções da equipe). */
export function usePermissoesJob() {
  const { temAcesso, pode, meus, atual } = useBusiness();
  const { sessao } = useSessao();
  const app = (c: string) => temAcesso(porCodigo(c)!);
  const chefe = atual?.papel === "proprietario" || atual?.papel === "gestor" || atual?.papel === "suporte";
  const setores = chefe ? ["cozinha", "bar"] : meus.setores;
  const cancelarSetores = chefe ? ["cozinha", "bar"] : meus.cancelarSetores;
  return {
    eu: sessao?.user.id ?? "",
    garcom: app("T7001"),
    caixa: app("T7005"),
    preparo: app("T7002"),
    entregas: app("T7003"),
    /** Tem alguma ação sensível: vê ocorrências e pedidos de autorização. */
    supervisor: chefe || meus.acoes.size > 0,
    pode,
    setores,
    descontoMax: chefe ? 100 : meus.descontoMax,
    /** Cancelar direto um item que já começou (respeita o setor da função). */
    podeCancelar: (i: Pick<ItemPedido, "destino">) =>
      pode("cancelar_item") && (i.destino === "sem_preparo" || cancelarSetores.includes(i.destino)),
  };
}

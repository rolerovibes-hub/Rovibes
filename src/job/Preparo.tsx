import { useState } from "react";
import clsx from "clsx";
import { Bell, BellOff, ChefHat, Clock, Martini, WifiOff } from "lucide-react";
import { mensagemDeErro } from "@/lib/supabase";
import { gravar, ler } from "@/lib/armazenamento";
import { cancelarOuPedir, ItemFila, minutosDesde, mudarItens, NOME_MODALIDADE, origemDoItem, Setor } from "@/lib/salao";
import { usePermissoesJob } from "./permissoes";
import { bip, porPedido, useItensFila } from "./fila";

const ATENCAO = 15;
const ATRASO = 25;

/** Comanda digital de produção: cozinha e bar iniciam e liberam cada item. */
export function FilaPreparo({ estab }: { estab: string }) {
  const [setor, setSetor] = useState<Setor | "todos">(() => ler<Setor | "todos">("preparo_setor", "todos"));
  const [som, setSom] = useState(() => ler("preparo_som", true));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const { itens, carregar, conectado } = useItensFila(estab, ["recebido", "preparo"], () => som && bip());
  const { podeCancelar, setores } = usePermissoesJob();
  const [ok, setOk] = useState("");
  // Barman e ajudantes de bar só veem o bar; cozinha só a cozinha (funções com setor).
  const umSetor = setores.length === 1 ? (setores[0] as Setor) : null;
  const doMeuSetor = (d: string) => setores.includes(d);
  const setorAtivo: Setor | "todos" = umSetor ?? setor;

  const visiveis = (itens ?? []).filter((i) => i.destino !== "sem_preparo" && doMeuSetor(i.destino) && (setorAtivo === "todos" || i.destino === setorAtivo));
  const grupos = porPedido(visiveis);

  const agir = async (chave: string, ids: string[], acao: "iniciar" | "liberar" | "cancelar") => {
    setOcupado(chave);
    setErro("");
    setOk("");
    if (acao === "cancelar") {
      const item = (itens ?? []).find((i) => i.id === ids[0]);
      if (item) {
        const r = await cancelarOuPedir(item, podeCancelar(item));
        if (r.error) setErro(mensagemDeErro(r.error));
        else if (r.pedido) setOk("Pedido de cancelamento enviado para quem lidera o setor.");
      }
    } else {
      const { error } = await mudarItens(ids, acao);
      if (error) setErro(mensagemDeErro(error));
    }
    setOcupado(null);
    void carregar();
  };

  const contar = (s: Setor) => (itens ?? []).filter((i) => i.destino === s).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {umSetor ? (
          <p className="flex flex-1 items-center gap-2 text-lg font-semibold">
            {umSetor === "bar" ? <Martini className="h-5 w-5 text-destaque" /> : <ChefHat className="h-5 w-5 text-destaque" />}
            {umSetor === "bar" ? "Bar" : "Cozinha"} · {contar(umSetor)}
          </p>
        ) : setores.length === 0 ? (
          <p className="flex-1 text-sm text-suave">Sua função não tem setor de preparo. Peça ao gestor para ajustar em Equipe e permissões.</p>
        ) : (
        <div className="grid flex-1 grid-cols-3 gap-1 rounded-lg border border-borda bg-superficie p-1" role="tablist" aria-label="Setor">
          {(["todos", "cozinha", "bar"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={setor === s}
              onClick={() => {
                setSetor(s);
                gravar("preparo_setor", s);
              }}
              className={clsx("flex items-center justify-center gap-1.5 rounded-md py-2 text-sm", setor === s ? "bg-destaque-suave font-semibold text-destaque" : "text-suave")}
            >
              {s === "bar" ? <Martini className="h-4 w-4" /> : s === "cozinha" ? <ChefHat className="h-4 w-4" /> : null}
              {s === "todos" ? "Todos" : s === "bar" ? `Bar · ${contar("bar")}` : `Cozinha · ${contar("cozinha")}`}
            </button>
          ))}
        </div>
        )}
        <button
          className="botao h-11 w-11 px-0"
          aria-label={som ? "Desligar som" : "Ligar som"}
          onClick={() => {
            setSom(!som);
            gravar("preparo_som", !som);
            if (!som) bip();
          }}
        >
          {som ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </button>
      </div>

      {!conectado && (
        <p role="alert" className="flex items-center gap-2 rounded-cartao border border-alerta/40 bg-alerta/10 px-4 py-3 text-sm text-alerta">
          <WifiOff className="h-4 w-4" />
          Sem conexão. A fila pode estar desatualizada; nenhuma ação é confirmada até a conexão voltar.
        </p>
      )}
      {ok && <p role="status" className="rounded-cartao border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{ok}</p>}
      {erro && <p role="alert" className="rounded-cartao border border-perigo/40 bg-perigo/10 px-4 py-3 text-sm text-perigo">{erro}</p>}

      {itens === null ? (
        <p className="py-10 text-center text-sm text-suave">Carregando a fila...</p>
      ) : grupos.length === 0 ? (
        <div className="cartao px-6 py-14 text-center">
          <ChefHat className="mx-auto h-8 w-8 text-suave" />
          <p className="mt-3 font-medium">Nada para preparar</p>
          <p className="mt-1 text-sm text-suave">Os pedidos novos aparecem aqui sozinhos{som ? ", com um bip" : ""}.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {grupos.map((g) => (
            <CartaoPreparo key={g[0].pedido!.id} itens={g} ocupado={ocupado} agir={agir} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CartaoPreparo({ itens, ocupado, agir }: { itens: ItemFila[]; ocupado: string | null; agir: (chave: string, ids: string[], acao: "iniciar" | "liberar" | "cancelar") => void }) {
  const p = itens[0].pedido!;
  const min = minutosDesde(p.criado_em);
  const ocupadoAqui = ocupado === p.id || itens.some((i) => ocupado === i.id);
  const livres = itens.filter((i) => !i.bloqueado);
  return (
    <li className={clsx("cartao overflow-hidden", min >= ATRASO ? "border-perigo" : min >= ATENCAO && "border-alerta")}>
      <header className="flex items-start justify-between gap-2 border-b border-borda px-4 py-3">
        <div>
          <p className="flex items-center gap-2">
            <span className="codigo text-lg font-semibold">#{p.numero}</span>
            <span className="font-semibold">{origemDoItem(itens[0])}</span>
          </p>
          <p className="text-[12px] text-suave">
            {NOME_MODALIDADE[p.modalidade]} · {p.usuario_id ? "pelo App" : "equipe"}
          </p>
        </div>
        <span className={clsx("flex items-center gap-1 text-sm", min >= ATRASO ? "font-semibold text-perigo" : min >= ATENCAO ? "font-semibold text-alerta" : "text-suave")}>
          <Clock className="h-4 w-4" />
          {min} min
        </span>
      </header>
      <ul className="divide-y divide-borda">
        {itens.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-suave">{i.destino === "bar" ? <Martini className="h-4 w-4" /> : <ChefHat className="h-4 w-4" />}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px]">
                <span className="codigo font-semibold">{i.quantidade}×</span> {i.nome}
              </p>
              {i.observacao && <p className="text-[13px] font-medium text-alerta">{i.observacao}</p>}
              {i.refeito > 0 && <p className="text-[12px] font-semibold text-magenta">Refazer ({i.refeito}ª vez)</p>}
              {i.bloqueado ? (
                <p className="text-[12px] font-semibold text-alerta">Aguardando supervisão</p>
              ) : (
                <button className="text-[12px] text-suave hover:text-perigo" disabled={ocupadoAqui} onClick={() => agir(i.id, [i.id], "cancelar")}>
                  Indisponível
                </button>
              )}
            </div>
            {i.bloqueado ? null : i.situacao === "recebido" ? (
              <button className="botao h-10 shrink-0 px-3" disabled={ocupadoAqui} onClick={() => agir(i.id, [i.id], "iniciar")}>
                Iniciar
              </button>
            ) : (
              <button className="botao-principal h-10 shrink-0 px-3" disabled={ocupadoAqui} onClick={() => agir(i.id, [i.id], "liberar")}>
                Liberar
              </button>
            )}
          </li>
        ))}
      </ul>
      {p.observacao && <p className="border-t border-borda bg-elevado/60 px-4 py-2 text-[13px]">Obs.: {p.observacao}</p>}
      {livres.length > 1 && (
        <button className="w-full border-t border-borda px-4 py-2.5 text-sm font-semibold text-destaque hover:bg-elevado" disabled={ocupadoAqui} onClick={() => agir(p.id, livres.map((i) => i.id), "liberar")}>
          Liberar tudo ({livres.length})
        </button>
      )}
    </li>
  );
}

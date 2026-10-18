import { useState } from "react";
import clsx from "clsx";
import { Bell, BellOff, ChefHat, Clock, Martini, WifiOff } from "lucide-react";
import { mensagemDeErro } from "@/lib/supabase";
import { gravar, ler } from "@/lib/armazenamento";
import { ItemFila, minutosDesde, mudarItens, NOME_MODALIDADE, origemDoItem, Setor } from "@/lib/salao";
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

  const visiveis = (itens ?? []).filter((i) => i.destino !== "sem_preparo" && (setor === "todos" || i.destino === setor));
  const grupos = porPedido(visiveis);

  const agir = async (chave: string, ids: string[], acao: "iniciar" | "liberar" | "cancelar") => {
    let motivo: string | undefined;
    if (acao === "cancelar") {
      motivo = window.prompt("Por que o item não pode ser feito? (ex.: acabou o ingrediente)") ?? "";
      if (!motivo.trim()) return;
    }
    setOcupado(chave);
    setErro("");
    const { error } = await mudarItens(ids, acao, motivo);
    setOcupado(null);
    if (error) setErro(mensagemDeErro(error));
    void carregar();
  };

  const contar = (s: Setor) => (itens ?? []).filter((i) => i.destino === s).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
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
              <button className="text-[12px] text-suave hover:text-perigo" disabled={ocupadoAqui} onClick={() => agir(i.id, [i.id], "cancelar")}>
                Indisponível
              </button>
            </div>
            {i.situacao === "recebido" ? (
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
      {itens.length > 1 && (
        <button className="w-full border-t border-borda px-4 py-2.5 text-sm font-semibold text-destaque hover:bg-elevado" disabled={ocupadoAqui} onClick={() => agir(p.id, itens.map((i) => i.id), "liberar")}>
          Liberar tudo ({itens.length})
        </button>
      )}
    </li>
  );
}

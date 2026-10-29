import { useEffect, useState } from "react";
import clsx from "clsx";
import { Briefcase, ChefHat, Wallet, X } from "lucide-react";
import { cupomTeste, imprimir } from "../impressao";
import { iniciaComWindows, iniciarComWindows, listarImpressoras, noApp } from "../nativo";
import { Estacao, Funcao, NOME_FUNCAO } from "../estacao";

const FUNCOES: { v: Funcao; icone: typeof Wallet; texto: string }[] = [
  { v: "caixa", icone: Wallet, texto: "Comandas e pagamentos" },
  { v: "cozinha", icone: ChefHat, texto: "Telão de pedidos" },
  { v: "escritorio", icone: Briefcase, texto: "Gestão completa" },
];

/** Primeira vez (ou engrenagem): o que este computador é, nome e impressora. */
export function ConfigurarEstacao({ atual, salvar, fechar }: { atual: Estacao | null; salvar: (e: Estacao) => void; fechar?: () => void }) {
  const [e, setE] = useState<Estacao>(
    atual ?? { funcao: "caixa", nome: "Caixa 1", impressora: null, papel: 80, setor: "todos", imprimirPedidos: false, som: true },
  );
  const [impressoras, setImpressoras] = useState<string[] | null>(null);
  const [inicio, setInicio] = useState<boolean | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    listarImpressoras()
      .then(setImpressoras)
      .catch(() => setImpressoras([]));
    void iniciaComWindows().then(setInicio);
  }, []);

  const mudar = (m: Partial<Estacao>) => setE((x) => ({ ...x, ...m }));
  const testar = async () => {
    setAviso(null);
    try {
      await imprimir(e.impressora, cupomTeste(e.nome, e.papel));
      setAviso({ ok: true, texto: "Enviado para a impressora." });
    } catch (err) {
      setAviso({ ok: false, texto: (err as Error).message });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
      <div className="w-full max-w-2xl rounded-2xl bg-superficie p-7 text-texto shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Este computador é…</h2>
          {fechar && (
            <button className="rounded-full p-1.5 hover:bg-elevado" onClick={fechar} aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {FUNCOES.map((f) => (
            <button
              key={f.v}
              onClick={() => mudar({ funcao: f.v, nome: e.nome && !Object.values(NOME_FUNCAO).some((n) => e.nome.startsWith(n.split(" ")[0])) ? e.nome : `${NOME_FUNCAO[f.v].split(" ")[0]} 1` })}
              className={clsx("rounded-xl border-2 p-4 text-center", e.funcao === f.v ? "border-marca bg-destaque-suave" : "border-borda hover:bg-elevado")}
            >
              <f.icone className={clsx("mx-auto mb-2 h-8 w-8", e.funcao === f.v ? "text-destaque" : "text-suave")} />
              <span className="block font-semibold">{NOME_FUNCAO[f.v]}</span>
              <span className="block text-[12px] text-suave">{f.texto}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <label>
            <span className="rotulo mb-1 block">Nome deste computador</span>
            <input className="entrada" value={e.nome} onChange={(x) => mudar({ nome: x.target.value.slice(0, 30) })} />
          </label>
          <label>
            <span className="rotulo mb-1 block">Impressora</span>
            <select className="entrada" value={e.impressora ?? ""} onChange={(x) => mudar({ impressora: x.target.value || null })}>
              <option value="">{impressoras === null ? "Procurando..." : impressoras.length ? "Nenhuma" : noApp() ? "Nenhuma impressora instalada" : "Só no app instalado"}</option>
              {(impressoras ?? []).map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="rotulo mb-1 block">Papel</span>
            <select className="entrada" value={e.papel} onChange={(x) => mudar({ papel: Number(x.target.value) as 58 | 80 })}>
              <option value={80}>80 mm</option>
              <option value={58}>58 mm</option>
            </select>
          </label>
          {e.funcao === "cozinha" && (
            <label>
              <span className="rotulo mb-1 block">Mostrar</span>
              <select className="entrada" value={e.setor} onChange={(x) => mudar({ setor: x.target.value as Estacao["setor"] })}>
                <option value="todos">Cozinha e bar</option>
                <option value="cozinha">Só cozinha</option>
                <option value="bar">Só bar</option>
              </select>
            </label>
          )}
        </div>
        <div className="mt-4 space-y-2 text-sm">
          {e.funcao === "cozinha" && (
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--marca))]" checked={e.imprimirPedidos} onChange={(x) => mudar({ imprimirPedidos: x.target.checked })} />
              Imprimir cada pedido novo
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--marca))]" checked={e.som} onChange={(x) => mudar({ som: x.target.checked })} />
            Som a cada pedido novo
          </label>
          {noApp() && inicio !== null && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[rgb(var(--marca))]"
                checked={inicio}
                onChange={(x) => void iniciarComWindows(x.target.checked).then(setInicio).catch(() => undefined)}
              />
              Abrir junto com o Windows
            </label>
          )}
        </div>
        {aviso && <p className={clsx("mt-3 text-sm", aviso.ok ? "text-ok" : "text-perigo")}>{aviso.texto}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button className="botao" disabled={!e.impressora} onClick={() => void testar()}>
            Testar impressão
          </button>
          <button className="botao-principal px-6" disabled={!e.nome.trim()} onClick={() => salvar({ ...e, nome: e.nome.trim() })}>
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}

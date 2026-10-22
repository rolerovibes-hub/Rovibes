import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Check, Folder, FolderMinus, Pencil, Trash2, X } from "lucide-react";
import { Aplicativo, Area } from "@/lib/catalogo";
import { PastaArea, useBusiness } from "@/lib/acessos";
import { CORES_APP } from "@/lib/estiloApps";
import { visualApp } from "./GradeApps";

const COR_PADRAO = "#334155";

/** Bloco da pasta na grade: mostra até 4 apps em miniatura, o nome e quantos apps tem. */
export function BlocoPasta({
  pasta,
  corArea,
  trocar,
  receber,
  onAbrir,
}: {
  pasta: PastaArea & { apps: Aplicativo[] };
  corArea: Record<Area, string>;
  trocar?: boolean;
  /** Está arrastando um app: soltar no meio põe o app na pasta. */
  receber?: boolean;
  onAbrir: () => void;
}) {
  const { estiloDe } = useBusiness();
  return (
    <button
      onClick={onAbrir}
      className={clsx(
        "flex h-[108px] w-full flex-col justify-between rounded-cartao p-3 text-left text-white shadow-sm transition-[filter] hover:brightness-110",
        trocar && "ring-4 ring-marca ring-offset-2 ring-offset-superficie",
      )}
      style={{ backgroundColor: pasta.cor ?? COR_PADRAO }}
    >
      <span className="grid w-fit grid-cols-4 gap-1">
        {pasta.apps.slice(0, 4).map((a) => {
          const { Icone, classe, estilo } = visualApp(a, estiloDe(a.codigo), corArea);
          return (
            <span key={a.codigo} className={clsx("flex h-6 w-6 items-center justify-center rounded-md ring-1 ring-white/30", classe)} style={estilo}>
              <Icone className="h-3.5 w-3.5" />
            </span>
          );
        })}
        {pasta.apps.length === 0 && <Folder className="h-5 w-5 opacity-80" />}
      </span>
      <span>
        <span className="block truncate text-[15px] font-semibold leading-snug">{pasta.nome}</span>
        <span className="block text-[12px] opacity-80">
          {trocar ? (receber ? "Soltar para pôr na pasta" : "Soltar para trocar") : `Pasta · ${pasta.apps.length} ${pasta.apps.length === 1 ? "app" : "apps"}`}
        </span>
      </span>
    </button>
  );
}

/** Pasta aberta: os apps dela; dá para editar, tirar um app ou apagar a pasta. */
export function FolhaPasta({
  pasta,
  corArea,
  fechar,
  onAbrirApp,
  editar,
}: {
  pasta: PastaArea & { apps: Aplicativo[] };
  corArea: Record<Area, string>;
  fechar: () => void;
  onAbrirApp: (a: Aplicativo) => void;
  editar: () => void;
}) {
  const { estiloDe, moverParaPasta, apagarPasta } = useBusiness();
  const [erro, setErro] = useState("");

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar]);

  return createPortal(
    <div data-sem-arrasto className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={`Pasta ${pasta.nome}`} onClick={fechar}>
      <div className="folha max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-superficie p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: pasta.cor ?? COR_PADRAO }}>
            <Folder className="h-4 w-4" />
          </span>
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{pasta.nome}</h2>
          <button className="rounded-full p-2 hover:bg-elevado" onClick={editar} aria-label="Editar pasta">
            <Pencil className="h-4 w-4" />
          </button>
          <button
            className="rounded-full p-2 text-perigo hover:bg-elevado"
            aria-label="Apagar pasta"
            onClick={async () => {
              if (!window.confirm(`Apagar a pasta ${pasta.nome}? Os apps voltam para a Área de Trabalho.`)) return;
              const e = await apagarPasta(pasta.id);
              if (e) setErro(e);
              else fechar();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button className="-mr-2 rounded-full p-2 hover:bg-elevado" onClick={fechar} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {erro && <p className="mb-2 text-sm text-perigo">{erro}</p>}
        {pasta.apps.length === 0 ? (
          <div className="rounded-lg border border-dashed border-borda px-4 py-8 text-center text-sm text-suave">
            <p>Pasta vazia. Arraste um app até o meio da pasta, use “Pôr numa pasta” nos três pontinhos do app, ou escolha aqui.</p>
            <button className="botao-principal mt-4" onClick={editar}>
              Escolher apps
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pasta.apps.map((a) => {
              const { Icone, classe, estilo } = visualApp(a, estiloDe(a.codigo), corArea);
              return (
                <div key={a.codigo} className={clsx("relative rounded-cartao text-white shadow-sm", classe)} style={estilo}>
                  <button
                    onClick={() => {
                      fechar();
                      onAbrirApp(a);
                    }}
                    className="flex h-[100px] w-full flex-col justify-between rounded-cartao p-3 text-left hover:brightness-110"
                  >
                    <span>
                      <Icone className="h-5 w-5 opacity-90" />
                      <span className="mt-2 block text-[14px] font-semibold leading-snug">{a.nome}</span>
                    </span>
                    <span className="codigo text-[11px] opacity-80">{a.codigo}</span>
                  </button>
                  <button
                    className="absolute right-1.5 top-1.5 rounded p-1 opacity-80 hover:bg-white/15 hover:opacity-100"
                    aria-label={`Tirar ${a.nome} da pasta`}
                    title="Tirar da pasta"
                    onClick={async () => {
                      const e = await moverParaPasta(a.codigo, null);
                      if (e) setErro(e);
                    }}
                  >
                    <FolderMinus className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Criar ou editar pasta: nome, cor e quais apps favoritos ficam dentro. */
export function EditorPasta({
  pasta,
  fechar,
  criada,
  appsIniciais,
}: {
  pasta: (PastaArea & { apps: Aplicativo[] }) | null;
  fechar: () => void;
  criada?: () => void;
  appsIniciais?: string[];
}) {
  const { favoritos, pastas, pastaDoApp, criarPasta, editarPasta } = useBusiness();
  const [nome, setNome] = useState(pasta?.nome ?? "");
  const [cor, setCor] = useState<string | null>(pasta?.cor ?? null);
  const [apps, setApps] = useState<string[]>(pasta?.apps.map((a) => a.codigo) ?? appsIniciais ?? []);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const nomeDe = new Map(pastas.map((p) => [p.id, p.nome]));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setSalvando(true);
    const r = pasta ? await editarPasta(pasta.id, nome.trim(), cor, apps) : await criarPasta(nome.trim(), cor, apps);
    setSalvando(false);
    if (r) return setErro(r);
    fechar();
    criada?.();
  };

  return createPortal(
    <div data-sem-arrasto className="fixed inset-0 z-[75] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={pasta ? "Editar pasta" : "Nova pasta"} onClick={fechar}>
      <form
        onSubmit={(e) => void salvar(e)}
        className="folha max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-superficie p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{pasta ? "Editar pasta" : "Nova pasta"}</h2>
          <button type="button" className="-mr-2 rounded-full p-2 hover:bg-elevado" onClick={fechar} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="block">
          <span className="rotulo mb-1 block">Nome da pasta</span>
          <input autoFocus required maxLength={30} className="entrada" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Dashboard, Salão, Marketing" />
        </label>

        <p className="rotulo mb-1.5 mt-4">Cor</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cor da pasta">
          {[{ cor: null as string | null, nome: "Padrão" }, ...CORES_APP].map((c) => (
            <button
              key={c.cor ?? "padrao"}
              type="button"
              role="radio"
              aria-checked={cor === c.cor}
              aria-label={c.nome}
              title={c.nome}
              onClick={() => setCor(c.cor)}
              className={clsx("flex h-8 w-8 items-center justify-center rounded-md text-white", cor === c.cor && "ring-2 ring-marca ring-offset-1 ring-offset-superficie")}
              style={{ backgroundColor: c.cor ?? COR_PADRAO }}
            >
              {cor === c.cor && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>

        <p className="rotulo mb-1.5 mt-4">Apps da pasta</p>
        {favoritos.length === 0 ? (
          <p className="text-sm text-suave">Marque primeiro a estrela dos apps que você quer na Área de Trabalho.</p>
        ) : (
          <ul className="divide-y divide-borda rounded-lg border border-borda">
            {favoritos.map((a) => {
              const marcado = apps.includes(a.codigo);
              const outra = pastaDoApp(a.codigo);
              const emOutra = outra && outra !== pasta?.id ? nomeDe.get(outra) : null;
              return (
                <li key={a.codigo}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[rgb(var(--marca))]"
                      checked={marcado}
                      onChange={() => setApps(marcado ? apps.filter((x) => x !== a.codigo) : [...apps, a.codigo])}
                    />
                    <a.icone className="h-4 w-4 text-suave" />
                    <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                    {emOutra && <span className="shrink-0 text-[12px] text-suave">em {emOutra}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {erro && <p className="mt-3 text-sm text-perigo">{erro}</p>}
        <button type="submit" className="botao-principal mt-4 h-11 w-full" disabled={salvando || !nome.trim()}>
          {salvando ? "Salvando..." : pasta ? "Salvar pasta" : "Criar pasta"}
        </button>
      </form>
    </div>,
    document.body,
  );
}

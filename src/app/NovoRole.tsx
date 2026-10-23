import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import clsx from "clsx";
import { Avatar } from "@/components/Avatar";
import { Carregando } from "@/components/Carregando";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { listaConexoes, PessoaResumo } from "@/lib/pessoas";
import { useVitrine } from "./dados";

const sem = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Converte ISO para o valor de um campo datetime-local (horário do aparelho). */
const paraCampo = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export interface DadosRole {
  titulo: string;
  local: string | null;
  quando: string | null;
}

/** Nome, lugar fixado e horário do rolê. */
export function FormularioRole({
  inicial,
  salvar,
  cancelar,
  textoBotao = "Salvar",
}: {
  inicial: DadosRole;
  salvar: (d: DadosRole) => Promise<void>;
  cancelar?: () => void;
  textoBotao?: string;
}) {
  const { lugares } = useVitrine();
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [local, setLocal] = useState<string | null>(inicial.local);
  const [quando, setQuando] = useState(paraCampo(inicial.quando));
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const opcoes = useMemo(() => {
    const t = sem(busca.trim());
    return lugares.filter((l) => !t || sem(`${l.nome} ${l.bairro ?? ""}`).includes(t)).slice(0, 30);
  }, [lugares, busca]);
  const escolhido = lugares.find((l) => l.id === local);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return setErro("Dê um nome para o rolê.");
    setSalvando(true);
    setErro("");
    try {
      await salvar({ titulo: titulo.trim(), local, quando: quando ? new Date(quando).toISOString() : null });
    } catch (er) {
      setErro(mensagemDeErro(er));
    }
    setSalvando(false);
  };

  return (
    <form onSubmit={(e) => void enviar(e)} className="space-y-3">
      <label className="block">
        <span className="rotulo mb-1 block">Nome do rolê</span>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value.slice(0, 60))}
          placeholder="Ex.: Sextou no centro"
          className="h-11 w-full rounded-lg border border-borda bg-fundo px-3 text-sm focus:border-marca focus:outline-none"
        />
      </label>
      <div>
        <span className="rotulo mb-1 block">Lugar (opcional)</span>
        {escolhido ? (
          <div className="flex items-center gap-2 rounded-lg border border-marca bg-destaque-suave px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{escolhido.nome}</span>
            <button type="button" onClick={() => setLocal(null)} className="rounded-full p-1 hover:bg-elevado" aria-label="Tirar o lugar">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-borda">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar lugar" className="h-10 w-full rounded-t-lg border-b border-borda bg-fundo px-3 text-sm focus:outline-none" />
            <ul className="max-h-40 overflow-y-auto">
              {opcoes.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => setLocal(l.id)} className="w-full px-3 py-2 text-left text-sm hover:bg-elevado">
                    <span className="font-medium">{l.nome}</span>
                    {l.bairro && <span className="text-suave"> · {l.bairro}</span>}
                  </button>
                </li>
              ))}
              {opcoes.length === 0 && <li className="px-3 py-3 text-sm text-suave">Nenhum lugar encontrado.</li>}
            </ul>
          </div>
        )}
      </div>
      <label className="block">
        <span className="rotulo mb-1 block">Quando (opcional)</span>
        <input
          type="datetime-local"
          value={quando}
          onChange={(e) => setQuando(e.target.value)}
          className="h-11 w-full rounded-lg border border-borda bg-fundo px-3 text-sm focus:border-marca focus:outline-none"
        />
      </label>
      {erro && <p className="text-sm text-perigo">{erro}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" className="botao-principal h-11 flex-1" disabled={salvando}>
          {salvando ? "Salvando..." : textoBotao}
        </button>
        {cancelar && (
          <button type="button" className="botao h-11" onClick={cancelar}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

/** Escolher pessoas: quem você segue e quem segue você, mais a busca geral. */
export function EscolherPessoas({
  jaNoRole = [],
  confirmar,
  cancelar,
  textoBotao,
  unica = false,
}: {
  jaNoRole?: string[];
  confirmar: (ids: string[], pessoas: PessoaResumo[]) => Promise<void>;
  cancelar?: () => void;
  textoBotao: string;
  unica?: boolean;
}) {
  const { sessao } = useSessao();
  const eu = sessao!.user.id;
  const [conhecidos, setConhecidos] = useState<PessoaResumo[] | null>(null);
  const [busca, setBusca] = useState("");
  const [outros, setOutros] = useState<PessoaResumo[]>([]);
  const [marcados, setMarcados] = useState<Map<string, PessoaResumo>>(new Map());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    Promise.all([listaConexoes(eu, "seguindo").catch(() => []), listaConexoes(eu, "seguidores").catch(() => [])]).then(([a, b]) => {
      const m = new Map<string, PessoaResumo>();
      for (const p of [...a, ...b.filter((x) => x.situacao === "ativo")]) m.set(p.id, p);
      setConhecidos([...m.values()].sort((x, y) => x.nome.localeCompare(y.nome)));
    });
  }, [eu]);

  useEffect(() => {
    const t = busca.trim();
    if (t.replace(/^@/, "").length < 2) return setOutros([]);
    const id = window.setTimeout(() => {
      supabase.rpc("buscar_pessoas", { p_termo: t }).then(({ data }) => setOutros((data ?? []) as PessoaResumo[]));
    }, 300);
    return () => window.clearTimeout(id);
  }, [busca]);

  const lista = useMemo(() => {
    const t = sem(busca.trim().replace(/^@/, ""));
    const base = (conhecidos ?? []).filter((p) => !t || sem(`${p.nome} ${p.usuario}`).includes(t));
    const ids = new Set(base.map((p) => p.id));
    return [...base, ...outros.filter((p) => !ids.has(p.id))].filter((p) => !jaNoRole.includes(p.id));
  }, [conhecidos, outros, busca, jaNoRole]);

  const alternar = (p: PessoaResumo) => {
    if (unica) {
      setSalvando(true);
      confirmar([p.id], [p])
        .catch((e) => setErro(mensagemDeErro(e)))
        .finally(() => setSalvando(false));
      return;
    }
    setMarcados((m) => {
      const n = new Map(m);
      if (n.has(p.id)) n.delete(p.id);
      else n.set(p.id, p);
      return n;
    });
  };

  const enviar = async () => {
    setSalvando(true);
    setErro("");
    try {
      await confirmar([...marcados.keys()], [...marcados.values()]);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setSalvando(false);
  };

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Buscar pessoas</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          autoCapitalize="none"
          placeholder="Buscar por nome ou @usuário"
          className="h-10 w-full rounded-lg border border-borda bg-fundo pl-9 pr-3 text-sm focus:border-marca focus:outline-none"
        />
      </label>
      {marcados.size > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...marcados.values()].map((p) => (
            <button key={p.id} onClick={() => alternar(p)} className="inline-flex items-center gap-1 rounded-full bg-destaque-suave px-2.5 py-1 text-[13px] font-medium text-destaque">
              {p.nome.split(" ")[0]}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
      {conhecidos === null ? (
        <Carregando compacto />
      ) : lista.length === 0 ? (
        <p className="py-6 text-center text-sm text-suave">{busca ? "Ninguém encontrado." : "Siga pessoas para chamá-las para o rolê, ou busque pelo nome."}</p>
      ) : (
        <ul className="mt-2 max-h-[44vh] divide-y divide-borda overflow-y-auto">
          {lista.map((p) => {
            const marcado = marcados.has(p.id);
            return (
              <li key={p.id}>
                <button onClick={() => alternar(p)} disabled={salvando} className="flex w-full items-center gap-3 py-2 text-left">
                  <Avatar nome={p.nome} foto={p.foto_url} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.usuario}</span>
                    <span className="block truncate text-[13px] text-suave">{p.nome}</span>
                  </span>
                  {!unica && (
                    <span className={clsx("flex h-6 w-6 items-center justify-center rounded-full border-2", marcado ? "border-marca bg-marca text-marca-texto" : "border-borda")}>
                      {marcado && <Check className="h-3.5 w-3.5" />}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-suave">Quem não segue você recebe como convite e decide se entra.</p>
      {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}
      {!unica && (
        <div className="mt-3 flex gap-2">
          <button className="botao-principal h-11 flex-1" disabled={salvando} onClick={() => void enviar()}>
            {salvando ? "Salvando..." : marcados.size ? `${textoBotao} (${marcados.size})` : textoBotao}
          </button>
          {cancelar && (
            <button className="botao h-11" onClick={cancelar}>
              Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

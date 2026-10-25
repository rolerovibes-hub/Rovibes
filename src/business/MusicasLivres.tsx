import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Check, ExternalLink, Pause, Play, Plus, Search } from "lucide-react";
import { chamarFuncao } from "@/lib/sistema";
import { pararPrevia, tocarPrevia } from "@/components/Musicas";

interface FaixaLivre {
  id: string;
  titulo: string;
  artista: string | null;
  duracao: number | null;
  licenca: string;
  versao: string | null;
  fonte: string | null;
  link: string | null;
  arquivo: string | null;
  estilos: string[];
  importada: boolean;
}

/** Temas de rolê → busca na biblioteca livre (em inglês, como as faixas são catalogadas). */
const TEMAS: { nome: string; busca: string }[] = [
  { nome: "Festa", busca: "party dance" },
  { nome: "Eletrônica", busca: "electronic dance" },
  { nome: "House", busca: "house" },
  { nome: "Funk", busca: "funk" },
  { nome: "Hip hop", busca: "hip hop" },
  { nome: "Samba", busca: "samba" },
  { nome: "Bossa nova", busca: "bossa nova" },
  { nome: "Pop", busca: "pop" },
  { nome: "Rock", busca: "rock" },
  { nome: "Reggae", busca: "reggae" },
  { nome: "Lo-fi", busca: "lofi" },
  { nome: "Lounge", busca: "lounge chill" },
  { nome: "Jazz", busca: "jazz" },
  { nome: "Acústico", busca: "acoustic" },
];

const tempo = (s: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

/** Biblioteca livre (Openverse): só faixas CC0, domínio público ou CC BY, liberadas para uso comercial. */
export function MusicasLivres({ aoImportar }: { aoImportar: () => void }) {
  const [tema, setTema] = useState(TEMAS[0]);
  const [termo, setTermo] = useState("");
  const [busca, setBusca] = useState(TEMAS[0].busca);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [lista, setLista] = useState<FaixaLivre[] | null>(null);
  const [erro, setErro] = useState("");
  const [tocando, setTocando] = useState<string | null>(null);
  const [importando, setImportando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLista(null);
    setErro("");
    try {
      const r = await chamarFuncao<{ faixas: FaixaLivre[]; paginas: number }>("musicas-livres", "buscar", { termo: busca, pagina });
      setLista(r.faixas);
      setPaginas(r.paginas);
    } catch (e) {
      setErro((e as Error).message);
      setLista([]);
    }
  }, [busca, pagina]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  useEffect(() => () => pararPrevia(), []);

  const ouvir = (f: FaixaLivre) => {
    if (!f.arquivo) return;
    tocarPrevia(f.arquivo);
    setTocando(tocando === f.id ? null : f.id);
  };

  const importar = async (f: FaixaLivre) => {
    setImportando(f.id);
    setErro("");
    try {
      await chamarFuncao("musicas-livres", "importar", { id: f.id, estilo: tema.nome });
      setLista((l) => l?.map((x) => (x.id === f.id ? { ...x, importada: true } : x)) ?? null);
      aoImportar();
    } catch (e) {
      setErro((e as Error).message);
    }
    setImportando(null);
  };

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    if (!termo.trim()) return;
    setPagina(1);
    setBusca(termo.trim());
  };

  return (
    <section className="cartao overflow-hidden">
      <div className="space-y-2.5 border-b border-borda p-3">
        <form onSubmit={buscar} className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
          <input className="entrada pl-9" placeholder="Buscar na biblioteca livre..." value={termo} onChange={(e) => setTermo(e.target.value)} aria-label="Buscar música livre" />
        </form>
        <div className="flex flex-wrap gap-1.5">
          {TEMAS.map((t) => (
            <button
              key={t.nome}
              onClick={() => {
                setTema(t);
                setTermo("");
                setPagina(1);
                setBusca(t.busca);
              }}
              className={clsx("rounded-full border px-2.5 py-0.5 text-[12px]", tema.nome === t.nome && busca === t.busca ? "border-marca bg-marca text-marca-texto" : "border-borda text-suave")}
            >
              {t.nome}
            </button>
          ))}
        </div>
      </div>
      {erro && <p className="px-4 py-2.5 text-sm text-perigo">{erro}</p>}
      {lista === null ? (
        <p className="p-6 text-center text-sm text-suave">Buscando...</p>
      ) : lista.length === 0 ? (
        <p className="p-8 text-center text-sm text-suave">Nada encontrado.</p>
      ) : (
        <ul className="divide-y divide-borda">
          {lista.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
              <button onClick={() => ouvir(f)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevado" aria-label={tocando === f.id ? "Pausar" : `Ouvir ${f.titulo}`}>
                {tocando === f.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{f.titulo}</span>
                <span className="block truncate text-[12px] text-suave">{[f.artista, tempo(f.duracao), f.fonte].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="hidden shrink-0 rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-bold text-ok sm:inline">
                {f.licenca}
                {f.versao && f.licenca !== "CC0" ? ` ${f.versao}` : ""}
              </span>
              {f.link && (
                <a href={f.link} target="_blank" rel="noreferrer" className="hidden rounded-full p-1.5 text-suave hover:bg-elevado sm:block" aria-label="Página original">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              {f.importada ? (
                <span className="inline-flex h-8 items-center gap-1 px-2 text-[12px] font-semibold text-ok">
                  <Check className="h-4 w-4" />
                  No RoVibes
                </span>
              ) : (
                <button className="botao h-8 px-3 text-[13px]" disabled={importando !== null} onClick={() => void importar(f)}>
                  <Plus className="h-4 w-4" />
                  {importando === f.id ? "Adicionando..." : "Adicionar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {paginas > 1 && (
        <div className="flex items-center justify-center gap-3 border-t border-borda p-2.5 text-sm">
          <button className="botao h-8 px-3" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
            Anterior
          </button>
          <span className="text-suave">
            {pagina} / {Math.min(paginas, 12)}
          </span>
          <button className="botao h-8 px-3" disabled={pagina >= Math.min(paginas, 12)} onClick={() => setPagina(pagina + 1)}>
            Próxima
          </button>
        </div>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Package, ScanBarcode, Search, X } from "lucide-react";
import { LeitorBarras } from "./LeitorBarras";
import { dadosParaBanco, FormularioBiblioteca } from "./FormularioBiblioteca";
import { mensagemDeErro } from "@/lib/supabase";
import { buscarBiblioteca, dadosVazios, DadosBiblioteca, enviarParaBiblioteca, incluirNoEstoque, ItemBiblioteca } from "@/lib/biblioteca";

/**
 * Busca na Biblioteca RoVibes (nome ou código de barras, com leitor ou câmera).
 * Ao escolher, o produto entra no estoque do estabelecimento. Se não existir, abre o cadastro que vai para análise.
 */
export function BuscaBiblioteca({ estab, escolhido, fechar }: { estab: string; escolhido: (produtoId: string, nome: string) => void; fechar: () => void }) {
  const [termo, setTermo] = useState("");
  const [lista, setLista] = useState<ItemBiblioteca[] | null>(null);
  const [camera, setCamera] = useState(false);
  const [cadastro, setCadastro] = useState<DadosBiblioteca | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const ultimaBusca = useRef("");

  const buscar = async (t: string) => {
    ultimaBusca.current = t;
    if (t.trim().length < 2) return setLista(null);
    try {
      const r = await buscarBiblioteca(estab, t.trim());
      if (ultimaBusca.current === t) setLista(r);
    } catch (e) {
      setErro(/function|schema cache/i.test(String((e as Error).message)) ? "Falta aplicar a atualização 021 do banco." : mensagemDeErro(e));
    }
  };
  useEffect(() => {
    const id = window.setTimeout(() => void buscar(termo), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo]);

  const escolher = async (b: ItemBiblioteca) => {
    setOcupado(true);
    setErro("");
    try {
      const id = b.produto_id ?? (await incluirNoEstoque(estab, b.id));
      escolhido(id, b.nome);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setOcupado(false);
  };

  // Leitor (USB/Bluetooth ou câmera) com EAN exato: escolhe direto; se não existir, já abre o cadastro com o EAN.
  const porCodigo = async (codigo: string) => {
    const c = codigo.replace(/\D/g, "");
    setTermo(c);
    setCamera(false);
    try {
      const r = await buscarBiblioteca(estab, c);
      const exato = r.find((x) => x.ean === c);
      if (exato) return void escolher(exato);
      setLista(r);
      if (/^\d{8,14}$/.test(c)) setCadastro(dadosVazios({ ean: c }));
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  const enviar = async () => {
    if (!cadastro) return;
    setOcupado(true);
    setErro("");
    try {
      const r = await enviarParaBiblioteca(estab, dadosParaBanco(cadastro));
      escolhido(r.produto_id, cadastro.nome);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setOcupado(false);
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Biblioteca de produtos" onClick={fechar}>
      <div className="folha flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-superficie pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 pb-2 pt-4">
          {cadastro && (
            <button type="button" onClick={() => setCadastro(null)} className="-ml-2 rounded-full p-2 hover:bg-elevado" aria-label="Voltar para a busca">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <h2 className="flex-1 text-lg font-semibold">{cadastro ? "Cadastrar na biblioteca" : "Biblioteca de produtos"}</h2>
          <button type="button" onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {cadastro ? (
            <>
              <p className="mb-3 text-sm text-suave">O produto vai para a equipe RoVibes aprovar ou ajustar. Enquanto isso, ele já pode ser usado no seu estoque (fica "Em análise").</p>
              <FormularioBiblioteca dados={cadastro} mudar={setCadastro} />
            </>
          ) : (
            <>
              <p className="text-sm text-suave">Busque pelo nome ou leia o código de barras. Ao escolher, o produto entra no seu estoque.</p>
              <div className="mt-3 flex gap-2">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Buscar na biblioteca</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
                  <input
                    autoFocus
                    value={termo}
                    onChange={(e) => setTermo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && /^\d{8,14}$/.test(termo.trim())) {
                        e.preventDefault();
                        void porCodigo(termo.trim());
                      }
                    }}
                    placeholder="Nome, marca ou código de barras"
                    className="entrada pl-9"
                  />
                </label>
                <button type="button" onClick={() => setCamera(!camera)} aria-pressed={camera} className="botao h-10 px-3" aria-label="Ler código de barras pela câmera">
                  <ScanBarcode className="h-5 w-5" />
                </button>
              </div>
              {camera && (
                <div className="mt-3">
                  <LeitorBarras aoLer={(c) => void porCodigo(c)} />
                </div>
              )}
              {lista && (
                <ul className="mt-3 divide-y divide-borda rounded-lg border border-borda">
                  {lista.map((b) => (
                    <li key={b.id}>
                      <LinhaBiblioteca item={b} disabled={ocupado} aoEscolher={() => void escolher(b)} />
                    </li>
                  ))}
                  {lista.length === 0 && <li className="px-3 py-4 text-center text-sm text-suave">Nenhum produto encontrado na biblioteca.</li>}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setCadastro(dadosVazios(/^\d{8,14}$/.test(termo.trim()) ? { ean: termo.trim() } : { nome: termo.trim() }))}
                className="mt-3 flex w-full items-center gap-3 rounded-lg border border-dashed border-borda px-3 py-3 text-left text-sm hover:bg-elevado"
              >
                <BookOpen className="h-5 w-5 text-destaque" />
                <span>
                  <span className="block font-medium">Não encontrou? Cadastrar na biblioteca</span>
                  <span className="block text-[12px] text-suave">EAN, foto, nome conforme a NF e descrição. A equipe RoVibes revisa.</span>
                </span>
              </button>
            </>
          )}
          {erro && <p className="mt-3 text-sm text-perigo">{erro}</p>}
        </div>

        {cadastro && (
          <div className="px-5 pt-3">
            <button type="button" className="botao-principal h-11 w-full" disabled={ocupado} onClick={() => void enviar()}>
              {ocupado ? "Enviando..." : "Enviar e usar no meu estoque"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Linha de resultado da busca na biblioteca (também usada na prévia da equipe RoVibes). */
export function LinhaBiblioteca({
  item: b,
  disabled,
  aoEscolher,
}: {
  item: Pick<ItemBiblioteca, "nome" | "ean" | "marca" | "foto_url" | "produto_id" | "situacao">;
  disabled?: boolean;
  aoEscolher?: () => void;
}) {
  return (
    <button type="button" disabled={disabled} onClick={aoEscolher} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-elevado">
      {b.foto_url ? (
        <img src={b.foto_url} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-white object-cover" />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-elevado text-suave">
          <Package className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{b.nome}</span>
        <span className="codigo block truncate text-[12px] text-suave">{[b.ean, b.marca].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="shrink-0 text-right text-[11px]">
        {b.produto_id ? <span className="font-semibold text-ok">No seu estoque</span> : <span className="font-semibold text-destaque">Incluir</span>}
        {b.situacao === "pendente" && <span className="block text-alerta">Em análise</span>}
      </span>
    </button>
  );
}

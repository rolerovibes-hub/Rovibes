import { useMemo, useRef, useState } from "react";
import { Camera, MapPin, X } from "lucide-react";
import { reduzirImagem } from "@/lib/imagens";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";
import { Lugar } from "./dados";

const sem = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Criar um story de pessoa: foto, legenda e (opcional) o lugar onde você está. Fica 24 h para quem segue você. */
export function NovoStory({ lugares, fechar, publicado }: { lugares: Lugar[]; fechar: () => void; publicado: () => void }) {
  const { sessao, perfil } = useSessao();
  const seletor = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [legenda, setLegenda] = useState("");
  const [local, setLocal] = useState<Lugar | null>(null);
  const [buscaLocal, setBuscaLocal] = useState("");
  const [escolhendoLocal, setEscolhendoLocal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const opcoes = useMemo(() => {
    const t = sem(buscaLocal.trim());
    return lugares.filter((l) => !t || sem(`${l.nome} ${l.bairro ?? ""}`).includes(t)).slice(0, 20);
  }, [lugares, buscaLocal]);

  const escolherFoto = (lista: FileList | null) => {
    const f = lista?.[0];
    if (seletor.current) seletor.current.value = "";
    if (!f) return;
    if (previa) URL.revokeObjectURL(previa);
    setArquivo(f);
    setPrevia(URL.createObjectURL(f));
  };

  const publicar = async () => {
    if (!arquivo || !sessao) return;
    setEnviando(true);
    setErro("");
    try {
      const blob = await reduzirImagem(arquivo, 1440);
      const caminho = `${sessao.user.id}/story-${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("avatares").upload(caminho, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      const url = supabase.storage.from("avatares").getPublicUrl(caminho).data.publicUrl;
      const { error: e2 } = await supabase
        .from("stories_pessoas")
        .insert({ foto_url: url, legenda: legenda.trim() || null, estabelecimento_id: local?.id ?? null });
      if (e2) {
        await supabase.storage.from("avatares").remove([caminho]);
        throw /relation|does not exist|schema cache/i.test(e2.message) ? new Error("Falta aplicar a atualização 013 do banco.") : e2;
      }
      publicado();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setEnviando(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Novo story" onClick={fechar}>
      <div className="max-h-[94vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-superficie p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Novo story</h2>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {perfil?.suspenso ? (
          <p className="py-6 text-center text-sm text-perigo">Sua conta está suspensa pela moderação e não pode publicar.</p>
        ) : (
          <>
            <input ref={seletor} type="file" accept="image/*" className="hidden" onChange={(e) => escolherFoto(e.target.files)} />
            {previa ? (
              <button onClick={() => seletor.current?.click()} className="mt-3 block w-full overflow-hidden rounded-xl bg-black" aria-label="Trocar foto">
                <img src={previa} alt="Prévia do story" className="mx-auto max-h-[46vh] object-contain" />
              </button>
            ) : (
              <button
                onClick={() => seletor.current?.click()}
                className="mt-3 flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borda text-suave hover:bg-elevado"
              >
                <Camera className="h-8 w-8" />
                <span className="text-sm font-medium">Tirar ou escolher foto</span>
              </button>
            )}

            <label className="mt-3 block">
              <span className="sr-only">Legenda</span>
              <input
                value={legenda}
                onChange={(e) => setLegenda(e.target.value.slice(0, 200))}
                placeholder="Escreva uma legenda (opcional)"
                className="h-11 w-full rounded-lg border border-borda bg-fundo px-3 text-sm focus:border-marca focus:outline-none"
              />
            </label>

            <div className="mt-3">
              {local ? (
                <div className="flex items-center gap-2 rounded-lg border border-marca bg-destaque-suave px-3 py-2 text-sm">
                  <MapPin className="h-4 w-4 text-destaque" />
                  <span className="min-w-0 flex-1 truncate font-medium">{local.nome}</span>
                  <button onClick={() => setLocal(null)} className="rounded-full p-1 hover:bg-elevado" aria-label="Tirar o lugar">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : escolhendoLocal ? (
                <div className="rounded-lg border border-borda">
                  <input
                    autoFocus
                    value={buscaLocal}
                    onChange={(e) => setBuscaLocal(e.target.value)}
                    placeholder="Buscar lugar"
                    className="h-10 w-full rounded-t-lg border-b border-borda bg-fundo px-3 text-sm focus:outline-none"
                  />
                  <ul className="max-h-44 overflow-y-auto">
                    {opcoes.map((l) => (
                      <li key={l.id}>
                        <button
                          onClick={() => {
                            setLocal(l);
                            setEscolhendoLocal(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-elevado"
                        >
                          <span className="font-medium">{l.nome}</span>
                          {l.bairro && <span className="text-suave"> · {l.bairro}</span>}
                        </button>
                      </li>
                    ))}
                    {opcoes.length === 0 && <li className="px-3 py-3 text-sm text-suave">Nenhum lugar encontrado.</li>}
                  </ul>
                </div>
              ) : (
                <button onClick={() => setEscolhendoLocal(true)} className="botao w-full">
                  <MapPin className="h-4 w-4" />
                  Marcar o lugar
                </button>
              )}
            </div>

            <p className="mt-3 text-[12px] text-suave">
              {perfil?.privado ? "Seu perfil é privado: só seus seguidores veem." : "Seus seguidores veem por 24 horas."} Você pode apagar quando quiser.
            </p>
            {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}
            <button className="botao-principal mt-3 h-11 w-full" disabled={!arquivo || enviando} onClick={() => void publicar()}>
              {enviando ? "Publicando..." : "Publicar story"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

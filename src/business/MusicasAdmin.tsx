import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Eye, EyeOff, Music, Pause, Play, Trash2, Upload } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, Secao } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";

interface Faixa {
  id: string;
  titulo: string;
  artista: string | null;
  estilo: string | null;
  arquivo_url: string;
  duracao: number | null;
  licenca: string;
  ativa: boolean;
  ordem: number;
}

const duracaoDoAudio = (f: File) =>
  new Promise<number | null>((ok) => {
    const a = document.createElement("audio");
    const url = URL.createObjectURL(f);
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      ok(Number.isFinite(a.duration) ? Math.round(a.duration * 100) / 100 : null);
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      ok(null);
    };
    a.src = url;
  });

/** A1006 · Músicas dos vídeos: só faixas com licença de uso (originais, compradas ou livres de direitos). */
export function MusicasAdmin() {
  const [lista, setLista] = useState<Faixa[] | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [artista, setArtista] = useState("");
  const [estilo, setEstilo] = useState("");
  const [licenca, setLicenca] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [tocando, setTocando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const player = useRef<HTMLAudioElement>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("musicas").select("id, titulo, artista, estilo, arquivo_url, duracao, licenca, ativa, ordem").order("ordem").order("titulo");
    if (error) {
      setLista([]);
      setAviso({ tipo: "erro", texto: /relation|does not exist|schema cache/i.test(error.message) ? "Falta aplicar a atualização 036 do banco." : mensagemDeErro(error) });
      return;
    }
    setLista((data ?? []) as Faixa[]);
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const atual = lista?.find((f) => f.id === selecionada) ?? null;

  const ouvir = (f: Faixa) => {
    const a = player.current;
    if (!a) return;
    if (tocando === f.id) {
      a.pause();
      setTocando(null);
      return;
    }
    a.src = f.arquivo_url;
    void a.play();
    setTocando(f.id);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!arquivo) return setAviso({ tipo: "erro", texto: "Escolha o arquivo de áudio (MP3)." });
    if (arquivo.size > 15 * 1024 * 1024) return setAviso({ tipo: "erro", texto: "O arquivo pode ter até 15 MB." });
    setOcupado(true);
    setAviso(null);
    try {
      const ext = (arquivo.name.split(".").pop() || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "");
      const caminho = `${crypto.randomUUID()}.${ext}`;
      const { error: e1 } = await supabase.storage.from("musicas").upload(caminho, arquivo, { contentType: arquivo.type || "audio/mpeg" });
      if (e1) throw e1;
      const url = supabase.storage.from("musicas").getPublicUrl(caminho).data.publicUrl;
      const { error: e2 } = await supabase.from("musicas").insert({
        titulo: titulo.trim(),
        artista: artista.trim() || null,
        estilo: estilo.trim() || null,
        licenca: licenca.trim(),
        arquivo_url: url,
        duracao: await duracaoDoAudio(arquivo),
        ordem: (lista?.length ?? 0) + 1,
      });
      if (e2) {
        await supabase.storage.from("musicas").remove([caminho]);
        throw e2;
      }
      setNova(false);
      setTitulo("");
      setArtista("");
      setEstilo("");
      setLicenca("");
      setArquivo(null);
      setAviso({ tipo: "ok", texto: "Música adicionada. Já aparece para quem grava vídeos." });
      await carregar();
    } catch (err) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(err) });
    }
    setOcupado(false);
  };

  const alternar = async () => {
    if (!atual) return;
    const { error } = await supabase.from("musicas").update({ ativa: !atual.ativa }).eq("id", atual.id);
    if (error) return setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    await carregar();
  };

  const excluir = async () => {
    if (!atual || !window.confirm(`Excluir "${atual.titulo}"? Vídeos já publicados continuam com o som.`)) return;
    const { error } = await supabase.from("musicas").delete().eq("id", atual.id);
    if (error) return setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    const caminho = atual.arquivo_url.split("/musicas/")[1];
    if (caminho && atual.arquivo_url.includes("/storage/")) await supabase.storage.from("musicas").remove([decodeURIComponent(caminho)]);
    setSelecionada(null);
    await carregar();
  };

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setNova(true)}>
            <Upload className="h-4 w-4" />
            Nova música
          </button>
          <button className="botao" disabled={!atual} onClick={() => void alternar()}>
            {atual?.ativa === false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {atual?.ativa === false ? "Mostrar" : "Esconder"}
          </button>
        </>
      }
      rodape={
        <button className="botao w-full text-perigo" disabled={!atual} onClick={() => void excluir()}>
          <Trash2 className="h-4 w-4" />
          Excluir
        </button>
      }
    >
      <audio ref={player} onEnded={() => setTocando(null)} />
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      {nova && (
        <Secao titulo="Nova música">
          <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Título">
              <input required className="entrada" maxLength={80} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </Campo>
            <Campo rotulo="Artista (opcional)">
              <input className="entrada" maxLength={80} value={artista} onChange={(e) => setArtista(e.target.value)} />
            </Campo>
            <Campo rotulo="Estilo (opcional)">
              <input className="entrada" maxLength={40} placeholder="Samba, House, Lo-fi..." value={estilo} onChange={(e) => setEstilo(e.target.value)} />
            </Campo>
            <Campo rotulo="Licença de uso">
              <input required className="entrada" maxLength={200} placeholder="Ex.: comprada na loja X, licença comercial" value={licenca} onChange={(e) => setLicenca(e.target.value)} />
            </Campo>
            <Campo rotulo="Arquivo (MP3, até 15 MB)">
              <input required type="file" accept="audio/mpeg,audio/mp3,audio/*" className="entrada py-1.5" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            </Campo>
            <div className="flex items-end gap-2">
              <button className="botao-principal" disabled={ocupado}>
                {ocupado ? "Enviando..." : "Adicionar"}
              </button>
              <button type="button" className="botao" onClick={() => setNova(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </Secao>
      )}

      {lista === null ? (
        <p className="text-sm text-suave">Carregando...</p>
      ) : lista.length === 0 ? (
        <section className="cartao px-6 py-14 text-center">
          <Music className="mx-auto h-8 w-8 text-suave" />
          <p className="mt-3 font-medium">Nenhuma música</p>
        </section>
      ) : (
        <ul className="cartao divide-y divide-borda">
          {lista.map((f) => (
            <li key={f.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelecionada(f.id)}
                onKeyDown={(e) => e.key === "Enter" && setSelecionada(f.id)}
                aria-pressed={selecionada === f.id}
                className={clsx("flex cursor-pointer items-center gap-3 px-4 py-3", selecionada === f.id && "bg-destaque-suave", !f.ativa && "opacity-60")}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    ouvir(f);
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevado"
                  aria-label={tocando === f.id ? "Pausar" : `Ouvir ${f.titulo}`}
                >
                  {tocando === f.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{f.titulo}</span>
                  <span className="block truncate text-[13px] text-suave">{[f.artista, f.estilo, f.duracao ? `${Math.round(f.duracao)} s` : null].filter(Boolean).join(" · ")}</span>
                  <span className="block truncate text-[12px] text-suave">Licença: {f.licenca}</span>
                </span>
                {!f.ativa && <span className="text-[12px] font-medium text-alerta">Escondida</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </TelaUniversal>
  );
}

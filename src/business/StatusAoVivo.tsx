import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Music, RefreshCw, X } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Secao } from "@/components/Formulario";
import { MedidorMovimento, Movimento } from "@/components/Marca";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";
import { useBusiness } from "@/lib/acessos";
import { Estrelas } from "@/app/Avaliacoes";
import { NOME_MOVIMENTO } from "@/app/presenca";

const NIVEIS: Movimento[] = ["tranquilo", "moderado", "cheio"];

interface Checkin {
  id: string;
  movimento: Movimento | null;
  vibe_confere: boolean | null;
  criado_em: string;
}

interface Avaliacao {
  id: string;
  nota: number;
  comentario: string | null;
  atualizado_em: string;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function StatusAoVivo() {
  const { atual } = useBusiness();
  const { sessao } = useSessao();
  const id = atual?.estabelecimento_id;
  const [informado, setInformado] = useState<{ nivel: Movimento; informado_em: string } | null>(null);
  const [musica, setMusica] = useState<{ texto: string; em: string } | null>(null);
  const [textoMusica, setTextoMusica] = useState("");
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    if (!id) return;
    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);
    const [m, c, a, g, ev] = await Promise.all([
      supabase
        .from("movimento_informado")
        .select("nivel, informado_em, musica, musica_em")
        .eq("estabelecimento_id", id)
        .maybeSingle()
        .then((r) => (r.error ? supabase.from("movimento_informado").select("nivel, informado_em").eq("estabelecimento_id", id).maybeSingle() : r)),
      supabase
        .from("checkins")
        .select("id, movimento, vibe_confere, criado_em")
        .eq("estabelecimento_id", id)
        .gte("criado_em", inicioDoDia.toISOString())
        .order("criado_em", { ascending: false })
        .limit(200),
      supabase.from("avaliacoes").select("id, nota, comentario, atualizado_em").eq("estabelecimento_id", id).order("atualizado_em", { ascending: false }).limit(10),
      supabase.from("estabelecimento_gostos").select("gosto:gostos(nome, tipo)").eq("estabelecimento_id", id),
      supabase.from("eventos").select("nome").eq("estabelecimento_id", id).eq("situacao", "publicado").gte("inicio", inicioDoDia.toISOString()).lt("inicio", new Date(inicioDoDia.getTime() + 86400000).toISOString()),
    ]);
    const mi = m.data as { nivel: Movimento | null; informado_em: string; musica?: string | null; musica_em?: string | null } | null;
    setInformado(mi?.nivel && Date.now() - Date.parse(mi.informado_em) < 3 * 3600 * 1000 ? { nivel: mi.nivel, informado_em: mi.informado_em } : null);
    setMusica(mi?.musica && mi.musica_em && Date.now() - Date.parse(mi.musica_em) < 3 * 3600 * 1000 ? { texto: mi.musica, em: mi.musica_em } : null);
    const estilos = ((g.data ?? []) as unknown as { gosto: { nome: string; tipo: string } | null }[]).filter((x) => x.gosto?.tipo === "musica").map((x) => x.gosto!.nome);
    const deHoje = ((ev.data ?? []) as { nome: string }[]).map((e) => e.nome);
    setSugestoes([...new Set([...deHoje, ...estilos, "DJ", "Banda ao vivo", "Playlist ambiente"])].slice(0, 10));
    setCheckins((c.data ?? []) as Checkin[]);
    setAvaliacoes((a.data ?? []) as Avaliacao[]);
  }, [id]);

  useEffect(() => {
    void carregar();
    const t = window.setInterval(() => void carregar(), 60000);
    return () => window.clearInterval(t);
  }, [carregar]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const informar = async (nivel: Movimento | null) => {
    setErro("");
    let { error } = await supabase.rpc("informar_agora", { p_estab: id, p_movimento: nivel ?? "", p_musica: null });
    // Banco sem a atualização 031: grava do jeito antigo.
    if (error && /function|schema cache/i.test(error.message))
      ({ error } = nivel
        ? await supabase
            .from("movimento_informado")
            .upsert({ estabelecimento_id: id, nivel, informado_por: sessao?.user.id, informado_em: new Date().toISOString() })
        : await supabase.from("movimento_informado").delete().eq("estabelecimento_id", id));
    if (error) setErro(mensagemDeErro(error));
    await carregar();
  };

  const informarMusica = async (texto: string) => {
    setErro("");
    const { error } = await supabase.rpc("informar_agora", { p_estab: id, p_movimento: null, p_musica: texto });
    if (error) setErro(/function|schema cache/i.test(error.message) ? "Falta aplicar a atualização 031 do banco para informar a música." : mensagemDeErro(error));
    else setTextoMusica("");
    await carregar();
  };

  const ultimas2h = checkins.filter((c) => Date.now() - Date.parse(c.criado_em) < 2 * 3600 * 1000);
  const contagem = (n: Movimento) => ultimas2h.filter((c) => c.movimento === n).length;
  const respostasVibe = checkins.filter((c) => c.vibe_confere != null);
  const vibeOk = respostasVibe.filter((c) => c.vibe_confere).length;
  const media = avaliacoes.length ? avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length : null;
  const expira = informado ? new Date(Date.parse(informado.informado_em) + 3 * 3600 * 1000) : null;

  return (
    <TelaUniversal
      acoes={
        <button className="botao col-span-2 sm:col-span-1" onClick={() => void carregar()}>
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      }
    >
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Secao
        titulo="Movimento agora"
        acao={
          informado && (
            <button className="botao h-8 text-[13px]" onClick={() => void informar(null)}>
              <X className="h-3.5 w-3.5" />
              Parar de informar
            </button>
          )
        }
      >
        <div className="grid grid-cols-3 gap-2">
          {NIVEIS.map((n) => (
            <button
              key={n}
              onClick={() => void informar(n)}
              aria-pressed={informado?.nivel === n}
              className={clsx(
                "flex flex-col items-center gap-2 rounded-lg border px-2 py-4 text-sm",
                informado?.nivel === n ? "border-marca bg-destaque-suave font-semibold" : "border-borda hover:bg-elevado",
              )}
            >
              <MedidorMovimento nivel={n} rotulo={false} />
              {NOME_MOVIMENTO[n]}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-suave">
          {informado && expira
            ? `Informado às ${hora(informado.informado_em)}. Vale até ${hora(expira.toISOString())}; depois o App volta a usar as respostas dos check-ins.`
            : "Sem informação da casa: o App mostra o que as pessoas respondem no check-in."}
        </p>
      </Secao>

      <Secao
        titulo="Música tocando agora"
        acao={
          musica && (
            <button className="botao h-8 text-[13px]" onClick={() => void informarMusica("")}>
              <X className="h-3.5 w-3.5" />
              Apagar
            </button>
          )
        }
      >
        {musica ? (
          <p className="mb-3 flex items-center gap-2 font-medium">
            <span className="h-2 w-2 animate-pulse rounded-full bg-perigo" />
            {musica.texto}
            <span className="text-[13px] font-normal text-suave">· informado às {hora(musica.em)}</span>
          </p>
        ) : (
          <p className="mb-3 text-[13px] text-suave">Sem informação: o App mostra a programação de hoje como “prevista”, não como o que está tocando.</p>
        )}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {sugestoes.map((t) => (
            <button key={t} className="h-8 rounded-full border border-borda px-3 text-[13px] hover:bg-elevado" onClick={() => void informarMusica(t)}>
              {t}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (textoMusica.trim()) void informarMusica(textoMusica.trim());
          }}
        >
          <input className="entrada min-w-0 flex-1" value={textoMusica} onChange={(e) => setTextoMusica(e.target.value.slice(0, 80))} placeholder="Ex.: Samba com Grupo Raiz, DJ de funk" />
          <button className="botao-principal shrink-0" disabled={!textoMusica.trim()}>
            <Music className="h-4 w-4" />
            Informar
          </button>
        </form>
        <p className="mt-2 text-[13px] text-suave">Um toque basta. Vale por até 3 horas; depois o App mostra “sem atualização recente”.</p>
      </Secao>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="cartao p-4">
          <p className="rotulo">Check-ins hoje</p>
          <p className="codigo mt-1 text-2xl font-semibold">{checkins.length}</p>
        </div>
        <div className="cartao p-4">
          <p className="rotulo">Últimas 2 horas</p>
          <p className="codigo mt-1 text-2xl font-semibold">{ultimas2h.length}</p>
          <p className="mt-1 text-[13px] text-suave">{NIVEIS.map((n) => `${NOME_MOVIMENTO[n]} ${contagem(n)}`).join(" · ")}</p>
        </div>
        <div className="cartao p-4">
          <p className="rotulo">A vibe confere (hoje)</p>
          <p className="codigo mt-1 text-2xl font-semibold">{respostasVibe.length ? `${Math.round((vibeOk / respostasVibe.length) * 100)}%` : "—"}</p>
          <p className="mt-1 text-[13px] text-suave">{respostasVibe.length} respostas</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Check-ins recentes">
          {checkins.length === 0 ? (
            <p className="text-sm text-suave">Nenhum check-in hoje.</p>
          ) : (
            <ul className="divide-y divide-borda text-sm">
              {checkins.slice(0, 15).map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="codigo w-12 text-sm">{hora(c.criado_em)}</span>
                  <span className="flex-1">{c.movimento ? <MedidorMovimento nivel={c.movimento} /> : <span className="text-suave">Sem resposta</span>}</span>
                  {c.vibe_confere != null && (
                    <span className={clsx("text-[13px]", c.vibe_confere ? "text-ok" : "text-alerta")}>{c.vibe_confere ? "Vibe confere" : "Vibe não confere"}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo={media ? `Avaliações · média ${media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}` : "Avaliações"}>
          {avaliacoes.length === 0 ? (
            <p className="text-sm text-suave">Nenhuma avaliação ainda.</p>
          ) : (
            <ul className="divide-y divide-borda">
              {avaliacoes.map((a) => (
                <li key={a.id} className="py-2.5">
                  <div className="flex items-center justify-between">
                    <Estrelas nota={a.nota} tamanho="h-3.5 w-3.5" />
                    <span className="text-[12px] text-suave">{new Date(a.atualizado_em).toLocaleDateString("pt-BR")}</span>
                  </div>
                  {a.comentario && <p className="mt-1 text-sm">{a.comentario}</p>}
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>
    </TelaUniversal>
  );
}

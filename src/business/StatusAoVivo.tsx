import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { RefreshCw, X } from "lucide-react";
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
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    if (!id) return;
    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);
    const [m, c, a] = await Promise.all([
      supabase.from("movimento_informado").select("nivel, informado_em").eq("estabelecimento_id", id).maybeSingle(),
      supabase
        .from("checkins")
        .select("id, movimento, vibe_confere, criado_em")
        .eq("estabelecimento_id", id)
        .gte("criado_em", inicioDoDia.toISOString())
        .order("criado_em", { ascending: false })
        .limit(200),
      supabase.from("avaliacoes").select("id, nota, comentario, atualizado_em").eq("estabelecimento_id", id).order("atualizado_em", { ascending: false }).limit(10),
    ]);
    const mi = m.data as { nivel: Movimento; informado_em: string } | null;
    setInformado(mi && Date.now() - Date.parse(mi.informado_em) < 3 * 3600 * 1000 ? mi : null);
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
    const { error } = nivel
      ? await supabase
          .from("movimento_informado")
          .upsert({ estabelecimento_id: id, nivel, informado_por: sessao?.user.id, informado_em: new Date().toISOString() })
      : await supabase.from("movimento_informado").delete().eq("estabelecimento_id", id);
    if (error) setErro(mensagemDeErro(error));
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

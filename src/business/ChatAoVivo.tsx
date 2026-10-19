import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Download, Eye, Power, Radio, X } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { EntradaAoVivo, entrarAoVivo, hora, MensagemAoVivo, mensagensAoVivo, NOME_MOVIMENTO_AO_VIVO, rpcAoVivo } from "@/lib/aoVivo";

interface Sessao {
  sala_id: string;
  abriu_em: string;
  fechou_em: string;
  aberta: boolean;
  mensagens: number;
  participantes: number;
  enquetes: number;
}

interface Enquete {
  pergunta: string;
  opcoes: string[];
  votos: number[];
  total: number;
}

const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });

const linhaTexto = (m: MensagemAoVivo) => {
  const quem = m.nome ?? (m.tipo === "sistema" ? "RoVibes" : "Alguém");
  const marca = m.apagada ? " [apagada pela moderação]" : "";
  switch (m.tipo) {
    case "musica":
      return `${quem} ${m.dados.voto === 1 ? "curtiu" : "não curtiu"} a música${m.dados.musica ? ` (${m.dados.musica})` : ""}`;
    case "ambiente":
      return `${quem} avaliou o ambiente: ${NOME_MOVIMENTO_AO_VIVO[m.dados.movimento ?? ""] ?? ""}, vibe ${m.dados.vibe}/5`;
    case "enquete":
      return `${quem} abriu a enquete: ${m.texto}`;
    case "foto":
      return `${quem}: [foto]${m.texto ? ` ${m.texto}` : ""}${marca}`;
    default:
      return `${quem}: ${m.texto ?? ""}${marca}`;
  }
};
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** T2002 — Chat ao vivo: abrir/encerrar, moderar e histórico (90 dias, com exportação em ZIP). */
export function ChatAoVivo({ estab, nomeEstab }: { estab: string; nomeEstab: string }) {
  const [entrada, setEntrada] = useState<EntradaAoVivo | null>(null);
  const [sessoes, setSessoes] = useState<Sessao[] | null>(null);
  const [horas, setHoras] = useState(6);
  const [vendo, setVendo] = useState<{ sessao: Sessao; msgs: MensagemAoVivo[] | null } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [e, h] = await Promise.all([entrarAoVivo(estab), rpcAoVivo("historico_ao_vivo", { p_estab: estab })]);
      setEntrada(e);
      setSessoes((h ?? []) as Sessao[]);
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
      setSessoes([]);
    }
  }, [estab]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const executar = async (f: () => Promise<unknown>, ok: string) => {
    setAviso(null);
    try {
      await f();
      setAviso({ tipo: "ok", texto: ok });
      await carregar();
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
    }
  };

  const ver = async (s: Sessao) => {
    setVendo({ sessao: s, msgs: null });
    try {
      setVendo({ sessao: s, msgs: await mensagensAoVivo(s.sala_id, 1000) });
    } catch (e) {
      setVendo(null);
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
    }
  };

  const exportar = async (s: Sessao) => {
    setOcupado(s.sala_id);
    setAviso(null);
    try {
      const [msgs, enq] = await Promise.all([mensagensAoVivo(s.sala_id, 1000), rpcAoVivo("enquetes_ao_vivo_lista", { p_sala: s.sala_id })]);
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const titulo = `Chat ao vivo — ${nomeEstab} — ${data(s.abriu_em)} (${hora(s.abriu_em)} às ${hora(s.fechou_em)})`;
      zip.file("conversa.txt", [titulo, "", ...msgs.map((m) => `[${hora(m.criado_em)}] ${linhaTexto(m)}`)].join("\n"));
      zip.file(
        "mensagens.csv",
        "﻿" +
          ["data_hora;usuario;nome;tipo;texto;musica;voto;movimento;vibe;foto;apagada", ...msgs.map((m) =>
            [new Date(m.criado_em).toLocaleString("pt-BR"), m.usuario ?? "", m.nome ?? "", m.tipo, m.texto ?? "", m.dados.musica ?? "", m.dados.voto ?? "", m.dados.movimento ?? "", m.dados.vibe ?? "", m.foto_path ? `fotos/${m.foto_path.split("/").pop()}` : "", m.apagada ? "sim" : ""]
              .map(csv)
              .join(";"),
          )].join("\n"),
      );
      zip.file(
        "enquetes.csv",
        "﻿" + ["pergunta;opcao;votos;total", ...((enq ?? []) as Enquete[]).flatMap((q) => q.opcoes.map((o, i) => [q.pergunta, o, q.votos[i], q.total].map(csv).join(";")))].join("\n"),
      );
      const fotos = msgs.filter((m) => m.foto_path);
      for (const m of fotos) {
        const { data: blob } = await supabase.storage.from("ao-vivo").download(m.foto_path!);
        if (blob) zip.file(`fotos/${m.foto_path!.split("/").pop()}`, blob);
      }
      const arquivo = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(arquivo);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-ao-vivo-${new Date(s.abriu_em).toISOString().slice(0, 10)}.zip`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setAviso({ tipo: "ok", texto: `Arquivo gerado: ${msgs.length} registros e ${fotos.length} foto(s).` });
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
    }
    setOcupado(null);
  };

  if (!entrada || !sessoes) return <Carregando />;
  const aberto = !!entrada.sala;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="cartao p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className={clsx("flex h-11 w-11 items-center justify-center rounded-full", aberto ? "bg-perigo/10 text-perigo" : "bg-elevado text-suave")}>
            <Radio className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">{aberto ? "Chat ao vivo aberto" : "Chat ao vivo fechado"}</h1>
            <p className="text-sm text-suave">
              {aberto
                ? `Aberto desde ${hora(entrada.abriu_em!)} · fecha às ${hora(entrada.fecha_previsto!)}`
                : "Abre sozinho no horário de funcionamento cadastrado. Para eventos fora do horário, abra manualmente."}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {aberto ? (
            <>
              <Link to={`/ao-vivo/${estab}`} className="botao-principal">
                <Eye className="h-4 w-4" />
                Entrar e moderar
              </Link>
              <button className="botao text-perigo" onClick={() => window.confirm("Encerrar o chat ao vivo agora?") && void executar(() => rpcAoVivo("fechar_ao_vivo", { p_estab: estab }), "Chat ao vivo encerrado.")}>
                <Power className="h-4 w-4" />
                Encerrar agora
              </button>
            </>
          ) : (
            <>
              <select className="entrada w-auto" value={horas} onChange={(e) => setHoras(Number(e.target.value))} aria-label="Por quanto tempo">
                {[2, 4, 6, 8, 12].map((h) => (
                  <option key={h} value={h}>
                    Por {h} horas
                  </option>
                ))}
              </select>
              <button className="botao-principal" onClick={() => void executar(() => rpcAoVivo("abrir_ao_vivo", { p_estab: estab, p_horas: horas }), "Chat ao vivo aberto.")}>
                <Radio className="h-4 w-4" />
                Abrir agora
              </button>
            </>
          )}
        </div>
        <p className="mt-3 text-[12px] text-suave">
          Quem fez check-in participa. Quem não fez vê uma prévia de 5 minutos por noite. Depois de fechado, só a equipe vê o histórico, guardado por 90 dias.
        </p>
      </section>

      {aviso && <p className={clsx("rounded-cartao border px-4 py-3 text-sm", aviso.tipo === "ok" ? "border-ok/40 bg-ok/10 text-ok" : "border-perigo/40 bg-perigo/10 text-perigo")}>{aviso.texto}</p>}

      <section className="cartao overflow-hidden">
        <h2 className="border-b border-borda px-5 py-3 font-semibold">Histórico (90 dias)</h2>
        {sessoes.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-suave">Nenhum chat ao vivo ainda.</p>
        ) : (
          <ul className="divide-y divide-borda">
            {sessoes.map((s) => (
              <li key={s.sala_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium capitalize">
                    {data(s.abriu_em)} {s.aberta && <span className="ml-1 rounded bg-perigo/10 px-1.5 text-[11px] font-bold uppercase text-perigo">ao vivo</span>}
                  </span>
                  <span className="block text-[13px] text-suave">
                    {hora(s.abriu_em)} às {hora(s.fechou_em)} · {s.mensagens} mensagens · {s.participantes} pessoas · {s.enquetes} enquete{s.enquetes === 1 ? "" : "s"}
                  </span>
                </span>
                <button className="botao h-9" onClick={() => void ver(s)}>
                  <Eye className="h-4 w-4" />
                  Ver
                </button>
                <button className="botao h-9" disabled={ocupado === s.sala_id} onClick={() => void exportar(s)}>
                  <Download className="h-4 w-4" />
                  {ocupado === s.sala_id ? "Gerando..." : "Exportar ZIP"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {vendo && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Histórico do chat" onClick={() => setVendo(null)}>
          <div className="folha flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-superficie sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-borda px-5 py-3">
              <h2 className="flex-1 font-semibold capitalize">{data(vendo.sessao.abriu_em)}</h2>
              <button onClick={() => setVendo(null)} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {!vendo.msgs ? (
                <Carregando />
              ) : vendo.msgs.length === 0 ? (
                <p className="py-6 text-center text-sm text-suave">Sem mensagens.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {vendo.msgs.map((m) => (
                    <li key={m.id} className={clsx(m.apagada && "text-suave line-through")}>
                      <span className="codigo mr-2 text-[12px] text-suave">{hora(m.criado_em)}</span>
                      {linhaTexto(m)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

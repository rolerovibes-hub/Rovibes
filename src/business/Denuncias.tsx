import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Archive, AlertTriangle, Ban, EyeOff, RefreshCw, UserCheck } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Avatar } from "@/components/Avatar";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { nomeMotivo } from "@/lib/pessoas";

interface Denuncia {
  id: string;
  tipo_alvo: "perfil" | "story" | "publicacao" | "mensagem" | "post" | "comentario";
  alvo_id: string;
  motivo: string;
  detalhe: string | null;
  criada_em: string;
  situacao: "aberta" | "resolvida" | "arquivada";
  acao: string | null;
  denunciante: string;
  alvo_nome: string | null;
  alvo_usuario_nome: string | null;
  alvo_foto: string | null;
  alvo_texto: string | null;
  alvo_imagem: string | null;
  total_contra: number;
}

const NOME_TIPO: Record<Denuncia["tipo_alvo"], string> = { perfil: "Perfil", story: "Story", publicacao: "Publicação", mensagem: "Mensagem", post: "Publicação de pessoa", comentario: "Comentário" };
const NOME_ACAO: Record<string, string> = { ocultado: "Conteúdo ocultado", advertido: "Advertência", suspenso: "Conta suspensa", arquivado: "Arquivada" };

type Acao = "ocultado" | "advertido" | "suspenso" | "arquivado";
const TEXTO_ACAO: Record<Acao, string> = {
  ocultado: "Ocultar o conteúdo",
  advertido: "Advertir a pessoa",
  suspenso: "Suspender a conta",
  arquivado: "Arquivar sem ação",
};

/** A1003 — Denúncias: a administração analisa e decide (ocultar, advertir, suspender ou arquivar). */
export function Denuncias() {
  const [filtro, setFiltro] = useState<"aberta" | "todas">("aberta");
  const [linhas, setLinhas] = useState<Denuncia[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [decisao, setDecisao] = useState<Acao | null>(null);
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    const { data, error } = await supabase.rpc("denuncias_abertas");
    if (error) setErro(/function|schema cache/i.test(error.message) ? "Falta aplicar a atualização 013 do banco." : mensagemDeErro(error));
    setLinhas((data ?? []) as Denuncia[]);
    setCarregando(false);
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const visiveis = linhas.filter((l) => filtro === "todas" || l.situacao === "aberta");
  const d = linhas.find((l) => l.id === sel) ?? null;
  const aberta = d?.situacao === "aberta";

  const decidir = async () => {
    if (!d || !decisao) return;
    const { error } = await supabase.rpc("resolver_denuncia", { p_denuncia: d.id, p_acao: decisao, p_nota: nota });
    if (error) return setErro(mensagemDeErro(error));
    setDecisao(null);
    setNota("");
    setSel(null);
    await carregar();
  };

  const reativar = async () => {
    if (!d) return;
    const { data: p } = await supabase.from("perfis").select("id").eq("usuario", d.alvo_usuario_nome ?? "").maybeSingle();
    if (!p) return;
    const { error } = await supabase.rpc("reativar_conta", { p_pessoa: p.id });
    if (error) setErro(mensagemDeErro(error));
    else window.alert("Conta reativada.");
  };

  const botao = (a: Acao, Icone: typeof Ban, desab = false) => (
    <button className={a === "suspenso" ? "botao text-perigo" : "botao"} disabled={!aberta || desab} onClick={() => setDecisao(a)}>
      <Icone className="h-4 w-4" />
      {a === "ocultado" ? "Ocultar" : a === "advertido" ? "Advertir" : a === "suspenso" ? "Suspender" : "Arquivar"}
    </button>
  );

  return (
    <TelaUniversal
      acoes={
        <>
          {botao("ocultado", EyeOff)}
          {botao("advertido", AlertTriangle, !d?.alvo_usuario_nome)}
          {botao("suspenso", Ban, !d?.alvo_usuario_nome)}
          {botao("arquivado", Archive)}
          <hr className="col-span-full my-1 border-borda" />
          <button className="botao" disabled={!d || d.acao !== "suspenso"} onClick={() => void reativar()}>
            <UserCheck className="h-4 w-4" />
            Reativar conta
          </button>
          <button className="botao" onClick={() => void carregar()}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </>
      }
    >
      <section className="cartao flex flex-wrap gap-2 p-3" role="tablist" aria-label="Situação">
        {(["aberta", "todas"] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filtro === f}
            onClick={() => setFiltro(f)}
            className={clsx("rounded-lg px-3 py-1.5 text-sm", filtro === f ? "bg-destaque-suave font-semibold text-destaque" : "text-suave hover:bg-elevado hover:text-texto")}
          >
            {f === "aberta" ? `Abertas (${linhas.filter((l) => l.situacao === "aberta").length})` : "Todas"}
          </button>
        ))}
      </section>

      {erro && (
        <p role="alert" className="cartao border-perigo/40 px-4 py-3 text-sm text-perigo">
          {erro}
        </p>
      )}

      {decisao && d && (
        <section className="cartao space-y-3 p-4">
          <h2 className="font-semibold">{TEXTO_ACAO[decisao]}</h2>
          <p className="text-sm text-suave">
            {decisao === "ocultado" && "O conteúdo sai do ar para todos. Se for um perfil, a foto e a bio são removidas."}
            {decisao === "advertido" && "Fica registrada uma advertência na conta da pessoa."}
            {decisao === "suspenso" && "A conta some do RoVibes (perfil, busca e stories) e não pode publicar. Dá para reativar depois."}
            {decisao === "arquivado" && "A denúncia é encerrada sem nenhuma ação."} A decisão vale para todas as denúncias abertas sobre o mesmo conteúdo.
          </p>
          <label className="block">
            <span className="rotulo mb-1 block">Observação interna (opcional)</span>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm focus:border-marca focus:outline-none" />
          </label>
          <div className="flex gap-2">
            <button className="botao-principal" onClick={() => void decidir()}>
              Confirmar
            </button>
            <button className="botao" onClick={() => setDecisao(null)}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      <section className="cartao overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-borda bg-elevado/60">
              <tr>
                {["Sobre", "Tipo", "Motivo", "Denúncias contra", "Recebida em", "Situação"].map((c) => (
                  <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => {
                    setSel(l.id);
                    setDecisao(null);
                  }}
                  aria-selected={sel === l.id}
                  className={clsx("cursor-pointer border-b border-borda last:border-0", sel === l.id ? "bg-destaque-suave" : "hover:bg-elevado")}
                >
                  <td className="px-4 py-3 font-medium">{l.alvo_usuario_nome ? `@${l.alvo_usuario_nome}` : "—"}</td>
                  <td className="px-4 py-3">{NOME_TIPO[l.tipo_alvo]}</td>
                  <td className="px-4 py-3">{nomeMotivo(l.motivo)}</td>
                  <td className={clsx("px-4 py-3", l.total_contra >= 3 && "font-semibold text-perigo")}>{l.total_contra || "—"}</td>
                  <td className="codigo whitespace-nowrap px-4 py-3 text-[13px]">{new Date(l.criada_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className={clsx("whitespace-nowrap px-4 py-3 font-medium", l.situacao === "aberta" ? "text-alerta" : "text-suave")}>
                    {l.situacao === "aberta" ? "Aberta" : NOME_ACAO[l.acao ?? ""] ?? "Encerrada"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!carregando && visiveis.length === 0 && <p className="px-6 py-12 text-center text-sm text-suave">Nenhuma denúncia {filtro === "aberta" ? "aberta" : ""}.</p>}
      </section>

      {d && (
        <section className="cartao space-y-3 p-4 text-sm">
          <div className="flex items-center gap-3">
            <Avatar nome={d.alvo_nome ?? "?"} foto={d.alvo_foto} />
            <div>
              <p className="font-semibold">{d.alvo_nome ?? "Conta removida"}</p>
              {d.alvo_usuario_nome && <p className="text-suave">@{d.alvo_usuario_nome}</p>}
            </div>
          </div>
          {d.alvo_imagem && <img src={d.alvo_imagem} alt="Conteúdo denunciado" className="max-h-80 rounded-lg object-contain" />}
          {d.alvo_texto && (
            <p className="rounded-lg bg-elevado px-3 py-2">
              <span className="text-suave">{d.tipo_alvo === "perfil" ? "Bio: " : "Texto: "}</span>
              {d.alvo_texto}
            </p>
          )}
          <p>
            <span className="text-suave">Motivo: </span>
            {nomeMotivo(d.motivo)}
          </p>
          {d.detalhe && (
            <p>
              <span className="text-suave">Relato: </span>
              {d.detalhe}
            </p>
          )}
          <p className="text-[13px] text-suave">Denunciado por {d.denunciante || "—"} (a pessoa denunciada não vê quem denunciou).</p>
        </section>
      )}
    </TelaUniversal>
  );
}

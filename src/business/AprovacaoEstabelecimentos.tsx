import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Ban, Check, RefreshCw, X } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { NOME_SITUACAO, Situacao } from "@/lib/acessos";

interface Linha {
  id: string;
  nome: string;
  bairro: string | null;
  endereco: string | null;
  telefone: string | null;
  situacao: Situacao;
  motivo_situacao: string | null;
  criado_em: string;
  criado_por: string;
  categoria: { nome: string } | null;
}

const FILTROS: { valor: Situacao | "todas"; nome: string }[] = [
  { valor: "pendente", nome: "Pendentes" },
  { valor: "aprovado", nome: "Aprovados" },
  { valor: "recusado", nome: "Recusados" },
  { valor: "suspenso", nome: "Suspensos" },
  { valor: "todas", nome: "Todas" },
];

const COR: Record<Situacao, string> = {
  pendente: "text-alerta",
  aprovado: "text-ok",
  recusado: "text-perigo",
  suspenso: "text-perigo",
};

export function AprovacaoEstabelecimentos() {
  const [filtro, setFiltro] = useState<Situacao | "todas">("pendente");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [responsaveis, setResponsaveis] = useState<Record<string, string>>({});
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [decisao, setDecisao] = useState<"recusado" | "suspenso" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    let consulta = supabase
      .from("estabelecimentos")
      .select("id, nome, bairro, endereco, telefone, situacao, motivo_situacao, criado_em, criado_por, categoria:categorias(nome)")
      .order("criado_em", { ascending: false })
      .limit(200);
    if (filtro !== "todas") consulta = consulta.eq("situacao", filtro);
    const { data, error } = await consulta;
    if (error) setErro(mensagemDeErro(error));
    const lista = (data ?? []) as unknown as Linha[];
    setLinhas(lista);
    const ids = [...new Set(lista.map((l) => l.criado_por))];
    if (ids.length) {
      const { data: p } = await supabase.from("perfis").select("id, nome").in("id", ids);
      setResponsaveis(Object.fromEntries((p ?? []).map((x) => [x.id as string, x.nome as string])));
    }
    setSelecionada(null);
    setCarregando(false);
  }, [filtro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const linha = linhas.find((l) => l.id === selecionada) ?? null;

  const decidir = async (situacao: "aprovado" | "recusado" | "suspenso") => {
    if (!linha) return;
    setErro("");
    const { error } = await supabase.rpc("decidir_estabelecimento", {
      p_estab: linha.id,
      p_situacao: situacao,
      p_motivo: situacao === "aprovado" ? null : motivo,
    });
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    setDecisao(null);
    setMotivo("");
    await carregar();
  };

  return (
    <TelaUniversal
      acoes={
        <>
          <button
            className="botao-principal col-span-2 sm:col-span-1"
            disabled={!linha || linha.situacao === "aprovado"}
            onClick={() => decidir("aprovado")}
          >
            <Check className="h-4 w-4" />
            Aprovar
          </button>
          <button className="botao" disabled={!linha || linha.situacao === "recusado"} onClick={() => setDecisao("recusado")}>
            <X className="h-4 w-4" />
            Recusar
          </button>
          <button className="botao" disabled={!linha || linha.situacao !== "aprovado"} onClick={() => setDecisao("suspenso")}>
            <Ban className="h-4 w-4" />
            Suspender
          </button>
          <hr className="col-span-full my-1 border-borda" />
          <button className="botao" onClick={() => void carregar()}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </>
      }
    >
      <section className="cartao flex flex-wrap gap-2 p-3" role="tablist" aria-label="Situação">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            role="tab"
            aria-selected={filtro === f.valor}
            onClick={() => setFiltro(f.valor)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-sm",
              filtro === f.valor ? "bg-destaque-suave font-semibold text-destaque" : "text-suave hover:bg-elevado hover:text-texto",
            )}
          >
            {f.nome}
          </button>
        ))}
      </section>

      {erro && (
        <p role="alert" className="cartao border-perigo/40 px-4 py-3 text-sm text-perigo">
          {erro}
        </p>
      )}

      {decisao && linha && (
        <section className="cartao space-y-3 p-4">
          <h2 className="font-semibold">
            {decisao === "recusado" ? "Recusar" : "Suspender"} {linha.nome}
          </h2>
          <label className="block">
            <span className="rotulo mb-1 block">Motivo (o estabelecimento vê este texto)</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm focus:border-marca focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            <button className="botao-principal" disabled={!motivo.trim()} onClick={() => decidir(decisao)}>
              Confirmar
            </button>
            <button
              className="botao"
              onClick={() => {
                setDecisao(null);
                setMotivo("");
              }}
            >
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
                {["Estabelecimento", "Categoria", "Bairro", "Responsável", "Enviado em", "Situação"].map((c) => (
                  <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setSelecionada(l.id)}
                  aria-selected={selecionada === l.id}
                  className={clsx(
                    "cursor-pointer border-b border-borda last:border-0",
                    selecionada === l.id ? "bg-destaque-suave" : "hover:bg-elevado",
                  )}
                >
                  <td className="px-4 py-3 font-medium">{l.nome}</td>
                  <td className="px-4 py-3">{l.categoria?.nome ?? "—"}</td>
                  <td className="px-4 py-3">{l.bairro ?? "—"}</td>
                  <td className="px-4 py-3">{responsaveis[l.criado_por] ?? "—"}</td>
                  <td className="codigo whitespace-nowrap px-4 py-3 text-[13px]">
                    {new Date(l.criado_em).toLocaleDateString("pt-BR")}
                  </td>
                  <td className={clsx("whitespace-nowrap px-4 py-3 font-medium", COR[l.situacao])}>{NOME_SITUACAO[l.situacao]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!carregando && linhas.length === 0 && <p className="px-6 py-12 text-center text-sm text-suave">Nenhum estabelecimento nesta situação.</p>}
      </section>

      {linha && (linha.endereco || linha.telefone) && (
        <section className="cartao p-4 text-sm">
          <p>
            <span className="text-suave">Endereço: </span>
            {linha.endereco ?? "—"}
          </p>
          <p>
            <span className="text-suave">Telefone: </span>
            {linha.telefone ?? "—"}
          </p>
        </section>
      )}
    </TelaUniversal>
  );
}

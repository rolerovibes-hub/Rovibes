import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Activity, CalendarDays, ChevronRight, CloudSun, Info, Music, Users, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { MedidorMovimento, Movimento } from "@/components/Marca";
import { Agora, Amigos, buscarClima, Clima, confirmarMovimento, haQuanto, NOME_FONTE } from "@/lib/agora";
import { mensagemDeErro } from "@/lib/supabase";
import { NOME_MOVIMENTO } from "./presenca";

const NIVEIS: Movimento[] = ["tranquilo", "moderado", "cheio"];
const LARGURA: Record<Movimento, string> = { tranquilo: "w-1/3", moderado: "w-2/3", cheio: "w-full" };
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }).replace(":00", "h").replace(":", "h");

/** "Ana, Lucas e mais 3 amigos estão aqui" — só quem a pessoa permitiu; os demais aparecem só como número. */
export function AmigosAqui({ amigos, compacto = false }: { amigos: Amigos | null | undefined; compacto?: boolean }) {
  if (!amigos || (amigos.identificados === 0 && amigos.anonimos === 0)) return null;
  const nomes = amigos.pessoas.slice(0, 2).map((p) => p.nome);
  const resto = amigos.identificados - nomes.length;
  let texto = "";
  if (nomes.length) {
    texto = resto > 0 ? `${nomes.join(", ")} e mais ${resto} ${resto === 1 ? "amigo" : "amigos"}` : nomes.join(" e ");
    texto += amigos.identificados === 1 ? " está aqui agora" : " estão aqui agora";
    if (amigos.anonimos > 0) texto += ` · +${amigos.anonimos} que você segue`;
  } else {
    texto = `${amigos.anonimos} ${amigos.anonimos === 1 ? "pessoa que você segue está" : "pessoas que você segue estão"} aqui agora`;
  }
  return (
    <div className={clsx("flex items-center gap-2", compacto ? "text-[12px]" : "text-[13px]")}>
      {amigos.pessoas.length > 0 ? (
        <span className="flex -space-x-2">
          {amigos.pessoas.slice(0, 3).map((p) => (
            <span key={p.id} className="rounded-full ring-2 ring-fundo">
              <Avatar nome={p.nome} foto={p.foto_url} tamanho="sm" />
            </span>
          ))}
        </span>
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-elevado text-suave">
          <Users className="h-4 w-4" />
        </span>
      )}
      <span className="text-suave">{texto}</span>
    </div>
  );
}

/** Uma linha de resumo: "Moderado · atualizado há 8 min" ou "sem atualização recente". */
export function ResumoMovimento({ agora }: { agora: Agora }) {
  const m = agora.movimento;
  if (!m?.nivel) return <span className="text-suave">Movimento sem atualização recente</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <MedidorMovimento nivel={m.nivel} rotulo={false} />
      <span className="font-medium">{NOME_MOVIMENTO[m.nivel]}</span>
      <span className="text-suave">· {haQuanto(m.em)}</span>
    </span>
  );
}

/** Cartão no perfil do lugar que abre a folha "Como está agora". */
export function CartaoComoEsta({ agora, abrir }: { agora: Agora | null | undefined; abrir: () => void }) {
  const musica = agora?.musica_agora?.texto ?? (agora?.musica_prevista.length ? agora.musica_prevista.slice(0, 2).join(" e ") : null);
  return (
    <button onClick={abrir} className="cartao flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevado">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destaque-suave text-destaque">
        <Activity className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Como está agora</span>
        <span className="block truncate text-[13px]">
          {agora === undefined ? (
            <span className="text-suave">Carregando...</span>
          ) : agora === null ? (
            <span className="text-suave">Movimento, música e atualidade</span>
          ) : (
            <>
              <ResumoMovimento agora={agora} />
              {musica && <span className="text-suave"> · {musica}</span>}
            </>
          )}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-suave" />
    </button>
  );
}

/**
 * Folha "Como está agora": movimento, música, clima e destaques de hoje.
 * Cada dado mostra de onde veio e quando; se estiver velho, diz que está sem atualização.
 */
export function FolhaComoEsta({
  nome,
  estab,
  agora,
  ponto,
  presente,
  fechar,
  verProgramacao,
  aoMudar,
}: {
  nome: string;
  estab: string;
  agora: Agora | null | undefined;
  ponto: [number, number] | null;
  presente: boolean;
  fechar: () => void;
  verProgramacao: () => void;
  aoMudar: () => void;
}) {
  const [clima, setClima] = useState<Clima | null>(null);
  const [enviado, setEnviado] = useState<string>("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    const [lat, lng] = ponto ?? [-18.9186, -48.2772]; // centro de Uberlândia
    buscarClima(lat, lng).then(setClima);
  }, [ponto]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [fechar]);

  const m = agora?.movimento;
  const ultimaAtualizacao = [m?.em, agora?.musica_agora?.em].filter(Boolean).sort().pop();

  const informar = async (n: Movimento) => {
    setErro("");
    try {
      await confirmarMovimento(estab, n);
      setEnviado(n);
      aoMudar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={`Como está agora em ${nome}`} onClick={fechar}>
      <div className="folha max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-fundo pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-destaque-suave text-destaque">
            <Activity className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-tight">Como está agora</h2>
            <p className="text-[13px] text-suave">{ultimaAtualizacao ? `Última atualização ${haQuanto(ultimaAtualizacao)}` : nome}</p>
          </div>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {agora === null ? (
          <p className="px-5 pb-6 text-sm text-suave">Estas informações aparecem depois que a atualização 031 do banco for aplicada.</p>
        ) : !agora ? (
          <p className="px-5 pb-6 text-sm text-suave">Carregando...</p>
        ) : (
          <div className="space-y-3 px-4">
            {/* Movimento */}
            <section className="cartao px-4 py-3.5">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 shrink-0 text-suave" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-suave">Movimento</p>
                  <p className="font-semibold">{m?.nivel ? NOME_MOVIMENTO[m.nivel] : "Sem atualização recente"}</p>
                </div>
              </div>
              {m?.nivel ? (
                <>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-elevado">
                    <div className={clsx("h-full rounded-full bg-marca", LARGURA[m.nivel])} />
                  </div>
                  <p className="mt-2 text-[12px] text-suave">
                    Informado {m.fonte ? NOME_FONTE[m.fonte] : ""} {haQuanto(m.em)}
                    {m.fonte === "comunidade" && m.respostas ? ` · ${m.respostas} ${m.respostas === 1 ? "resposta" : "respostas"}` : ""}
                    {m.confianca === "baixa" && " · pouca informação, pode ter mudado"}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[12px] text-suave">
                  {m?.ultimo_em ? `A última informação é de ${haQuanto(m.ultimo_em)}; pode não valer mais.` : "Ninguém informou o movimento por enquanto."}
                </p>
              )}
              {presente && (
                <div className="mt-3 border-t border-borda pt-3">
                  <p className="mb-2 text-[13px] font-medium">{enviado ? "Obrigado! Isso ajuda quem está decidindo." : "Você está aqui. Como está o movimento?"}</p>
                  {!enviado && (
                    <div className="grid grid-cols-3 gap-2">
                      {NIVEIS.map((n) => (
                        <button key={n} onClick={() => void informar(n)} className="botao flex-col gap-1 py-2 text-[13px]">
                          <MedidorMovimento nivel={n} rotulo={false} />
                          {NOME_MOVIMENTO[n]}
                        </button>
                      ))}
                    </div>
                  )}
                  {erro && <p className="mt-2 text-[13px] text-perigo">{erro}</p>}
                </div>
              )}
            </section>

            {/* Música e clima */}
            <section className="cartao divide-y divide-borda">
              <div className="flex items-start gap-3 px-4 py-3.5">
                <Music className="mt-0.5 h-5 w-5 shrink-0 text-suave" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-suave">Música</p>
                  {agora.musica_agora ? (
                    <>
                      <p className="font-medium">
                        <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-perigo align-middle" />
                        Tocando agora: {agora.musica_agora.texto}
                      </p>
                      <p className="text-[12px] text-suave">Informado pela equipe {haQuanto(agora.musica_agora.em)}</p>
                    </>
                  ) : agora.musica_prevista.length ? (
                    <>
                      <p className="font-medium">{agora.musica_prevista.join(" / ")}</p>
                      <p className="text-[12px] text-suave">
                        {agora.prevista_de === "programacao" ? "Previsto na programação de hoje" : "Estilos da casa"} · não confirma o som deste momento
                      </p>
                    </>
                  ) : (
                    <p className="text-suave">Sem informação de música para hoje</p>
                  )}
                </div>
              </div>
              {clima && (
                <div className="flex items-start gap-3 px-4 py-3.5">
                  <CloudSun className="mt-0.5 h-5 w-5 shrink-0 text-suave" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-suave">Clima</p>
                    <p className="font-medium">
                      {clima.texto} · {clima.temperatura}°C
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* Destaques de hoje */}
            {agora.hoje.length > 0 && (
              <section>
                <h3 className="mb-2 mt-1 px-1 font-semibold">Destaques de hoje</h3>
                <ul className="space-y-2">
                  {agora.hoje.map((e) => (
                    <li key={e.id}>
                      <Link to={`/evento/${e.id}`} onClick={fechar} className="cartao flex items-center gap-3 p-2.5 hover:bg-elevado">
                        {e.capa_url ? (
                          <img src={e.capa_url} alt="" className="h-16 w-20 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-16 w-20 shrink-0 items-center justify-center rounded-lg bg-elevado text-suave">
                            <CalendarDays className="h-5 w-5" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{e.nome}</span>
                          <span className="block truncate text-[13px] text-suave">
                            A partir das {hora(e.inicio)}
                            {e.estilos.length ? ` · ${e.estilos.join(", ")}` : ""}
                            {e.entrada ? ` · ${e.entrada}` : ""}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-suave" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <button
              onClick={() => {
                fechar();
                verProgramacao();
              }}
              className="botao h-11 w-full rounded-full"
            >
              Ver programação completa
            </button>
            <p className="flex items-start gap-1.5 px-1 text-[12px] text-suave">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              O movimento vem da equipe do lugar e de quem fez check-in. Não é contagem exata de pessoas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { IconePapo } from "@/components/IconesRoVibes";
import { useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, Check, Plus, Store, Users, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Carregando } from "@/components/Carregando";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { abrirConversaEstab, enviarMensagem } from "@/lib/chat";
import { listaConexoes, PessoaResumo } from "@/lib/pessoas";
import { abertoAgora } from "@/lib/horarios";
import { posicaoSeLiberada } from "@/lib/agora";
import { distanciaKm, km } from "./dados";
import { LugarNaoEncontrado, useLugar } from "./LugarPagina";
import { EscolherPessoas } from "./NovoRole";
import { useExigirLogin } from "./presenca";
import { registrarSinal } from "@/lib/sinais";

type Dia = "hoje" | "amanha" | "outro";
type Faixa = "agora" | "noite" | "personalizado";

const dataLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function calcularQuando(dia: Dia, outroDia: string, faixa: Faixa, horario: string): Date | null {
  const base = new Date();
  if (dia === "amanha") base.setDate(base.getDate() + 1);
  if (dia === "outro") {
    if (!outroDia) return null;
    const [a, m, d] = outroDia.split("-").map(Number);
    base.setFullYear(a, m - 1, d);
  }
  if (faixa === "agora") return dia === "hoje" ? new Date() : null;
  const [h, min] = (faixa === "noite" ? "20:00" : horario || "").split(":").map(Number);
  if (Number.isNaN(h)) return null;
  base.setHours(h, min || 0, 0, 0);
  return base;
}

const textoQuando = (d: Date) => {
  const hoje = new Date();
  const amanha = new Date(Date.now() + 86400000);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === hoje.toDateString()) return `hoje às ${hora}`;
  if (d.toDateString() === amanha.toDateString()) return `amanhã às ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })} às ${hora}`;
};

/** Marcar rolê: lugar, com quem, quando e extras (reserva de mesa e primeira mensagem). Cria o grupo com o plano dentro. */
export function MarcarRole() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const dados = useLugar(id);
  const { sessao } = useSessao();
  const eu = sessao?.user.id ?? "";
  const exigirLogin = useExigirLogin();
  const [amigos, setAmigos] = useState<PessoaResumo[] | null>(null);
  const [marcados, setMarcados] = useState<Map<string, PessoaResumo>>(new Map());
  const [escolhendo, setEscolhendo] = useState(false);
  const [dia, setDia] = useState<Dia>("hoje");
  const [outroDia, setOutroDia] = useState("");
  const [faixa, setFaixa] = useState<Faixa>("agora");
  const [horario, setHorario] = useState("21:00");
  const [reserva, setReserva] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [comentar, setComentar] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!sessao) exigirLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao]);

  // Sugestões: amigos (nos seguimos) primeiro, depois quem eu sigo.
  useEffect(() => {
    if (!eu) return;
    Promise.all([listaConexoes(eu, "seguindo").catch(() => []), listaConexoes(eu, "seguidores").catch(() => [])]).then(([seguindo, seguidores]) => {
      const voltam = new Set(seguidores.filter((p) => p.situacao !== "pendente").map((p) => p.id));
      setAmigos([...seguindo].sort((a, b) => Number(voltam.has(b.id)) - Number(voltam.has(a.id)) || a.nome.localeCompare(b.nome)).slice(0, 12));
    });
    posicaoSeLiberada().then(setPos);
  }, [eu]);

  useEffect(() => {
    if (dia !== "hoje" && faixa === "agora") setFaixa("noite");
  }, [dia, faixa]);

  const quando = useMemo(() => calcularQuando(dia, outroDia, faixa, horario), [dia, outroDia, faixa, horario]);

  if (!dados) return <Carregando />;
  const { lugar } = dados;
  if (!lugar) return <LugarNaoEncontrado />;

  const ponto: [number, number] | null = lugar.latitude != null && lugar.longitude != null ? [lugar.latitude, lugar.longitude] : null;
  const distancia = pos && ponto ? km(distanciaKm(pos, ponto)) : null;
  const aberto = lugar.horarios.length ? abertoAgora(lugar.horarios) : null;
  const sugestoes = (amigos ?? []).filter((a) => !marcados.has(a.id));
  const escolhidos = [...marcados.values()];

  const alternar = (p: PessoaResumo) =>
    setMarcados((m) => {
      const n = new Map(m);
      if (n.has(p.id)) n.delete(p.id);
      else n.set(p.id, p);
      return n;
    });

  const criar = async () => {
    setErro("");
    if (!quando) return setErro(dia === "outro" && !outroDia ? "Escolha o dia." : "Escolha o horário.");
    if (quando.getTime() < Date.now() - 15 * 60000) return setErro("Esse horário já passou.");
    setSalvando(true);
    try {
      const nome = titulo.trim() || `Rolê no ${lugar.nome}`;
      const { data, error } = await supabase.rpc("criar_role", {
        p_titulo: nome,
        p_local: lugar.id,
        p_quando: quando.toISOString(),
        p_pessoas: escolhidos.map((p) => p.id),
      });
      if (error) throw error;
      const conversa = data as string;
      registrarSinal(lugar.id, "role");
      if (comentar && mensagem.trim()) await enviarMensagem(conversa, mensagem.trim()).catch(() => undefined);
      if (reserva) {
        const c = await abrirConversaEstab(lugar.id);
        const pessoas = escolhidos.length + 1;
        await enviarMensagem(c, `Olá! Gostaria de reservar uma mesa para ${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"} ${textoQuando(quando)}. É possível?`, null, lugar.id);
      }
      navegar(`/chat/${conversa}`, { replace: true });
    } catch (e) {
      setErro(mensagemDeErro(e));
      setSalvando(false);
    }
  };

  const chip = (ativo: boolean) =>
    clsx("h-10 rounded-full border px-4 text-sm font-medium transition-colors", ativo ? "border-marca bg-destaque-suave text-destaque" : "border-borda bg-superficie hover:bg-elevado");

  return (
    <div className="mx-auto max-w-xl pb-28">
      <header className="sticky top-14 z-20 flex items-center gap-2 border-b border-borda bg-fundo/95 px-2 py-2 backdrop-blur">
        <button onClick={() => navegar(-1)} className="rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-semibold">Marcar rolê</h1>
        <span className="w-9" />
      </header>

      <div className="space-y-6 px-4 pt-4">
        {/* Lugar */}
        <div className="relative overflow-hidden rounded-2xl">
          {lugar.capa_url ? (
            <img src={lugar.capa_url} alt="" className="h-32 w-full object-cover" />
          ) : (
            <div className="flex h-32 w-full items-center justify-center bg-elevado text-suave">
              <Store className="h-7 w-7" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
          <div className="absolute inset-y-0 left-0 flex flex-col justify-center px-4 text-white">
            <p className="text-lg font-semibold">{lugar.nome}</p>
            <p className="text-[13px] opacity-90">
              {[distancia, aberto === null ? null : aberto ? "Aberto agora" : "Fechado agora"].filter(Boolean).join(" · ") || lugar.bairro}
            </p>
          </div>
        </div>

        {/* Com quem */}
        <section>
          <h2 className="mb-2 font-semibold">Com quem você vai?</h2>
          <div className="flex items-start gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {escolhidos.map((p) => (
              <button key={p.id} onClick={() => alternar(p)} className="flex w-14 shrink-0 flex-col items-center gap-1" aria-pressed="true" aria-label={`Tirar ${p.nome}`}>
                <span className="relative rounded-full ring-2 ring-marca ring-offset-2 ring-offset-fundo">
                  <Avatar nome={p.nome} foto={p.foto_url} />
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-marca text-marca-texto">
                    <Check className="h-3 w-3" />
                  </span>
                </span>
                <span className="w-full truncate text-center text-[11px]">{p.nome.split(" ")[0]}</span>
              </button>
            ))}
            {sugestoes.map((p) => (
              <button key={p.id} onClick={() => alternar(p)} className="flex w-14 shrink-0 flex-col items-center gap-1 opacity-80 hover:opacity-100" aria-pressed="false" aria-label={`Chamar ${p.nome}`}>
                <Avatar nome={p.nome} foto={p.foto_url} />
                <span className="w-full truncate text-center text-[11px] text-suave">{p.nome.split(" ")[0]}</span>
              </button>
            ))}
            <button onClick={() => setEscolhendo(true)} className="flex w-14 shrink-0 flex-col items-center gap-1" aria-label="Selecionar amigos">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-borda text-suave">
                <Plus className="h-5 w-5" />
              </span>
              <span className="text-[11px] text-suave">Buscar</span>
            </button>
          </div>
          {amigos?.length === 0 && <p className="mt-1 text-[13px] text-suave">Siga pessoas para chamá-las rápido, ou toque em Buscar.</p>}
          {escolhidos.length === 0 && amigos && amigos.length > 0 && <p className="mt-1 text-[13px] text-suave">Toque para chamar. Dá para ir sozinho e chamar depois.</p>}
        </section>

        {/* Quando */}
        <section>
          <h2 className="mb-2 font-semibold">Quando?</h2>
          <div className="flex flex-wrap gap-2">
            <button className={chip(dia === "hoje")} onClick={() => setDia("hoje")}>Hoje</button>
            <button className={chip(dia === "amanha")} onClick={() => setDia("amanha")}>Amanhã</button>
            <button className={chip(dia === "outro")} onClick={() => setDia("outro")}>Outro dia</button>
          </div>
          {dia === "outro" && (
            <input type="date" className="entrada mt-2 max-w-[220px]" min={dataLocal(new Date())} value={outroDia} onChange={(e) => setOutroDia(e.target.value)} aria-label="Dia do rolê" />
          )}
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Horário</h2>
          <div className="flex flex-wrap gap-2">
            {dia === "hoje" && <button className={chip(faixa === "agora")} onClick={() => setFaixa("agora")}>Agora</button>}
            <button className={chip(faixa === "noite")} onClick={() => setFaixa("noite")}>Depois das 20h</button>
            <button className={chip(faixa === "personalizado")} onClick={() => setFaixa("personalizado")}>Personalizado</button>
          </div>
          {faixa === "personalizado" && <input type="time" className="entrada mt-2 max-w-[160px]" value={horario} onChange={(e) => setHorario(e.target.value)} aria-label="Horário" />}
          {quando && <p className="mt-2 text-[13px] text-suave">O rolê fica marcado para {textoQuando(quando)}.</p>}
        </section>

        {/* Extras */}
        <section>
          <h2 className="mb-2 font-semibold">Deseja adicionar algo?</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setReserva(!reserva)}
              aria-pressed={reserva}
              className={clsx("flex items-start gap-2.5 rounded-xl border p-3 text-left", reserva ? "border-marca bg-destaque-suave" : "border-borda bg-superficie hover:bg-elevado")}
            >
              <Users className={clsx("mt-0.5 h-5 w-5 shrink-0", reserva ? "text-destaque" : "text-suave")} />
              <span>
                <span className="block text-sm font-semibold">Pedir reserva de mesa</span>
                <span className="block text-[12px] text-suave">Mandamos o pedido para o {lugar.nome}</span>
              </span>
            </button>
            <button
              onClick={() => setComentar(!comentar)}
              aria-pressed={comentar}
              className={clsx("flex items-start gap-2.5 rounded-xl border p-3 text-left", comentar ? "border-marca bg-destaque-suave" : "border-borda bg-superficie hover:bg-elevado")}
            >
              <IconePapo className={clsx("mt-0.5 h-5 w-5 shrink-0", comentar ? "text-destaque" : "text-suave")} />
              <span>
                <span className="block text-sm font-semibold">Comentar no chat</span>
                <span className="block text-[12px] text-suave">Uma mensagem para a galera</span>
              </span>
            </button>
          </div>
          {comentar && (
            <textarea
              className="entrada mt-2 min-h-[72px] py-2"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value.slice(0, 500))}
              placeholder="Ex.: bora? chego umas 21h"
              aria-label="Mensagem para o grupo"
            />
          )}
          <label className="mt-3 block">
            <span className="rotulo mb-1 block">Nome do rolê (opcional)</span>
            <input className="entrada" value={titulo} onChange={(e) => setTitulo(e.target.value.slice(0, 60))} placeholder={`Rolê no ${lugar.nome}`} />
          </label>
        </section>

        {erro && <p className="text-sm text-perigo">{erro}</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-borda bg-fundo/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <button onClick={() => void criar()} disabled={salvando} className="botao-principal mx-auto flex h-12 w-full max-w-xl rounded-full text-[15px]">
          {salvando ? "Criando..." : escolhidos.length ? `Criar rolê com ${escolhidos.length} ${escolhidos.length === 1 ? "pessoa" : "pessoas"}` : "Criar rolê"}
        </button>
      </div>

      {escolhendo && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Selecionar amigos" onClick={() => setEscolhendo(false)}>
          <div className="folha w-full max-w-md rounded-t-2xl bg-superficie p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Selecionar amigos</h2>
              <button onClick={() => setEscolhendo(false)} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <EscolherPessoas
              jaNoRole={[...marcados.keys()]}
              textoBotao="Adicionar"
              cancelar={() => setEscolhendo(false)}
              confirmar={async (_ids, pessoas) => {
                setMarcados((m) => {
                  const n = new Map(m);
                  for (const p of pessoas) n.set(p.id, p);
                  return n;
                });
                setEscolhendo(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Camera, ImagePlus, LocateFixed, RotateCcw, Save, Star, Trash2 } from "lucide-react";
import { VerNoApp } from "./VerNoApp";
import { LugarDasAcoes, TelaUniversal } from "./TelaUniversal";
import { ChipsGostos } from "./GostosDaCasa";
import { Aviso } from "@/components/Formulario";
import { CampoSecao, camposVazios, InfoSecao, SecaoFormulario, SubtituloSecao, TrilhaSecoes, vazioObrigatorio } from "@/components/FormularioSecoes";
import { NOME_TIPO_GOSTO, ORDEM_TIPOS, useGostos } from "@/lib/gostos";
import { MapaBase, PinMapa, Recentralizar, UBERLANDIA } from "@/components/MapaBase";
import { Carregando } from "@/components/Carregando";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { apagarFoto, caminhoDaUrl, enviarFoto } from "@/lib/imagens";
import { DIAS, hhmm } from "@/lib/horarios";
import { useBusiness } from "@/lib/acessos";

interface Dados {
  nome: string;
  categoria_id: number | null;
  descricao: string;
  telefone: string;
  whatsapp: string;
  instagram: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  latitude: number | null;
  longitude: number | null;
  capa_url: string | null;
  logo_url: string | null;
}

interface DiaHorario {
  aberto: boolean;
  abre: string;
  fecha: string;
}

interface Foto {
  id: string;
  url: string;
  caminho: string;
}

const MAX_VIBES = 4;
const HORARIO_PADRAO: DiaHorario = { aberto: false, abre: "18:00", fecha: "00:00" };

// Campos novos (atualização 055). Sem ela, a tela segue funcionando com os campos antigos.
const COLUNAS_NOVAS = ["whatsapp", "cep", "logradouro", "numero", "complemento"] as const;

/** "Rua das Paineiras 285" → rua e número, para endereços cadastrados antes dos campos separados. */
function separarEndereco(endereco: string) {
  const m = endereco.trim().match(/^(.*?)[,\s]+(?:n[ºo°.]?\s*)?(\d+[a-zA-Z]?)\s*$/);
  return m ? { logradouro: m[1].trim(), numero: m[2] } : { logradouro: endereco.trim(), numero: "" };
}

const mascaraCep = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

interface Estado {
  dados: Dados;
  vibes: number[];
  gostos: number[];
  horarios: DiaHorario[];
}

const d0 = (x: unknown) => x as Record<string, unknown>;
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const CAMPOS: Record<string, (keyof Dados)[]> = {
  identidade: ["nome", "categoria_id", "descricao"],
  contato: ["telefone", "whatsapp", "instagram"],
  localizacao: ["cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "latitude", "longitude"],
};

export function PerfilEstabelecimento() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const noComputador = !!useContext(LugarDasAcoes);
  const todosGostos = useGostos();
  const [dados, setDados] = useState<Dados | null>(null);
  const [inicial, setInicial] = useState<Estado | null>(null);
  const [categorias, setCategorias] = useState<{ id: number; nome: string }[]>([]);
  const [vibes, setVibes] = useState<{ id: number; nome: string }[]>([]);
  const [minhasVibes, setMinhasVibes] = useState<number[]>([]);
  const [gostos, setGostos] = useState<number[]>([]);
  const [horarios, setHorarios] = useState<DiaHorario[]>(DIAS.map(() => ({ ...HORARIO_PADRAO })));
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [semColunasNovas, setSemColunasNovas] = useState(false);
  const [enderecoOriginal, setEnderecoOriginal] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [centro, setCentro] = useState<[number, number] | null>(null);
  const seletorFoto = useRef<HTMLInputElement>(null);
  const seletorLogo = useRef<HTMLInputElement>(null);
  const seletorCapa = useRef<HTMLInputElement>(null);
  const campoNumero = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    const base = "nome, categoria_id, descricao, telefone, instagram, endereco, bairro, cidade, uf, latitude, longitude, capa_url, logo_url";
    let e = await supabase.from("estabelecimentos").select(`${base}, ${COLUNAS_NOVAS.join(", ")}`).eq("id", id).single();
    let antigas = false;
    if (e.error && /column|coluna/i.test(e.error.message)) {
      e = await supabase.from("estabelecimentos").select(base).eq("id", id).single();
      antigas = true;
    }
    const [c, v, mv, h, f, g] = await Promise.all([
      supabase.from("categorias").select("id, nome").eq("ativa", true).order("nome"),
      supabase.from("vibes").select("id, nome").eq("ativa", true).order("nome"),
      supabase.from("estabelecimento_vibes").select("vibe_id").eq("estabelecimento_id", id),
      supabase.from("horarios").select("dia_semana, abre, fecha").eq("estabelecimento_id", id),
      supabase.from("fotos").select("id, url, caminho").eq("estabelecimento_id", id).order("ordem"),
      supabase.from("estabelecimento_gostos").select("gosto_id").eq("estabelecimento_id", id),
    ]);
    if (e.error) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e.error) });
      return;
    }
    setSemColunasNovas(antigas);
    setEnderecoOriginal((d0(e.data).endereco as string | null) ?? "");
    const d = e.data as unknown as Record<string, unknown>;
    const txt = (k: string) => ((d[k] as string | null) ?? "").toString();
    const separado = txt("logradouro") ? { logradouro: txt("logradouro"), numero: txt("numero") } : separarEndereco(txt("endereco"));
    const novos: Dados = {
      nome: txt("nome"),
      categoria_id: (d.categoria_id as number) ?? null,
      descricao: txt("descricao"),
      telefone: txt("telefone"),
      whatsapp: txt("whatsapp"),
      instagram: txt("instagram"),
      cep: mascaraCep(txt("cep")),
      logradouro: separado.logradouro,
      numero: separado.numero,
      complemento: txt("complemento"),
      bairro: txt("bairro"),
      cidade: txt("cidade") || "Uberlândia",
      uf: txt("uf") || "MG",
      latitude: (d.latitude as number) ?? null,
      longitude: (d.longitude as number) ?? null,
      capa_url: (d.capa_url as string) ?? null,
      logo_url: (d.logo_url as string) ?? null,
    };
    const porDia = DIAS.map((_, i) => {
      const linha = (h.data ?? []).find((x) => x.dia_semana === i);
      return linha ? { aberto: true, abre: hhmm(linha.abre as string), fecha: hhmm(linha.fecha as string) } : { ...HORARIO_PADRAO };
    });
    const vs = (mv.data ?? []).map((x) => x.vibe_id as number);
    const gs = ((g.data ?? []) as { gosto_id: number }[]).map((x) => x.gosto_id);
    setDados(novos);
    setMinhasVibes(vs);
    setGostos(gs);
    setHorarios(porDia);
    setInicial({ dados: novos, vibes: vs, gostos: gs, horarios: porDia });
    setCategorias((c.data ?? []) as { id: number; nome: string }[]);
    setVibes((v.data ?? []) as { id: number; nome: string }[]);
    setFotos((f.data ?? []) as Foto[]);
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!atual) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento para editar o perfil.</p>;
  if (!dados || !inicial) return <Carregando />;

  const mudar = <K extends keyof Dados>(campo: K, valor: Dados[K]) => setDados((d) => (d ? { ...d, [campo]: valor } : d));
  const mudouCampos = (sec: string) => CAMPOS[sec].some((k) => !igual(dados[k], inicial.dados[k]));
  const pin: [number, number] | null = dados.latitude != null && dados.longitude != null ? [dados.latitude, dados.longitude] : null;
  const diasAbertos = horarios.filter((h) => h.aberto).length;

  const secoes: InfoSecao[] = [
    { id: "identidade", titulo: "Identidade", falta: camposVazios([["Nome", dados.nome], ["Categoria", dados.categoria_id]]), alterada: mudouCampos("identidade") },
    { id: "contato", titulo: "Contato", falta: camposVazios([["Telefone", dados.telefone]]), alterada: mudouCampos("contato") },
    {
      id: "localizacao",
      titulo: "Localização",
      falta: [
        ...camposVazios(
          semColunasNovas
            ? [["Rua", dados.logradouro], ["Bairro", dados.bairro]]
            : [["CEP", dados.cep], ["Rua", dados.logradouro], ["Número", dados.numero], ["Bairro", dados.bairro], ["Cidade", dados.cidade]],
        ),
        ...(pin ? [] : ["Local no mapa"]),
      ],
      alterada: mudouCampos("localizacao"),
    },
    {
      id: "funcionamento",
      titulo: "Funcionamento",
      falta: diasAbertos ? [] : ["Dias abertos"],
      resumo: `${diasAbertos} ${diasAbertos === 1 ? "dia" : "dias"}`,
      alterada: !igual(horarios, inicial.horarios),
    },
    {
      id: "vibe",
      titulo: "Vibe e estilo",
      falta: minhasVibes.length ? [] : ["Vibes"],
      resumo: `${minhasVibes.length} ${minhasVibes.length === 1 ? "vibe" : "vibes"} · ${gostos.length} ${gostos.length === 1 ? "gosto" : "gostos"}`,
      alterada: !igual([...minhasVibes].sort(), [...inicial.vibes].sort()) || !igual([...gostos].sort(), [...inicial.gostos].sort()),
    },
    { id: "fotos", titulo: "Fotos do lugar", resumo: `${fotos.length} ${fotos.length === 1 ? "foto" : "fotos"}` },
  ];
  const alteradas = secoes.filter((s) => s.alterada).length;
  const info = (sid: string) => secoes.find((s) => s.id === sid)!;
  const numero = (sid: string) => secoes.findIndex((s) => s.id === sid) + 1;

  const salvar = async () => {
    if (!id) return;
    setSalvando(true);
    setAviso(null);
    try {
      // O App continua lendo o endereço numa linha só: "Rua, número - complemento".
      const rua = [dados.logradouro.trim(), dados.numero.trim()].filter(Boolean).join(", ");
      // Sem mexer na rua, número ou complemento, o endereço do App fica exatamente como estava.
      const mexeuEndereco = (["logradouro", "numero", "complemento"] as const).some((k) => dados[k] !== inicial.dados[k]);
      const endereco = mexeuEndereco ? [rua, dados.complemento.trim()].filter(Boolean).join(" - ") : enderecoOriginal;
      const campos: Record<string, unknown> = {
        nome: dados.nome.trim(),
        categoria_id: dados.categoria_id,
        descricao: dados.descricao.trim() || null,
        telefone: dados.telefone.trim() || null,
        instagram: dados.instagram.trim().replace(/^@/, "") || null,
        endereco: endereco || null,
        bairro: dados.bairro.trim() || null,
        cidade: dados.cidade.trim() || "Uberlândia",
        uf: dados.uf.trim().toUpperCase() || "MG",
        latitude: dados.latitude,
        longitude: dados.longitude,
      };
      if (!semColunasNovas) {
        Object.assign(campos, {
          whatsapp: dados.whatsapp.trim() || null,
          cep: dados.cep.replace(/\D/g, "") || null,
          logradouro: dados.logradouro.trim() || null,
          numero: dados.numero.trim() || null,
          complemento: dados.complemento.trim() || null,
        });
      }
      const { error } = await supabase.from("estabelecimentos").update(campos).eq("id", id);
      if (error) throw error;

      if (!igual([...minhasVibes].sort(), [...inicial.vibes].sort())) {
        const r1 = await supabase.from("estabelecimento_vibes").delete().eq("estabelecimento_id", id);
        if (r1.error) throw r1.error;
        if (minhasVibes.length) {
          const r2 = await supabase.from("estabelecimento_vibes").insert(minhasVibes.map((vibe_id) => ({ estabelecimento_id: id, vibe_id })));
          if (r2.error) throw r2.error;
        }
      }

      if (todosGostos && !igual([...gostos].sort(), [...inicial.gostos].sort())) {
        const rg = await supabase.rpc("salvar_gostos_estab", { p_estab: id, p_ids: gostos });
        if (rg.error) throw rg.error;
      }

      if (!igual(horarios, inicial.horarios)) {
        const r3 = await supabase.from("horarios").delete().eq("estabelecimento_id", id);
        if (r3.error) throw r3.error;
        const abertos = horarios
          .map((h, dia_semana) => ({ ...h, dia_semana }))
          .filter((h) => h.aberto)
          .map((h) => ({ estabelecimento_id: id, dia_semana: h.dia_semana, abre: h.abre, fecha: h.fecha }));
        if (abertos.length) {
          const r4 = await supabase.from("horarios").insert(abertos);
          if (r4.error) throw r4.error;
        }
      }
      setInicial({ dados, vibes: minhasVibes, gostos, horarios });
      setEnderecoOriginal(endereco);
      setAviso({ tipo: "ok", texto: "Perfil salvo." });
    } catch (err) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(err) });
    } finally {
      setSalvando(false);
    }
  };

  const buscarCep = async (cep: string) => {
    const d = cep.replace(/\D/g, "");
    if (d.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = (await r.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (j.erro) {
        setAviso({ tipo: "erro", texto: "CEP não encontrado." });
        return;
      }
      setDados((x) =>
        x
          ? {
              ...x,
              logradouro: j.logradouro || x.logradouro,
              bairro: j.bairro || x.bairro,
              cidade: j.localidade || x.cidade,
              uf: j.uf || x.uf,
            }
          : x,
      );
      campoNumero.current?.focus();
    } catch {
      /* sem internet ou serviço fora: preenche à mão */
    } finally {
      setBuscandoCep(false);
    }
  };

  const localizar = async () => {
    const rua = [dados.logradouro, dados.numero].filter(Boolean).join(", ");
    const consulta = [rua, dados.bairro, dados.cidade || "Uberlândia", dados.uf || "MG", "Brasil"].filter(Boolean).join(", ");
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(consulta)}`);
      const lista = (await r.json()) as { lat: string; lon: string }[];
      if (!lista.length) {
        setAviso({ tipo: "erro", texto: "Endereço não encontrado no mapa. Toque no mapa para marcar o local." });
        return;
      }
      const lat = Number(lista[0].lat);
      const lng = Number(lista[0].lon);
      setDados((x) => (x ? { ...x, latitude: lat, longitude: lng } : x));
      setCentro([lat, lng]);
    } catch {
      setAviso({ tipo: "erro", texto: "Não foi possível consultar o mapa agora." });
    }
  };

  const definirCapa = async (url: string | null) => {
    if (!id) return;
    const { error } = await supabase.from("estabelecimentos").update({ capa_url: url }).eq("id", id);
    if (!error) setDados((x) => (x ? { ...x, capa_url: url } : x));
  };

  /** Envia fotos para a galeria; com `comoCapa`, a primeira vira a capa. */
  const adicionarFotos = async (arquivos: FileList | null, comoCapa = false) => {
    if (!arquivos?.length || !id) return;
    setEnviando(true);
    setAviso(null);
    let temCapa = !!dados.capa_url && !comoCapa;
    try {
      let ordem = fotos.length;
      for (const arquivo of Array.from(arquivos)) {
        const { url, caminho } = await enviarFoto(id, arquivo, "foto");
        const { data, error } = await supabase.from("fotos").insert({ estabelecimento_id: id, url, caminho, ordem: ordem++ }).select("id, url, caminho").single();
        if (error) throw error;
        setFotos((f) => [...f, data as Foto]);
        if (!temCapa) {
          await definirCapa(url);
          temCapa = true;
        }
      }
    } catch (err) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(err) });
    } finally {
      setEnviando(false);
      if (seletorFoto.current) seletorFoto.current.value = "";
      if (seletorCapa.current) seletorCapa.current.value = "";
    }
  };

  const trocarLogo = async (arquivos: FileList | null) => {
    const arquivo = arquivos?.[0];
    if (!arquivo || !id) return;
    setEnviando(true);
    setAviso(null);
    try {
      const anterior = caminhoDaUrl(dados.logo_url);
      const { url } = await enviarFoto(id, arquivo, "logo");
      const { error } = await supabase.from("estabelecimentos").update({ logo_url: url }).eq("id", id);
      if (error) throw error;
      if (anterior) await apagarFoto(anterior);
      setDados((x) => (x ? { ...x, logo_url: url } : x));
    } catch (err) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(err) });
    } finally {
      setEnviando(false);
      if (seletorLogo.current) seletorLogo.current.value = "";
    }
  };

  const removerFoto = async (foto: Foto) => {
    const { error } = await supabase.from("fotos").delete().eq("id", foto.id);
    if (error) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
      return;
    }
    await apagarFoto(foto.caminho);
    setFotos((f) => f.filter((x) => x.id !== foto.id));
    if (dados.capa_url === foto.url) await definirCapa(fotos.find((x) => x.id !== foto.id)?.url ?? null);
  };

  const chip = (marcado: boolean) =>
    clsx("rounded-full border px-3.5 py-1.5 text-sm transition-colors disabled:opacity-40", marcado ? "border-marca bg-marca font-medium text-marca-texto" : "border-borda hover:bg-elevado");

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={salvar} disabled={salvando}>
            <Save className="h-4 w-4" />
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          {alteradas > 0 && (
            <p className="col-span-2 flex items-center gap-1.5 px-1 text-[12px] font-medium text-alerta sm:col-span-1">
              <span className="h-1.5 w-1.5 rounded-full bg-alerta" />
              {alteradas} {alteradas === 1 ? "seção alterada" : "seções alteradas"}
            </p>
          )}
          <button className="botao" onClick={() => void carregar()} disabled={salvando}>
            <RotateCcw className="h-4 w-4" />
            Descartar
          </button>
          <hr className="col-span-full my-1 border-borda" />
          <VerNoApp caminho={id ? `/lugar/${id}` : null} />
        </>
      }
    >
      <TrilhaSecoes secoes={secoes} topo={noComputador ? "top-0" : "top-16"} />
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {atual.estabelecimento.situacao !== "aprovado" && (
        <Aviso tipo="erro">Este estabelecimento ainda não aparece no App: aguarda aprovação da administração.</Aviso>
      )}

      <SecaoFormulario info={info("identidade")} numero={numero("identidade")}>
        <CampoSecao>
          <div className="flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              onClick={() => seletorLogo.current?.click()}
              disabled={enviando}
              aria-label="Trocar a logo"
              className="group relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border border-dashed border-borda bg-fundo text-suave hover:bg-elevado"
            >
              {dados.logo_url ? <img src={dados.logo_url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-black/65 px-2 py-0.5 text-[11.5px] font-semibold text-white">Logo</span>
            </button>
            <button
              type="button"
              onClick={() => seletorCapa.current?.click()}
              disabled={enviando}
              aria-label="Trocar a capa"
              className="relative flex h-28 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-dashed border-borda bg-fundo text-suave hover:bg-elevado"
            >
              {dados.capa_url ? <img src={dados.capa_url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}
              <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/65 px-2 py-0.5 text-[11.5px] font-semibold text-white">
                <Camera className="h-3 w-3" />
                {enviando ? "Enviando…" : "Capa"}
              </span>
            </button>
          </div>
          <input ref={seletorLogo} type="file" accept="image/*" className="hidden" onChange={(e) => void trocarLogo(e.target.files)} />
          <input ref={seletorCapa} type="file" accept="image/*" className="hidden" onChange={(e) => void adicionarFotos(e.target.files, true)} />
        </CampoSecao>
        <CampoSecao rotulo="Nome" obrigatorio largura={8}>
          <input className={clsx("entrada", vazioObrigatorio(dados.nome))} value={dados.nome} onChange={(e) => mudar("nome", e.target.value)} />
        </CampoSecao>
        <CampoSecao rotulo="Categoria" obrigatorio largura={4}>
          <select
            className={clsx("entrada", dados.categoria_id == null && "border-alerta bg-alerta/5")}
            value={dados.categoria_id ?? ""}
            onChange={(e) => mudar("categoria_id", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Escolha</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </CampoSecao>
        <CampoSecao rotulo="Descrição">
          <textarea rows={3} maxLength={400} className="entrada" value={dados.descricao} onChange={(e) => mudar("descricao", e.target.value)} />
        </CampoSecao>
      </SecaoFormulario>

      <SecaoFormulario info={info("contato")} numero={numero("contato")}>
        <CampoSecao rotulo="Telefone" obrigatorio largura={4}>
          <input type="tel" className={clsx("entrada", vazioObrigatorio(dados.telefone))} value={dados.telefone} onChange={(e) => mudar("telefone", e.target.value)} />
        </CampoSecao>
        {!semColunasNovas && (
          <CampoSecao rotulo="WhatsApp" largura={4}>
            <input type="tel" className="entrada" value={dados.whatsapp} onChange={(e) => mudar("whatsapp", e.target.value)} />
          </CampoSecao>
        )}
        <CampoSecao rotulo="Instagram" largura={4}>
          <input className="entrada" placeholder="@seuperfil" value={dados.instagram} onChange={(e) => mudar("instagram", e.target.value)} />
        </CampoSecao>
      </SecaoFormulario>

      <SecaoFormulario info={info("localizacao")} numero={numero("localizacao")}>
        {!semColunasNovas && (
          <CampoSecao rotulo="CEP" obrigatorio largura={3}>
            <input
              inputMode="numeric"
              className={clsx("entrada", vazioObrigatorio(dados.cep))}
              placeholder="00000-000"
              value={dados.cep}
              onChange={(e) => {
                const v = mascaraCep(e.target.value);
                mudar("cep", v);
                if (v.replace(/\D/g, "").length === 8 && v !== dados.cep) void buscarCep(v);
              }}
            />
            {buscandoCep && <span className="mt-1 block text-[12px] text-suave">Buscando…</span>}
          </CampoSecao>
        )}
        <CampoSecao rotulo="Rua" obrigatorio largura={semColunasNovas ? 12 : 7}>
          <input className={clsx("entrada", vazioObrigatorio(dados.logradouro))} value={dados.logradouro} onChange={(e) => mudar("logradouro", e.target.value)} />
        </CampoSecao>
        {!semColunasNovas && (
          <>
            <CampoSecao rotulo="Número" obrigatorio largura={2}>
              <input ref={campoNumero} className={clsx("entrada", vazioObrigatorio(dados.numero))} value={dados.numero} onChange={(e) => mudar("numero", e.target.value)} />
            </CampoSecao>
            <CampoSecao rotulo="Complemento" largura={4}>
              <input className="entrada" placeholder="Sala, andar, referência" value={dados.complemento} onChange={(e) => mudar("complemento", e.target.value)} />
            </CampoSecao>
          </>
        )}
        <CampoSecao rotulo="Bairro" obrigatorio largura={4}>
          <input className={clsx("entrada", vazioObrigatorio(dados.bairro))} value={dados.bairro} onChange={(e) => mudar("bairro", e.target.value)} />
        </CampoSecao>
        <CampoSecao rotulo="Cidade" obrigatorio largura={3}>
          <input className={clsx("entrada", vazioObrigatorio(dados.cidade))} value={dados.cidade} onChange={(e) => mudar("cidade", e.target.value)} />
        </CampoSecao>
        <CampoSecao rotulo="UF" largura={1}>
          <input className="entrada uppercase" maxLength={2} value={dados.uf} onChange={(e) => mudar("uf", e.target.value.toUpperCase())} />
        </CampoSecao>
        <CampoSecao>
          <div className="mb-2 flex justify-end">
            <button type="button" className="botao h-9" onClick={localizar}>
              <LocateFixed className="h-4 w-4" />
              Localizar pelo endereço
            </button>
          </div>
          <div className={clsx("h-64 overflow-hidden rounded-xl border", pin ? "border-borda" : "border-alerta")}>
            <MapaBase
              centro={pin ?? UBERLANDIA}
              zoom={pin ? 16 : 13}
              className="h-full w-full"
              aoClicar={(lat, lng) => setDados((x) => (x ? { ...x, latitude: lat, longitude: lng } : x))}
            >
              <Recentralizar centro={centro} zoom={16} />
              {pin && <PinMapa posicao={pin} tamanho="grande" />}
            </MapaBase>
          </div>
        </CampoSecao>
      </SecaoFormulario>

      <SecaoFormulario info={info("funcionamento")} numero={numero("funcionamento")}>
        <CampoSecao>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
            {DIAS.map((dia, i) => {
              const h = horarios[i];
              const definir = (novo: Partial<DiaHorario>) => setHorarios((todos) => todos.map((x, j) => (j === i ? { ...x, ...novo } : x)));
              return (
                <li key={dia} className={clsx("rounded-xl border p-2.5", h.aberto ? "border-marca/40 bg-marca/5" : "border-borda")}>
                  <label className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
                    <input type="checkbox" checked={h.aberto} onChange={(e) => definir({ aberto: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--marca))]" />
                    {dia}
                  </label>
                  {h.aberto ? (
                    <div className="space-y-1.5">
                      <input type="time" aria-label={`${dia}, abre`} className="entrada h-9 px-2" value={h.abre} onChange={(e) => definir({ abre: e.target.value })} />
                      <input type="time" aria-label={`${dia}, fecha`} className="entrada h-9 px-2" value={h.fecha} onChange={(e) => definir({ fecha: e.target.value })} />
                    </div>
                  ) : (
                    <p className="py-2 text-center text-[13px] text-suave">Fechado</p>
                  )}
                </li>
              );
            })}
          </ul>
        </CampoSecao>
      </SecaoFormulario>

      <SecaoFormulario info={info("vibe")} numero={numero("vibe")}>
        <SubtituloSecao>Vibes (até {MAX_VIBES})</SubtituloSecao>
        <CampoSecao>
          <div className="flex flex-wrap gap-2">
            {vibes.map((v) => {
              const marcada = minhasVibes.includes(v.id);
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={!marcada && minhasVibes.length >= MAX_VIBES}
                  aria-pressed={marcada}
                  onClick={() => setMinhasVibes((m) => (marcada ? m.filter((x) => x !== v.id) : [...m, v.id]))}
                  className={chip(marcada)}
                >
                  {v.nome}
                </button>
              );
            })}
          </div>
        </CampoSecao>
        {todosGostos &&
          ORDEM_TIPOS.map((t) => (
            <div key={t} className="contents">
              <SubtituloSecao>{NOME_TIPO_GOSTO[t]}</SubtituloSecao>
              <CampoSecao>
                <ChipsGostos
                  gostos={todosGostos.filter((g) => g.tipo === t)}
                  marcados={gostos}
                  alternar={(gid) => setGostos((m) => (m.includes(gid) ? m.filter((x) => x !== gid) : [...m, gid]))}
                />
              </CampoSecao>
            </div>
          ))}
      </SecaoFormulario>

      <SecaoFormulario
        info={info("fotos")}
        numero={numero("fotos")}
        acao={
          <>
            <input ref={seletorFoto} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void adicionarFotos(e.target.files)} />
            <button type="button" className="botao h-8 text-[13px]" disabled={enviando} onClick={() => seletorFoto.current?.click()}>
              <ImagePlus className="h-3.5 w-3.5" />
              {enviando ? "Enviando…" : "Adicionar"}
            </button>
          </>
        }
      >
        <CampoSecao>
          {fotos.length === 0 ? (
            <p className="text-sm text-suave">Nenhuma foto ainda.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {fotos.map((f) => {
                const capa = dados.capa_url === f.url;
                return (
                  <li key={f.id} className="relative overflow-hidden rounded-lg border border-borda">
                    <img src={f.url} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    {capa && <span className="absolute left-2 top-2 rounded-md bg-marca px-2 py-0.5 text-[12px] font-semibold text-marca-texto">Capa</span>}
                    <div className="flex border-t border-borda bg-superficie">
                      <button
                        type="button"
                        disabled={capa}
                        onClick={() => void definirCapa(f.url)}
                        className="flex flex-1 items-center justify-center gap-1.5 py-2 text-[13px] hover:bg-elevado disabled:opacity-40"
                      >
                        <Star className="h-3.5 w-3.5" />
                        Capa
                      </button>
                      <button
                        type="button"
                        onClick={() => void removerFoto(f)}
                        className="flex flex-1 items-center justify-center gap-1.5 border-l border-borda py-2 text-[13px] text-perigo hover:bg-elevado"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CampoSecao>
      </SecaoFormulario>

      {!noComputador && alteradas > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-borda bg-superficie px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] xl:hidden">
          <span className="flex-1 text-[12.5px] font-medium text-alerta">
            {alteradas} {alteradas === 1 ? "seção alterada" : "seções alteradas"}
          </span>
          <button className="botao-principal px-6" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      )}
    </TelaUniversal>
  );
}

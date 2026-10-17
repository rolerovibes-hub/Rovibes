import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { CircleMarker } from "react-leaflet";
import { ExternalLink, ImagePlus, LocateFixed, RotateCcw, Save, Star, Trash2 } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, Secao } from "@/components/Formulario";
import { MapaBase, Recentralizar, UBERLANDIA } from "@/components/MapaBase";
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
  instagram: string;
  endereco: string;
  bairro: string;
  faixa_preco: number | null;
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

export function PerfilEstabelecimento() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [dados, setDados] = useState<Dados | null>(null);
  const [categorias, setCategorias] = useState<{ id: number; nome: string }[]>([]);
  const [vibes, setVibes] = useState<{ id: number; nome: string }[]>([]);
  const [minhasVibes, setMinhasVibes] = useState<number[]>([]);
  const [horarios, setHorarios] = useState<DiaHorario[]>(DIAS.map(() => ({ ...HORARIO_PADRAO })));
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [centro, setCentro] = useState<[number, number] | null>(null);
  const seletorFoto = useRef<HTMLInputElement>(null);
  const seletorLogo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    const [e, c, v, mv, h, f] = await Promise.all([
      supabase
        .from("estabelecimentos")
        .select("nome, categoria_id, descricao, telefone, instagram, endereco, bairro, faixa_preco, latitude, longitude, capa_url, logo_url")
        .eq("id", id)
        .single(),
      supabase.from("categorias").select("id, nome").eq("ativa", true).order("nome"),
      supabase.from("vibes").select("id, nome").eq("ativa", true).order("nome"),
      supabase.from("estabelecimento_vibes").select("vibe_id").eq("estabelecimento_id", id),
      supabase.from("horarios").select("dia_semana, abre, fecha").eq("estabelecimento_id", id),
      supabase.from("fotos").select("id, url, caminho").eq("estabelecimento_id", id).order("ordem"),
    ]);
    if (e.error) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e.error) });
      return;
    }
    const d = e.data as Record<string, unknown>;
    setDados({
      nome: (d.nome as string) ?? "",
      categoria_id: (d.categoria_id as number) ?? null,
      descricao: (d.descricao as string) ?? "",
      telefone: (d.telefone as string) ?? "",
      instagram: (d.instagram as string) ?? "",
      endereco: (d.endereco as string) ?? "",
      bairro: (d.bairro as string) ?? "",
      faixa_preco: (d.faixa_preco as number) ?? null,
      latitude: (d.latitude as number) ?? null,
      longitude: (d.longitude as number) ?? null,
      capa_url: (d.capa_url as string) ?? null,
      logo_url: (d.logo_url as string) ?? null,
    });
    setCategorias((c.data ?? []) as { id: number; nome: string }[]);
    setVibes((v.data ?? []) as { id: number; nome: string }[]);
    setMinhasVibes((mv.data ?? []).map((x) => x.vibe_id as number));
    const porDia = DIAS.map((_, i) => {
      const linha = (h.data ?? []).find((x) => x.dia_semana === i);
      return linha ? { aberto: true, abre: hhmm(linha.abre as string), fecha: hhmm(linha.fecha as string) } : { ...HORARIO_PADRAO };
    });
    setHorarios(porDia);
    setFotos((f.data ?? []) as Foto[]);
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!atual) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento para editar o perfil.</p>;
  if (!dados) return <Carregando />;

  const mudar = <K extends keyof Dados>(campo: K, valor: Dados[K]) => setDados((d) => (d ? { ...d, [campo]: valor } : d));

  const salvar = async () => {
    if (!id) return;
    setSalvando(true);
    setAviso(null);
    try {
      const { error } = await supabase
        .from("estabelecimentos")
        .update({
          nome: dados.nome.trim(),
          categoria_id: dados.categoria_id,
          descricao: dados.descricao.trim() || null,
          telefone: dados.telefone.trim() || null,
          instagram: dados.instagram.trim().replace(/^@/, "") || null,
          endereco: dados.endereco.trim() || null,
          bairro: dados.bairro.trim() || null,
          faixa_preco: dados.faixa_preco,
          latitude: dados.latitude,
          longitude: dados.longitude,
        })
        .eq("id", id);
      if (error) throw error;

      const r1 = await supabase.from("estabelecimento_vibes").delete().eq("estabelecimento_id", id);
      if (r1.error) throw r1.error;
      if (minhasVibes.length) {
        const r2 = await supabase
          .from("estabelecimento_vibes")
          .insert(minhasVibes.map((vibe_id) => ({ estabelecimento_id: id, vibe_id })));
        if (r2.error) throw r2.error;
      }

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
      setAviso({ tipo: "ok", texto: "Perfil salvo." });
    } catch (err) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(err) });
    } finally {
      setSalvando(false);
    }
  };

  const localizar = async () => {
    const consulta = [dados.endereco, dados.bairro, "Uberlândia", "MG", "Brasil"].filter(Boolean).join(", ");
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(consulta)}`);
      const lista = (await r.json()) as { lat: string; lon: string }[];
      if (!lista.length) {
        setAviso({ tipo: "erro", texto: "Endereço não encontrado no mapa. Toque no mapa para marcar o local." });
        return;
      }
      const lat = Number(lista[0].lat);
      const lng = Number(lista[0].lon);
      setDados((d) => (d ? { ...d, latitude: lat, longitude: lng } : d));
      setCentro([lat, lng]);
    } catch {
      setAviso({ tipo: "erro", texto: "Não foi possível consultar o mapa agora." });
    }
  };

  const adicionarFotos = async (arquivos: FileList | null) => {
    if (!arquivos?.length || !id) return;
    setEnviando(true);
    setAviso(null);
    let temCapa = !!dados.capa_url;
    try {
      for (const arquivo of Array.from(arquivos)) {
        const { url, caminho } = await enviarFoto(id, arquivo, "foto");
        const { data, error } = await supabase
          .from("fotos")
          .insert({ estabelecimento_id: id, url, caminho, ordem: fotos.length })
          .select("id, url, caminho")
          .single();
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
    }
  };

  const definirCapa = async (url: string | null) => {
    if (!id) return;
    const { error } = await supabase.from("estabelecimentos").update({ capa_url: url }).eq("id", id);
    if (!error) setDados((d) => (d ? { ...d, capa_url: url } : d));
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
      setDados((d) => (d ? { ...d, logo_url: url } : d));
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

  const pin: [number, number] | null = dados.latitude != null && dados.longitude != null ? [dados.latitude, dados.longitude] : null;

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={salvar} disabled={salvando}>
            <Save className="h-4 w-4" />
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          <button className="botao" onClick={() => void carregar()} disabled={salvando}>
            <RotateCcw className="h-4 w-4" />
            Descartar
          </button>
          <hr className="col-span-full my-1 border-borda" />
          <Link to={`/lugar/${id}`} className="botao">
            <ExternalLink className="h-4 w-4" />
            Ver no App
          </Link>
        </>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {atual.estabelecimento.situacao !== "aprovado" && (
        <Aviso tipo="erro">Este estabelecimento ainda não aparece no App: aguarda aprovação da administração.</Aviso>
      )}

      <Secao titulo="Dados">
        <div className="mb-5 flex items-center gap-4">
          <button
            type="button"
            onClick={() => seletorLogo.current?.click()}
            disabled={enviando}
            aria-label="Trocar a logo"
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-dashed border-borda bg-fundo text-suave hover:bg-elevado"
          >
            {dados.logo_url ? <img src={dados.logo_url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5" />}
          </button>
          <div>
            <p className="text-sm font-medium">Logo</p>
            <p className="text-[13px] text-suave">Aparece em círculo sobre a foto de capa. Use uma imagem quadrada.</p>
          </div>
          <input ref={seletorLogo} type="file" accept="image/*" className="hidden" onChange={(e) => void trocarLogo(e.target.files)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome">
            <input className="entrada" value={dados.nome} onChange={(e) => mudar("nome", e.target.value)} />
          </Campo>
          <Campo rotulo="Categoria">
            <select
              className="entrada"
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
          </Campo>
          <Campo rotulo="Descrição" className="sm:col-span-2">
            <textarea
              rows={3}
              maxLength={400}
              className="entrada"
              value={dados.descricao}
              onChange={(e) => mudar("descricao", e.target.value)}
            />
          </Campo>
          <Campo rotulo="Telefone">
            <input type="tel" className="entrada" value={dados.telefone} onChange={(e) => mudar("telefone", e.target.value)} />
          </Campo>
          <Campo rotulo="Instagram">
            <input className="entrada" placeholder="@seuperfil" value={dados.instagram} onChange={(e) => mudar("instagram", e.target.value)} />
          </Campo>
          <Campo rotulo="Faixa de preço">
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => mudar("faixa_preco", dados.faixa_preco === n ? null : n)}
                  aria-pressed={dados.faixa_preco === n}
                  className={clsx(
                    "codigo h-10 flex-1 rounded-lg border text-sm",
                    dados.faixa_preco === n ? "border-marca bg-destaque-suave font-semibold text-destaque" : "border-borda hover:bg-elevado",
                  )}
                >
                  {"$".repeat(n)}
                </button>
              ))}
            </div>
          </Campo>
        </div>
      </Secao>

      <Secao titulo={`Vibes (até ${MAX_VIBES})`}>
        <div className="flex flex-wrap gap-2">
          {vibes.map((v) => {
            const marcada = minhasVibes.includes(v.id);
            const cheio = !marcada && minhasVibes.length >= MAX_VIBES;
            return (
              <button
                key={v.id}
                type="button"
                disabled={cheio}
                aria-pressed={marcada}
                onClick={() => setMinhasVibes((m) => (marcada ? m.filter((x) => x !== v.id) : [...m, v.id]))}
                className={clsx(
                  "rounded-full border px-3.5 py-1.5 text-sm transition-colors disabled:opacity-40",
                  marcada ? "border-marca bg-marca font-medium text-marca-texto" : "border-borda hover:bg-elevado",
                )}
              >
                {v.nome}
              </button>
            );
          })}
        </div>
      </Secao>

      <Secao titulo="Endereço e localização">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Campo rotulo="Endereço">
            <input className="entrada" placeholder="Rua, número" value={dados.endereco} onChange={(e) => mudar("endereco", e.target.value)} />
          </Campo>
          <Campo rotulo="Bairro">
            <input className="entrada" value={dados.bairro} onChange={(e) => mudar("bairro", e.target.value)} />
          </Campo>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-suave">{pin ? "Local marcado. Toque no mapa para ajustar." : "Toque no mapa para marcar o local."}</p>
          <button type="button" className="botao" onClick={localizar}>
            <LocateFixed className="h-4 w-4" />
            Localizar pelo endereço
          </button>
        </div>
        <div className="mt-3 h-72 overflow-hidden rounded-cartao border border-borda">
          <MapaBase
            centro={pin ?? UBERLANDIA}
            zoom={pin ? 16 : 13}
            className="h-full w-full"
            aoClicar={(lat, lng) => setDados((d) => (d ? { ...d, latitude: lat, longitude: lng } : d))}
          >
            <Recentralizar centro={centro} zoom={16} />
            {pin && <CircleMarker center={pin} radius={10} pathOptions={{ color: "#fff", weight: 3, fillColor: "#6D55E0", fillOpacity: 1 }} />}
          </MapaBase>
        </div>
      </Secao>

      <Secao titulo="Horários">
        <ul className="divide-y divide-borda">
          {DIAS.map((dia, i) => {
            const h = horarios[i];
            const definir = (novo: Partial<DiaHorario>) =>
              setHorarios((todos) => todos.map((x, j) => (j === i ? { ...x, ...novo } : x)));
            return (
              <li key={dia} className="flex flex-wrap items-center gap-3 py-2.5">
                <label className="flex w-36 items-center gap-2.5 text-sm">
                  <input type="checkbox" checked={h.aberto} onChange={(e) => definir({ aberto: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--marca))]" />
                  {dia}
                </label>
                {h.aberto ? (
                  <div className="flex items-center gap-2 text-sm">
                    <input type="time" aria-label={`${dia}, abre`} className="entrada w-28" value={h.abre} onChange={(e) => definir({ abre: e.target.value })} />
                    <span className="text-suave">às</span>
                    <input type="time" aria-label={`${dia}, fecha`} className="entrada w-28" value={h.fecha} onChange={(e) => definir({ fecha: e.target.value })} />
                  </div>
                ) : (
                  <span className="text-sm text-suave">Fechado</span>
                )}
              </li>
            );
          })}
        </ul>
      </Secao>

      <Secao
        titulo="Fotos"
        acao={
          <>
            <input
              ref={seletorFoto}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void adicionarFotos(e.target.files)}
            />
            <button type="button" className="botao" disabled={enviando} onClick={() => seletorFoto.current?.click()}>
              <ImagePlus className="h-4 w-4" />
              {enviando ? "Enviando…" : "Adicionar fotos"}
            </button>
          </>
        }
      >
        {fotos.length === 0 ? (
          <p className="text-sm text-suave">Nenhuma foto ainda. A primeira foto vira a capa.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {fotos.map((f) => {
              const capa = dados.capa_url === f.url;
              return (
                <li key={f.id} className="group relative overflow-hidden rounded-lg border border-borda">
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
      </Secao>
    </TelaUniversal>
  );
}

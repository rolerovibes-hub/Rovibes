import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import { CircleMarker } from "react-leaflet";
import { ArrowLeft, AtSign, Bookmark, CalendarDays, MapPinned, Navigation, Phone, Store } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { MapaBase, corDaMarca } from "@/components/MapaBase";
import { reais } from "@/components/Formulario";
import { abertoAgora, DIAS, hhmm, resumoHorario } from "@/lib/horarios";
import { buscarLugar, nomesVibes, quando } from "./dados";

type Dados = Awaited<ReturnType<typeof buscarLugar>>;

export function LugarPagina() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const [dados, setDados] = useState<Dados | null>(null);
  const [foto, setFoto] = useState(0);

  useEffect(() => {
    setDados(null);
    buscarLugar(id).then(setDados);
  }, [id]);

  useEffect(() => {
    if (dados?.lugar) document.title = `${dados.lugar.nome} · RoVibes`;
  }, [dados]);

  if (!dados) return <Carregando />;
  const { lugar, eventos, fotos, categorias, itens } = dados;
  if (!lugar) {
    return (
      <div className="px-6 py-20 text-center">
        <Store className="mx-auto h-8 w-8 text-suave" />
        <p className="mt-3 font-medium">Lugar não encontrado</p>
        <Link to="/" className="botao mt-5">
          Voltar ao Descobrir
        </Link>
      </div>
    );
  }

  const imagens = fotos.length ? fotos.map((f) => f.url) : lugar.capa_url ? [lugar.capa_url] : [];
  const aberto = abertoAgora(lugar.horarios);
  const ponto: [number, number] | null = lugar.latitude != null && lugar.longitude != null ? [lugar.latitude, lugar.longitude] : null;
  const rota = ponto
    ? `https://www.google.com/maps/dir/?api=1&destination=${ponto[0]},${ponto[1]}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lugar.endereco ?? lugar.nome}, Uberlândia`)}`;
  const grupos = [
    ...categorias.map((c) => ({ nome: c.nome, itens: itens.filter((i) => i.categoria_id === c.id) })),
    { nome: categorias.length ? "Outros" : "Cardápio", itens: itens.filter((i) => !i.categoria_id || !categorias.some((c) => c.id === i.categoria_id)) },
  ].filter((g) => g.itens.length);

  return (
    <article className="pb-6">
      <div className="relative">
        {imagens.length ? (
          <>
            <img src={imagens[foto]} alt={`Foto de ${lugar.nome}`} className="aspect-[16/10] w-full object-cover" />
            {imagens.length > 1 && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                {imagens.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setFoto(i)}
                    aria-label={`Foto ${i + 1}`}
                    className={clsx("h-1.5 rounded-full transition-all", i === foto ? "w-5 bg-white" : "w-1.5 bg-white/60")}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex aspect-[16/10] w-full items-center justify-center bg-elevado text-suave">
            <Store className="h-8 w-8" />
          </div>
        )}
        <button onClick={() => navegar(-1)} className="absolute left-3 top-3 rounded-full bg-superficie/90 p-2 shadow-sm" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-6 px-4 pt-4">
        <header>
          <h1 className="text-[22px] font-semibold leading-tight">{lugar.nome}</h1>
          <p className="mt-0.5 text-sm text-suave">
            {[lugar.categoria?.nome, lugar.bairro, lugar.faixa_preco ? "$".repeat(lugar.faixa_preco) : null].filter(Boolean).join(" · ")}
          </p>
          {lugar.horarios.length > 0 && (
            <p className={clsx("mt-1.5 text-sm", aberto ? "font-medium text-ok" : "text-suave")}>{resumoHorario(lugar.horarios)}</p>
          )}
          {nomesVibes(lugar).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {nomesVibes(lugar).map((v) => (
                <span key={v} className="rounded-md bg-destaque-suave px-2.5 py-1 text-[13px] font-medium text-destaque">
                  {v}
                </span>
              ))}
            </div>
          )}
        </header>

        <div className="grid grid-cols-3 gap-2">
          <a href={rota} target="_blank" rel="noreferrer" className="botao-principal flex-col gap-1 py-2.5 text-[13px]">
            <Navigation className="h-4 w-4" />
            Como chegar
          </a>
          <button className="botao flex-col gap-1 py-2.5 text-[13px]" disabled title="Chega na fase 3">
            <Bookmark className="h-4 w-4" />
            Salvar
          </button>
          <button className="botao flex-col gap-1 py-2.5 text-[13px]" disabled title="Chega na fase 3">
            <MapPinned className="h-4 w-4" />
            Check-in
          </button>
        </div>

        {lugar.descricao && <p className="text-[15px] leading-relaxed">{lugar.descricao}</p>}

        {eventos.length > 0 && (
          <section>
            <h2 className="mb-2.5 font-semibold">Próximos eventos</h2>
            <ul className="cartao divide-y divide-borda">
              {eventos.map((e) => (
                <li key={e.id}>
                  <Link to={`/evento/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-elevado">
                    <CalendarDays className="h-5 w-5 shrink-0 text-destaque" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{e.nome}</span>
                      <span className="block text-[13px] text-suave">
                        {quando(e.inicio)}
                        {e.entrada ? ` · ${e.entrada}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {grupos.length > 0 && (
          <section>
            <h2 className="mb-2.5 font-semibold">Cardápio</h2>
            <div className="space-y-4">
              {grupos.map((g) => (
                <div key={g.nome}>
                  <h3 className="rotulo mb-1.5">{g.nome}</h3>
                  <ul className="cartao divide-y divide-borda">
                    {g.itens.map((i) => (
                      <li key={i.id} className="flex gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{i.nome}</p>
                          {i.descricao && <p className="text-[13px] text-suave">{i.descricao}</p>}
                        </div>
                        {i.preco != null && <span className="codigo shrink-0 text-sm">{reais(i.preco)}</span>}
                        {i.foto_url && <img src={i.foto_url} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" loading="lazy" />}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {lugar.horarios.length > 0 && (
          <section>
            <h2 className="mb-2.5 font-semibold">Horários</h2>
            <ul className="cartao divide-y divide-borda text-sm">
              {DIAS.map((dia, i) => {
                const h = lugar.horarios.find((x) => x.dia_semana === i);
                const hoje = new Date().getDay() === i;
                return (
                  <li key={dia} className={clsx("flex justify-between px-4 py-2.5", hoje && "font-semibold")}>
                    <span>{dia}</span>
                    <span className={clsx("codigo text-sm", !h && "text-suave")}>{h ? `${hhmm(h.abre)} às ${hhmm(h.fecha)}` : "Fechado"}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-2.5 font-semibold">Onde fica</h2>
          {ponto && (
            <div className="mb-3 h-44 overflow-hidden rounded-cartao border border-borda">
              <MapaBase centro={ponto} zoom={16} className="h-full w-full">
                <CircleMarker center={ponto} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: corDaMarca(), fillOpacity: 1 }} />
              </MapaBase>
            </div>
          )}
          <ul className="space-y-2 text-sm">
            {(lugar.endereco || lugar.bairro) && <li>{[lugar.endereco, lugar.bairro, "Uberlândia-MG"].filter(Boolean).join(", ")}</li>}
            {lugar.telefone && (
              <li>
                <a href={`tel:${lugar.telefone.replace(/\D/g, "")}`} className="inline-flex items-center gap-2 text-destaque">
                  <Phone className="h-4 w-4" />
                  {lugar.telefone}
                </a>
              </li>
            )}
            {lugar.instagram && (
              <li>
                <a href={`https://instagram.com/${lugar.instagram}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-destaque">
                  <AtSign className="h-4 w-4" />
                  {lugar.instagram}
                </a>
              </li>
            )}
          </ul>
        </section>
      </div>
    </article>
  );
}

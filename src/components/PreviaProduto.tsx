import { useState } from "react";
import clsx from "clsx";
import { ArrowLeft, Info, Moon, Package, Search, Sun } from "lucide-react";
import { DetalheItemCardapio, ItemVisual, LinhaItemCardapio } from "./VisualCardapio";
import { LinhaBiblioteca } from "./BuscaBiblioteca";
import { ItemBiblioteca } from "@/lib/biblioteca";

export interface DadosPrevia {
  nome: string;
  descricao: string;
  foto_url: string | null;
  ean: string;
  marca: string;
  categoria: string;
  unidade: string;
  situacao: ItemBiblioteca["situacao"];
}

type Tela = "cardapio" | "detalhe" | "busca" | "estoque";
const TELAS: { id: Tela; nome: string }[] = [
  { id: "cardapio", nome: "Cardápio do app" },
  { id: "detalhe", nome: "Detalhe do item" },
  { id: "busca", nome: "Busca no Business" },
  { id: "estoque", nome: "Meus produtos" },
];

/** O nome que o estabelecimento recebe pronto ao criar o item do cardápio. */
export const nomeNoCardapio = (d: Pick<DadosPrevia, "nome" | "descricao">) => {
  const a = d.descricao.trim();
  return a && a.length <= 80 ? a : d.nome.trim() || "Produto";
};

const VIZINHOS: ItemVisual[] = [
  { id: "v1", nome: "Porção de batata", descricao: "Batata frita crocante, 400 g", preco: 32, foto_url: null },
  { id: "v2", nome: "Água com gás", descricao: null, preco: 6, foto_url: null },
];

/** Prévia de como o produto aparece para o cliente (app) e para o estabelecimento (Business), em modo claro e escuro. */
export function PreviaProduto({ dados }: { dados: DadosPrevia }) {
  const [tela, setTela] = useState<Tela>("cardapio");
  const [escuro, setEscuro] = useState(false);
  const [preco, setPreco] = useState("9,90");
  const [esgotado, setEsgotado] = useState(false);

  const valor = Number(preco.replace(/\./g, "").replace(",", "."));
  const item: ItemVisual = {
    id: "previa",
    nome: nomeNoCardapio(dados),
    descricao: null,
    preco: Number.isFinite(valor) ? valor : null,
    foto_url: dados.foto_url,
    esgotado,
  };
  const dicas: string[] = [];
  if (!dados.foto_url) dicas.push("Sem foto: o item aparece no cardápio sem imagem e o detalhe fica com um ícone.");
  if (!dados.descricao.trim()) dicas.push("Sem descrição: o cardápio usará o nome da NF, que costuma vir abreviado.");
  else if (dados.descricao.trim().length > 80) dicas.push("Descrição longa (mais de 80 letras): o cardápio usará o nome da NF. Deixe a descrição curta e clara.");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tela da prévia">
          {TELAS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tela === t.id}
              onClick={() => setTela(t.id)}
              className={clsx("rounded-full border px-3.5 py-1.5 text-sm", tela === t.id ? "border-marca bg-marca font-medium text-marca-texto" : "border-borda bg-superficie")}
            >
              {t.nome}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-borda" role="group" aria-label="Tema">
            <button type="button" onClick={() => setEscuro(false)} aria-pressed={!escuro} className={clsx("flex items-center gap-1.5 px-3 py-2 text-sm", !escuro && "bg-elevado font-medium")}>
              <Sun className="h-4 w-4" />
              Claro
            </button>
            <button type="button" onClick={() => setEscuro(true)} aria-pressed={escuro} className={clsx("flex items-center gap-1.5 border-l border-borda px-3 py-2 text-sm", escuro && "bg-elevado font-medium")}>
              <Moon className="h-4 w-4" />
              Escuro
            </button>
          </div>
          {(tela === "cardapio" || tela === "detalhe") && (
            <>
              <label className="block w-28">
                <span className="rotulo mb-1 block">Preço exemplo</span>
                <input value={preco} onChange={(e) => setPreco(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" className="entrada h-9" />
              </label>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={esgotado} onChange={(e) => setEsgotado(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--marca))]" />
                Esgotado
              </label>
            </>
          )}
        </div>
        <div className="space-y-2 rounded-lg border border-borda bg-fundo p-3 text-[13px]">
          <p className="flex gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-destaque" />
            <span>
              No cardápio o item recebe o nome <strong>“{item.nome}”</strong> (o estabelecimento pode mudar) e a foto da biblioteca. O preço é definido por cada estabelecimento.
            </span>
          </p>
          {dicas.map((d) => (
            <p key={d} className="flex gap-2 text-alerta">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{d}</span>
            </p>
          ))}
        </div>
      </div>

      {/* Aparelho */}
      <div className="mx-auto w-full max-w-[360px]">
        <div className="rounded-[2.2rem] border-[10px] border-neutral-900 bg-neutral-900 shadow-xl">
          <div className={clsx(escuro ? "dark" : "claro", "relative h-[640px] overflow-hidden rounded-[1.6rem] bg-fundo text-texto")} style={{ fontSize: 15 }}>
            <div className="flex h-6 items-center justify-between px-5 text-[11px] font-semibold">
              <span>9:41</span>
              <span className="h-4 w-16 rounded-full bg-neutral-900" />
              <span>5G</span>
            </div>
            <div className="h-[calc(100%-24px)] overflow-y-auto">
              {(tela === "cardapio" || tela === "detalhe") && (
                <>
                  <div className="flex items-center gap-3 border-b border-borda px-4 py-3">
                    <span className="botao h-9 w-9 shrink-0 px-0">
                      <ArrowLeft className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold leading-tight">Cardápio</p>
                      <p className="truncate text-[13px] text-suave">Bar Exemplo</p>
                    </div>
                  </div>
                  <div className="px-4 pt-4">
                    <h3 className="mb-2.5 text-[17px] font-semibold">{dados.categoria.trim() || "Bebidas"}</h3>
                    <ul className="cartao divide-y divide-borda">
                      <li>
                        <LinhaItemCardapio item={VIZINHOS[0]} />
                      </li>
                      <li className="relative">
                        <LinhaItemCardapio item={item} aoAbrir={() => setTela("detalhe")} />
                        <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-inset ring-marca/60" aria-hidden />
                      </li>
                      <li>
                        <LinhaItemCardapio item={VIZINHOS[1]} />
                      </li>
                    </ul>
                  </div>
                </>
              )}
              {tela === "detalhe" && (
                <div className="absolute inset-x-0 bottom-0 top-6 flex items-end bg-black/60">
                  <div className="max-h-full w-full overflow-y-auto">
                    <DetalheItemCardapio item={item} lugar="Bar Exemplo" fechar={() => setTela("cardapio")} embutido />
                  </div>
                </div>
              )}
              {tela === "busca" && (
                <div className="px-4 pt-4">
                  <p className="text-lg font-semibold">Biblioteca de produtos</p>
                  <div className="relative mt-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
                    <div className="entrada truncate pl-9 text-suave">{dados.ean || dados.nome.split(" ")[0] || "Buscar"}</div>
                  </div>
                  <ul className="mt-3 divide-y divide-borda rounded-lg border border-borda bg-superficie">
                    <li>
                      <LinhaBiblioteca item={{ nome: dados.nome || "Nome conforme a NF", ean: dados.ean || null, marca: dados.marca || null, foto_url: dados.foto_url, produto_id: null, situacao: dados.situacao }} />
                    </li>
                  </ul>
                </div>
              )}
              {tela === "estoque" && (
                <div className="px-4 pt-4">
                  <p className="text-lg font-semibold">Meus produtos</p>
                  <ul className="mt-3 divide-y divide-borda rounded-lg border border-borda bg-superficie">
                    <li className="flex items-center gap-3 px-3 py-2 text-sm">
                      {dados.foto_url ? (
                        <img src={dados.foto_url} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-white object-cover" />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-elevado text-suave">
                          <Package className="h-5 w-5" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{dados.nome || "Nome conforme a NF"}</span>
                        <span className="codigo block truncate text-[12px] text-suave">{dados.ean || "sem código"}</span>
                      </span>
                      <span className="shrink-0 text-right text-[12px]">
                        <span className="codigo block">24 {dados.unidade}</span>
                        <span className={clsx("block font-semibold", dados.situacao === "pendente" ? "text-alerta" : "text-ok")}>{dados.situacao === "pendente" ? "Em análise" : "Aprovado"}</span>
                      </span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

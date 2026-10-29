import { imprimirBruto } from "./nativo";

/** Cupom em ESC/POS (impressoras térmicas de cupom, 80 mm ou 58 mm). Sem acentos, que variam de modelo para modelo. */
export class Cupom {
  private b: number[] = [0x1b, 0x40];
  constructor(private colunas = 48) {}
  private bytes(s: string) {
    const limpo = s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x0a\x20-\x7e]/g, "?");
    for (let i = 0; i < limpo.length; i++) this.b.push(limpo.charCodeAt(i));
    return this;
  }
  linha(s = "") {
    return this.bytes(`${s}\n`);
  }
  centro(s: string) {
    this.b.push(0x1b, 0x61, 1);
    this.linha(s);
    this.b.push(0x1b, 0x61, 0);
    return this;
  }
  negrito(on: boolean) {
    this.b.push(0x1b, 0x45, on ? 1 : 0);
    return this;
  }
  grande(on: boolean) {
    this.b.push(0x1d, 0x21, on ? 0x11 : 0);
    return this;
  }
  separador() {
    return this.linha("-".repeat(this.colunas));
  }
  /** Texto à esquerda e valor à direita na mesma linha. */
  duas(esq: string, dir: string) {
    const espaco = this.colunas - dir.length - 1;
    const e = esq.length > espaco ? esq.slice(0, espaco) : esq;
    return this.linha(`${e}${" ".repeat(Math.max(1, this.colunas - e.length - dir.length))}${dir}`);
  }
  cortar() {
    this.b.push(0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00);
    return this;
  }
  pronto() {
    return new Uint8Array(this.b);
  }
}

const dinheiro = (v: number) => v.toFixed(2).replace(".", ",");
const agora = () => new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
export const colunasDoPapel = (papel: 58 | 80) => (papel === 58 ? 32 : 48);

export function cupomConta(c: {
  estabelecimento: string;
  titulo: string;
  itens: { quantidade: number; nome: string; total: number }[];
  subtotal: number;
  desconto: number;
  servico: number;
  total: number;
  pago: number;
  falta: number;
  papel: 58 | 80;
}) {
  const p = new Cupom(colunasDoPapel(c.papel));
  p.negrito(true).centro(c.estabelecimento).negrito(false).centro(c.titulo).centro(agora()).separador();
  for (const i of c.itens) p.duas(`${i.quantidade}x ${i.nome}`, dinheiro(i.total));
  p.separador().duas("Subtotal", dinheiro(c.subtotal));
  if (c.desconto > 0) p.duas("Desconto", `-${dinheiro(c.desconto)}`);
  if (c.servico > 0) p.duas("Servico", dinheiro(c.servico));
  p.negrito(true).duas("TOTAL", dinheiro(c.total)).negrito(false);
  if (c.pago > 0) p.duas("Pago", `-${dinheiro(c.pago)}`).negrito(true).duas("FALTA", dinheiro(c.falta)).negrito(false);
  p.linha().centro("Nao e documento fiscal").centro("RoVibes").cortar();
  return p.pronto();
}

export function cupomPedido(c: {
  origem: string;
  numero: number;
  setor: string;
  itens: { quantidade: number; nome: string; observacao: string | null }[];
  observacao: string | null;
  papel: 58 | 80;
}) {
  const p = new Cupom(colunasDoPapel(c.papel));
  p.grande(true).negrito(true).linha(c.origem).grande(false).linha(`Pedido #${c.numero} - ${c.setor}`).negrito(false).linha(agora()).separador();
  for (const i of c.itens) {
    p.grande(true).linha(`${i.quantidade}x ${i.nome}`).grande(false);
    if (i.observacao) p.linha(`   > ${i.observacao}`);
  }
  if (c.observacao) p.separador().linha(`Obs: ${c.observacao}`);
  p.cortar();
  return p.pronto();
}

export function cupomTeste(estacao: string, papel: 58 | 80) {
  return new Cupom(colunasDoPapel(papel)).negrito(true).centro("RoVibes Business").negrito(false).centro(`Teste de impressao - ${estacao}`).centro(agora()).cortar().pronto();
}

export const imprimir = (impressora: string | null, dados: Uint8Array) => {
  if (!impressora) return Promise.reject(new Error("Escolha a impressora nas configurações deste computador."));
  return imprimirBruto(impressora, dados);
};

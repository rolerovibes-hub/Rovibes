/**
 * Tratamento da foto do produto (Biblioteca RoVibes), tudo no próprio aparelho:
 * enquadramento quadrado com fundo branco, zoom, giro, brilho, contraste, nitidez,
 * remoção de fundo (modelo U²-Net leve, roda no navegador) e alertas de qualidade.
 */

export const TAMANHO_FINAL = 1000;
const LADO_MAXIMO_FONTE = 2000;

export interface AjustesImagem {
  zoom: number; // 1 = produto inteiro dentro do quadro
  x: number; // deslocamento do centro, em fração do quadro
  y: number;
  rotacao: number; // graus
  brilho: number; // 100 = original
  contraste: number; // 100 = original
  nitidez: number; // 0 a 100
  semFundo: boolean; // aplica a máscara de recorte
  limiar: number; // 0,2 a 0,8: quanto do contorno entra no recorte
}

export const AJUSTES_INICIAIS: AjustesImagem = { zoom: 1, x: 0, y: 0, rotacao: 0, brilho: 100, contraste: 100, nitidez: 0, semFundo: false, limiar: 0.5 };

const novoCanvas = (l: number, a: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(l));
  c.height = Math.max(1, Math.round(a));
  return c;
};
const contexto = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: true })!;

/** Abre a foto (arquivo ou endereço) e devolve uma cópia em canvas (até 2000 px no lado maior) e o tamanho original. */
export async function abrirImagem(origem: File | Blob | string): Promise<{ fonte: HTMLCanvasElement; largura: number; altura: number }> {
  let blob: Blob;
  if (typeof origem === "string") {
    const r = await fetch(origem, { mode: "cors", cache: "no-cache" });
    if (!r.ok) throw new Error("Não foi possível abrir a foto atual.");
    blob = await r.blob();
  } else blob = origem;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error("Não foi possível ler esta imagem. Use JPG, PNG ou WEBP."));
      i.src = url;
    });
    const largura = img.naturalWidth;
    const altura = img.naturalHeight;
    const escala = Math.min(1, LADO_MAXIMO_FONTE / Math.max(largura, altura));
    const fonte = novoCanvas(largura * escala, altura * escala);
    const ctx = contexto(fonte);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, fonte.width, fonte.height);
    return { fonte, largura, altura };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Aplica a máscara (0–255 por pixel) como transparência, com o limiar escolhido. */
export function recortar(fonte: HTMLCanvasElement, mascara: Uint8ClampedArray, limiar: number): HTMLCanvasElement {
  const c = novoCanvas(fonte.width, fonte.height);
  const ctx = contexto(c);
  ctx.drawImage(fonte, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const ini = Math.max(0, limiar - 0.18) * 255;
  const fim = Math.min(1, limiar + 0.18) * 255;
  const faixa = fim - ini || 1;
  for (let i = 0, p = 3; i < mascara.length; i++, p += 4) {
    const t = Math.min(1, Math.max(0, (mascara[i] - ini) / faixa));
    d.data[p] = Math.round(d.data[p] * t * t * (3 - 2 * t));
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

/** Brilho, contraste e nitidez nos pixels (funciona igual em todos os navegadores, inclusive iPhone). */
function tratarPixels(d: ImageData, brilho: number, contraste: number, nitidez: number) {
  const px = d.data;
  const b = brilho / 100;
  const c = contraste / 100;
  if (b !== 1 || c !== 1) {
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      for (let k = 0; k < 3; k++) px[i + k] = ((px[i + k] * b) / 255 - 0.5) * c * 255 + 127.5;
    }
  }
  if (nitidez > 0) {
    const a = (nitidez / 100) * 0.9;
    const w = d.width;
    const h = d.height;
    const orig = new Uint8ClampedArray(px);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        if (orig[i + 3] === 0) continue;
        for (let k = 0; k < 3; k++) {
          const v = orig[i + k];
          const viz = orig[i - 4 + k] + orig[i + 4 + k] + orig[i - w * 4 + k] + orig[i + w * 4 + k];
          px[i + k] = v + a * (4 * v - viz);
        }
      }
    }
  }
}

/** Monta a foto final: quadrado com fundo branco e o produto enquadrado. */
export function renderizar(fonte: HTMLCanvasElement, recorte: HTMLCanvasElement | null, aj: AjustesImagem, tamanho = TAMANHO_FINAL): HTMLCanvasElement {
  const origem = aj.semFundo && recorte ? recorte : fonte;
  const camada = novoCanvas(tamanho, tamanho);
  const ctx = contexto(camada);
  ctx.imageSmoothingQuality = "high";
  const s = Math.min(tamanho / origem.width, tamanho / origem.height) * aj.zoom;
  ctx.translate(tamanho / 2 + aj.x * tamanho, tamanho / 2 + aj.y * tamanho);
  ctx.rotate((aj.rotacao * Math.PI) / 180);
  ctx.drawImage(origem, (-origem.width * s) / 2, (-origem.height * s) / 2, origem.width * s, origem.height * s);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (aj.brilho !== 100 || aj.contraste !== 100 || aj.nitidez > 0) {
    const d = ctx.getImageData(0, 0, tamanho, tamanho);
    tratarPixels(d, aj.brilho, aj.contraste, (aj.nitidez * tamanho) / TAMANHO_FINAL);
    ctx.putImageData(d, 0, 0);
  }
  const final = novoCanvas(tamanho, tamanho);
  const f = contexto(final);
  f.fillStyle = "#ffffff";
  f.fillRect(0, 0, tamanho, tamanho);
  f.drawImage(camada, 0, 0);
  return final;
}

export const paraArquivo = (c: HTMLCanvasElement) =>
  new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível preparar a imagem."))), "image/jpeg", 0.88));

/** Caixa onde está o produto na fonte: pela máscara, ou pelo que difere da cor dos cantos. */
function caixaDoProduto(fonte: HTMLCanvasElement, mascara: Uint8ClampedArray | null) {
  const passo = Math.max(1, Math.round(Math.max(fonte.width, fonte.height) / 400));
  const w = fonte.width;
  const h = fonte.height;
  const d = contexto(fonte).getImageData(0, 0, w, h).data;
  const canto = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };
  const cantos = [canto(0, 0), canto(w - 1, 0), canto(0, h - 1), canto(w - 1, h - 1)];
  const fundo = [0, 1, 2].map((k) => cantos.reduce((s, c) => s + c[k], 0) / 4);
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y += passo) {
    for (let x = 0; x < w; x += passo) {
      const p = y * w + x;
      const dentro = mascara ? mascara[p] > 128 : Math.abs(d[p * 4] - fundo[0]) + Math.abs(d[p * 4 + 1] - fundo[1]) + Math.abs(d[p * 4 + 2] - fundo[2]) > 60;
      if (dentro) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, x1, y1 };
}

/** Enquadra o produto no centro, ocupando cerca de 85% do quadro. */
export function enquadrar(fonte: HTMLCanvasElement, mascara: Uint8ClampedArray | null, aj: AjustesImagem): AjustesImagem {
  const cx = caixaDoProduto(fonte, aj.semFundo ? mascara : null);
  if (!cx) return { ...aj, zoom: 1, x: 0, y: 0 };
  const T = TAMANHO_FINAL;
  const s0 = Math.min(T / fonte.width, T / fonte.height);
  const r = (aj.rotacao * Math.PI) / 180;
  const bw = cx.x1 - cx.x0;
  const bh = cx.y1 - cx.y0;
  // Tamanho da caixa depois do giro.
  const lw = Math.abs(bw * Math.cos(r)) + Math.abs(bh * Math.sin(r));
  const lh = Math.abs(bw * Math.sin(r)) + Math.abs(bh * Math.cos(r));
  const zoom = Math.min(8, Math.max(0.3, (0.85 * T) / (Math.max(lw, lh, 1) * s0)));
  const s = s0 * zoom;
  const dx = ((cx.x0 + cx.x1) / 2 - fonte.width / 2) * s;
  const dy = ((cx.y0 + cx.y1) / 2 - fonte.height / 2) * s;
  const rx = dx * Math.cos(r) - dy * Math.sin(r);
  const ry = dx * Math.sin(r) + dy * Math.cos(r);
  return { ...aj, zoom, x: -rx / T, y: -ry / T };
}

// ============================================================
// Alertas de qualidade
// ============================================================
export interface AlertaQualidade {
  nivel: "ok" | "alerta" | "grave";
  texto: string;
}

export function analisarQualidade(original: { fonte: HTMLCanvasElement; largura: number; altura: number }, final: HTMLCanvasElement): AlertaQualidade[] {
  const r: AlertaQualidade[] = [];
  const menor = Math.min(original.largura, original.altura);
  if (menor < 300) r.push({ nivel: "grave", texto: `Foto muito pequena (${original.largura}×${original.altura}). Use uma foto com pelo menos 800 px.` });
  else if (menor < 600) r.push({ nivel: "alerta", texto: `Foto pequena (${original.largura}×${original.altura}). Pode ficar sem nitidez na tela de detalhe.` });

  // Analisa a foto final reduzida (rápido).
  const L = 300;
  const c = novoCanvas(L, L);
  const ctx = contexto(c);
  ctx.drawImage(final, 0, 0, L, L);
  const d = ctx.getImageData(0, 0, L, L).data;
  const cinza = new Float32Array(L * L);
  let soma = 0;
  let nProduto = 0;
  let x0 = L,
    y0 = L,
    x1 = -1,
    y1 = -1;
  for (let p = 0; p < L * L; p++) {
    const g = 0.299 * d[p * 4] + 0.587 * d[p * 4 + 1] + 0.114 * d[p * 4 + 2];
    cinza[p] = g;
    const branco = d[p * 4] > 235 && d[p * 4 + 1] > 235 && d[p * 4 + 2] > 235;
    if (!branco) {
      soma += g;
      nProduto++;
      const x = p % L;
      const y = (p / L) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (nProduto < L * L * 0.01) {
    r.push({ nivel: "grave", texto: "Não aparece produto no quadro. Ajuste o zoom ou o recorte." });
    return r;
  }
  const media = soma / nProduto;
  if (media < 60) r.push({ nivel: "alerta", texto: "Foto escura. Aumente o brilho." });
  else if (media > 215) r.push({ nivel: "alerta", texto: "Foto muito clara ou estourada. Diminua o brilho." });

  // Nitidez: variação do contorno (Laplaciano) só na área do produto.
  let n = 0,
    m = 0,
    m2 = 0;
  for (let y = 1; y < L - 1; y++) {
    for (let x = 1; x < L - 1; x++) {
      const p = y * L + x;
      if (d[p * 4] > 235 && d[p * 4 + 1] > 235 && d[p * 4 + 2] > 235) continue;
      const v = 4 * cinza[p] - cinza[p - 1] - cinza[p + 1] - cinza[p - L] - cinza[p + L];
      n++;
      m += v;
      m2 += v * v;
    }
  }
  const variancia = n ? m2 / n - (m / n) ** 2 : 0;
  if (variancia < 25) r.push({ nivel: "alerta", texto: "A foto parece desfocada. Se puder, tire outra com o produto parado e bem iluminado." });

  // Fundo: a borda do quadro deve ser branca.
  let borda = 0,
    bordaBranca = 0;
  const faixa = Math.round(L * 0.03);
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      if (x >= faixa && x < L - faixa && y >= faixa && y < L - faixa) continue;
      const p = (y * L + x) * 4;
      borda++;
      if (d[p] > 235 && d[p + 1] > 235 && d[p + 2] > 235) bordaBranca++;
    }
  }
  if (bordaBranca / borda < 0.7) r.push({ nivel: "alerta", texto: "O fundo não está branco. Use “Remover fundo” para padronizar." });

  const ocupa = Math.max(x1 - x0, y1 - y0) / L;
  if (ocupa < 0.45) r.push({ nivel: "alerta", texto: "Produto pequeno no quadro. Use “Enquadrar”." });
  if (!r.length) r.push({ nivel: "ok", texto: "Foto boa: nítida, bem iluminada e com fundo branco." });
  return r;
}

// ============================================================
// Remoção de fundo (U²-Net leve, ~4,5 MB + motor de ~11 MB baixado só na primeira vez)
// ============================================================
const ORT_VERSAO = "1.20.1";
const ORT_DIR = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSAO}/dist/`;
const MODELO = `${import.meta.env.BASE_URL}modelos/u2netp.onnx`;
const LADO_MODELO = 320;

interface Tensor {
  data: Float32Array;
}
interface Sessao {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, Tensor>>;
}
interface Ort {
  env: { wasm: { numThreads: number; wasmPaths: string } };
  Tensor: new (tipo: string, dados: Float32Array, forma: number[]) => unknown;
  InferenceSession: { create(modelo: ArrayBuffer, opcoes: Record<string, unknown>): Promise<Sessao> };
}

let carregando: Promise<{ ort: Ort; sessao: Sessao }> | null = null;

function prepararMotor(aviso?: (t: string) => void) {
  if (!carregando) {
    carregando = (async () => {
      aviso?.("Baixando o removedor de fundo (só na primeira vez)...");
      const ort = (await import(/* @vite-ignore */ `${ORT_DIR}ort.wasm.min.mjs`)) as unknown as Ort;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = ORT_DIR;
      const r = await fetch(MODELO);
      if (!r.ok) throw new Error("Não foi possível baixar o modelo de recorte.");
      const sessao = await ort.InferenceSession.create(await r.arrayBuffer(), { executionProviders: ["wasm"] });
      return { ort, sessao };
    })().catch((e) => {
      carregando = null;
      throw e;
    });
  }
  return carregando;
}

/** Devolve a máscara do produto (0–255 por pixel, no tamanho da fonte). */
export async function mascaraDoProduto(fonte: HTMLCanvasElement, aviso?: (t: string) => void): Promise<Uint8ClampedArray> {
  const { ort, sessao } = await prepararMotor(aviso);
  aviso?.("Separando o produto do fundo...");
  const c = novoCanvas(LADO_MODELO, LADO_MODELO);
  const ctx = contexto(c);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(fonte, 0, 0, LADO_MODELO, LADO_MODELO);
  const px = ctx.getImageData(0, 0, LADO_MODELO, LADO_MODELO).data;
  let max = 1;
  for (let i = 0; i < px.length; i++) if (i % 4 !== 3 && px[i] > max) max = px[i];
  const media = [0.485, 0.456, 0.406];
  const desvio = [0.229, 0.224, 0.225];
  const area = LADO_MODELO * LADO_MODELO;
  const entrada = new Float32Array(3 * area);
  for (let p = 0; p < area; p++) for (let k = 0; k < 3; k++) entrada[k * area + p] = (px[p * 4 + k] / max - media[k]) / desvio[k];
  const saida = await sessao.run({ [sessao.inputNames[0]]: new ort.Tensor("float32", entrada, [1, 3, LADO_MODELO, LADO_MODELO]) });
  const bruto = saida[sessao.outputNames[0]].data;
  let mi = Infinity,
    ma = -Infinity;
  for (let i = 0; i < area; i++) {
    if (bruto[i] < mi) mi = bruto[i];
    if (bruto[i] > ma) ma = bruto[i];
  }
  const pequena = ctx.createImageData(LADO_MODELO, LADO_MODELO);
  for (let i = 0; i < area; i++) {
    const v = ((bruto[i] - mi) / (ma - mi || 1)) * 255;
    pequena.data[i * 4] = pequena.data[i * 4 + 1] = pequena.data[i * 4 + 2] = v;
    pequena.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(pequena, 0, 0);
  const grande = novoCanvas(fonte.width, fonte.height);
  const g = contexto(grande);
  g.imageSmoothingQuality = "high";
  g.drawImage(c, 0, 0, grande.width, grande.height);
  const d = g.getImageData(0, 0, grande.width, grande.height).data;
  const mascara = new Uint8ClampedArray(grande.width * grande.height);
  for (let i = 0; i < mascara.length; i++) mascara[i] = d[i * 4];
  return mascara;
}

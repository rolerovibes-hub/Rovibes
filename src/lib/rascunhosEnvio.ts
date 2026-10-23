import type { PedidoPublicacao } from "./envios";

/**
 * Guarda no aparelho (IndexedDB) cada publicação desde o toque em "Publicar" até terminar.
 * Se o app fechar ou recarregar no meio, ela continua ao abrir de novo; se não der, vira rascunho.
 */
export interface EnvioGuardado {
  id: string;
  usuario: string;
  pedido: PedidoPublicacao;
  /** Caminho no armazenamento e id da publicação (fixos: reenviar não duplica). */
  base: string;
  postId: string;
  /** pendente = estava enviando; rascunho = falhou ou precisa de um toque para continuar. */
  estado: "pendente" | "rascunho";
  erro?: string;
  criado_em: number;
}

const BANCO = "rovibes-envios";
const LOJA = "envios";

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    if (typeof indexedDB === "undefined") return falha(new Error("sem IndexedDB"));
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(LOJA)) r.result.createObjectStore(LOJA, { keyPath: "id" });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}

async function usar<T>(modo: IDBTransactionMode, fazer: (loja: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await abrir();
  return new Promise<T | undefined>((ok, falha) => {
    const t = db.transaction(LOJA, modo);
    const req = fazer(t.objectStore(LOJA));
    t.oncomplete = () => {
      db.close();
      ok(req ? (req.result as T) : undefined);
    };
    t.onerror = () => {
      db.close();
      falha(t.error);
    };
  });
}

/** Nunca deixa o envio falhar por causa do armazenamento local (modo anônimo, sem espaço...). */
const seguro = async <T,>(p: () => Promise<T>) => {
  try {
    return await p();
  } catch {
    return undefined;
  }
};

export const guardarEnvio = (e: EnvioGuardado) => seguro(() => usar("readwrite", (l) => l.put(e)));
export const apagarEnvio = (id: string) => seguro(() => usar("readwrite", (l) => l.delete(id)));
export const listarEnvios = async (usuario: string) =>
  ((await seguro(() => usar<EnvioGuardado[]>("readonly", (l) => l.getAll() as IDBRequest<EnvioGuardado[]>))) ?? [])
    .filter((e) => e.usuario === usuario)
    .sort((a, b) => a.criado_em - b.criado_em);

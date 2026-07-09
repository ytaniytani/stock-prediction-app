import type { InstrumentCode, OHLC, DataMode } from "./types";

const DB_NAME = "stock-prediction-db";
const DB_VERSION = 1;
const STORE_SERIES = "series"; // key: instrument code, value: OHLC[]
const STORE_META = "meta"; // key: string, value: any

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SERIES)) {
        db.createObjectStore(STORE_SERIES);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSeries(code: InstrumentCode, rows: OHLC[]): Promise<void> {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  await withStore(STORE_SERIES, "readwrite", (store) => store.put(sorted, code));
}

export async function loadSeries(code: InstrumentCode): Promise<OHLC[]> {
  const result = await withStore<OHLC[] | undefined>(STORE_SERIES, "readonly", (store) => store.get(code));
  return result ?? [];
}

export async function loadAllSeries(codes: InstrumentCode[]): Promise<Record<string, OHLC[]>> {
  const entries = await Promise.all(codes.map(async (c) => [c, await loadSeries(c)] as const));
  return Object.fromEntries(entries);
}

export async function clearSeries(code: InstrumentCode): Promise<void> {
  await withStore(STORE_SERIES, "readwrite", (store) => store.delete(code));
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const result = await withStore<T | undefined>(STORE_META, "readonly", (store) => store.get(key));
  return result ?? fallback;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await withStore(STORE_META, "readwrite", (store) => store.put(value, key));
}

export async function getDataMode(): Promise<DataMode> {
  return getMeta<DataMode>("dataMode", "sample");
}

export async function setDataMode(mode: DataMode): Promise<void> {
  await setMeta("dataMode", mode);
}

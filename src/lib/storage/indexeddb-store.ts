import type { ScanReport } from "../scanner/types";
import {
  MAX_SCANS_PER_DOMAIN,
  type ScanStore,
  type StoredScan,
  type TrackedDomain,
} from "./types";

/**
 * ScanStore backed by the browser's IndexedDB. Data never leaves the
 * visitor's machine. Every operation runs in ONE transaction so related
 * changes (e.g. insert a scan + prune old ones) succeed or fail together.
 */

/** A ScanStore that can also add a scan with an original timestamp (for imports). */
export interface ImportableStore extends ScanStore {
  importScan(
    ownerId: string,
    domainId: string,
    scan: { scannedAt: string; report: ScanReport },
  ): Promise<StoredScan>;
}

const DOMAINS = "domains";
const SCANS = "scans";

// A scan row as stored: StoredScan plus an auto-incrementing `seq` that
// gives us a reliable "newest first" order even when timestamps tie.
interface ScanRow extends StoredScan {
  seq?: number;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const tx = db.transaction([DOMAINS, SCANS], mode);
  const finished = transactionDone(tx);
  let result: T;
  try {
    result = await work(tx);
  } catch (error) {
    // Roll back anything this operation changed, then rethrow.
    try {
      tx.abort();
    } catch {
      // already finished
    }
    await finished.catch(() => undefined);
    throw error;
  }
  await finished;
  return result;
}

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      const domains = db.createObjectStore(DOMAINS, { keyPath: "id" });
      domains.createIndex("byOwner", "ownerId");
      domains.createIndex("byOwnerHost", ["ownerId", "hostname"], { unique: true });
      const scans = db.createObjectStore(SCANS, { keyPath: "seq", autoIncrement: true });
      scans.createIndex("byDomain", "domainId");
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error("Could not open IndexedDB"));
  });
}

function toDomain(row: TrackedDomain): TrackedDomain {
  return {
    id: row.id,
    ownerId: row.ownerId,
    hostname: row.hostname,
    createdAt: row.createdAt,
  };
}

function toScan(row: ScanRow): StoredScan {
  return {
    id: row.id,
    domainId: row.domainId,
    scannedAt: row.scannedAt,
    postureLabel: row.postureLabel,
    report: row.report,
  };
}

/** Returns the domain only if it exists AND belongs to this owner. */
async function ownedDomain(
  tx: IDBTransaction,
  ownerId: string,
  domainId: string,
): Promise<TrackedDomain | null> {
  const row = (await request(tx.objectStore(DOMAINS).get(domainId))) as
    | TrackedDomain
    | undefined;
  return row && row.ownerId === ownerId ? row : null;
}

/**
 * Inserts one scan and prunes the oldest beyond the retention limit, inside
 * the caller's transaction. Used by both saveScan (timestamp = now) and
 * importScan (timestamp = the original).
 */
async function insertScan(
  tx: IDBTransaction,
  ownerId: string,
  domainId: string,
  scannedAt: string,
  report: ScanReport,
): Promise<StoredScan> {
  const domain = await ownedDomain(tx, ownerId, domainId);
  if (!domain) throw new Error("Domain not found");

  const scans = tx.objectStore(SCANS);
  const row: ScanRow = {
    id: crypto.randomUUID(),
    domainId,
    scannedAt,
    postureLabel: report.posture.label,
    report,
  };
  await request(scans.add(row));

  // Keep only the newest MAX_SCANS_PER_DOMAIN. getAllKeys on an index
  // returns keys ordered by (domainId, seq), so oldest come first.
  const keys = await request(scans.index("byDomain").getAllKeys(IDBKeyRange.only(domainId)));
  const excess = keys.length - MAX_SCANS_PER_DOMAIN;
  for (let i = 0; i < excess; i++) {
    await request(scans.delete(keys[i]));
  }
  return toScan(row);
}

export function createIndexedDbStore(dbName = "linkguard"): ImportableStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const getDb = () => (dbPromise ??= openDb(dbName));

  return {
    async addDomain(ownerId, hostname) {
      const db = await getDb();
      return run(db, "readwrite", async (tx) => {
        const store = tx.objectStore(DOMAINS);
        const existing = (await request(
          store.index("byOwnerHost").get([ownerId, hostname]),
        )) as TrackedDomain | undefined;
        if (existing) return toDomain(existing);

        const created: TrackedDomain = {
          id: crypto.randomUUID(),
          ownerId,
          hostname,
          createdAt: new Date().toISOString(),
        };
        await request(store.add(created));
        return toDomain(created);
      });
    },

    async listDomains(ownerId) {
      const db = await getDb();
      return run(db, "readonly", async (tx) => {
        const rows = (await request(
          tx.objectStore(DOMAINS).index("byOwner").getAll(ownerId),
        )) as TrackedDomain[];
        return rows
          .map(toDomain)
          .sort(
            (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
          );
      });
    },

    async getDomain(ownerId, domainId) {
      const db = await getDb();
      return run(db, "readonly", async (tx) => {
        const row = await ownedDomain(tx, ownerId, domainId);
        return row ? toDomain(row) : null;
      });
    },

    async removeDomain(ownerId, domainId) {
      const db = await getDb();
      return run(db, "readwrite", async (tx) => {
        const row = await ownedDomain(tx, ownerId, domainId);
        if (!row) return false;
        const scans = tx.objectStore(SCANS);
        const keys = await request(
          scans.index("byDomain").getAllKeys(IDBKeyRange.only(domainId)),
        );
        for (const key of keys) await request(scans.delete(key));
        await request(tx.objectStore(DOMAINS).delete(domainId));
        return true;
      });
    },

    async saveScan(ownerId, domainId, report: ScanReport) {
      const db = await getDb();
      return run(db, "readwrite", (tx) =>
        insertScan(tx, ownerId, domainId, new Date().toISOString(), report),
      );
    },

    async importScan(ownerId, domainId, scan) {
      const db = await getDb();
      return run(db, "readwrite", (tx) =>
        insertScan(tx, ownerId, domainId, scan.scannedAt, scan.report),
      );
    },

    async listScans(ownerId, domainId, limit = MAX_SCANS_PER_DOMAIN) {
      const db = await getDb();
      return run(db, "readonly", async (tx) => {
        const domain = await ownedDomain(tx, ownerId, domainId);
        if (!domain || limit <= 0) return [];
        const out: StoredScan[] = [];
        await new Promise<void>((resolve, reject) => {
          const cursorReq = tx
            .objectStore(SCANS)
            .index("byDomain")
            .openCursor(IDBKeyRange.only(domainId), "prev"); // newest first
          cursorReq.onerror = () => reject(cursorReq.error);
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor || out.length >= limit) return resolve();
            out.push(toScan(cursor.value as ScanRow));
            cursor.continue();
          };
        });
        return out;
      });
    },

    async clearScans(ownerId, domainId) {
      const db = await getDb();
      return run(db, "readwrite", async (tx) => {
        const domain = await ownedDomain(tx, ownerId, domainId);
        if (!domain) return 0;
        const scans = tx.objectStore(SCANS);
        const keys = await request(
          scans.index("byDomain").getAllKeys(IDBKeyRange.only(domainId)),
        );
        for (const key of keys) await request(scans.delete(key));
        return keys.length;
      });
    },
  };
}
import { LEGACY_BRAND } from "@/lib/legacyBrand";

const MIGRATION_STORE = "brand-migrations";
const migrations = new Map<string, Promise<void>>();

/** Copy each legacy library once, preserving the original and newer records. */
export function migrateLegacyLibrary(database: IDBDatabase, stores: string[]): Promise<void> {
  const existing = migrations.get(database.name);
  if (existing) return existing;
  const migration = migrate(database, stores).catch((error) => {
    migrations.delete(database.name);
    throw error;
  });
  migrations.set(database.name, migration);
  return migration;
}

export function createBrandMigrationStore(database: IDBDatabase) {
  if (!database.objectStoreNames.contains(MIGRATION_STORE)) database.createObjectStore(MIGRATION_STORE);
}

async function migrate(database: IDBDatabase, stores: string[]) {
  const done = await new Promise<boolean>((resolve, reject) => {
    const request = database.transaction(MIGRATION_STORE).objectStore(MIGRATION_STORE).get("complete");
    request.onsuccess = () => resolve(request.result === true);
    request.onerror = () => reject(request.error);
  });
  if (done) return;
  const legacy = await new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(database.name.replace(/^kercad\./, `${LEGACY_BRAND}.`));
    let absent = false;
    // Do not create an empty legacy database on a fresh installation.
    request.onupgradeneeded = () => { absent = true; request.transaction?.abort(); };
    request.onerror = () => absent ? resolve(null) : reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const entries: Array<{ store: string; key: IDBValidKey; value: unknown }> = [];
  try {
    if (legacy) for (const store of stores) {
      if (!legacy.objectStoreNames.contains(store)) continue;
      await new Promise<void>((resolve, reject) => {
        const transaction = legacy.transaction(store);
        const request = transaction.objectStore(store).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) { entries.push({ store, key: cursor.primaryKey, value: cursor.value }); cursor.continue(); }
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
    }
  } finally { legacy?.close(); }
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([...stores, MIGRATION_STORE], "readwrite");
    for (const entry of entries) {
      const store = transaction.objectStore(entry.store);
      const request = store.get(entry.key);
      request.onsuccess = () => { if (request.result === undefined) store.put(entry.value); };
    }
    transaction.objectStore(MIGRATION_STORE).put(true, "complete");
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}

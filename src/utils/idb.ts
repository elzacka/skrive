const connections = new Map<string, Promise<IDBDatabase>>();

// One connection per database for the session, with a single object store;
// a failed or closed connection is opened again on the next call
export function openDb(name: string, store: string): Promise<IDBDatabase> {
  const cached = connections.get(name);
  if (cached) return cached;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => connections.delete(name);
      db.onversionchange = () => { db.close(); connections.delete(name); };
      resolve(db);
    };
  });
  opening.catch(() => connections.delete(name));
  connections.set(name, opening);
  return opening;
}

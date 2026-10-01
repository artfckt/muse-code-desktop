import type { MuseItem } from "./protocol";

export type CachedConversation = {
  id: string;
  items: MuseItem[];
  session: any;
  cachedAt: number;
};
const MAX_CHATS = 12;
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_AGE = 7 * 86400000;
let opening: Promise<IDBDatabase> | undefined;
function database() {
  return (opening ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("muse-conversation-cache", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("chats", { keyPath: "id" });
      request.result.createObjectStore("index");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = undefined;
      reject(request.error);
    };
  }));
}
async function read(store: string, key: string) {
  const db = await database();
  return new Promise<any>((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function cachedConversation(
  id: string,
): Promise<CachedConversation | null> {
  try {
    const row = await read("chats", id);
    return row && Date.now() - row.cachedAt < MAX_AGE ? row : null;
  } catch {
    return null;
  }
}
export async function cacheConversation(row: CachedConversation) {
  try {
    // The disk preview is bounded; native history remains authoritative and complete.
    const preview = { ...row, items: row.items.slice(-200) };
    if (JSON.stringify(preview).length * 2 > 2 * 1024 * 1024) return;
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("chats", "readwrite"),
        store = tx.objectStore("chats");
      store.put(preview);
      const request = store.getAll();
      request.onsuccess = () => {
        let bytes = 0;
        request.result
          .sort((a, b) => b.cachedAt - a.cachedAt)
          .forEach((held, i) => {
            bytes += JSON.stringify(held).length * 2;
            if (
              i >= MAX_CHATS ||
              bytes > MAX_BYTES ||
              Date.now() - held.cachedAt > MAX_AGE
            )
              store.delete(held.id);
          });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* A failed preview cache does not affect native history or drafts. */
  }
}
export async function cachedIndex(): Promise<{
  sessions: any[];
  workspaces: string[];
} | null> {
  try {
    const row = await read("index", "sidebar");
    return row && Date.now() - row.cachedAt < MAX_AGE ? row : null;
  } catch {
    return null;
  }
}
export async function cacheIndex(sessions: any[], workspaces: string[]) {
  try {
    const db = await database(),
      tx = db.transaction("index", "readwrite");
    // Keep lightweight navigation only, never full prompts, tokens or account credentials.
    tx.objectStore("index").put(
      {
        cachedAt: Date.now(),
        workspaces,
        sessions: sessions
          .slice(0, 1000)
          .map(
            ({
              sessionId,
              name,
              title,
              firstUserPrompt,
              workspaceRoot,
              updatedAt,
              lastActivityAt,
              permissionProfile,
              modelId,
            }) => ({
              sessionId,
              name,
              title: title || firstUserPrompt?.slice(0, 160),
              workspaceRoot,
              updatedAt,
              lastActivityAt,
              permissionProfile,
              modelId,
            }),
          ),
      },
      "sidebar",
    );
  } catch {}
}
export async function clearConversationCache() {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["chats", "index"], "readwrite");
    tx.objectStore("chats").clear();
    tx.objectStore("index").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

import { useEffect, useRef, useState } from "react";
import type { Attachment } from "./media";

type Draft = { text: string; images: Attachment[]; revision: number };
export type DraftSnapshot = Draft & { key: string };
const empty = (): Draft => ({ text: "", images: [], revision: 0 });
// IndexedDB keeps binary attachments out of the small localStorage quota.
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("muse-desktop-drafts", 2);
    request.onupgradeneeded = () => {
      for (const name of ["drafts", "attachments"])
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
const warn = () =>
  window.dispatchEvent(new CustomEvent("muse-draft-storage-error"));
const storedAttachments = new Map<string, Attachment>();
function persist(key: string, draft?: Draft) {
  void db()
    .then((database) => {
      const transaction = database.transaction(
        ["drafts", "attachments"],
        "readwrite",
      );
      const store = transaction.objectStore("drafts");
      if (draft && (draft.text || draft.images.length)) {
        for (const image of draft.images)
          if (storedAttachments.get(image.id) !== image) {
            transaction.objectStore("attachments").put(image, image.id);
            storedAttachments.set(image.id, image);
          }
        store.put(
          { ...draft, images: draft.images.map((image) => ({ id: image.id })) },
          key,
        );
      } else store.delete(key);
      transaction.onerror = () => {
        for (const image of draft?.images || [])
          storedAttachments.delete(image.id);
        warn();
      };
    })
    .catch(warn);
}
async function savedDrafts() {
  const database = await db();
  return new Promise<Draft[]>((resolve, reject) => {
    const request = database
      .transaction("drafts")
      .objectStore("drafts")
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function cleanDraftAttachments() {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      ["drafts", "attachments"],
      "readwrite",
    );
    const drafts = transaction.objectStore("drafts").getAll();
    drafts.onsuccess = () => {
      const used = new Set(
        drafts.result.flatMap((draft: Draft) =>
          draft.images.map((image) => image.id),
        ),
      );
      const attachments = transaction.objectStore("attachments");
      const keys = attachments.getAllKeys();
      keys.onsuccess = () => {
        for (const id of keys.result)
          if (!used.has(String(id))) {
            attachments.delete(id);
            storedAttachments.delete(String(id));
          }
      };
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
export function useDrafts() {
  const key = useRef("__initial__");
  const drafts = useRef(new Map<string, Draft>());
  const aliases = useRef(new Map<string, string>());
  const [draft, render] = useState<Draft>(empty);
  const current = () => drafts.current.get(key.current) || empty();
  function update(patch: Partial<Draft>, target = key.current) {
    const previous = drafts.current.get(target) || empty();
    const next = { ...previous, ...patch, revision: previous.revision + 1 };
    drafts.current.set(target, next);
    persist(target, next);
    if (target === key.current) render(next);
  }
  function select(target: string, move = false) {
    if (target === key.current) return;
    if (move) {
      drafts.current.set(target, current());
      aliases.current.set(key.current, target);
      persist(key.current);
      persist(target, current());
      drafts.current.delete(key.current);
    }
    key.current = target;
    render(current());
    if (!drafts.current.has(target)) {
      // A restored snapshot may never overwrite text typed while it loads.
      void db()
        .then(
          (database) =>
            new Promise<Draft | undefined>((resolve, reject) => {
              const request = database
                .transaction("drafts")
                .objectStore("drafts")
                .get(target);
              request.onsuccess = () => {
                const saved = request.result;
                if (!saved) {
                  resolve(undefined);
                  return;
                }
                const images = (saved.images || []) as Attachment[];
                Promise.all(
                  images.map((image) => {
                    if (Array.isArray(image.frames)) return image; // beta.1 legacy record
                    return new Promise<Attachment | undefined>((resolve) => {
                      const attachment = database
                        .transaction("attachments")
                        .objectStore("attachments")
                        .get(image.id);
                      attachment.onsuccess = () => resolve(attachment.result);
                      attachment.onerror = () => resolve(undefined);
                    });
                  }),
                ).then((images) =>
                  resolve({ ...saved, images: images.filter(Boolean) }),
                );
              };
              request.onerror = () => reject(request.error);
            }),
        )
        .then((saved) => {
          if (saved && !drafts.current.has(target)) {
            drafts.current.set(target, saved);
            if (target === key.current) render(saved);
          }
        })
        .catch(() => {});
    }
  }
  function capture(): DraftSnapshot {
    return { ...current(), key: key.current };
  }
  function clear(snapshot: DraftSnapshot) {
    let target = snapshot.key;
    const seen = new Set<string>();
    while (aliases.current.has(target) && !seen.has(target)) {
      seen.add(target);
      target = aliases.current.get(target)!;
    }
    if (drafts.current.get(target)?.revision === snapshot.revision) {
      update({ text: "", images: [] }, target);
      void cleanDraftAttachments().catch(warn);
    }
  }
  useEffect(() => {
    select("new:");
  }, []);
  return {
    prompt: draft.text,
    images: draft.images,
    select,
    capture,
    clear,
    setPrompt: (value: string) => update({ text: value }),
    setImages: (
      value: Attachment[] | ((images: Attachment[]) => Attachment[]),
    ) => {
      const previous = current().images;
      const images = typeof value === "function" ? value(previous) : value;
      update({ images });
      if (images.length < previous.length)
        void cleanDraftAttachments().catch(warn);
    },
    retainedIds: async () => [
      ...new Set([
        ...(await savedDrafts()).flatMap((draft) =>
          draft.images.map((image) => image.id),
        ),
        ...[...drafts.current.values()].flatMap((draft) =>
          draft.images.map((image) => image.id),
        ),
      ]),
    ],
    append: (snapshot: DraftSnapshot, images: Attachment[]) => {
      let target = snapshot.key;
      while (aliases.current.has(target)) target = aliases.current.get(target)!;
      update(
        { images: [...(drafts.current.get(target)?.images || []), ...images] },
        target,
      );
    },
  };
}

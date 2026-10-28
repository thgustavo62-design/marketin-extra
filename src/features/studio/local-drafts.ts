export type StudioDraft = {
  key: string;
  json: string;
  revision: number;
  sourceHash: string;
  documentSourceHash: string;
  updatedAt: number;
};
const database = "encartiva-studio-drafts";
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  if (typeof indexedDB === "undefined") return;
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(database, 1);
    open.onupgradeneeded = () =>
      open.result.createObjectStore("drafts", { keyPath: "key" });
    const deadline = setTimeout(
      () => reject(Error("Local backup timeout")),
      3000,
    );
    open.onblocked = () => {
      clearTimeout(deadline);
      reject(Error("Local backup blocked"));
    };
    open.onerror = () => {
      clearTimeout(deadline);
      reject(open.error);
    };
    open.onsuccess = () => {
      clearTimeout(deadline);
      const db = open.result,
        tx = db.transaction("drafts", mode);
      let value: T;
      const request = run(tx.objectStore("drafts"));
      request.onsuccess = () => {
        value = request.result;
      };
      tx.oncomplete = () => {
        db.close();
        resolve(value);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
export const readStudioDraft = (key: string) =>
  transaction<StudioDraft | undefined>("readonly", (s) => s.get(key));
export const writeStudioDraft = (draft: StudioDraft) =>
  transaction("readwrite", (s) => s.put(draft));
export const deleteStudioDraft = (key: string) =>
  transaction("readwrite", (s) => s.delete(key));

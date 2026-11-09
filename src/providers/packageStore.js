let database;
const CHANGE_EVENT = "kiss-provider-packages-changed";
function notifyPackageChange() {
  globalThis.dispatchEvent?.(new Event(CHANGE_EVENT));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CHANGE_EVENT);
    channel.postMessage("changed");
    channel.close();
  }
}
/** A subscription owns its channel and closes it on unmount; package writers retain no listeners. */
export function subscribeProviderPackageChanges(listener) {
  globalThis.addEventListener?.(CHANGE_EVENT, listener);
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(CHANGE_EVENT)
      : null;
  if (channel) channel.onmessage = listener;
  return () => {
    globalThis.removeEventListener?.(CHANGE_EVENT, listener);
    channel?.close();
  };
}
function open() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("kiss-provider-packages", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("packages", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        database = undefined;
        reject(request.error);
      };
    });
  return database;
}

async function transaction(mode, operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("packages", mode);
    const request = operation(tx.objectStore("packages"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error || new Error("Plugin transaction aborted."));
  });
}

export const saveProviderPackage = async (pack) => {
  const result = await transaction("readwrite", (store) =>
    store.put({ ...pack, id: pack.manifest.id })
  );
  notifyPackageChange();
  return result;
};
export const listProviderPackages = () =>
  transaction("readonly", (store) => store.getAll());
export const getProviderPackage = (id) =>
  transaction("readonly", (store) => store.get(id));
export const removeProviderPackage = async (id) => {
  await transaction("readwrite", (store) => store.delete(id));
  notifyPackageChange();
};

const subscribers = new Map();

/** Subscribe to explicit storage refreshes within the current page. */
export function subscribeStorageRefresh(key, callback) {
  if (!subscribers.has(key)) subscribers.set(key, new Set());
  const callbacks = subscribers.get(key);
  callbacks.add(callback);
  return () => {
    callbacks.delete(callback);
    if (callbacks.size === 0) subscribers.delete(key);
  };
}

/** Wait until all currently mounted subscribers have reloaded these keys. */
export async function refreshStorageKeys(keys) {
  const callbacks = new Set(
    [...new Set(keys)].flatMap((key) => [...(subscribers.get(key) || [])])
  );
  const results = await Promise.allSettled(
    [...callbacks].map((callback) => Promise.resolve().then(callback))
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

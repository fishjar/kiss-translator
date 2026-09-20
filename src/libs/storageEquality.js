/** Compare JSON storage values without depending on object property order. */
export function isSameStorageValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    return (
      a.length === b.length &&
      a.every((value, index) => isSameStorageValue(value, b[index]))
    );
  }
  const firstKeys = Object.keys(a);
  const secondKeys = Object.keys(b);
  return (
    firstKeys.length === secondKeys.length &&
    firstKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        isSameStorageValue(a[key], b[key])
    )
  );
}

/** Isolate captured edits and updater inputs using the storage JSON format. */
export function cloneStorageValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

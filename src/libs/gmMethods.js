/** Resolve the native userscript API without loading storage or network modules. */
export function getNativeGm() {
  if (typeof GM !== "undefined") return GM;
  return globalThis.GM;
}

/** Prefer a supplied bridge, then the native API, then a legacy global method. */
export function getGmMethod(method, legacyMethod, fallbackObjects = []) {
  const gmObjects = [...fallbackObjects, getNativeGm()];
  for (const object of gmObjects) {
    const api = object?.[method];
    if (typeof api === "function") return api.bind(object);
  }

  const legacyApi = globalThis[legacyMethod];
  if (typeof legacyApi === "function") return legacyApi;
  throw new Error(`GM API is not available: ${method}`);
}

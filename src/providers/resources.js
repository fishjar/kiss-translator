import { providerError } from "./capabilities";

/** Synced snapshots are untrusted too; bound decoded allocation before minting task assets. */
export function importExecutionResources(snapshot, assets) {
  const entries = Object.entries(snapshot || {});
  if (entries.length + assets.entries().length > 8)
    throw providerError("INPUT_LIMIT_EXCEEDED", "Task assets exceed 8 files.");
  let total = 0;
  const resources = {};
  for (const [id, resource] of entries) {
    if (
      !/^[A-Za-z_$][\w$]*$/.test(id) ||
      ["__proto__", "constructor", "prototype"].includes(id) ||
      typeof resource?.data !== "string" ||
      resource.data.length > Math.ceil((256 * 1024) / 3) * 4 ||
      typeof resource.mimeType !== "string"
    )
      throw providerError(
        "INVALID_ASSET",
        "Invalid execution resource snapshot."
      );
    const binary = atob(resource.data);
    if (binary.length > 256 * 1024 || (total += binary.length) > 1024 * 1024)
      throw providerError(
        "INPUT_LIMIT_EXCEEDED",
        "Execution resources exceed snapshot limits."
      );
    resources[id] = assets.put(
      new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))], {
        type: resource.mimeType,
      })
    );
  }
  if (
    assets.entries().reduce((n, [, blob]) => n + blob.size, 0) >
    8 * 1024 * 1024
  )
    throw providerError("INPUT_LIMIT_EXCEEDED", "Task assets exceed 8 MiB.");
  return resources;
}

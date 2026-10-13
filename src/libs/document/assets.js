export const documentAssetPath = (name) => `assets/${name}`;

// Only resource-bearing fields are migrated; model diagnostics remain verbatim.
export function normalizeDocumentAssets(value, assets) {
  const replacements = (assets || []).filter((asset) => asset.name && asset.url)
    .map((asset) => [asset.url, documentAssetPath(asset.name)]);
  if (!replacements.length) return value;
  const visit = (node, key) => {
    if (typeof node === "string" && ["raw", "targetRaw", "bilingualRaw", "markdown", "formulaMarkdown", "url"].includes(key))
      return replacements.reduce((text, [url, path]) => text.split(url).join(path), node);
    if (Array.isArray(node)) {
      const items = node.map((item) => visit(item));
      return items.every((item, index) => item === node[index]) ? node : items;
    }
    if (!node || typeof node !== "object" || node instanceof Blob || node instanceof Map) return node;
    const fields = Object.entries(node).map(([field, item]) =>
      [field, ["assets", "formulaDiagnostics", "formulaDiagnostic"].includes(field) ? item : visit(item, field)]);
    return fields.every(([field, item]) => item === node[field]) ? node : Object.fromEntries(fields);
  };
  return visit(value);
}

export class DocumentAssetPreview {
  entries = new Map();
  failures = new Set();
  legacyUrls = new Set();
  sync(assets) {
    const retired = [];
    const names = new Set();
    for (const asset of assets || []) {
      if (!asset.name) continue;
      const path = documentAssetPath(asset.name);
      if (asset.url?.startsWith("blob:") && !this.legacyUrls.has(asset.url)) {
        this.legacyUrls.add(asset.url);
        retired.push(asset.url);
      }
      names.add(path);
      const old = this.entries.get(path);
      if (old?.blob === asset.blob) continue;
      if (old?.url) retired.push(old.url);
      this.failures.delete(path);
      this.entries.set(path, { blob: asset.blob,
        url: asset.blob instanceof Blob && asset.blob.size ? URL.createObjectURL(asset.blob) : null, retried: false });
    }
    for (const [path, entry] of this.entries) {
      if (names.has(path)) continue;
      if (entry.url) retired.push(entry.url);
      this.entries.delete(path);
      this.failures.delete(path);
    }
    return () => retired.forEach((url) => URL.revokeObjectURL(url));
  }
  urls() { return new Map([...this.entries].map(([path, entry]) => [path, this.failures.has(path) ? null : entry.url])); }
  retry(path, url) {
    const entry = this.entries.get(path);
    if (!entry || entry.url !== url || this.failures.has(path)) return null;
    if (entry.retried || !(entry.blob instanceof Blob) || !entry.blob.size) {
      this.failures.add(path);
      return null;
    }
    entry.retried = true;
    entry.url = URL.createObjectURL(entry.blob);
    return entry.url;
  }
  clear() {
    for (const entry of this.entries.values()) if (entry.url) URL.revokeObjectURL(entry.url);
    this.entries.clear();
    this.failures.clear();
  }
}

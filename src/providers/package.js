import { unzipSync, strFromU8 } from "fflate";
import { providerError } from "./capabilities";
import { validateDefaultPrompts } from "./defaultPrompts";
import { validateDeclarativeRules } from "./declarativeRules";
import {
  mergeSettingFields,
  validateCapabilities,
  validateModels,
  validatePermissions,
  validateFieldCapabilities,
} from "./instances";

const MAX_PACKAGE = 5 * 1024 * 1024;
const MAX_UNPACKED = 10 * 1024 * 1024;
export async function readProviderFile(file, signal) {
  if (file.size > MAX_PACKAGE)
    throw providerError("PACKAGE_TOO_LARGE", "Plugin package exceeds 5 MiB.");
  if (signal?.aborted)
    throw providerError("REQUEST_CANCELLED", "插件安装已取消");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted)
    throw providerError("REQUEST_CANCELLED", "插件安装已取消");
  return { ...readProviderPackage(bytes), source: { kind: "file" } };
}
function validPath(name) {
  return (
    typeof name === "string" &&
    name &&
    !name.startsWith("/") &&
    !name.includes("\\") &&
    !name.includes(":") &&
    !name.split("/").some((part) => part === ".." || part === ".")
  );
}

export async function readProviderDirectory(fileList, signal) {
  const selected = Array.from(fileList);
  const files = Object.create(null);
  const paths = new Set();
  let root;
  let total = 0;
  const checkCancelled = () => {
    if (signal?.aborted)
      throw providerError("REQUEST_CANCELLED", "插件安装已取消");
  };
  checkCancelled();
  if (selected.length > 100)
    throw providerError("PACKAGE_TOO_LARGE", "插件文件夹最多包含 100 个文件");
  const entries = selected.map((file) => {
    const path = file.webkitRelativePath;
    if (!validPath(path) || path.split("/").some((part) => !part))
      throw providerError("INVALID_PACKAGE", "插件文件夹包含非法路径");
    const [directory, ...parts] = path.split("/");
    root ||= directory;
    const relative = parts.join("/");
    if (directory !== root || !relative || paths.has(relative))
      throw providerError(
        "INVALID_PACKAGE",
        "请选择单个插件文件夹，且文件路径不能重复"
      );
    paths.add(relative);
    total += file.size;
    if (total > MAX_UNPACKED)
      throw providerError("PACKAGE_TOO_LARGE", "插件文件夹不能超过 10 MiB");
    return { file, relative };
  });
  if (!paths.has("manifest.json"))
    throw providerError(
      "INVALID_PACKAGE",
      "所选文件夹根目录必须包含 manifest.json"
    );
  total = 0;
  for (const { file, relative } of entries) {
    checkCancelled();
    const bytes = new Uint8Array(await file.arrayBuffer());
    checkCancelled();
    total += bytes.byteLength;
    if (total > MAX_UNPACKED)
      throw providerError("PACKAGE_TOO_LARGE", "插件文件夹不能超过 10 MiB");
    files[relative] = bytes;
  }
  return { ...parseProviderFiles(files), source: { kind: "directory" } };
}

export function readProviderPackage(bytes, { githubArchive = false } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_PACKAGE)
    throw providerError("PACKAGE_TOO_LARGE", "Plugin package exceeds 5 MiB.");
  let total = 0;
  let count = 0;
  let files = unzipSync(bytes, {
    filter: (entry) => {
      if (!validPath(entry.name))
        throw providerError("INVALID_PACKAGE", "Invalid ZIP path.");
      total += entry.originalSize;
      if (++count > 100 || total > MAX_UNPACKED)
        throw providerError(
          "PACKAGE_TOO_LARGE",
          "Unpacked plugin exceeds limits."
        );
      return !entry.name.endsWith("/");
    },
  });
  if (
    Object.values(files).reduce((size, bytes) => size + bytes.byteLength, 0) >
    MAX_UNPACKED
  )
    throw providerError(
      "PACKAGE_TOO_LARGE",
      "Decoded plugin exceeds unpacked limits."
    );
  if (githubArchive) {
    // GitHub adds exactly one directory; never search arbitrary nested projects.
    const root = Object.keys(files)[0]?.split("/")[0];
    if (
      !root ||
      !Object.keys(files).every((name) => name.startsWith(root + "/"))
    )
      throw providerError(
        "INVALID_PACKAGE",
        "GitHub archive must contain one root directory."
      );
    files = Object.fromEntries(
      Object.entries(files).map(([name, value]) => [
        name.slice(root.length + 1),
        value,
      ])
    );
  }
  return parseProviderFiles(files);
}

function parseProviderFiles(files) {
  if (!files["manifest.json"])
    throw providerError(
      "INVALID_PACKAGE",
      "manifest.json must be at package root."
    );
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  if (
    manifest.manifestVersion !== 1 ||
    manifest.apiVersion !== "1" ||
    !/^[a-z][a-z0-9-]{1,100}$/.test(manifest.id) ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    !Array.isArray(manifest.services) ||
    !manifest.services.length ||
    (manifest.resources !== undefined &&
      (!Array.isArray(manifest.resources) || manifest.resources.length > 8))
  )
    throw providerError("INVALID_MANIFEST", "Unsupported or invalid manifest.");
  const ids = new Set();
  const implementations = {};
  const resources = {};
  let resourceBytes = 0;
  for (const resource of manifest.resources || []) {
    if (
      !resource ||
      !/^[A-Za-z_$][\w$]*$/.test(resource.id) ||
      ["__proto__", "constructor", "prototype"].includes(resource.id) ||
      Object.prototype.hasOwnProperty.call(resources, resource.id) ||
      !validPath(resource.path) ||
      !files[resource.path] ||
      typeof resource.mimeType !== "string"
    )
      throw providerError("INVALID_MANIFEST", "Invalid package resource.");
    const bytes = files[resource.path];
    if (
      bytes.byteLength > 256 * 1024 ||
      (resourceBytes += bytes.byteLength) > 1024 * 1024
    )
      throw providerError(
        "PACKAGE_TOO_LARGE",
        "Execution resources exceed 256 KiB per file or 1 MiB total."
      );
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    resources[resource.id] = {
      data: btoa(binary),
      mimeType: resource.mimeType,
    };
  }
  let icon;
  if (manifest.icon !== undefined) {
    const bytes = files[manifest.icon];
    const mimeType = /\.png$/i.test(manifest.icon)
      ? "image/png"
      : /\.webp$/i.test(manifest.icon)
        ? "image/webp"
        : /\.jpe?g$/i.test(manifest.icon)
          ? "image/jpeg"
          : undefined;
    const signature =
      mimeType === "image/png"
        ? bytes?.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
        : mimeType === "image/jpeg"
          ? bytes?.[0] === 255 && bytes?.[1] === 216 && bytes?.[2] === 255
          : mimeType === "image/webp"
            ? strFromU8(bytes?.slice(0, 4) || []) === "RIFF" &&
              strFromU8(bytes?.slice(8, 12) || []) === "WEBP"
            : false;
    if (
      !validPath(manifest.icon) ||
      !bytes ||
      bytes.length > 256 * 1024 ||
      !signature
    )
      throw providerError(
        "INVALID_MANIFEST",
        "Icon must be a PNG, JPEG or WebP under 256 KiB."
      );
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    icon = { data: btoa(binary), mimeType };
  }
  for (const service of manifest.services) {
    if (
      !/^[A-Za-z][\w-]{0,100}$/.test(service?.id) ||
      ["__proto__", "constructor", "prototype"].includes(service.id) ||
      ids.has(service.id) ||
      !["script", "declarative"].includes(service.implementation?.kind) ||
      !validPath(service.implementation.entry) ||
      !files[service.implementation.entry]
    )
      throw providerError(
        "INVALID_MANIFEST",
        "Missing or invalid service entry."
      );
    ids.add(service.id);
    validateCapabilities(service.capabilities);
    validateDefaultPrompts(service);
    validateFieldCapabilities(
      service,
      mergeSettingFields(manifest.sharedSettings, service.settings),
      manifest.permissions
    );
    validateModels(
      service,
      mergeSettingFields(manifest.sharedSettings, service.settings)
    );
    validatePermissions(
      manifest.permissions,
      mergeSettingFields(manifest.sharedSettings, service.settings)
    );
    const text = strFromU8(files[service.implementation.entry]);
    implementations[service.id] =
      service.implementation.kind === "script" ? text : JSON.parse(text);
    if (service.implementation.kind === "declarative") {
      const rules = implementations[service.id];
      validateDeclarativeRules(
        rules,
        service.capabilities,
        mergeSettingFields(manifest.sharedSettings, service.settings),
        "INVALID_MANIFEST"
      );
    }
  }
  return {
    manifest,
    implementations,
    ...(Object.keys(resources).length && { resources }),
    ...(icon && { icon }),
  };
}

export async function downloadProviderPackage(
  url,
  fetchImpl = globalThis.fetch,
  { signal, timeoutMs = 60000, githubArchive = false } = {}
) {
  const target = new URL(url);
  if (target.protocol !== "https:" || target.username || target.password)
    throw providerError(
      "INVALID_URL",
      "Use an HTTPS package URL without credentials."
    );
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw providerError("INVALID_TIMEOUT", "Invalid download timeout.");
  const controller = new AbortController();
  let abortReason;
  const cancel = () => {
    abortReason = providerError(
      "REQUEST_CANCELLED",
      "Plugin download cancelled."
    );
    controller.abort(abortReason);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => {
    abortReason = providerError(
      "REQUEST_TIMEOUT",
      "Plugin download timed out."
    );
    controller.abort(abortReason);
  }, timeoutMs);
  let reader;
  // Bound the entire download, including waiting for headers and stalled body reads.
  // Abort reaches fetch; the race also settles custom transports that ignore it.
  let rejectAbort;
  const aborted = new Promise((_, reject) => {
    rejectAbort = reject;
  });
  aborted.catch(() => {});
  const onAbort = () => rejectAbort(abortReason);
  controller.signal.addEventListener("abort", onAbort, { once: true });
  if (controller.signal.aborted) onAbort();
  try {
    if (controller.signal.aborted) throw abortReason;
    const response = await Promise.race([
      fetchImpl(target.href, {
        credentials: "omit",
        redirect: "error",
        signal: controller.signal,
      }),
      aborted,
    ]);
    if (!response.ok)
      throw providerError(
        "HTTP_ERROR",
        `Plugin download failed: ${response.status}`
      );
    reader = response.body?.getReader();
    if (!reader)
      throw providerError("INVALID_PACKAGE", "Download stream unavailable.");
    const chunks = [];
    let length = 0;
    while (true) {
      const { value, done } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      length += value.byteLength;
      if (length > MAX_PACKAGE)
        throw providerError(
          "PACKAGE_TOO_LARGE",
          "Plugin package exceeds 5 MiB."
        );
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      ...readProviderPackage(bytes, { githubArchive }),
      source: { kind: "zip", url: target.href },
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", onAbort);
    if (reader) {
      reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}

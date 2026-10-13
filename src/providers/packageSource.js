import { downloadProviderPackage } from "./package";
import { providerError } from "./capabilities";

export function parsePackageSource(address) {
  let url;
  try {
    url = new URL(address);
  } catch {
    throw providerError("INVALID_URL", "请输入 GitHub 项目或 HTTPS ZIP 地址");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw providerError("INVALID_URL", "安装地址必须为不含凭据的 HTTPS 地址");
  if (
    url.hostname === "github.com" &&
    /^\/[^/]+\/[^/]+\/?$/.test(url.pathname)
  ) {
    if (url.search)
      throw providerError("INVALID_URL", "GitHub 项目地址不能指定分支或参数");
    const [owner, repository] = url.pathname.split("/").filter(Boolean);
    const repo = repository.replace(/\.git$/, "");
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo))
      throw providerError("INVALID_URL", "无效 GitHub 项目地址");
    return { kind: "github", repoUrl: `https://github.com/${owner}/${repo}` };
  }
  if (url.hostname === "github.com" && /\/(tree|blob)\//.test(url.pathname))
    throw providerError(
      "INVALID_URL",
      "请输入 GitHub 项目根地址，不支持分支或子目录安装"
    );
  return { kind: "zip", url: url.href };
}

/** One deadline covers lookup and archive bytes. Restore never follows the latest branch. */
export async function downloadProviderSource(
  input,
  fetchImpl = globalThis.fetch,
  { signal, timeoutMs = 60000, restore = false } = {}
) {
  const source = typeof input === "string" ? parsePackageSource(input) : input;
  if (!source || !["github", "zip"].includes(source.kind))
    throw providerError("INVALID_URL", "请重新导入原 ZIP 文件");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw providerError("INVALID_TIMEOUT", "Invalid download timeout");
  const controller = new AbortController();
  let abortReason;
  const abort = (reason) => {
    abortReason = reason;
    controller.abort(reason);
  };
  const cancel = () =>
    abort(providerError("REQUEST_CANCELLED", "插件安装已取消"));
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(
    () => abort(providerError("REQUEST_TIMEOUT", "插件下载超时")),
    timeoutMs
  );
  let rejectAbort;
  const aborted = new Promise((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort(abortReason);
  controller.signal.addEventListener("abort", onAbort, { once: true });
  if (controller.signal.aborted) onAbort();
  aborted.catch(() => {});
  const json = async (url) => {
    if (controller.signal.aborted) throw abortReason;
    const response = await fetchImpl(url, {
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok)
      throw providerError(
        "HTTP_ERROR",
        response.status === 403 || response.status === 429
          ? "GitHub 请求受限，请稍后重试"
          : `GitHub 项目查询失败：${response.status}`
      );
    const reader = response.body?.getReader();
    if (!reader) throw providerError("INVALID_RESPONSE", "GitHub 响应不可读取");
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await Promise.race([reader.read(), aborted]);
        if (done) break;
        size += value.byteLength;
        if (size > 1024 * 1024)
          throw providerError(
            "RESOURCE_BUDGET_EXCEEDED",
            "GitHub 元数据超过限制"
          );
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return JSON.parse(new TextDecoder().decode(bytes));
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock?.();
    }
  };
  try {
    return await Promise.race([
      (async () => {
        if (controller.signal.aborted) throw abortReason;
        if (source.kind === "zip")
          return downloadProviderPackage(source.url, fetchImpl, {
            signal: controller.signal,
            timeoutMs,
          });
        const canonical = parsePackageSource(source.repoUrl);
        if (canonical.kind !== "github")
          throw providerError("INVALID_URL", "无效 GitHub 项目地址");
        const path = new URL(canonical.repoUrl).pathname;
        let commitSha = restore ? source.commitSha : undefined;
        if (!restore) {
          const repository = await json(`https://api.github.com/repos${path}`);
          if (repository.private || !repository.default_branch)
            throw providerError(
              "INVALID_PACKAGE",
              "仅支持有默认分支的公开仓库"
            );
          const branch = await json(
            `https://api.github.com/repos${path}/branches/${encodeURIComponent(repository.default_branch)}`
          );
          commitSha = branch.commit?.sha;
        }
        if (!/^[0-9a-f]{40}$/.test(commitSha || ""))
          throw providerError("INVALID_PACKAGE", "缺少有效的 GitHub 提交 SHA");
        const pack = await downloadProviderPackage(
          `https://codeload.github.com${path}/zip/${commitSha}`,
          fetchImpl,
          { signal: controller.signal, timeoutMs, githubArchive: true }
        );
        return { ...pack, source: { ...canonical, commitSha } };
      })(),
      aborted,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

export function checkPackageReplacement(previous, incoming) {
  if (previous.manifest.id !== incoming.manifest.id)
    throw providerError("INVALID_PACKAGE", "更新包的插件 ID 不一致");
  const old = previous.manifest.version.split(".").map(Number);
  const next = incoming.manifest.version.split(".").map(Number);
  const diff =
    next
      .map((value, index) => value - old[index])
      .find((value) => value !== 0) || 0;
  if (diff === 0 && previous.integrity === incoming.integrity) return false;
  if (diff <= 0)
    throw providerError(
      "INVALID_PACKAGE",
      "更新必须提高 Manifest 版本，不能覆盖同版本内容或降级"
    );
  return true;
}

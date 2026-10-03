import { useCallback } from "react";
import { loadOrFetchSubTerms, removeSubTerms } from "../libs/subTerms";
import { kissLog } from "../libs/log";
import { useTerms } from "./Terms";
import { makeLibraryId, DEFAULT_TERMS_LIBRARY_ID } from "../config";

/**
 * 订阅术语库管理（多库模型）。
 *
 * 与旧版的关键差异：订阅源不再存在 `setting.subTermsList`，而是并入
 * `STOKEY_TERMS.libraries[]`，与自定义库**统一在同一个有序列表中**。
 * 理由（人类已确认）：
 * - 排序是"库"粒度的（拖动卡片调优先级），订阅源必须与自定义库同处一个序列
 * - 若订阅源单独存 setting，就会出现"两个列表谁先加载"的歧义
 *
 * 仍然保持的性质：
 * - 订阅库的**正文**存 STOKEY_TERMCACHE_PREFIX + url（不参与云同步）
 * - 每库独立 `enabled`（多源并行，不是单选）
 * - 新增订阅**追加到列表末尾**（不悄悄改变用户现有翻译结果）
 */
export function useSubTerms() {
  const { libraries, updateLibraries, updateLibrary } = useTerms();

  const subTermsList = libraries.filter(
    (lib) => lib.source?.type === "subscription"
  );

  /**
   * 新增一个术语订阅库（默认启用，追加末尾）。
   * @returns {Promise<string>} 新库的 id（已存在则返回既有 id）
   */
  const addSubTerms = useCallback(
    async (url) => {
      const trimmed = typeof url === "string" ? url.trim() : "";
      if (!trimmed) return "";
      const id = makeLibraryId(trimmed); // 同一 URL 恒定同一 id → 天然去重

      const existing = libraries.find((lib) => lib.id === id);
      if (existing) return id;

      await updateLibraries((list) => [
        ...list,
        {
          id,
          name: "", // 首次同步后从订阅文件元信息填充
          description: "",
          enabled: true,
          terms: "",
          source: { type: "subscription", url: trimmed },
          sortOrder: list.length,
        },
      ]);
      return id;
    },
    [libraries, updateLibraries]
  );

  /** 删除一个订阅库（同时清掉本地缓存与时间戳） */
  const delSubTerms = useCallback(
    async (url) => {
      const id = makeLibraryId(url);
      await updateLibraries((list) => list.filter((lib) => lib.id !== id));
      try {
        await removeSubTerms(url);
      } catch (err) {
        kissLog("removeSubTerms", err);
      }
    },
    [updateLibraries]
  );

  /** 启用/停用某个订阅源（多源并行，不影响其他源） */
  const toggleSubTerms = useCallback(
    (url, enabled) => {
      const id = makeLibraryId(url);
      return updateLibrary(id, { enabled: enabled !== false });
    },
    [updateLibrary]
  );

  /**
   * 手动同步单个源；返回解析结果供 UI 展示条目数 / 错误。
   * 同步成功后，把订阅文件里的元信息（name/description/author）回填到库上，
   * 这样卡片就能显示真实库名与署名（人类决策：元信息由订阅方自己写）。
   */
  const syncOne = useCallback(
    async (url) => {
      try {
        const parsed = await loadOrFetchSubTerms(url);
        const id = makeLibraryId(url);
        const meta = parsed?.meta;
        const patch = {};
        if (meta?.name) patch.name = meta.name;
        if (meta?.description) patch.description = meta.description;
        if (Object.keys(patch).length > 0) {
          await updateLibrary(id, patch);
        }
        return { ok: true, parsed };
      } catch (err) {
        kissLog("sync sub terms", err);
        return { ok: false, error: err };
      }
    },
    [updateLibrary]
  );

  return {
    subTermsList,
    DEFAULT_TERMS_LIBRARY_ID,
    addSubTerms,
    delSubTerms,
    toggleSubTerms,
    syncOne,
  };
}

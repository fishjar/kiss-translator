import {
  STOKEY_TERMS,
  KV_TERMS_KEY,
  DEFAULT_TERMS,
  normalizeTermsData,
  normalizeLibraryOrder,
  makeLibraryId,
  DEFAULT_TERMS_LIBRARY_ID,
} from "../config";
import { useCallback, useMemo } from "react";
import { useStorage } from "./Storage";

/**
 * 术语库（多库模型，参与云同步）。
 *
 * 结构：`{ _v: 2, libraries: [{ id, name, description, enabled, terms, source, sortOrder }] }`
 *
 * 核心语义（人类已确认）：
 * - 数组顺序即**加载顺序**，靠前者优先级高（"前覆盖后"）
 * - 默认库（id = "default"）不可删、不可拖，序号恒为 0
 * - 每库有独立开关；关闭的库完全不参与合成
 * - 新建库/新订阅**统一追加到末尾**（不悄悄改变用户现有翻译结果）
 * - 库允许同名（库是容器，冲突只在术语条目层）
 *
 * 订阅库的**正文**不在 libraries[] 内，而在 STOKEY_TERMCACHE_PREFIX + url
 * （不参与云同步）；此处只维护元信息。
 *
 * 与 useFavWords 同构：读写走 useStorage，持久化与同步由页面控制器承担。
 */
export function useTerms() {
  const { data, save, isLoading } = useStorage(
    STOKEY_TERMS,
    DEFAULT_TERMS,
    KV_TERMS_KEY
  );

  // 读取时归一化：结构缺失/类型错误/默认库丢失都不崩溃（storage.getTerms 同款兜底）
  const libraries = useMemo(
    () => normalizeTermsData(data).libraries,
    [data]
  );

  /** 用变换函数更新整个库列表（自动归一化顺序） */
  const updateLibraries = useCallback(
    (updater) =>
      save((prev) => {
        const current = normalizeTermsData(prev).libraries;
        const next = typeof updater === "function" ? updater(current) : updater;
        return { _v: 2, libraries: normalizeLibraryOrder(next || []) };
      }),
    [save]
  );

  /** 新增一个自定义库（追加末尾） */
  const addLibrary = useCallback(
    ({ name = "", description = "" } = {}) => {
      const id = makeLibraryId(); // 无 url → 随机 id
      return updateLibraries((list) => [
        ...list,
        {
          id,
          name,
          description,
          enabled: true,
          terms: "",
          source: { type: "custom" },
          sortOrder: list.length,
        },
      ]).then(() => id);
    },
    [updateLibraries]
  );

  /** 删除库。默认库不可删（静默忽略，与 UI 隐藏删除按钮双重保险） */
  const removeLibrary = useCallback(
    (id) => {
      if (id === DEFAULT_TERMS_LIBRARY_ID) return Promise.resolve();
      return updateLibraries((list) => list.filter((lib) => lib.id !== id));
    },
    [updateLibraries]
  );

  /** 更新库的元信息（名字/简介/开关/正文） */
  const updateLibrary = useCallback(
    (id, patch) =>
      updateLibraries((list) =>
        list.map((lib) => (lib.id === id ? { ...lib, ...patch } : lib))
      ),
    [updateLibraries]
  );

  /** 覆写某库正文 */
  const setLibraryTerms = useCallback(
    (id, text) =>
      updateLibrary(id, { terms: typeof text === "string" ? text : "" }),
    [updateLibrary]
  );

  /** 追加术语到某库（导入时用）：与已有内容合并，换行分隔 */
  const appendLibraryTerms = useCallback(
    (id, text) => {
      const incoming = typeof text === "string" ? text.trim() : "";
      if (!incoming) return Promise.resolve();
      return updateLibraries((list) =>
        list.map((lib) => {
          if (lib.id !== id) return lib;
          const current = typeof lib.terms === "string" ? lib.terms.trim() : "";
          return { ...lib, terms: current ? `${current}\n${incoming}` : incoming };
        })
      );
    },
    [updateLibraries]
  );

  /**
   * 拖拽重排：把 fromId 移到 toId 的位置，其余顺次位移。
   *
   * 复用 hooks/Api.js 的 reorderApis 同款三步（splice 抽 → splice 插 → 归一化），
   * 保证与"翻译接口"列表的交互手感一致。
   * 默认库不可拖：若 from 是默认库则忽略。
   */
  const reorderLibraries = useCallback(
    (fromId, toId) => {
      if (!fromId || !toId || fromId === toId) return Promise.resolve();
      if (fromId === DEFAULT_TERMS_LIBRARY_ID) return Promise.resolve();
      return updateLibraries((list) => {
        const fromIndex = list.findIndex((lib) => lib.id === fromId);
        // 默认库恒在首位，故"拖到默认库之前"无意义，钳到 1
        let toIndex = list.findIndex((lib) => lib.id === toId);
        if (fromIndex < 0 || toIndex < 0) return list;
        if (toIndex === 0) toIndex = 1;
        const next = [...list];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
    },
    [updateLibraries]
  );

  /** 上移/下移（触屏与键盘友好；默认库不可移动） */
  const moveLibrary = useCallback(
    (id, direction) =>
      updateLibraries((list) => {
        if (id === DEFAULT_TERMS_LIBRARY_ID) return list;
        const index = list.findIndex((lib) => lib.id === id);
        if (index < 0) return list;
        const target = index + direction;
        // 不允许移到默认库之前（下标 0 被默认库占据）
        if (target < 1 || target >= list.length) return list;
        const next = [...list];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      }),
    [updateLibraries]
  );

  return {
    libraries,
    updateLibraries,
    addLibrary,
    removeLibrary,
    updateLibrary,
    setLibraryTerms,
    appendLibraryTerms,
    reorderLibraries,
    moveLibrary,
    isLoading,
  };
}

import { useEffect, useState, useCallback } from "react";

/**
 * 自定义异步操作封装 Hook，管理数据、加载态及错误状态
 */
export const useAsync = () => {
  const [data, setData] = useState(null); // 执行成功返回的数据
  const [loading, setLoading] = useState(false); // 加载状态标识
  const [error, setError] = useState(null); // 错误消息

  // 触发异步执行的入口函数
  const execute = useCallback(async (fn, ...args) => {
    if (!fn) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fn(...args);
      setData(res);
      setLoading(false);
      return res;
    } catch (err) {
      setError(err?.message || "An unknown error occurred");
      setLoading(false);
      // throw err;
    }
  }, []);

  // 重置状态
  const reset = useCallback(() => {
    setData(null);
    setLoading(false);
    setError(null);
  }, []);

  return { data, loading, error, execute, reset };
};

/**
 * 立即执行异步任务的 Hook
 * @param {function} fn 异步函数
 * @param {*} arg 传入参数
 */
export const useAsyncNow = (fn, arg) => {
  const { execute, ...asyncState } = useAsync();

  // REVIEW: 此处未对竞态条件(Race Condition)进行处理。
  // 若引用的 fn 或 arg 发生快速变化，前一次执行的 execute 回调在后一次执行之后才返回，
  // 依然会触发 setData 将旧的/过期的数据覆盖最新的结果。
  // 建议增加清理标识（如 let ignore = false），在依赖变化时执行清理以忽略过期请求。
  useEffect(() => {
    if (fn) {
      execute(fn, arg);
    }
  }, [execute, fn, arg]);

  return { ...asyncState };
};

/**
 * 通用的 fetch 网络请求封装 Hook
 */
export const useFetch = () => {
  const { execute, ...asyncState } = useAsync();

  // 内部默认的请求器实现，负责处理响应 HTTP 状态及 Content-Type 识别
  const requester = useCallback(async (url, options) => {
    const response = await fetch(url, options);
    // 请求失败时抛出详细 Error
    if (!response.ok) {
      const errorInfo = await response.text();
      throw new Error(
        `Request failed: ${response.status} ${response.statusText} - ${errorInfo}`
      );
    }
    // 204 No Content 返回空
    if (response.status === 204) {
      return null;
    }

    // 自动解析 JSON
    if (response.headers.get("Content-Type")?.includes("json")) {
      return response.json();
    }

    return response.text();
  }, []);

  // GET 请求封装
  const get = useCallback(
    async (url, options = {}) => {
      try {
        const result = await execute(requester, url, {
          ...options,
          method: "GET",
        });
        return result;
      } catch (err) {
        return null;
      }
    },
    [execute, requester]
  );

  // POST 请求封装
  const post = useCallback(
    async (url, body, options = {}) => {
      try {
        const result = await execute(requester, url, {
          ...options,
          method: "POST",
          headers: { "Content-Type": "application/json", ...options.headers },
          body: JSON.stringify(body),
        });
        return result;
      } catch (err) {
        return null;
      }
    },
    [execute, requester]
  );

  // PUT 请求封装
  const put = useCallback(
    async (url, body, options = {}) => {
      try {
        const result = await execute(requester, url, {
          ...options,
          method: "PUT",
          headers: { "Content-Type": "application/json", ...options.headers },
          body: JSON.stringify(body),
        });
        return result;
      } catch (err) {
        return null;
      }
    },
    [execute, requester]
  );

  // DELETE 请求封装
  const del = useCallback(
    async (url, options = {}) => {
      try {
        const result = await execute(requester, url, {
          ...options,
          method: "DELETE",
        });
        return result;
      } catch (err) {
        return null;
      }
    },
    [execute, requester]
  );

  return {
    ...asyncState,
    get,
    post,
    put,
    del,
  };
};

/**
 * 立即对 URL 发起 GET 请求的快捷 Hook
 * @param {string} url 目标请求 URL
 */
export const useGet = (url) => {
  const { get, ...fetchState } = useFetch();

  // REVIEW: 同样没有处理竞态条件。在 url 频繁变化时，较晚返回的响应可能覆盖较早返回的最新响应。
  useEffect(() => {
    if (url) get(url);
  }, [url, get]);

  return { ...fetchState };
};

import { useEffect, useState, useCallback } from "react";

export const useAsync = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const reset = useCallback(() => {
    setData(null);
    setLoading(false);
    setError(null);
  }, []);

  return { data, loading, error, execute, reset };
};

export const useAsyncNow = (fn, arg) => {
  const { execute, ...asyncState } = useAsync();

  useEffect(() => {
    if (fn) {
      execute(fn, arg);
    }
  }, [execute, fn, arg]);

  return { ...asyncState };
};

export const useFetch = () => {
  const { execute, ...asyncState } = useAsync();

  const requester = useCallback(async (url, options) => {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorInfo = await response.text();
      throw new Error(
        `Request failed: ${response.status} ${response.statusText} - ${errorInfo}`
      );
    }
    if (response.status === 204) {
      return null;
    }

    if (response.headers.get("Content-Type")?.includes("json")) {
      return response.json();
    }

    return response.text();
  }, []);

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

export const useGet = (url) => {
  const { get, ...fetchState } = useFetch();

  useEffect(() => {
    if (url) get(url);
  }, [url, get]);

  return { ...fetchState };
};

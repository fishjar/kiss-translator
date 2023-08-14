import { useEffect, useState } from "react";

/**
 * fetch data hook
 * @returns
 */
export const useFetch = (url) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url) {
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`[${res.status}] ${res.statusText}`);
        }
        let data;
        if (res.headers.get("Content-Type")?.includes("json")) {
          data = await res.json();
        } else {
          data = await res.text();
        }
        setData(data);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [url]);

  return [data, loading, error];
};

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
    setLoading(true);
    fetch(url)
      .then((res) => {
        if (res.ok) {
          if (res.headers.get("Content-Type")?.includes("json")) {
            return res.json().then(setData);
          }
          return res.text().then(setData);
        }
        setError(`[${res.status}] ${res.statusText}`);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [url]);

  return [data, loading, error];
};

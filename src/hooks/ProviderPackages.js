import { useEffect, useState } from "react";
import {
  listProviderPackages,
  subscribeProviderPackageChanges,
} from "../providers/packageStore";

export function useProviderPackages() {
  const [packages, setPackages] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (
      typeof indexedDB === "undefined" ||
      !["chrome", "edge", "firefox"].includes(process.env.REACT_APP_CLIENT)
    )
      return;
    let alive = true;
    const refresh = () =>
      listProviderPackages()
        .then((items) => {
          if (alive) {
            setPackages(items);
            setError("");
          }
        })
        .catch((err) => {
          if (alive) setError(err.message);
        });
    refresh();
    const unsubscribe = subscribeProviderPackageChanges(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return { packages, error };
}

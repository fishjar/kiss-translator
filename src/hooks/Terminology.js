import { useEffect, useState } from "react";
import {
  readTableDirectory,
  TERMINOLOGY_INDEX,
} from "../libs/terminologyStorage";
import { subscribeStorageInvalidation } from "../libs/storageEvents";

export function useTerminologyDirectory(enabled = true) {
  const [tables, setTables] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const refresh = () =>
      readTableDirectory()
        .then((value) => {
          if (active) {
            setTables(value);
            setError("");
          }
        })
        .catch((reason) => {
          if (active) setError(String(reason));
        });
    refresh();
    const unsubscribe = subscribeStorageInvalidation(
      TERMINOLOGY_INDEX,
      refresh
    );
    window.addEventListener("kiss-terminology-changed", refresh);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("kiss-terminology-changed", refresh);
    };
  }, [enabled]);
  return { tables, error };
}

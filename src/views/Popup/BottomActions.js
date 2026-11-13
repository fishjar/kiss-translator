import { useEffect, useRef, useState } from "react";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded";
import { useI18n } from "../../hooks/I18n";
import { tryClearCaches } from "../../libs/cache";
import { logger } from "../../libs/log";

export default function BottomActions({ children }) {
  const i18n = useI18n();
  const [cacheStatus, setCacheStatus] = useState("idle");
  const pendingRef = useRef(false);
  const activeRef = useRef(true);
  const timerRef = useRef(null);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleClearCache = async () => {
    if (pendingRef.current || cacheStatus === "done") return;
    pendingRef.current = true;
    window.clearTimeout(timerRef.current);
    setCacheStatus("clearing");
    let cleared = false;
    try {
      cleared = await tryClearCaches();
    } catch (error) {
      logger.child("popup").error("clear popup cache", error);
    }
    pendingRef.current = false;
    if (!activeRef.current) return;
    setCacheStatus(cleared ? "done" : "error");
    timerRef.current = window.setTimeout(() => setCacheStatus("idle"), 2000);
  };

  return (
    <div className="kt-popup-bottom-actions">
      {children}
      <button
        type="button"
        className="kt-popup-cache-button"
        data-status={cacheStatus}
        disabled={cacheStatus === "clearing" || cacheStatus === "done"}
        onClick={() => void handleClearCache()}
      >
        {cacheStatus === "done" ? (
          <CheckRoundedIcon aria-hidden="true" />
        ) : (
          <DeleteSweepRoundedIcon aria-hidden="true" />
        )}
        {i18n(
          cacheStatus === "done"
            ? "popup_cache_cleared"
            : cacheStatus === "error"
              ? "popup_cache_failed"
              : "clear_cache"
        )}
      </button>
      <span className="kt-popup-version">v{process.env.REACT_APP_VERSION}</span>
    </div>
  );
}

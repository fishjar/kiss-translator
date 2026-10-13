import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import { runtimeHost } from "../../../localAi/runtime/runtimeHostAdapter";
import { nextRpcId } from "../../../localAi/runtime/rpc";
import { resolveModelTarget } from "../../../localAi/core/modelTarget";
import { useI18n } from "../../../hooks/I18n";

export function useRuntimeService(service, target) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    let received = false;
    const unsub = runtimeHost.onServiceState((next) => {
      if (next.service === service) {
        received = true;
        setState(next);
      }
    });
    runtimeHost
      .request({
        id: nextRpcId("status"),
        service: "runtime",
        method: "status",
        payload: {},
      })
      .then((status) => {
        if (active && !received) setState(status.sessions[service]);
      })
      .catch(() => {});
    return () => {
      active = false;
      unsub();
    };
  }, [service]);
  let selectedId;
  try {
    selectedId = resolveModelTarget(service, target).modelId;
  } catch {
    /* no selected model */
  }
  const loaded = Boolean(
    state?.modelId &&
      selectedId &&
      state.modelId === selectedId &&
      (state.state === "ready" || state.state === "idle") &&
      (!target.loadSpec?.device ||
        !state.loadSpec?.device ||
        state.loadSpec.device === target.loadSpec.device)
  );
  return {
    state,
    loaded,
    matches: Boolean(
      state?.modelId && selectedId && state.modelId === selectedId
    ),
    busy: Boolean(state?.busy),
  };
}

export function ModelStatus({
  installed,
  downloading,
  runtime,
  system = false,
}) {
  const i18n = useI18n();
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 1,
        alignItems: "center",
        ml: "auto",
      }}
    >
      {system ? (
        <Chip
          size="small"
          label={i18n("local_ai_tts_engine_system", "系统原生朗读")}
        />
      ) : (
        <>
          <Chip
            size="small"
            color={installed ? "success" : "default"}
            label={
              installed
                ? i18n("local_ai_models_state_installed", "已安装")
                : downloading
                  ? i18n("local_ai_models_state_downloading", "下载中")
                  : i18n("local_ai_models_state_not_installed", "未安装")
            }
          />
          <Chip
            size="small"
            color={runtime.loaded ? "success" : "default"}
            label={
              runtime.matches && runtime.state?.state === "unloading"
                ? i18n("local_ai_unloading", "卸载中…")
                : runtime.matches && runtime.state?.state === "loading"
                  ? i18n("local_ai_model_loading", "加载中…")
                  : runtime.loaded
                    ? `${i18n("local_ai_loaded", "已加载")}${runtime.state?.backend ? ` · ${runtime.state.backend.toUpperCase()}` : ""}`
                    : i18n("local_ai_not_loaded", "未加载")
            }
          />
        </>
      )}
    </Box>
  );
}

export function UnloadModelButton({ client, runtime, onError, cacheable = true }) {
  const i18n = useI18n();
  const [unloading, setUnloading] = useState(false);
  const [ignoreCache, setIgnoreCache] = useState(false);
  useEffect(() => {
    if (client && cacheable) client.cacheMode = ignoreCache ? "refresh" : "default";
  }, [client, ignoreCache, cacheable]);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      {cacheable && <FormControlLabel label={i18n("local_ai_ignore_cache", "忽略缓存")}
        control={<Checkbox size="small" checked={ignoreCache} disabled={runtime.busy || unloading}
          onChange={(event) => setIgnoreCache(event.target.checked)} />} />}
    <Tooltip
      title={i18n(
        "local_ai_unload_current",
        "卸载该服务当前驻留模型，保留已安装文件"
      )}
    >
      <span>
        <Button
          size="small"
          variant="outlined"
          disabled={!runtime.state?.modelId || runtime.busy || unloading}
          onClick={async () => {
            setUnloading(true);
            try {
              await client.unload();
            } catch (e) {
              onError(e instanceof Error ? e.message : String(e));
            } finally {
              setUnloading(false);
            }
          }}
        >
          {unloading
            ? i18n("local_ai_unloading", "卸载中…")
            : i18n("local_ai_unload_model", "卸载模型")}
        </Button>
      </span>
    </Tooltip>
    </Box>
  );
}

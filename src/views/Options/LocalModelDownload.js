import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { sharedModelManager as manager } from "../../localAi/core/modelManager";
import { OCR_GROUPS } from "../../localAi/core/catalog";
import { MIRROR_BASES } from "../../localAi/core/types";
import { formatBytes } from "../../localAi/core/progress";
import { runtimeHost } from "../../localAi/runtime/runtimeHostAdapter";
import { nextRpcId } from "../../localAi/runtime/rpc";
import { useI18n } from "../../hooks/I18n";

export default function LocalModelDownload({ modelRef }) {
  const i18n = useI18n();
  const [records, setRecords] = useState([]);
  const [mirror, setMirror] = useState(manager.getMirror());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const group = OCR_GROUPS.find((item) => item.id === modelRef);
  const ids = group ? [group.detId, group.recId] : [modelRef];

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active)
        setRecords(
          manager
            .list()
            .map((record) => ({ ...record, files: { ...record.files } }))
        );
    };
    const unsubscribe = manager.subscribe(refresh);
    const unsubscribeSettings = runtimeHost.onServiceState((state) => {
      if (active && state.settings) setMirror(state.settings.mirror);
    });
    Promise.all([
      manager.init().then(refresh),
      runtimeHost
        .request({
          id: nextRpcId("settings"),
          service: "runtime",
          method: "getSettings",
          payload: {},
        })
        .then((settings) => {
          if (active) setMirror(settings.mirror);
        }),
    ]).catch((e) => {
      if (active) setError(String(e));
    });
    return () => {
      active = false;
      unsubscribe();
      unsubscribeSettings();
    };
  }, []);

  const selected = ids
    .map((id) => records.find((record) => record.manifest.id === id))
    .filter(Boolean);
  const downloading = selected.some((record) =>
    ["queued", "downloading", "verifying"].includes(record.state)
  );
  const total = selected.reduce(
    (sum, record) =>
      sum + record.manifest.files.reduce((n, file) => n + file.size, 0),
    0
  );
  const downloaded = selected.reduce(
    (sum, record) =>
      sum +
      record.manifest.files.reduce(
        (n, file) => n + (record.files[file.path]?.downloaded || 0),
        0
      ),
    0
  );
  const percent = total ? Math.min(100, (downloaded / total) * 100) : 0;
  const recordError = selected.find(
    (record) => record.state === "error"
  )?.error;
  const sources = [
    ...new Set(
      selected.map((record) => record.manifest.base || MIRROR_BASES[mirror])
    ),
  ];
  const fixedSource =
    selected.length === ids.length &&
    selected.every((record) => record.manifest.base);

  const changeMirror = async (event) => {
    setBusy(true);
    setError("");
    try {
      const settings = await runtimeHost.request({
        id: nextRpcId("settings-update"),
        service: "runtime",
        method: "updateSettings",
        payload: { mirror: event.target.value },
      });
      setMirror(settings.mirror);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    setBusy(true);
    setError("");
    try {
      await Promise.all(
        ids
          .filter((id) => manager.get(id)?.state !== "installed")
          .map((id) => manager.download(id))
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="stretch">
        <TextField
          select
          fullWidth
          size="small"
          label={i18n("local_ai_models_mirror", "下载源镜像")}
          value={mirror}
          onChange={changeMirror}
          disabled={busy || downloading || fixedSource}
          sx={{ flex: 1, minWidth: 0 }}
        >
          <MenuItem value="hf-mirror">
            {i18n(
              "local_ai_models_mirror_hf_mirror",
              "HF 国内镜像 (hf-mirror.com)"
            )}
          </MenuItem>
          <MenuItem value="modelscope">ModelScope (modelscope.cn)</MenuItem>
          <MenuItem value="huggingface">
            {i18n("local_ai_models_mirror_hf", "Hugging Face (官方)")}
          </MenuItem>
        </TextField>
        <Button
          variant="outlined"
          sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
          onClick={download}
          disabled={busy || downloading || selected.length !== ids.length}
        >
          {i18n("api_local_model_download", "下载模型")}
        </Button>
      </Stack>
      <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
        {fixedSource &&
          `${i18n("api_local_model_fixed_source", "此模型使用官方固定下载源")}：`}
        {sources.join("；") || MIRROR_BASES[mirror]}
      </Typography>
      {(downloading || downloaded > 0) && (
        <>
          <LinearProgress variant="determinate" value={percent} />
          <Typography variant="caption">
            {selected.some((record) => record.state === "verifying")
              ? i18n("local_ai_models_state_verifying", "校验中")
              : downloading
                ? i18n("local_ai_models_state_downloading", "下载中")
                : i18n("local_ai_models_state_paused", "已暂停")}
            {` · ${formatBytes(downloaded)} / ${formatBytes(total)} (${Math.floor(percent)}%)`}
          </Typography>
        </>
      )}
      {(error || recordError) && (
        <Alert severity="error">{error || recordError}</Alert>
      )}
    </Stack>
  );
}

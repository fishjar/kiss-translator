import { useEffect, useState } from "react";
import { Alert, Button } from "@mui/material";
import localModelTasks from "../config/localModelTasks.json";
import { openOptionsPage } from "../libs/navigation";

/** File translation supplies the extension's model context, never the web page's OPFS. */
export default function LocalServiceNotice({
  apis = [],
  models,
  i18n,
  onDownload = () => openOptionsPage("/local-ai"),
  sx,
}) {
  const [records, setRecords] = useState(null);
  const hasLocal = apis.some((api) => api?.apiType === "LocalAI");
  useEffect(() => {
    if (!hasLocal || models !== undefined) return;
    let active = true;
    let unsubscribe;
    import("../localAi/core/modelManager")
      .then(async ({ sharedModelManager: manager }) => {
        if (!active) return;
        const refresh = () => {
          if (active)
            setRecords(
              manager.list().map((record) => ({
                id: record.manifest.id,
                state: record.state,
              }))
            );
        };
        unsubscribe = manager.subscribe(refresh);
        await manager.init();
        refresh();
      })
      .catch(() => {
        if (active) setRecords(null);
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [hasLocal, models]);

  const available = models === undefined ? records : models;
  if (!hasLocal || !available) return null;
  const installed = new Set(
    available
      .filter((model) => model.state === "installed")
      .map((model) => model.id)
  );
  const missing = apis.filter((api) => {
    if (api?.apiType !== "LocalAI") return false;
    const group = localModelTasks.ocrGroups.find(
      (item) => item.id === api.modelRef
    );
    return !(group ? [group.detId, group.recId] : [api.modelRef]).every((id) =>
      installed.has(id)
    );
  });
  if (!missing.length) return null;
  return (
    <Alert
      severity="warning"
      sx={sx}
      action={
        <Button color="inherit" size="small" onClick={onDownload}>
          {i18n("api_local_model_download", "下载模型")}
        </Button>
      }
    >
      {[...new Set(missing.map((api) => api.apiName || api.apiSlug))].join(
        "、"
      )}
      {"："}
      {i18n(
        "api_local_model_required",
        "本地模型未下载或下载不完整，下载完成后才能使用。"
      )}
    </Alert>
  );
}

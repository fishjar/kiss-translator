import { Alert, Button } from "@mui/material";
import localModelTasks from "../config/localModelTasks.json";

/** File translation supplies the extension's model context, never the web page's OPFS. */
export default function LocalServiceNotice({
  apis = [],
  models,
  i18n,
  onDownload,
  sx,
}) {
  const hasLocal = apis.some((api) => api?.apiType === "LocalAI");
  const available = models;
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

import { useEffect, useState } from "react";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { useI18n } from "../../hooks/I18n";

export default function LocalModelSelect({ value, onChange }) {
  const [models, setModels] = useState([]);
  const i18n = useI18n();

  useEffect(() => {
    let active = true;
    import("../../localAi/fileOperations")
      .then(({ installedLlmModels }) => installedLlmModels())
      .then((items) => {
        if (active) setModels(items);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <TextField
      select
      fullWidth
      size="small"
      label={i18n("api_local_model", "本地模型")}
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      helperText={i18n(
        "api_local_model_helper",
        "仅列出本机已安装的 LLM；跨设备保留原引用"
      )}
    >
      <MenuItem value="">{i18n("api_local_model_select", "选择已安装模型")}</MenuItem>
      {models.map((id) => (
        <MenuItem key={id} value={id}>
          {id}
        </MenuItem>
      ))}
      {value && !models.includes(value) && (
        <MenuItem value={value}>
          {value}（{i18n("api_local_model_not_installed", "本机未安装")}）
        </MenuItem>
      )}
    </TextField>
  );
}

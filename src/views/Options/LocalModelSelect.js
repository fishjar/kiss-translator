import { useEffect, useState } from "react";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ListSubheader from "@mui/material/ListSubheader";
import { useI18n } from "../../hooks/I18n";
import { getModelDisplayName } from "../../localAi/core/catalog";

export default function LocalModelSelect({
  value,
  onChange,
  capabilities = ["translation"],
}) {
  const [groups, setGroups] = useState([]);
  const i18n = useI18n();

  const capsKey = Array.isArray(capabilities) ? capabilities.join(",") : "";

  useEffect(() => {
    let active = true;
    const caps = capsKey ? capsKey.split(",") : ["translation"];
    import("../../localAi/fileOperations")
      .then(({ installedModelsForCapabilities }) =>
        installedModelsForCapabilities(caps)
      )
      .then((items) => {
        if (active) setGroups(items || []);
      })
      .catch(() => {
        if (active) setGroups([]);
      });
    return () => {
      active = false;
    };
  }, [capsKey]);

  const allItems = groups.flatMap((g) => g.items);
  const installedIds = allItems.map((m) => m.id);

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
        "仅列出本机已安装并匹配所选能力的模型；跨设备保留原引用"
      )}
    >
      <MenuItem value="">
        {i18n("api_local_model_select", "选择已安装模型")}
      </MenuItem>

      {groups.length === 0 && (
        <MenuItem value="" disabled>
          {i18n(
            "api_local_model_none",
            "暂无匹配能力的已安装模型（请先在本地 AI 中下载）"
          )}
        </MenuItem>
      )}

      {groups.length === 1 &&
        groups[0].items.map((m) => (
          <MenuItem key={m.id} value={m.id}>
            {getModelDisplayName(m, i18n) || m.id}
          </MenuItem>
        ))}

      {groups.length > 1 &&
        groups.flatMap((group) => [
          <ListSubheader
            key={`header-${group.category}`}
            sx={{ lineHeight: "36px", fontWeight: 700 }}
          >
            {i18n(`local_ai_group_${group.category}`, group.title)}
          </ListSubheader>,
          ...group.items.map((m) => (
            <MenuItem key={m.id} value={m.id} sx={{ pl: 3 }}>
              {getModelDisplayName(m, i18n) || m.id}
            </MenuItem>
          )),
        ])}

      {value && !installedIds.includes(value) && (
        <MenuItem value={value}>
          {value}（{i18n("api_local_model_not_installed", "本机未安装")}）
        </MenuItem>
      )}
    </TextField>
  );
}

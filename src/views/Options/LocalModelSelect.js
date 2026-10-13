import { lazy, Suspense, useEffect, useState } from "react";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ListSubheader from "@mui/material/ListSubheader";
import { useI18n } from "../../hooks/I18n";
import { getModelDisplayName } from "../../localAi/core/catalog";
const LocalModelDownload = lazy(() => import("./LocalModelDownload"));

export default function LocalModelSelect({ value, onChange }) {
  const [groups, setGroups] = useState([]);
  const i18n = useI18n();

  useEffect(() => {
    let active = true;
    let unsubscribe;
    Promise.all([
      import("../../localAi/fileOperations"),
      import("../../localAi/core/modelManager"),
    ])
      .then(
        async ([{ serviceModelOptions }, { sharedModelManager: manager }]) => {
          const refresh = async () => {
            const items = await serviceModelOptions();
            if (active) setGroups(items || []);
          };
          const states = new Map();
          if (!active) return;
          unsubscribe = manager.subscribe((id, record) => {
            if (states.get(id) === record.state) return;
            states.set(id, record.state);
            void refresh().catch(() => {});
          });
          await refresh();
        }
      )
      .catch(() => {
        if (active) setGroups([]);
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const allItems = groups.flatMap((g) => g.items);
  const catalogIds = allItems.map((m) => m.id);
  const selected = allItems.find((m) => m.id === value);
  const missing = selected?.installed === false;
  const description = (m) =>
    [
      ...(m.installed === false
        ? [i18n("api_local_model_not_downloaded", "未下载或下载未完成")]
        : []),
      ...(m.unavailableReasons || []),
    ].join("；");

  return (
    <>
      <TextField
        select
        fullWidth
        size="small"
        label={i18n("api_local_model", "本地模型")}
        value={value || ""}
        error={missing}
        onChange={(event) => {
          const next = event.target.value;
          if (
            !next ||
            allItems.some(
              (item) => item.id === next && !item.unavailableReasons?.length
            )
          )
            onChange(next);
        }}
        helperText={i18n(
          "api_local_model_helper",
          "未下载的模型可选择并保存；下载完成后才能使用"
        )}
      >
        <MenuItem value="">
          {i18n("api_local_model_select", "选择本地模型")}
        </MenuItem>

        {groups.length === 0 && (
          <MenuItem value="" disabled>
            {i18n(
              "api_local_model_none",
              "模型目录暂不可用，请重新打开或到本地 AI 页面检查"
            )}
          </MenuItem>
        )}

        {groups.length === 1 &&
          groups[0].items.map((m) => (
            <MenuItem
              key={m.id}
              value={m.id}
              disabled={Boolean(m.unavailableReasons?.length)}
              sx={{ whiteSpace: "normal" }}
            >
              {getModelDisplayName(m, i18n) || m.id}
              {description(m) ? `（${description(m)}）` : ""}
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
              <MenuItem
                key={m.id}
                value={m.id}
                sx={{ pl: 3, whiteSpace: "normal" }}
                disabled={Boolean(m.unavailableReasons?.length)}
              >
                {getModelDisplayName(m, i18n) || m.id}
                {description(m) ? `（${description(m)}）` : ""}
              </MenuItem>
            )),
          ])}

        {value && !catalogIds.includes(value) && (
          <MenuItem value={value} disabled>
            {value}（{i18n("api_local_model_unknown", "模型不在当前目录中")}）
          </MenuItem>
        )}
      </TextField>
      {missing && (
        <Suspense fallback={null}>
          <LocalModelDownload key={value} modelRef={value} />
        </Suspense>
      )}
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Card,
  CardContent,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { runtimeHost } from "../../../localAi/runtime/runtimeHostAdapter";
import { nextRpcId } from "../../../localAi/runtime/rpc";
import { useI18n } from "../../../hooks/I18n";
import { DEFAULT_SETTINGS } from "../../../localAi/core/types";

const inputFields = [
  ["maxImageFileMB", "图片文件大小上限（MB）", "超出上限的图片文件将被拒绝。"],
  [
    "maxImageEdge",
    "图片最长边（像素）",
    "超出时等比例缩小图片，保留完整内容。",
  ],
  ["maxAudioFileMB", "音频文件大小上限（MB）", "超出上限的音频文件将被拒绝。"],
  [
    "maxAsrMinutes",
    "ASR 音频时长上限（分钟）",
    "超出时仅识别音频开头部分，适用于上传、录音及其他调用。",
  ],
  [
    "maxTtsCharacters",
    "TTS 文字上限（字符）",
    "超出时仅合成开头部分；不限制系统原生朗读。",
  ],
];

export default function SettingsTab() {
  const i18n = useI18n();
  const [settings, setSettings] = useState(null);
  const [minutes, setMinutes] = useState("10");
  const [budget, setBudget] = useState("0");
  const [budgetInvalid, setBudgetInvalid] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inputValues, setInputValues] = useState({});
  const [inputErrors, setInputErrors] = useState({});
  const pending = useRef(false);
  const applySettings = useCallback((next) => {
    setSettings(next);
    setMinutes(String(next.autoUnloadMinutes));
    setBudget(String(next.residentMemoryBudgetMB ?? 0));
    setInputValues(
      Object.fromEntries(
        inputFields.map(([key]) => [
          key,
          String(next[key] ?? DEFAULT_SETTINGS[key]),
        ])
      )
    );
  }, []);
  useEffect(() => {
    let active = true;
    let received = false;
    const apply = (next) => {
      if (active) {
        applySettings(next);
      }
    };
    const unsub = runtimeHost.onServiceState((state) => {
      if (state.settings) {
        received = true;
        apply(state.settings);
      }
    });
    runtimeHost
      .request({
        id: nextRpcId("settings"),
        service: "runtime",
        method: "getSettings",
        payload: {},
      })
      .then((next) => {
        if (!received) apply(next);
      })
      .catch((e) => active && setError(String(e)));
    return () => {
      active = false;
      unsub();
    };
  }, [applySettings]);
  const save = async (patch) => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const next = await runtimeHost.request({
        id: nextRpcId("settings-update"),
        service: "runtime",
        method: "updateSettings",
        payload: patch,
      });
      applySettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  const saveMinutes = () => {
    const value = Number(minutes);
    const bad = !minutes.trim() || !Number.isSafeInteger(value) || value < 0;
    setInvalid(bad);
    if (!bad && settings && value !== settings.autoUnloadMinutes)
      void save({ autoUnloadMinutes: value });
  };
  const saveInput = (key) => {
    const raw = inputValues[key] ?? "";
    const value = Number(raw);
    const bad = !raw.trim() || !Number.isSafeInteger(value) || value <= 0;
    setInputErrors((prev) => ({ ...prev, [key]: bad }));
    if (!bad && settings && value !== settings[key])
      void save({ [key]: value });
  };
  const saveBudget = () => {
    const value = Number(budget);
    const bad = !budget.trim() || !Number.isSafeInteger(value) || value < 0;
    setBudgetInvalid(bad);
    if (!bad && settings && value !== settings.residentMemoryBudgetMB)
      void save({ residentMemoryBudgetMB: value });
  };
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={600}>
            {i18n("local_ai_runtime_settings", "运行时设置")}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={i18n(
              "local_ai_auto_unload_minutes",
              "自动卸载模型时间（分钟）"
            )}
            type="number"
            value={minutes}
            inputProps={{ min: 0, step: 1 }}
            disabled={!settings || saving}
            error={invalid}
            onChange={(e) => {
              setMinutes(e.target.value);
              setInvalid(false);
            }}
            onBlur={saveMinutes}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveMinutes();
              }
            }}
            helperText={
              invalid
                ? i18n("local_ai_minutes_invalid", "请输入非负整数")
                : i18n(
                    "local_ai_auto_unload_help",
                    "模型闲置超过设定时间后自动卸载，保留已安装文件；设为 0 可关闭。"
                  )
            }
          />
          <Stack spacing={0.5}>
            <TextField
              label={i18n("local_ai_memory_budget", "模型驻留预算（估算 MB）")}
              type="number"
              value={budget}
              inputProps={{
                min: 0,
                step: 1,
                "data-limit": "residentMemoryBudgetMB",
              }}
              disabled={!settings || saving}
              error={budgetInvalid}
              onChange={(e) => {
                setBudget(e.target.value);
                setBudgetInvalid(false);
              }}
              onBlur={saveBudget}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveBudget();
                }
              }}
              helperText={
                budgetInvalid
                  ? i18n("local_ai_minutes_invalid", "请输入非负整数")
                  : i18n(
                      "local_ai_memory_budget_help",
                      "0 表示不限制估算预算。按权重两倍加 256 MB 估算，并非实际内存或显存；预算不足时卸载空闲模型。"
                    )
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings?.exclusiveResourceMode ?? false}
                  disabled={!settings || saving}
                  onChange={(_, checked) =>
                    void save({ exclusiveResourceMode: checked })
                  }
                />
              }
              label={i18n("local_ai_exclusive_mode", "独享资源模式")}
            />
            <Typography variant="body2" color="text.secondary">
              {i18n(
                "local_ai_exclusive_help",
                "减少内存和显存占用；切换功能时需要重新加载模型，等待时间更长。JEV 不受此模式限制。"
              )}
            </Typography>
          </Stack>
          <Typography variant="subtitle1" fontWeight={600}>
            {i18n(
              "local_ai_input_limits",
              "输入限制（适用于所有本地 AI 调用）"
            )}
          </Typography>
          {inputFields.map(([key, label, help]) => (
            <TextField
              key={key}
              label={i18n(`local_ai_${key}`, label)}
              type="number"
              value={inputValues[key] ?? String(DEFAULT_SETTINGS[key])}
              inputProps={{ min: 1, step: 1, "data-limit": key }}
              disabled={!settings || saving}
              error={!!inputErrors[key]}
              onChange={(e) => {
                setInputValues((prev) => ({ ...prev, [key]: e.target.value }));
                setInputErrors((prev) => ({ ...prev, [key]: false }));
              }}
              onBlur={() => saveInput(key)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveInput(key);
                }
              }}
              helperText={
                inputErrors[key]
                  ? i18n(
                      "local_ai_positive_integer",
                      "请输入正整数（不能为 0）"
                    )
                  : i18n(`local_ai_${key}_help`, help)
              }
            />
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

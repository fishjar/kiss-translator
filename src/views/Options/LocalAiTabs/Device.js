import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import { detectDevice } from "../../../localAi/core/deviceManager";
import {
  isModelRunnable,
  pickBackend,
} from "../../../localAi/core/backendScheduler";
import { CATALOG } from "../../../localAi/core/catalog";
import { formatBytes } from "../../../localAi/core/progress";
import { useI18n } from "../../../hooks/I18n";

function FeatureRow({ ok, label, detail, badgeText }) {
  const i18n = useI18n();
  const isStatus = badgeText !== "CPU" && badgeText !== "ENV";
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        py: 1,
        borderBottom: "1px solid",
        borderColor: "divider",
        "&:last-child": { borderBottom: "none" },
      }}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1, mr: 2 }}
      >
        <Chip
          size="small"
          icon={
            isStatus ? (
              ok ? (
                <CheckCircleRoundedIcon />
              ) : (
                <CancelRoundedIcon />
              )
            ) : undefined
          }
          label={
            badgeText ||
            (ok
              ? i18n("local_ai_device_supported", "支持")
              : i18n("local_ai_device_unsupported", "不支持"))
          }
          color={!isStatus ? "default" : ok ? "success" : "error"}
          variant="outlined"
          sx={{
            width: 82,
            minWidth: 82,
            justifyContent: isStatus ? "flex-start" : "center",
            fontWeight: 500,
            "& .MuiChip-icon": {
              ml: "6px",
              mr: 0,
            },
            "& .MuiChip-label": isStatus
              ? { pl: "4px", pr: "6px" }
              : { px: "6px" },
          }}
        />
        <Typography variant="body2" fontWeight={600}>
          {label}
        </Typography>
      </Box>
      {detail && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textAlign: "right", wordBreak: "break-all" }}
        >
          {detail}
        </Typography>
      )}
    </Box>
  );
}

export default function DeviceTab() {
  const i18n = useI18n();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const detect = () => {
    setLoading(true);
    setError(null);
    detectDevice()
      .then(setProfile)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    detect();
  }, []);

  return (
    <Stack spacing={2.5}>
      <Card variant="outlined">
        <CardContent sx={{ pb: "16px !important" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 2,
            }}
          >
            <Typography variant="h6" fontWeight={600}>
              {i18n("local_ai_device_detect", "设备检测")}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshRoundedIcon />}
              onClick={detect}
              disabled={loading}
            >
              {loading
                ? i18n("local_ai_device_detecting", "检测中…")
                : i18n("local_ai_device_redetect", "重新检测")}
            </Button>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {i18n("local_ai_device_detect_failed", "检测失败")}：{error}
            </Alert>
          )}

          {profile && (
            <Box>
              <FeatureRow
                ok={profile.webgpu}
                label="WebGPU"
                detail={
                  profile.webgpu ? profile.webgpuAdapter : profile.webgpuError
                }
                badgeText={
                  profile.webgpu
                    ? i18n("local_ai_device_supported", "支持")
                    : i18n("local_ai_device_unsupported", "不支持")
                }
              />
              {profile.webgpu && (
                <FeatureRow
                  ok={Boolean(profile.webgpuShaderF16)}
                  label={i18n(
                    "local_ai_device_shader_f16",
                    "WebGPU shader-f16"
                  )}
                  detail={
                    profile.webgpuShaderF16
                      ? i18n(
                          "local_ai_device_shader_f16_ok",
                          "支持 FP16 着色器（wllama / q4f16 ONNX 可启用 GPU 加速）"
                        )
                      : i18n(
                          "local_ai_device_shader_f16_fallback",
                          "当前显卡不支持 shader-f16（将自动回退 WASM CPU）"
                        )
                  }
                  badgeText={
                    profile.webgpuShaderF16
                      ? i18n("local_ai_device_supported", "支持")
                      : i18n("local_ai_device_unsupported", "不支持")
                  }
                />
              )}
              {profile.maxBufferSize && (
                <Box
                  sx={{
                    py: 0.75,
                    px: 1,
                    bgcolor: "action.hover",
                    borderRadius: 1,
                    my: 0.5,
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    maxBufferSize {formatBytes(profile.maxBufferSize)}
                    {profile.maxStorageBufferBindingSize &&
                      ` · maxStorageBufferBindingSize ${formatBytes(profile.maxStorageBufferBindingSize)}`}
                  </Typography>
                </Box>
              )}
              <FeatureRow
                ok={profile.wasmSimd}
                label="WASM SIMD"
                detail={profile.wasmSimdError}
                badgeText={
                  profile.wasmSimd
                    ? i18n("local_ai_device_supported", "支持")
                    : i18n("local_ai_device_unsupported", "不支持")
                }
              />
              <FeatureRow
                ok={profile.sharedArrayBuffer}
                label="SharedArrayBuffer"
                badgeText={
                  profile.sharedArrayBuffer
                    ? i18n("local_ai_device_supported", "支持")
                    : i18n("local_ai_device_unsupported", "不支持")
                }
              />
              <FeatureRow
                ok={profile.webnn}
                label="WebNN"
                badgeText={
                  profile.webnn
                    ? i18n("local_ai_device_supported", "支持")
                    : i18n("local_ai_device_unsupported", "不支持")
                }
              />
              <FeatureRow
                ok={typeof profile.deviceMemoryGB === "number"}
                label={i18n("local_ai_device_memory", "内存 (deviceMemory)")}
                detail={
                  profile.deviceMemoryGB
                    ? i18n(
                        "local_ai_device_memory_approx",
                        "≈ {0} GB（浏览器粗粒度上限）"
                      ).replace("{0}", profile.deviceMemoryGB)
                    : i18n("local_ai_device_memory_hidden", "当前浏览器不暴露")
                }
                badgeText={
                  typeof profile.deviceMemoryGB === "number"
                    ? i18n("local_ai_device_supported", "支持")
                    : i18n("local_ai_device_unsupported", "不支持")
                }
              />
              <FeatureRow
                ok={Boolean(profile.cpuCores)}
                label={i18n("local_ai_device_cpu", "CPU 核心")}
                detail={
                  profile.cpuCores
                    ? i18n("local_ai_device_cores", "{0} 核").replace(
                        "{0}",
                        profile.cpuCores
                      )
                    : i18n("local_ai_device_unknown", "未知")
                }
                badgeText="CPU"
              />
              <FeatureRow
                ok={true}
                label={i18n("local_ai_device_env", "运行环境")}
                detail={`${profile.browser} · ${profile.platform}`}
                badgeText="ENV"
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {profile && (
        <Card variant="outlined">
          <CardContent sx={{ pb: "16px !important" }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              {i18n("local_ai_device_rec_backend", "推荐后端")}
            </Typography>
            <Grid container spacing={1.5}>
              {CATALOG.map((m) => {
                const runnable = isModelRunnable(profile, m);
                const backend = runnable
                  ? pickBackend(profile, m)
                  : i18n("local_ai_device_no_backend", "无可用后端");
                return (
                  <Grid item xs={12} sm={6} key={m.id}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 1.5,
                        border: "1px solid",
                        borderColor: "divider",
                        bgcolor: "background.paper",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {m.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          → {backend}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={
                          runnable
                            ? i18n("local_ai_device_runnable", "可运行")
                            : i18n("local_ai_device_not_runnable", "不可运行")
                        }
                        color={runnable ? "success" : "default"}
                        variant={runnable ? "filled" : "outlined"}
                      />
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

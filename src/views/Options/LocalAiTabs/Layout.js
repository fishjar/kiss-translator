import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Slider from "@mui/material/Slider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import LinearProgress from "@mui/material/LinearProgress";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";

import { validateInputFile } from "../../../localAi/core/inputFiles";
import {
  ModelStatus,
  UnloadModelButton,
  useRuntimeService,
} from "./RuntimeControls";
import { sharedModelManager as manager } from "../../../localAi/core/modelManager";
import { DocClient } from "../../../localAi/core/docClient";
import {
  CATALOG,
  DOC_MODEL_ID,
  getModelDisplayName,
} from "../../../localAi/core/catalog";
import { useI18n } from "../../../hooks/I18n";
import LogViewer, { useLocalAiLog } from "./LogViewer";

const DOC_MODELS = CATALOG.filter(
  (m) => m.task === "doc-layout" || m.id === DOC_MODEL_ID
);

// 版面区域标签的中文名称与主题颜色
const REGION_TYPE_CONFIG = {
  text: { labelZh: "段落正文", color: "#1976d2", bg: "rgba(25, 118, 210, 0.12)" },
  paragraph: {
    labelZh: "段落",
    color: "#1976d2",
    bg: "rgba(25, 118, 210, 0.12)",
  },
  title: { labelZh: "标题", color: "#7b1fa2", bg: "rgba(123, 31, 162, 0.12)" },
  figure: { labelZh: "图片", color: "#e65100", bg: "rgba(230, 81, 0, 0.12)" },
  table: { labelZh: "表格", color: "#2e7d32", bg: "rgba(46, 125, 50, 0.12)" },
  equation: {
    labelZh: "公式",
    color: "#00838f",
    bg: "rgba(0, 131, 143, 0.12)",
  },
  header: { labelZh: "页眉", color: "#616161", bg: "rgba(97, 97, 97, 0.12)" },
  footer: { labelZh: "页脚", color: "#616161", bg: "rgba(97, 97, 97, 0.12)" },
  reference: {
    labelZh: "参考文献",
    color: "#455a64",
    bg: "rgba(69, 90, 100, 0.12)",
  },
  code: { labelZh: "代码块", color: "#c2185b", bg: "rgba(194, 24, 91, 0.12)" },
  list: { labelZh: "列表", color: "#0288d1", bg: "rgba(2, 136, 209, 0.12)" },
};

function getRegionStyle(label) {
  const key = (label || "").toLowerCase();
  return (
    REGION_TYPE_CONFIG[key] || {
      labelZh: label,
      color: "#0288d1",
      bg: "rgba(2, 136, 209, 0.12)",
    }
  );
}

export default function LayoutTab() {
  const i18n = useI18n();
  const { logs, addLog, clearLogs } = useLocalAiLog();

  // 模型与运行环境配置
  const [selectedId, setSelectedId] = useState(DOC_MODEL_ID);
  const [device, setDevice] = useState("wasm");
  const [recs, setRecs] = useState({});
  const [clientState, setClientState] = useState("idle");
  const [progressText, setProgressText] = useState("");

  // 图像与识别结果
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [hoveredRegionId, setHoveredRegionId] = useState(null);

  // 显示与过滤控制
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [showBoxes, setShowBoxes] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef(null);
  const clientRef = useRef(new DocClient());
  const selectionRef = useRef(0);

  const modelTarget = useMemo(
    () => ({ modelRef: selectedId, loadSpec: { device } }),
    [selectedId, device]
  );
  const runtime = useRuntimeService("doc", modelTarget);
  const isLoaded = runtime.loaded;

  const rec = recs[selectedId] ?? null;
  const modelInstalled = rec?.state === "installed";
  const modelBusy =
    rec?.state === "downloading" ||
    rec?.state === "queued" ||
    rec?.state === "verifying";

  useEffect(() => {
    const c = clientRef.current;
    c.onProgress = (status) => {
      setProgressText(status);
      addLog(status);
    };
    c.onStateChange = (ready, reason) => {
      if (!ready) {
        setClientState("idle");
        if (reason) {
          if (!reason.includes("已卸载") && !reason.includes("闲置超时")) {
            setError(reason);
          }
          addLog(reason, "warn");
        }
      }
    };

    const unsub = manager.subscribe((id, r) => {
      if (id === DOC_MODEL_ID) {
        setRecs((prev) => ({ ...prev, [id]: { ...r } }));
      }
    });

    void manager.init().then(() => {
      const r = manager.get(DOC_MODEL_ID);
      if (r) setRecs((prev) => ({ ...prev, [DOC_MODEL_ID]: { ...r } }));
    });

    return () => {
      unsub();
      c.stop();
    };
  }, [addLog]);

  useEffect(() => {
    setResult(null);
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const loadModel = async () => {
    setError(null);
    setClientState("loading");
    setProgressText(i18n("local_ai_model_loading", "启动推理引擎…"));
    addLog(`开始加载 DOC 版面分析模型: ${selectedId} (${device.toUpperCase()})`);
    try {
      await clientRef.current.load({ device }, modelTarget);
      setClientState("ready");
      setProgressText("");
      addLog(
        `DOC 版面分析模型加载就绪 (${device.toUpperCase()})`,
        "success"
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setClientState("idle");
      setError(msg);
      addLog(`DOC 模型加载失败: ${msg}`, "error");
    }
  };

  const runAnalyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    addLog(
      `开始分析文档图像: ${file.name} (${Math.round(file.size / 1024)} KB)…`
    );
    try {
      const out = await clientRef.current.analyze(file, {
        modelId: selectedId,
        device,
      });
      setResult(out);
      addLog(
        `版面分析完成: 检出 ${out.regions.length} 个区域，耗时 ${Math.round(out.elapsedMs)} ms`,
        "success"
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("REQUEST_CANCELLED")) {
        setError(msg);
        addLog(`版面分析失败: ${msg}`, "error");
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const stopAnalyze = () => {
    clientRef.current.stop();
    setAnalyzing(false);
    addLog("已手动停止版面分析", "warn");
  };

  // 根据置信度阈值过滤检测区域
  const filteredRegions = useMemo(() => {
    if (!result?.regions) return [];
    return result.regions.filter((r) => r.score >= confidenceThreshold);
  }, [result, confidenceThreshold]);

  // 汇总统计各类别的检测数量
  const categoryStats = useMemo(() => {
    const map = {};
    for (const r of filteredRegions) {
      const label = r.label || "unknown";
      map[label] = (map[label] || 0) + 1;
    }
    return Object.entries(map);
  }, [filteredRegions]);

  const copyJson = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Stack spacing={2.5}>
      {/* 卡片 1: 模型与运行时控制 */}
      <Card variant="outlined">
        <CardContent sx={{ pb: "16px !important" }}>
          <Box sx={{ mb: 2 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 1,
                width: "100%",
              }}
            >
              <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
                {i18n("local_ai_doc_title", "本地文档版面分析 (PP-DocLayout)")}
              </Typography>
              <ModelStatus
                installed={modelInstalled}
                downloading={modelBusy}
                runtime={runtime}
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {i18n(
                "local_ai_doc_desc",
                "面向文档图像与 PDF 页面的高精度版面分析流水线，识别正文段落、标题、表格、图片、公式及阅读顺序"
              )}
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 2,
            }}
          >
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel id="doc-model-label">
                {i18n("local_ai_select_model", "选择模型")}
              </InputLabel>
              <Select
                labelId="doc-model-label"
                value={selectedId}
                label={i18n("local_ai_select_model", "选择模型")}
                onChange={(e) => setSelectedId(e.target.value)}
                disabled={clientState === "loading" || analyzing}
              >
                {DOC_MODELS.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {getModelDisplayName(m, i18n)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="doc-backend-label">
                {i18n("local_ai_backend", "计算后端")}
              </InputLabel>
              <Select
                labelId="doc-backend-label"
                value={device}
                label={i18n("local_ai_backend", "计算后端")}
                onChange={(e) => setDevice(e.target.value)}
                disabled={clientState === "loading" || analyzing}
              >
                <MenuItem value="wasm">
                  {i18n("compute_device_wasm", "WASM (CPU)")}
                </MenuItem>
              </Select>
            </FormControl>

            <Button
              variant="contained"
              size="small"
              disabled={
                runtime.busy ||
                !modelInstalled ||
                clientState === "loading" ||
                analyzing ||
                isLoaded
              }
              onClick={() => void loadModel()}
            >
              {clientState === "loading"
                ? i18n("local_ai_model_loading", "加载中…")
                : isLoaded
                  ? i18n("local_ai_model_loaded", "模型已就绪")
                  : i18n("local_ai_load_model", "加载模型")}
            </Button>

            <UnloadModelButton
              client={clientRef.current}
              runtime={runtime}
              onError={(err) => {
                setError(err);
                addLog(`DOC 模型卸载失败: ${err}`, "error");
              }}
            />

            {progressText && (
              <Typography variant="caption" color="text.secondary">
                {progressText}
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* 卡片 2: 文档图像与版面分析 */}
      <Card variant="outlined">
        <CardContent sx={{ pb: "16px !important" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1,
              mb: 2,
            }}
          >
            <Typography variant="h6" fontWeight={600}>
              {i18n("local_ai_doc_card_title", "文档图像与版面分析")}
            </Typography>

            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<UploadFileRoundedIcon />}
                onClick={() => fileInputRef.current?.click()}
                disabled={analyzing}
              >
                {file
                  ? i18n("local_ai_doc_change_image", "更换图片")
                  : i18n("local_ai_doc_upload_image", "选择图片")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  const sel = ++selectionRef.current;
                  if (f) {
                    void validateInputFile(f, "image")
                      .then(() => {
                        if (sel === selectionRef.current) {
                          setFile(f);
                          setError(null);
                          addLog(
                            `已选择文件: ${f.name} (${Math.round(f.size / 1024)} KB)`
                          );
                        }
                      })
                      .catch((err) => {
                        if (sel === selectionRef.current) {
                          setError(err.message);
                          addLog(`文件校验失败: ${err.message}`, "error");
                        }
                      });
                  }
                  e.target.value = "";
                }}
              />

              <Button
                variant="contained"
                size="small"
                startIcon={<PlayArrowRoundedIcon />}
                disabled={!file || runtime.busy || !modelInstalled || analyzing}
                onClick={() => void runAnalyze()}
              >
                {analyzing
                  ? i18n("local_ai_doc_analyzing", "正在分析…")
                  : i18n("local_ai_doc_run", "开始分析")}
              </Button>

              {analyzing && (
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  startIcon={<StopRoundedIcon />}
                  onClick={stopAnalyze}
                >
                  {i18n("local_ai_stop", "停止")}
                </Button>
              )}
            </Box>
          </Box>

          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              onClose={() => setError(null)}
            >
              {error}
            </Alert>
          )}

          {file && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {i18n("local_ai_doc_current_file", "当前文件")}: {file.name} (
                {Math.round(file.size / 1024)} KB)
              </Typography>
            </Box>
          )}

          {/* 辅助过滤与视图控制工具栏 */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 3,
              p: 1.5,
              mb: 2,
              bgcolor: "action.hover",
              borderRadius: 1,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                minWidth: 240,
              }}
            >
              <Typography variant="body2" color="text.secondary" noWrap>
                {i18n("local_ai_doc_threshold", "置信度阈值")}:
              </Typography>
              <Slider
                size="small"
                min={0.1}
                max={0.9}
                step={0.05}
                value={confidenceThreshold}
                onChange={(_, v) => setConfidenceThreshold(v)}
                valueLabelDisplay="auto"
                sx={{ width: 120 }}
              />
              <Typography variant="body2" fontWeight={600}>
                {confidenceThreshold.toFixed(2)}
              </Typography>
            </Box>

            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={showBoxes}
                  onChange={(e) => setShowBoxes(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2">
                  {i18n("local_ai_doc_show_boxes", "区域边框")}
                </Typography>
              }
            />

            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={showLabels}
                  onChange={(e) => setShowLabels(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2">
                  {i18n("local_ai_doc_show_labels", "类别标签")}
                </Typography>
              }
            />
          </Box>

          {analyzing && <LinearProgress sx={{ mb: 2 }} />}

          {/* 图片与多边形/矩形高亮标注区域 */}
          {previewUrl && (
            <Box
              sx={{
                position: "relative",
                maxWidth: "100%",
                overflow: "auto",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                bgcolor: "#fafafa",
                mb: 2,
              }}
            >
              <img
                src={previewUrl}
                alt="文档页面预览"
                style={{ width: "100%", display: "block" }}
              />

              {result && (
                <svg
                  viewBox={`0 0 ${result.imageSize.width} ${result.imageSize.height}`}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                  }}
                >
                  {filteredRegions.map((r) => {
                    const style = getRegionStyle(r.label);
                    const isHovered = hoveredRegionId === r.id;
                    const points = r.polygon
                      ? r.polygon.map((p) => p.join(",")).join(" ")
                      : `${r.bbox[0]},${r.bbox[1]} ${r.bbox[2]},${r.bbox[1]} ${r.bbox[2]},${r.bbox[3]} ${r.bbox[0]},${r.bbox[3]}`;
                    const labelX = r.bbox ? r.bbox[0] : 0;
                    const labelY = r.bbox ? Math.max(16, r.bbox[1]) : 16;
                    const badgeText = `${r.order != null ? `#${r.order} ` : ""}${style.labelZh} ${(r.score * 100).toFixed(0)}%`;
                    const badgeWidth = badgeText.length * 9 + 12;

                    return (
                      <g key={r.id}>
                        {showBoxes && (
                          <polygon
                            points={points}
                            fill={isHovered ? style.color : style.bg}
                            fillOpacity={isHovered ? 0.35 : 0.15}
                            stroke={style.color}
                            strokeWidth={isHovered ? 3 : 1.5}
                          />
                        )}
                        {showLabels && (
                          <g>
                            <rect
                              x={labelX}
                              y={labelY - 14}
                              width={badgeWidth}
                              height={18}
                              rx={3}
                              fill="rgba(0, 0, 0, 0.75)"
                            />
                            <text
                              x={labelX + 5}
                              y={labelY}
                              fill="#ffffff"
                              fontSize="12"
                              fontWeight="bold"
                              fontFamily="sans-serif"
                            >
                              {badgeText}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>
              )}
            </Box>
          )}

          {/* 分析结果统计与列表 */}
          {result && (
            <Stack spacing={2}>
              {/* 统计指标卡片 */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 1.5,
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                }}
              >
                <Chip
                  size="small"
                  label={`${Math.round(result.elapsedMs)} ms`}
                  color="primary"
                  variant="outlined"
                />
                <Chip
                  size="small"
                  label={`${filteredRegions.length} ${i18n("local_ai_doc_stats_regions", "个区域")}`}
                  color="success"
                />
                <Chip
                  size="small"
                  label={result.backend?.toUpperCase() || "WASM"}
                  variant="outlined"
                />

                <DividerOrientation />

                {categoryStats.map(([cat, count]) => {
                  const st = getRegionStyle(cat);
                  return (
                    <Chip
                      key={cat}
                      size="small"
                      label={`${st.labelZh} ${count}`}
                      sx={{
                        color: st.color,
                        borderColor: st.color,
                        bgcolor: st.bg,
                      }}
                      variant="outlined"
                    />
                  );
                })}
              </Box>

              {/* 按阅读顺序展示的区域列表 */}
              <Box>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                  {i18n("local_ai_doc_reading_order", "阅读顺序明细")} (
                  {filteredRegions.length})
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: 1,
                    maxHeight: 220,
                    overflowY: "auto",
                    p: 1,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                  }}
                >
                  {filteredRegions.map((r) => {
                    const st = getRegionStyle(r.label);
                    return (
                      <Box
                        key={r.id}
                        onMouseEnter={() => setHoveredRegionId(r.id)}
                        onMouseLeave={() => setHoveredRegionId(null)}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          p: 0.8,
                          borderRadius: 0.8,
                          border: "1px solid",
                          borderColor:
                            hoveredRegionId === r.id ? st.color : "divider",
                          bgcolor:
                            hoveredRegionId === r.id ? st.bg : "background.paper",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography
                            variant="caption"
                            fontWeight={700}
                            color="text.secondary"
                          >
                            #{r.order != null ? r.order : "-"}
                          </Typography>
                          <Chip
                            size="small"
                            label={st.labelZh}
                            sx={{
                              height: 20,
                              fontSize: 11,
                              color: st.color,
                              bgcolor: st.bg,
                            }}
                          />
                        </Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          fontWeight={500}
                        >
                          {(r.score * 100).toFixed(0)}%
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              {/* 原始 JSON 数据折叠面板 */}
              <Accordion variant="outlined" disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      pr: 1,
                    }}
                  >
                    <Typography variant="body2" fontWeight={500}>
                      {i18n("local_ai_doc_raw_json", "原始 JSON 数据")}
                    </Typography>
                    <Button
                      size="small"
                      startIcon={
                        copied ? (
                          <CheckRoundedIcon color="success" />
                        ) : (
                          <ContentCopyRoundedIcon />
                        )
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        copyJson();
                      }}
                    >
                      {copied
                        ? i18n("local_ai_copied", "已复制")
                        : i18n("local_ai_doc_copy_json", "复制 JSON")}
                    </Button>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 1.5, bgcolor: "#f8f9fa" }}>
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      maxHeight: 260,
                      overflow: "auto",
                      fontSize: 12,
                      fontFamily: "monospace",
                    }}
                  >
                    {JSON.stringify(result, null, 2)}
                  </Box>
                </AccordionDetails>
              </Accordion>
            </Stack>
          )}
        </CardContent>
      </Card>
      <LogViewer
        logs={logs}
        onClear={clearLogs}
      />
    </Stack>
  );
}

function DividerOrientation() {
  return (
    <Box
      sx={{
        width: "1px",
        height: 16,
        bgcolor: "divider",
        mx: 0.5,
      }}
    />
  );
}

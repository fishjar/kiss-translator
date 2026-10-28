/**
 * @file ImageTranslateContent.js
 * @description 图片翻译弹窗下方结果区域：支持【原文/译文/双语】Tab 切换、按序分段展示与单段/全文复制。
 */

import React, { useState } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Tooltip from "@mui/material/Tooltip";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";

export default function ImageTranslateContent({
  items = [],
  originalText = "",
  translatedText = "",
  busy = false,
  error = "",
  recognitionErrors = [],
  viewMode = "bilingual",
  hasRecognitionService = true,
  hasExecuted = false,
  onViewModeChange,
  onRetry,
  onRetryItem,
  actions,
  i18n = (k, d) => d || k,
}) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const handleCopyText = (text, isAll = false, index = null) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      if (isAll) {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
      } else if (index != null) {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      }
    });
  };

  const getFullCopyText = () => {
    if (viewMode === "source") {
      return items
        .map((i) => i.original || i.text)
        .filter(Boolean)
        .join("\n\n");
    }
    if (viewMode === "target") {
      return items
        .map((i) => i.translation)
        .filter(Boolean)
        .join("\n\n");
    }
    // bilingual
    return items
      .map((i) => `${i.original || i.text || ""}\n${i.translation || ""}`)
      .filter((s) => s.trim())
      .join("\n\n");
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        overflow: "hidden",
        backgroundColor: "background.default",
        borderRadius: "0 0 16px 16px",
      }}
    >
      {/* 顶部栏：Tab 切换与复制全文按钮 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 0.5,
          flexWrap: "wrap",
          px: 1.5,
          backgroundColor: "background.paper",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Tabs
            value={viewMode}
            onChange={(_e, v) => onViewModeChange?.(v)}
            size="small"
            textColor="primary"
            indicatorColor="primary"
            sx={{ minHeight: 38, "& .MuiTab-root": { minWidth: 48, px: 1 } }}
          >
            <Tab
              value="bilingual"
              label={i18n("image_tab_bilingual", "双语")}
              sx={{ minHeight: 38, py: 0.5, fontSize: "13px" }}
            />
            <Tab
              value="source"
              label={i18n("image_tab_source", "原文")}
              sx={{ minHeight: 38, py: 0.5, fontSize: "13px" }}
            />
            <Tab
              value="target"
              label={i18n("image_tab_target", "译文")}
              sx={{ minHeight: 38, py: 0.5, fontSize: "13px" }}
            />
          </Tabs>

          {items.length > 0 && (
            <Tooltip
              PopperProps={{ "data-kiss-ui": "", className: "notranslate" }}
              title={
                copiedAll
                  ? i18n("image_copied", "已复制")
                  : i18n("image_copy_all", "复制全文")
              }
            >
              <IconButton
                size="small"
                aria-label={i18n("image_copy_all", "复制全文")}
                onClick={() => handleCopyText(getFullCopyText(), true)}
              >
                {copiedAll ? (
                  <CheckRoundedIcon fontSize="small" color="success" />
                ) : (
                  <ContentCopyRoundedIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {actions}
      </Box>

      {/* 错误提示 */}
      {error && (
        <Alert
          severity="error"
          action={
            onRetry ? (
              <Button color="inherit" size="small" onClick={onRetry}>
                {i18n("retry", "重试")}
              </Button>
            ) : null
          }
          sx={{ mx: 1.5, mt: 1.5 }}
        >
          {error}
        </Alert>
      )}

      {/* 结果分段滚动容器 */}
      <Box
        sx={{
          flexGrow: 1,
          overflowY: "auto",
          p: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        {recognitionErrors.length > 0 && (
          <Alert severity="warning">
            {i18n(
              "image_partial_recognition_failed",
              "部分分区识别失败，可通过「文本识别」重新识别。"
            )}
            {recognitionErrors.map((failure, index) => (
              <Typography key={index} variant="body2">
                #{failure.order + 1}: {failure.error}
              </Typography>
            ))}
          </Alert>
        )}
        {items.length === 0 && !busy && !error && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              minHeight: 180,
              color: "text.secondary",
            }}
          >
            <Typography variant="body2">
              {!hasRecognitionService
                ? i18n(
                    "image_no_recognition_service",
                    "未配置识别服务，请在上方选择或前往设置"
                  )
                : !hasExecuted
                  ? i18n("image_idle_prompt", "点击上方「翻译」开始识别与翻译")
                  : i18n("image_no_text_found", "未在图片中识别到文本")}
            </Typography>
          </Box>
        )}

        {items.map((item, index) => {
          const source = item.original || item.text || "";
          const target = item.translation || "";
          const isSingleCopied = copiedIndex === index;

          const itemCopyText =
            viewMode === "source"
              ? source
              : viewMode === "target"
                ? target
                : `${source}\n${target}`;

          return (
            <Box
              key={index}
              sx={{
                p: 1.5,
                borderRadius: "8px",
                backgroundColor: "background.paper",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                border: "1px solid",
                borderColor: "divider",
                position: "relative",
              }}
            >
              {/* 单段一键复制按钮 */}
              <Box sx={{ position: "absolute", top: 6, right: 6 }}>
                <Tooltip
                  PopperProps={{ "data-kiss-ui": "", className: "notranslate" }}
                  title={
                    isSingleCopied
                      ? i18n("image_copied", "已复制")
                      : i18n("image_copy_item", "复制")
                  }
                >
                  <IconButton
                    size="small"
                    onClick={() => handleCopyText(itemCopyText, false, index)}
                  >
                    {isSingleCopied ? (
                      <CheckRoundedIcon fontSize="small" color="success" />
                    ) : (
                      <ContentCopyRoundedIcon fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>
              </Box>

              {/* 原文 */}
              {(viewMode === "bilingual" || viewMode === "source") && (
                <Typography
                  variant="body2"
                  sx={{
                    color:
                      viewMode === "bilingual"
                        ? "text.secondary"
                        : "text.primary",
                    mb: viewMode === "bilingual" && target ? 1 : 0,
                    pr: 4,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {source}
                </Typography>
              )}

              {/* 译文 */}
              {(viewMode === "bilingual" || viewMode === "target") && (
                <>
                  {target ? (
                    <Typography
                      variant="body2"
                      sx={{
                        color: "text.primary",
                        fontWeight: 500,
                        pr: 4,
                        lineHeight: 1.6,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {target}
                    </Typography>
                  ) : item.error ? (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        mt: 0.5,
                        p: 0.8,
                        borderRadius: "6px",
                        backgroundColor: "rgba(211, 47, 47, 0.08)",
                        border: "1px solid",
                        borderColor: "error.light",
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: "error.main", fontWeight: 500 }}
                      >
                        {item.error}
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        disabled={busy}
                        onClick={() => onRetryItem?.(index)}
                        sx={{
                          py: 0.2,
                          px: 1,
                          minWidth: "auto",
                          fontSize: "11px",
                          textTransform: "none",
                        }}
                      >
                        {i18n("retry", "重试")}
                      </Button>
                    </Box>
                  ) : (
                    <Typography
                      variant="body2"
                      sx={{
                        color: "text.secondary",
                        fontStyle: "italic",
                        pr: 4,
                        lineHeight: 1.6,
                      }}
                    >
                      {busy ? "..." : ""}
                    </Typography>
                  )}
                </>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

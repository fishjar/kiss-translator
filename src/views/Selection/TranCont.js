import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import FormHelperText from "@mui/material/FormHelperText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { apiTranslate } from "../../apis";
import {
  API_SPE_TYPES,
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_GOOGLE,
} from "../../config";
import { useI18n } from "../../hooks/I18n";
import { parseMathInText } from "../../libs/mathParse";
import CopyBtn from "./CopyBtn";
import {
  ResizeHandle,
  usePrefersReducedMotion,
  CONTROL_HEIGHT,
  CONTROL_CENTER_FROM_RIGHT,
  NOTCH_STRIP_HEIGHT,
  NOTCH_HORIZONTAL_PAD,
} from "../../components/ResizeHandle";
import { useTextareaResize } from "../../components/useTextareaResize";
import { useFocusClosingGate } from "../../components/useFocusClosingGate";

// 控件嵌入边框的共享定位常量（转发导出，供测试与其他调用点从本组件导入）
export {
  CONTROL_HEIGHT,
  CONTROL_CENTER_FROM_RIGHT,
  NOTCH_STRIP_HEIGHT,
  NOTCH_HORIZONTAL_PAD,
} from "../../components/ResizeHandle";

/**
 * 判断划词翻译结果是否允许进行可见的流式渲染。
 *
 * @param {Object} apiSetting 翻译接口配置。
 * @returns {boolean} 当前接口是否应把增量 chunk 直接写入划词翻译输出框。
 */
const canRenderStream = (apiSetting) =>
  Boolean(
    apiSetting?.useStream &&
      API_SPE_TYPES.stream.has(apiSetting.apiType) &&
      (apiSetting.streamRenderMode || "disabled") !== "disabled"
  );

/**
 * 归一化流式回调中的文本载荷。
 *
 * @param {string|string[]} text 流式回调返回的局部文本或最终翻译结果。
 * @returns {string} 可直接写入 UI 的译文字符串。
 */
const normalizeChunkText = (text) => {
  if (Array.isArray(text)) {
    return text[0] || "";
  }

  return text || "";
};

/**
 * 将接口响应转换为文本框可直接显示和复制的纯文本。
 *
 * @param {string} text 翻译接口返回的文本。
 * @param {string} apiType 翻译接口类型。
 * @param {string} sourceText 原始待翻译文本。
 * @param {boolean} parseLatex 是否转换译文中的行内 LaTeX 公式。
 * @returns {string} 供文本 UI 使用的译文。
 */
const normalizeTranslationText = (text, apiType, sourceText, parseLatex) => {
  const normalizedText = normalizeChunkText(text);
  // 划词结果以纯文本展示，开启后把模型输出的行内 LaTeX 转成可读的 Unicode。
  // 必须先于换行反转义执行：`\right` 等命令会被 `\\n|\\r` 规则拆坏。
  const mathText = parseLatex
    ? parseMathInText(normalizedText)
    : normalizedText;

  if (apiType === OPT_TRANS_GOOGLE) {
    return mathText.replace(/[\t ]*(\r\n|\r|\n)[\t ]*/g, "\n");
  }

  if (API_SPE_TYPES.ai.has(apiType) && /\r\n|\r|\n/.test(sourceText)) {
    return mathText.replace(/\\r\\n|\\n|\\r/g, "\n");
  }

  return mathText;
};

/**
 * BuiltinAI does not preserve input line breaks reliably. Translate each
 * non-empty text fragment separately, then rejoin the original separators.
 *
 * @param {string} text Original text to translate.
 * @param {string} fromLang Requested source language.
 * @param {string} detectedLang Source language detected from the complete input.
 * @param {Function} translate Translation function for one text fragment.
 * @returns {Promise<{trText: string, isSame: boolean}>} Rejoined translated text.
 */
const translateBuiltinText = async (
  text,
  fromLang,
  detectedLang,
  translate
) => {
  const parts = text.split(/(\r\n|\r|\n)/);
  const translatableIndexes = parts.reduce((indexes, part, index) => {
    if (index % 2 === 0 && part.trim()) indexes.push(index);
    return indexes;
  }, []);
  if (translatableIndexes.length === 0) {
    return { trText: text, isSame: false };
  }

  const results = [];
  const translatedParts = [...parts];
  let requestFromLang =
    fromLang === "auto" && detectedLang ? detectedLang : fromLang;
  let remainingIndexes = translatableIndexes;

  // 完整文本检测仍未解析出语言时，只允许首个片段走 auto/fallback。
  // 成功后复用其源语言，避免其余片段并发触发远程检测。
  if (requestFromLang === "auto") {
    const [firstIndex, ...restIndexes] = translatableIndexes;
    const firstResult = await translate(parts[firstIndex], "auto");
    results.push(firstResult);
    translatedParts[firstIndex] = firstResult.trText;
    remainingIndexes = restIndexes;
    requestFromLang = firstResult.srCode || firstResult.srLang;
    if (remainingIndexes.length > 0 && !requestFromLang) {
      throw new Error(
        "BuiltinAI could not resolve the source language for multiline translation"
      );
    }
  }

  await Promise.all(
    remainingIndexes.map(async (index) => {
      const result = await translate(parts[index], requestFromLang);
      results.push(result);
      translatedParts[index] = result.trText;
    })
  );

  return {
    trText: translatedParts.join(""),
    isSame: results.length > 0 && results.every((result) => result.isSame),
  };
};

/**
 * 单个划词翻译结果组件，负责发起指定服务商的翻译请求并渲染译文。
 *
 * @param {Object} props 组件参数。
 * @param {string} props.text 需要翻译的原始文本。
 * @param {string} props.fromLang 源语言代码。
 * @param {string} props.toLang 目标语言代码。
 * @param {string} props.apiSlug 选用的翻译 API 唯一标识。
 * @param {Array<Object>} props.transApis 可用翻译 API 配置列表。
 * @param {boolean} [props.simpleStyle=false] 是否使用极简文本样式渲染。
 * @returns {JSX.Element|null} 单个翻译服务商的结果视图。
 */
export default function TranCont({
  text,
  fromLang,
  toLang,
  apiSlug,
  transApis,
  translateVariants = true,
  parseLatex = false,
  detectedLang = "",
  sourceDetectionPending = false,
  simpleStyle = false,
}) {
  const i18n = useI18n();
  const prefersReducedMotion = usePrefersReducedMotion();
  // 实例级稳定 ID：同一页面多个 TranCont（多引擎并行）同时出错时，每个错误
  // 提示都必须有唯一、稳定的 DOM id 与对应 textarea 的 aria-describedby 一一
  // 关联；不得共享硬编码 id，避免重复 id 造成错误的可访问性关联。
  const helperId = useId();
  const fieldId = useId();
  const [trText, setTrText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // 唯一焦点退出 gate：与 TranForm 共享的状态机，负责 focus-gating（focused）
  // 与 120ms 退出过渡（closing）。
  const {
    focused,
    closing,
    handleFocus: handleFieldFocus,
    handleBlur: handleFieldBlur,
  } = useFocusClosingGate({ prefersReducedMotion });
  // focus-gating + 内容门控：译文框是只读的，空译文时右上角没有任何可执行操作
  // （不能复制、不能输入、不能提交），故 rail / 复制按钮 / 右上 rail-notch 只在
  // "有译文"时显示，空译文聚焦不挖右上角缺口；流式加载中即使已有部分译文，
  // rail 系列也整体隐藏（加载期间不可复制、不可 resize，避免只剩 rail/notch
  // 而可操作按钮全部消失的视觉缺口）；有译文失焦时 closing 期间照常淡出。
  const hasTranslation = Boolean(trText && trText.trim());
  const showControls = hasTranslation && (focused || closing) && !loading;
  // 译文文本框自定义高度：null 表示仍由 MUI TextareaAutosize 自动测量，
  // 用户首次拖动后切换为受控高度，后续内容变化不会覆盖用户调整的尺寸。
  const [resizeHeight, setResizeHeight] = useState(null);
  // 拖动高度 → TextField 的 minRows/maxRows/根节点高度样式（共享 hook）：
  // 未拖动时保持自动测量（maxRows=10 限制上限），拖动后全部释放量化，
  // 由像素高度驱动。
  const { minRows, maxRows, rootStyle } = useTextareaResize(resizeHeight, 1);
  // loading 期间译文框内已有 startAdornment spinner 占位，label 必须随之一并
  // 浮动到边框，避免与 spinner 在框内视觉重叠；空译文非 loading 仍不浮动。
  const labelShrink = Boolean(loading || (trText && trText.trim()));
  const translatedBoxRef = useRef(null);

  // 根据 slug 找到当前组件实例负责调用的翻译接口配置。
  const apiSetting = useMemo(
    () => transApis.find((api) => api.apiSlug === apiSlug),
    [transApis, apiSlug]
  );
  const coordinatesBuiltinSource =
    apiSetting?.apiType === OPT_TRANS_BUILTINAI && fromLang === "auto";
  const builtinDetectedLang = coordinatesBuiltinSource ? detectedLang : "";
  const waitForBuiltinDetection =
    coordinatesBuiltinSource && sourceDetectionPending;

  useEffect(() => {
    if (!text?.trim() || !apiSetting) {
      setTrText("");
      setLoading(false);
      setError("");
      return;
    }

    if (waitForBuiltinDetection) {
      setTrText("");
      setLoading(true);
      setError("");
      return;
    }

    let active = true;
    const controller = new AbortController();
    const enableStreamRender = canRenderStream(apiSetting);

    /**
     * 接收底层翻译队列吐出的流式增量文本，并同步到当前输出框。
     *
     * @param {Object} chunk 流式翻译分块。
     * @param {string|string[]} chunk.text 当前分块中已经解析出的译文。
     */
    const handleStreamChunk = enableStreamRender
      ? ({ text: chunkText }) => {
          // 旧请求被切换或取消后，晚到的流式分块不能再覆盖当前划词结果。
          if (!active || controller.signal.aborted) {
            return;
          }

          const nextText = normalizeTranslationText(
            chunkText,
            apiSetting.apiType,
            text,
            parseLatex
          );
          if (nextText) {
            setTrText(nextText);
          }
        }
      : undefined;

    (async () => {
      try {
        setLoading(true);
        setTrText("");
        setError("");

        const translate = (requestText, requestFromLang = fromLang) =>
          apiTranslate({
            text: requestText,
            fromLang: requestFromLang,
            toLang,
            apiSetting,
            textFormat: "text",
            translateVariants,
            onStreamChunk: handleStreamChunk,
            // 将组件生命周期的取消信号下传，避免划词内容变化后旧请求继续占用网络与回写 UI。
            signal: controller.signal,
          });
        const { trText, isSame } =
          apiSetting.apiType === OPT_TRANS_BUILTINAI
            ? await translateBuiltinText(
                text,
                fromLang,
                builtinDetectedLang,
                translate
              )
            : await translate(text);

        if (active) {
          setTrText(
            isSame
              ? ""
              : normalizeTranslationText(
                  trText,
                  apiSetting.apiType,
                  text,
                  parseLatex
                )
          );
        }
      } catch (err) {
        if (err?.name === "AbortError") {
          return;
        }

        if (active) {
          setError(err.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      // 组件卸载或依赖变化时主动中止请求，确保后台流式连接不会继续为旧划词结果推送数据。
      controller.abort();
    };
  }, [
    text,
    fromLang,
    toLang,
    apiSetting,
    translateVariants,
    parseLatex,
    builtinDetectedLang,
    waitForBuiltinDetection,
  ]);

  if (!apiSetting) {
    return null;
  }

  if (simpleStyle) {
    return (
      <Box>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : trText ? (
          <Stack direction="row" spacing={1} alignItems="flex-start">
            {loading && (
              <CircularProgress
                size={12}
                sx={{ flex: "0 0 auto", mt: "0.35em" }}
              />
            )}
            <Typography style={{ whiteSpace: "pre-line" }}>{trText}</Typography>
          </Stack>
        ) : loading ? (
          <CircularProgress size={16} />
        ) : null}
      </Box>
    );
  }

  return (
    <>
      {/* 定位包装层：外框与输入根节点完全重合（helperText 在包装层之外渲染，
          不参与覆盖层几何），rail / 手柄 / notch 相对本包装层定位，
          与可能设置 overflow-y: auto 的输入根节点同级，不会被滚动裁切；
          onBlur 挂在包装层（焦点保活见 handleFieldBlur）。 */}
      <Box
        ref={translatedBoxRef}
        sx={{ position: "relative" }}
        onBlur={handleFieldBlur}
      >
        <TextField
          id={fieldId}
          size="small"
          label={`${i18n("translated_text")} - ${apiSetting.apiName}`}
          fullWidth
          multiline
          minRows={minRows}
          maxRows={maxRows}
          // 译文为受控组件且没有 onChange，显式声明只读语义，同时保留文本选择与复制能力
          inputProps={{
            readOnly: true,
            // helperText 移出包装层后手动保持无障碍关联：仅在出错时引用
            // 本实例的 helper ID，无错误时不留下悬空的 aria-describedby。
            "aria-describedby": error ? helperId : undefined,
          }}
          // 空译文时 label 不浮动：强制 label 只在有译文内容时浮动（shrink）
          InputLabelProps={{ shrink: labelShrink }}
          error={Boolean(error)}
          sx={{
            "& textarea:not([aria-hidden='true'])": {
              boxSizing: "border-box",
              maxHeight: "100%",
              resize: "none",
              ...(resizeHeight != null ? { overflow: "auto !important" } : {}),
            },
          }}
          value={trText}
          onFocus={handleFieldFocus}
          InputProps={{
            style: {
              paddingRight: 14,
              ...(rootStyle || {}),
            },
            startAdornment: loading ? <CircularProgress size={16} /> : null,
          }}
        />
        {/* 覆盖层：与可能设置 overflow-y: auto 的输入根节点同级，避免滚动裁切
            控件（rail / 六点手柄 / 两处 notch 不再位于滚动根节点内部），
            也避免滚动时覆盖层随内容滚走。 */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
          }}
        >
          {/* 右上角复制操作区：聚焦显示；失焦播放退出动画后卸载 */}
          {showControls && (
            <>
              {/* Notch 遮罩条：覆盖顶边框线段，形成 notch 效果 */}
              <Box
                data-testid="trancont-rail-notch"
                style={{
                  position: "absolute",
                  right:
                    CONTROL_CENTER_FROM_RIGHT -
                    CONTROL_HEIGHT / 2 -
                    NOTCH_HORIZONTAL_PAD,
                  top: -Math.round(NOTCH_STRIP_HEIGHT / 2),
                  width: CONTROL_HEIGHT + NOTCH_HORIZONTAL_PAD * 2,
                  height: NOTCH_STRIP_HEIGHT,
                }}
                sx={{
                  backgroundColor: "background.paper",
                  zIndex: 1,
                  // 与 rail 统一为同一套 opacity + visibility 过渡（120ms）
                  opacity: closing ? 0 : 1,
                  visibility: closing ? "hidden" : "visible",
                  transition: prefersReducedMotion
                    ? "none"
                    : "opacity 120ms ease, visibility 120ms ease",
                }}
              />
              <Stack
                direction="row"
                data-testid="trancont-rail"
                style={{
                  position: "absolute",
                  right: CONTROL_CENTER_FROM_RIGHT - CONTROL_HEIGHT / 2,
                  top: -Math.round(CONTROL_HEIGHT / 2),
                  // 进入态保持 auto 以便命中；closing 期间屏蔽点击，防止残留按钮被触发
                  pointerEvents: closing ? "none" : "auto",
                }}
                sx={{
                  zIndex: 2,
                  // 与边框变色 / 缩放手柄统一为同一套 opacity + visibility 过渡（120ms）
                  opacity: closing ? 0 : 1,
                  visibility: closing ? "hidden" : "visible",
                  transition: prefersReducedMotion
                    ? "none"
                    : "opacity 120ms ease, visibility 120ms ease",
                }}
              >
                {/* 复制当前译文；流式渲染期间复制到的是已经到达的部分文本。 */}
                {Boolean(trText.trim() && !loading) && (
                  <CopyBtn text={trText} title={i18n("copy")} />
                )}
              </Stack>
            </>
          )}
          {/* 右下缩放手柄：聚焦且有有效译文时显示（错误前部分译文仍有效）；
              已有手动高度（resizeHeight）本身也构成显示手柄的理由——
              每次重译 setTrText("") 清空译文后手柄常驻，可拖回最小完成复位。 */}
          <ResizeHandle
            visible={Boolean(
              (focused || closing) &&
                (trText.trim() || resizeHeight != null) &&
                !loading
            )}
            closing={closing}
            height={resizeHeight}
            containerRef={translatedBoxRef}
            onHeightChange={setResizeHeight}
            prefersReducedMotion={prefersReducedMotion}
            controlsId={fieldId}
            title={i18n("field_resize_height")}
            ariaLabel={i18n("field_resize_height")}
            testId="trancont-resize-handle"
            notchTestId="trancont-resize-notch"
          />
        </Box>
      </Box>
      {/* 错误提示：位于定位包装层之外，不参与覆盖层几何（与 Preview 的 .helper 一致） */}
      {error && (
        <FormHelperText error id={helperId} sx={{ margin: "3px 14px 0" }}>
          {error}
        </FormHelperText>
      )}
    </>
  );
}

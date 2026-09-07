import Box from "@mui/material/Box";
import ApiRoundedIcon from "@mui/icons-material/ApiRounded";
import {
  API_SPE_TYPES,
  OPT_TRANS_ALIYUNBAILIAN,
  OPT_TRANS_AZUREAI,
  OPT_TRANS_BAIDU,
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_CEREBRAS,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_GOOGLE,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_GOOGLE_CLOUD,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_OPENAI,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_ORCAROUTER,
  OPT_TRANS_QWENMT,
  OPT_TRANS_SILICONFLOW,
  OPT_TRANS_TENCENT,
  OPT_TRANS_VOLCENGINE,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_YANDEX,
  OPT_TRANS_YANDEXFREE,
  OPT_TRANS_ZAI,
} from "../config";
import { browser, isOptions } from "../libs/browser";
import { isGm } from "../libs/client";

const API_ICON_FILES = {
  [OPT_TRANS_BUILTINAI]: "BuiltinAI.svg",
  [OPT_TRANS_GOOGLE]: "Google.svg",
  [OPT_TRANS_GOOGLE_2]: "Google.svg",
  [OPT_TRANS_GOOGLE_CLOUD]: "GoogleCloud.svg",
  [OPT_TRANS_MICROSOFT]: "Microsoft.svg",
  [OPT_TRANS_AZUREAI]: "AzureAI.svg",
  [OPT_TRANS_DEEPSEEK]: "DeepSeek.svg",
  [OPT_TRANS_OPENCODEGO]: "OpenCodeGo.svg",
  [OPT_TRANS_SILICONFLOW]: "SiliconFlow.svg",
  [OPT_TRANS_XIAOMIMIMO]: "XiaomiMimo.svg",
  [OPT_TRANS_ALIYUNBAILIAN]: "AliyunBailian.svg",
  [OPT_TRANS_QWENMT]: "QwenMT.svg",
  [OPT_TRANS_CEREBRAS]: "Cerebras.svg",
  [OPT_TRANS_ZAI]: "Zai.svg",
  [OPT_TRANS_DEEPL]: "DeepL.svg",
  [OPT_TRANS_DEEPLFREE]: "DeepL.svg",
  [OPT_TRANS_DEEPLX]: "DeepL.svg",
  [OPT_TRANS_BAIDU]: "Baidu.svg",
  [OPT_TRANS_TENCENT]: "Tencent.svg",
  [OPT_TRANS_VOLCENGINE]: "Volcengine.svg",
  [OPT_TRANS_YANDEX]: "Yandex.svg",
  [OPT_TRANS_YANDEXFREE]: "Yandex.svg",
  [OPT_TRANS_EPHONEAI]: "ePhoneAI.png",
  [OPT_TRANS_OPENAI]: "OpenAI.svg",
  [OPT_TRANS_GEMINI]: "Gemini.svg",
  [OPT_TRANS_GEMINI_2]: "Gemini.svg",
  [OPT_TRANS_CLAUDE]: "Claude.svg",
  [OPT_TRANS_CLOUDFLAREAI]: "CloudflareAI.svg",
  [OPT_TRANS_OLLAMA]: "Ollama.svg",
  [OPT_TRANS_OPENROUTER]: "OpenRouter.svg",
  [OPT_TRANS_ORCAROUTER]: "OrcaRouter.svg",
};

const LIGHT_SURFACE_FOREGROUND = "#1F1F1F";
const API_ICON_SCALES = {
  [OPT_TRANS_SILICONFLOW]: 1.25,
};

export function resolveApiIconPresentation(
  apiType,
  { mode = "light", lightSurface = false } = {}
) {
  const shouldInvert = lightSurface
    ? apiType === OPT_TRANS_EPHONEAI
    : mode === "dark" && API_SPE_TYPES.darkIcon.has(apiType);

  return {
    color: lightSurface ? LIGHT_SURFACE_FOREGROUND : undefined,
    filter: shouldInvert ? "invert(100%)" : "none",
    scale: API_ICON_SCALES[apiType] || 1,
  };
}

export function getApiIconSrc(
  apiType,
  {
    runtime = browser?.runtime,
    publicUrl = process.env.PUBLIC_URL || ".",
    allowPublicUrl = !isGm || isOptions(),
  } = {}
) {
  const fileName = API_ICON_FILES[apiType];
  if (!fileName) return "";

  const relativePath = `api/${fileName}`;
  if (runtime?.getURL) return runtime.getURL(relativePath);
  return allowPublicUrl ? `${publicUrl}/${relativePath}` : "";
}

export default function ApiProviderIcon({
  apiType,
  label = "",
  size = 22,
  imageSize = 14,
  disabled = false,
  lightSurface = false,
  className = "",
  sx = {},
}) {
  const src = getApiIconSrc(apiType);
  const presentation = resolveApiIconPresentation(apiType, { lightSurface });

  return (
    <Box
      component="span"
      className={className}
      aria-hidden={label ? undefined : true}
      sx={{
        width: size,
        height: size,
        display: "inline-grid",
        flex: "0 0 auto",
        placeItems: "center",
        color: presentation.color,
        opacity: disabled ? 0.5 : 1,
        ...sx,
      }}
    >
      {src ? (
        <Box
          component="img"
          src={src}
          alt={label}
          sx={(theme) => {
            const imagePresentation = resolveApiIconPresentation(apiType, {
              mode: theme.palette.mode,
              lightSurface,
            });

            return {
              width: imageSize,
              height: imageSize,
              display: "block",
              objectFit: "contain",
              filter: imagePresentation.filter,
              transform: `scale(${imagePresentation.scale})`,
              transformOrigin: "center",
            };
          }}
        />
      ) : (
        <ApiRoundedIcon
          sx={{
            width: imageSize,
            height: imageSize,
            color: presentation.color || "inherit",
          }}
        />
      )}
    </Box>
  );
}

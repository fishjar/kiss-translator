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
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_OPENAI,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_ORCAROUTER,
  OPT_TRANS_SILICONFLOW,
  OPT_TRANS_TENCENT,
  OPT_TRANS_VOLCENGINE,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_ZAI,
} from "../config";
import { browser } from "../libs/browser";
import { isGm } from "../libs/client";

const API_ICON_FILES = {
  [OPT_TRANS_BUILTINAI]: "BuiltinAI.svg",
  [OPT_TRANS_GOOGLE]: "Google.svg",
  [OPT_TRANS_GOOGLE_2]: "Google.svg",
  [OPT_TRANS_MICROSOFT]: "Microsoft.svg",
  [OPT_TRANS_AZUREAI]: "AzureAI.svg",
  [OPT_TRANS_DEEPSEEK]: "DeepSeek.svg",
  [OPT_TRANS_OPENCODEGO]: "OpenCodeGo.svg",
  [OPT_TRANS_SILICONFLOW]: "SiliconFlow.svg",
  [OPT_TRANS_XIAOMIMIMO]: "XiaomiMimo.svg",
  [OPT_TRANS_ALIYUNBAILIAN]: "AliyunBailian.svg",
  [OPT_TRANS_CEREBRAS]: "Cerebras.svg",
  [OPT_TRANS_ZAI]: "Zai.svg",
  [OPT_TRANS_DEEPL]: "DeepL.svg",
  [OPT_TRANS_DEEPLFREE]: "DeepL.svg",
  [OPT_TRANS_DEEPLX]: "DeepL.svg",
  [OPT_TRANS_BAIDU]: "Baidu.svg",
  [OPT_TRANS_TENCENT]: "Tencent.svg",
  [OPT_TRANS_VOLCENGINE]: "Volcengine.svg",
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

export function getApiIconSrc(
  apiType,
  {
    runtime = browser?.runtime,
    publicUrl = process.env.PUBLIC_URL || ".",
    allowPublicUrl = !isGm,
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
  className = "",
  sx = {},
}) {
  const src = getApiIconSrc(apiType);

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
        opacity: disabled ? 0.5 : 1,
        ...sx,
      }}
    >
      {src ? (
        <Box
          component="img"
          src={src}
          alt={label}
          sx={(theme) => ({
            width: imageSize,
            height: imageSize,
            display: "block",
            objectFit: "contain",
            filter:
              theme.palette.mode === "dark" &&
              API_SPE_TYPES.darkIcon.has(apiType)
                ? "invert(100%)"
                : "none",
          })}
        />
      ) : (
        <ApiRoundedIcon sx={{ width: imageSize, height: imageSize }} />
      )}
    </Box>
  );
}

import TerminologySelect from "../../components/TerminologySelect";
import { Box } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { OPT_LANGS_FROM_REVERSED, OPT_LANGS_TO_REVERSED } from "../../config";
import { SettingsSelect } from "../Options/SettingsCard";
import ServiceSelect from "./ServiceSelect";
import ScenePromptSelect from "./ScenePromptSelect";

export default function FileTranslateSettings({
  i18n,
  scene,
  services,
  terminologyDirectory,
  prompts,
  onChange,
  disabled = false,
}) {
  return (
    <>
      {/* 语言选择：源语言 -> 目标语言 */}
      <Box sx={{ width: 155, flexShrink: 0 }}>
        <SettingsSelect
          disabled={disabled}
          fullWidth
          size="small"
          variant="outlined"
          hiddenLabel={false}
          label={i18n("from_lang", "源语言")}
          value={scene.fromLang}
          options={OPT_LANGS_FROM_REVERSED}
          onChange={(fromLang) => {
            onChange({ fromLang });
          }}
        />
      </Box>
      <ArrowForwardRoundedIcon
        sx={{
          fontSize: 16,
          color: "text.disabled",
          flexShrink: 0,
        }}
      />
      <Box sx={{ width: 155, flexShrink: 0 }}>
        <SettingsSelect
          disabled={disabled}
          fullWidth
          size="small"
          variant="outlined"
          hiddenLabel={false}
          label={i18n("to_lang", "目标语言")}
          value={scene.toLang}
          options={OPT_LANGS_TO_REVERSED}
          onChange={(toLang) => {
            onChange({ toLang });
          }}
        />
      </Box>

      {/* 翻译服务与提示词 */}
      <Box sx={{ width: 165, flexShrink: 0 }}>
        <ServiceSelect
          i18n={i18n}
          disabled={disabled}
          fullWidth
          size="small"
          variant="outlined"
          hiddenLabel={false}
          label={i18n("translate_service", "翻译服务")}
          scene={scene}
          apis={services}
          onChange={(apiSlug) => onChange({ apiSlug })}
        />
      </Box>
      <Box sx={{ width: 150, flexShrink: 0 }}>
        <ScenePromptSelect
          scene={scene}
          apis={services}
          i18n={i18n}
          prompts={prompts}
          disabled={disabled}
          fullWidth
          size="small"
          variant="outlined"
          hiddenLabel={false}
          label={i18n("translation_prompt", "翻译提示词")}
          value={scene.promptSlug || ""}
          onChange={(promptSlug) => onChange({ promptSlug })}
        />
      </Box>
      <Box sx={{ width: 160, flexShrink: 0 }}>
        <TerminologySelect
          i18n={i18n}
          tables={terminologyDirectory || []}
          value={scene.termsList || []}
          onChange={(termsList) => onChange({ termsList })}
          disabled={disabled}
          showChips={false}
          showHelperText={false}
          showAlert={false}
          sx={{ minWidth: 0, width: "100%" }}
        />
      </Box>
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import LoadingButton from "@mui/lab/LoadingButton";
import { useI18n } from "../../hooks/I18n";
import { useAlert } from "../../hooks/Alert";
import { useSetting } from "../../hooks/Setting";
import { resolveApiPromptSettings } from "../../config/prompt";
import { OPT_LANGS_LIST } from "../../config";
import { apiTranslate } from "../../apis";
import { enabledApiCapabilities } from "../../config/serviceSelection";
import { validateServiceConfig } from "../../providers/instances";
import { translatePlugin } from "../../providers/translationAdapter";
import { invokeService } from "../../providers/serviceRuntime";

export default function QuickTranslationTest({
  api,
  disabled = false,
  onBusyChange,
}) {
  const i18n = useI18n();
  const alert = useAlert();
  const { setting: { prompts, subtitleSetting, uiLang } = {} } = useSetting();
  const [loading, setLoading] = useState(false);
  const activeTest = useRef(null);
  useEffect(
    () => () => {
      activeTest.current?.abort();
      activeTest.current = null;
    },
    []
  );
  const handleApiTest = async () => {
    if (activeTest.current || disabled) return;
    const controller = new AbortController();
    activeTest.current = controller;
    try {
      setLoading(true);
      onBusyChange?.(true);
      const text = "The quick brown fox jumps over the lazy dog.";

      const apiSetting = resolveApiPromptSettings(
        { ...api },
        prompts,
        subtitleSetting
      );

      // 测试译文目标语言跟随界面语言；界面语言为英文（与原文相同）时回退到简体中文
      const fromLang = "en";
      const UI_LANG_TO_TRANS = { zh: "zh-CN", zh_TW: "zh-TW" };
      let toLang = UI_LANG_TO_TRANS[uiLang] || uiLang;
      if (!OPT_LANGS_LIST.includes(toLang) || toLang === fromLang) {
        toLang = "zh-CN";
      }

      let trText = "";
      if (
        apiSetting.provider &&
        apiSetting.provider.implementation.kind !== "native"
      ) {
        validateServiceConfig(
          apiSetting.provider,
          apiSetting.pluginConfig,
          enabledApiCapabilities(apiSetting)
        );
        if (controller.signal.aborted) return;
        for await (const row of translatePlugin([text], {
          apiSetting,
          fromLang,
          toLang,
          signal: controller.signal,
          invoke: invokeService,
        })) {
          if (row.result) trText = row.result[0];
        }
      } else {
        ({ trText } = await apiTranslate({
          text,
          fromLang,
          toLang,
          apiSetting,
          useCache: false,
          usePool: false,
          signal: controller.signal,
        }));
      }
      if (activeTest.current !== controller || controller.signal.aborted)
        return;
      if (!trText?.trim()) {
        throw new Error("empty result");
      }
      alert.success(
        <>
          <div>{i18n("test_success")}</div>
          <div>{text}</div>
          <div>{trText}</div>
        </>
      );
    } catch (err) {
      if (activeTest.current !== controller || controller.signal.aborted)
        return;
      // alert.error(`${i18n("test_failed")}: ${err.message}`);
      let msg = err.message;
      try {
        msg = JSON.stringify(JSON.parse(err.message), null, 2);
      } catch (err) {
        // skip
      }
      alert.error(
        <>
          <div>{i18n("test_failed")}</div>
          {msg === err.message ? <div>{msg}</div> : <pre>{msg}</pre>}
        </>
      );
    } finally {
      if (activeTest.current === controller) {
        activeTest.current = null;
        setLoading(false);
        onBusyChange?.(false);
      }
    }
  };

  return (
    <LoadingButton
      size="small"
      variant="outlined"
      onClick={handleApiTest}
      loading={loading}
      disabled={disabled}
    >
      {i18n("quick_translation_test", "快捷翻译测试")}
    </LoadingButton>
  );
}

import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import { useI18n } from "../../hooks/I18n";
import { useSetting } from "../../hooks/Setting";
import { useRules } from "../../hooks/Rules";
import { useOverviewShortcuts } from "../../hooks/Commands";
import {
  GLOBLA_RULE,
  OPT_LANGS_FROM_REVERSED as OPT_LANGS_FROM,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
} from "../../config";

export default function OverviewHero() {
  const i18n = useI18n();
  const { setting } = useSetting();
  const { list: rules } = useRules();
  const shortcutMap = useOverviewShortcuts(setting);
  const globalRule = rules.find((rule) => rule.pattern === "*") || GLOBLA_RULE;
  const activeApi = (setting.transApis || []).find(
    (api) => api.apiSlug === globalRule.apiSlug
  );
  const serviceName =
    activeApi?.apiName || activeApi?.apiType || globalRule.apiSlug || "—";
  const sourceLanguage =
    OPT_LANGS_FROM.find(([key]) => key === globalRule.fromLang)?.[1] ||
    globalRule.fromLang ||
    "—";
  const targetLanguage =
    OPT_LANGS_TO.find(([key]) => key === globalRule.toLang)?.[1] ||
    globalRule.toLang ||
    "—";
  const shortcuts = [
    [i18n("popup_translate_page"), shortcutMap.page],
    [i18n("open_menu"), shortcutMap.popup],
    [i18n("text_style_alt"), shortcutMap.style],
    [i18n("selection_translate"), shortcutMap.selection],
    [i18n("input_translate"), shortcutMap.input],
    [i18n("setting"), shortcutMap.settings],
  ];

  return (
    <section className="kt-overview-top">
      <div className="kt-overview-hero">
        <div className="kt-overview-hero__header">
          <span className="kt-overview-hero__icon" aria-hidden="true">
            <TranslateRoundedIcon />
          </span>
          <span className="kt-overview-hero__copy">
            <span className="kt-overview-hero__title">
              {i18n("options_overview")}
            </span>
            <span className="kt-overview-hero__subtitle">
              {i18n("options_overview_description")}
            </span>
          </span>
        </div>
        <div className="kt-overview-hero__summary">
          <div className="kt-overview-hero__summary-item">
            <span>{i18n("translate_service")}</span>
            <strong>{serviceName}</strong>
          </div>
          <div className="kt-overview-hero__summary-item">
            <span>
              {i18n("from_lang")} → {i18n("to_lang")}
            </span>
            <strong>
              {sourceLanguage.split(" - ")[0]} →{" "}
              {targetLanguage.split(" - ")[0]}
            </strong>
          </div>
        </div>
      </div>
      <div className="kt-overview-shortcuts">
        <h2>{i18n("options_shortcuts")}</h2>
        {shortcuts.map(([label, keys]) => (
          <div className="kt-overview-shortcut" key={label}>
            <span>{label}</span>
            <span className="kt-overview-shortcut__keys">
              {(keys.length ? keys : ["—"]).map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

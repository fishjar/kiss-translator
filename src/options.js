import React from "react";
import ReactDOM from "react-dom/client";
import Options from "./views/Options";
import { registerI18n } from "./config/i18n";
import { LOCAL_AI_I18N } from "./config/locales/localAi";
import { RULE_EDITOR_I18N } from "./config/i18n.ruleEditor";
import { SUBTITLE_PLAYGROUND_I18N } from "./config/locales/subtitlePlayground";
import { TERMINOLOGY_PLAYGROUND_I18N } from "./config/locales/terminologyPlayground";
import { FILE_TRANSLATE_I18N } from "./config/locales/fileTranslate";
import { CUSTOM_API_HELP_I18N } from "./config/locales/customApiHelp";

registerI18n(LOCAL_AI_I18N);
registerI18n(RULE_EDITOR_I18N);
registerI18n(SUBTITLE_PLAYGROUND_I18N);
registerI18n(TERMINOLOGY_PLAYGROUND_I18N);
registerI18n(FILE_TRANSLATE_I18N);
registerI18n(CUSTOM_API_HELP_I18N);

// 标记当前上下文为 "options"，方便其他共享库得知当前处于设置选项页环境
globalThis.__KISS_CONTEXT__ = "options";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
